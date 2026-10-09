"""Local speech-to-text server for Agriflow AI (AgriTalk voice input).

Exposes an OpenAI-compatible endpoint:
    POST /v1/audio/transcriptions   (multipart: file, language)  ->  {"text": "..."}

Engines, best first:
  1. N-ATLaS ASR models (NCAIR1/Yoruba-ASR, Hausa-ASR, Igbo-ASR, NigerianAccentedEnglish).
     Gated on Hugging Face: accept each model's terms, then set HF_TOKEN.
  2. OpenAI Whisper (open source, no login). Supports English, Yoruba and Hausa; not Igbo.

Run:  npm run asr          (or: python scripts/asr_server.py)
Env:  ASR_PORT=8001  WHISPER_MODEL=small  HF_TOKEN=hf_...  ASR_USE_NATLAS=1
"""

import os
import tempfile
import threading

import uvicorn
import whisper
from fastapi import FastAPI, File, Form, HTTPException, UploadFile

NATLAS_MODELS = {
    "en": "NCAIR1/NigerianAccentedEnglish",
    "yo": "NCAIR1/Yoruba-ASR",
    "ha": "NCAIR1/Hausa-ASR",
    "ig": "NCAIR1/Igbo-ASR",
}
WHISPER_LANGUAGES = {"en", "yo", "ha"}  # Whisper has no Igbo
MAX_BYTES = 10 * 1024 * 1024  # ~10 minutes of compressed speech

HF_TOKEN = os.environ.get("HF_TOKEN") or None
USE_NATLAS = os.environ.get("ASR_USE_NATLAS", "1" if HF_TOKEN else "0") == "1"
WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "small")

app = FastAPI(title="Agriflow ASR")
_lock = threading.Lock()  # one transcription at a time on CPU
_natlas_pipes: dict = {}
_natlas_failed: set = set()
_whisper_model = None


def natlas_pipe(lang: str):
    """Load (once) the N-ATLaS ASR pipeline for a language, or None if unavailable."""
    if not USE_NATLAS or lang not in NATLAS_MODELS or lang in _natlas_failed:
        return None
    if lang not in _natlas_pipes:
        try:
            from transformers import pipeline

            print(f"Loading {NATLAS_MODELS[lang]} …", flush=True)
            _natlas_pipes[lang] = pipeline(
                "automatic-speech-recognition", model=NATLAS_MODELS[lang], token=HF_TOKEN
            )
        except Exception as err:  # gated, no token, offline, …
            print(f"N-ATLaS ASR for '{lang}' unavailable, using Whisper: {err}", flush=True)
            _natlas_failed.add(lang)
            return None
    return _natlas_pipes[lang]


def whisper_model():
    global _whisper_model
    if _whisper_model is None:
        print(f"Loading Whisper '{WHISPER_MODEL}' …", flush=True)
        _whisper_model = whisper.load_model(WHISPER_MODEL)
    return _whisper_model


@app.get("/health")
def health():
    return {
        "ok": True,
        "engine": "n-atlas" if USE_NATLAS else "whisper",
        "whisper_model": WHISPER_MODEL,
    }


@app.post("/v1/audio/transcriptions")
async def transcribe(
    file: UploadFile = File(...),
    language: str = Form("en"),
    model: str = Form("auto"),  # accepted for OpenAI compatibility; ignored
):
    data = await file.read()
    if not data:
        raise HTTPException(400, "Empty audio file.")
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "Audio is too long.")
    lang = language.split("-")[0].lower()

    suffix = os.path.splitext(file.filename or "")[1] or ".webm"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(data)
        path = tmp.name
    try:
        audio = whisper.load_audio(path)  # ffmpeg → 16 kHz mono float32
        with _lock:
            pipe = natlas_pipe(lang)
            if pipe is not None:
                result = pipe({"raw": audio, "sampling_rate": 16000})
                return {"text": result["text"].strip(), "engine": NATLAS_MODELS[lang]}
            result = whisper_model().transcribe(
                audio,
                language=lang if lang in WHISPER_LANGUAGES else None,
                fp16=False,
            )
            return {"text": result["text"].strip(), "engine": f"whisper-{WHISPER_MODEL}"}
    except HTTPException:
        raise
    except Exception as err:
        raise HTTPException(500, f"Transcription failed: {err}") from err
    finally:
        os.unlink(path)


if __name__ == "__main__":
    port = int(os.environ.get("ASR_PORT", "8001"))
    print(f"Agriflow ASR on http://localhost:{port} (engine: {'N-ATLaS' if USE_NATLAS else 'Whisper'})")
    uvicorn.run(app, host="127.0.0.1", port=port)
