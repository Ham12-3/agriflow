"""Local text-to-speech server for Agriflow AI, using YarnGPT2 (Apache-2.0).

Speaks Nigerian-accented English, Yoruba, Hausa and Igbo. The language model
runs in Ollama (model `agriflow-yarngpt2`, about 8x faster than PyTorch on a
CPU); this server builds the prompt and turns the model's audio codes into a
WAV file with WavTokenizer. Runs in its own virtual environment (.venv-tts)
because YarnGPT pins transformers 4.47 and outetts 0.2.3. Set up once with
`npm run tts:setup`, then `npm run tts`.

    POST /v1/audio/speech   JSON {input, language: en|yo|ha|ig, voice?}  ->  audio/wav
    GET  /health

The app sends one sentence per request, several at once, and plays them in
order once enough audio is ready to play without pauses.
"""

import inflect
import io
import json
import os
import re
import sys
import threading
import time
import urllib.error
import urllib.request
from collections import OrderedDict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TTS_DIR = os.path.join(ROOT, ".data", "tts")
sys.path.insert(0, TTS_DIR)  # for the cloned `yarngpt` package

import numpy as np  # noqa: E402
import soundfile as sf  # noqa: E402
import torch  # noqa: E402
import uvicorn  # noqa: E402
from fastapi import FastAPI, HTTPException  # noqa: E402
from fastapi.responses import Response  # noqa: E402
from pydantic import BaseModel  # noqa: E402
from yarngpt.audiotokenizer import AudioTokenizerV2  # noqa: E402

MODEL_DIR = os.path.join(TTS_DIR, "YarnGPT2")
WAV_CKPT = os.path.join(TTS_DIR, "wavtokenizer_large_speech_320_24k.ckpt")
WAV_CONFIG = os.path.join(TTS_DIR, "wavtokenizer_mediumdata_frame75_3s_nq1_code4096_dim512_kmeans200_attn.yaml")
# `npm run tts` starts a separate Ollama on :11435 that makes up to 3 clips at
# once (about twice the throughput of one at a time on a laptop CPU).
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434").rstrip("/")
OLLAMA_MODEL = os.environ.get("TTS_OLLAMA_MODEL", "agriflow-yarngpt2")
SAMPLE_RATE = 24000
MAX_WORDS = 60  # per request; the app sends one sentence at a time

LANGS = {"en": "english", "yo": "yoruba", "ha": "hausa", "ig": "igbo"}
# Clearest and most stable voices first (YarnGPT2's own ranking, and for
# English our clarity tests: joke, emma, umar, remi and tayo were often
# unintelligible, so they're left out). Keep in sync with src/lib/voices.ts.
VOICES = {
    "en": ["idera", "chinenye", "zainab", "jude", "osagie"],
    "yo": ["yoruba_male2", "yoruba_female2", "yoruba_female1"],
    "ig": ["igbo_female2", "igbo_male2", "igbo_female1"],
    "ha": ["hausa_female1", "hausa_female2", "hausa_male2"],
}
DEFAULT_VOICES = {lang: voices[0] for lang, voices in VOICES.items()}

torch.set_num_threads(int(os.environ.get("TTS_THREADS", max(1, (os.cpu_count() or 2) // 2))))
print("Loading the YarnGPT tokenizer and WavTokenizer decoder …", flush=True)
started = time.time()
tokenizer = AudioTokenizerV2(MODEL_DIR, WAV_CKPT, WAV_CONFIG)
print(f"Ready in {time.time() - started:.0f}s; speech model: {OLLAMA_MODEL} in Ollama", flush=True)


def generate(prompt: str, max_tokens: int) -> str:
    """Runs YarnGPT in Ollama on a raw prompt; returns text with <|code|> tokens."""
    body = json.dumps({
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "raw": True,
        "stream": False,
        "keep_alive": os.environ.get("TTS_KEEP_ALIVE", "60m"),
        # As YarnGPT's own example: low temperature, mild repetition penalty.
        # The penalty only looks at recent tokens; over the whole clip it
        # garbled more words in our tests.
        "options": {
            "temperature": 0.1,
            "repeat_penalty": 1.1,
            "repeat_last_n": 64,
            "num_ctx": 4096,
            "num_predict": max_tokens,
            "stop": ["<|audio_end|>", "<|im_end|>"],
        },
    }).encode()
    req = urllib.request.Request(f"{OLLAMA_URL}/api/generate", body, {"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=300) as res:
            return json.load(res)["response"]
    except urllib.error.HTTPError as err:
        detail = err.read().decode(errors="replace")[:200]
        if err.code == 404:
            raise HTTPException(503, f"Ollama has no model '{OLLAMA_MODEL}'. Run: npm run tts:setup") from err
        raise HTTPException(502, f"Ollama error {err.code}: {detail}") from err
    except OSError as err:
        raise HTTPException(503, "Ollama isn't running. Start it with: ollama serve") from err


app = FastAPI(title="Agriflow TTS")
decode_lock = threading.Lock()  # the WavTokenizer decoder isn't shared between threads
cache_lock = threading.Lock()
FADE = int(0.012 * SAMPLE_RATE)


def polish(audio: np.ndarray) -> np.ndarray:
    """Evens out loudness, trims silence at the ends and fades the edges.

    Some voices (Yoruba, Hausa) came out past full scale and crackled when saved.
    Levels use a near-peak value, not the single loudest sample, so one stray
    spike doesn't make the clip quiet or the trimming cut real speech.
    """
    if not audio.size:
        return audio
    level = float(np.percentile(np.abs(audio), 99.9)) or 1.0
    audio = np.clip(audio * (0.8 / level), -0.98, 0.98)
    loud = np.flatnonzero(np.abs(audio) > 0.02)
    if loud.size:
        pad = int(0.05 * SAMPLE_RATE)
        audio = audio[max(0, loud[0] - pad): loud[-1] + pad]
    if audio.size > 2 * FADE:
        ramp = np.linspace(0, 1, FADE, dtype=audio.dtype)
        audio[:FADE] *= ramp
        audio[-FADE:] *= ramp[::-1]
    return audio


cache: "OrderedDict[tuple, bytes]" = OrderedDict()
CACHE_SIZE = 64


# Batch IDs are species prefix + farm code + number (POU-72917-003); read them
# as "poultry batch 3", which YarnGPT says far more clearly than the code.
SPECIES = {"POU": "poultry", "CAT": "cattle", "GOA": "goat", "SHE": "sheep", "PIG": "pig", "FIS": "fish", "RAB": "rabbit"}
numbers = inflect.engine()


def say_number(match: re.Match) -> str:
    """6977 -> "six thousand nine hundred seventy-seven", 2.17 -> "two point one seven"."""
    whole, _, frac = match.group(0).partition(".")
    words = numbers.number_to_words(whole, andword="", comma="")
    if frac:
        words += " point " + " ".join(numbers.number_to_words(d) for d in frac)
    return f" {words} "


def normalize(text: str) -> str:
    """Make IDs, money, units and numbers easy for YarnGPT to say."""
    text = re.sub(
        r"\b([A-Z]{3})-(?:\d+-)?(\d{1,4})\b",
        lambda m: f"{SPECIES.get(m.group(1), '')} batch {int(m.group(2))}".strip(),
        text,
    )
    text = re.sub(r"(\d),(?=\d{3}\b)", r"\1", text)  # 2,050,000 -> 2050000
    text = re.sub(r"[₦N]\s?(\d+(?:\.\d+)?)\s?M\b", r"\1 million naira", text)
    text = re.sub(r"₦\s?(\d+(?:\.\d+)?)", r"\1 naira", text)
    text = re.sub(r"(\d)\s?kg\b", r"\1 kilograms", text)
    text = re.sub(r"(\d)\s?%", r"\1 percent", text)
    text = re.sub(r"\d+(?:\.\d+)?", say_number, text)
    text = re.sub(r"[*_#`>|]", " ", text)  # markdown
    return re.sub(r"\s+", " ", text).strip()


class SpeechRequest(BaseModel):
    input: str
    language: str = "en"
    voice: str | None = None


@app.get("/health")
def health():
    return {"ok": True, "engine": "yarngpt2", "runner": "ollama", "model": OLLAMA_MODEL}


@app.get("/v1/voices")
def voices():
    return VOICES


@app.post("/v1/audio/speech")
def speech(req: SpeechRequest):
    lang = req.language.split("-")[0].lower()
    if lang not in LANGS:
        raise HTTPException(400, "language must be en, yo, ha or ig")
    voice = req.voice if req.voice in VOICES[lang] else DEFAULT_VOICES[lang]
    text = normalize(req.input)
    words = text.split()
    if not words:
        raise HTTPException(400, "Nothing to say.")
    if len(words) > MAX_WORDS:
        raise HTTPException(413, f"Send at most {MAX_WORDS} words per request.")

    key = (lang, voice, text)
    with cache_lock:
        hit = cache.get(key)
        if hit:
            cache.move_to_end(key)
    if hit:
        return Response(hit, media_type="audio/wav", headers={"X-Cache": "hit"})

    # Requests run in parallel (Ollama queues what it can't run at once).
    t0 = time.time()
    prompt = tokenizer.create_prompt(text, lang=LANGS[lang], speaker_name=voice)
    # ~75 audio codes per second of speech plus timing tokens.
    output = generate(prompt, 60 * len(words) + 200)
    t_gen = time.time() - t0
    codes = tokenizer.extract_integers(output)
    if not codes:
        raise HTTPException(500, "The model produced no audio.")
    with decode_lock, torch.inference_mode():
        audio = tokenizer.get_audio(codes)  # (1, samples) float tensor at 24 kHz
    audio = polish(audio.squeeze().float().cpu().numpy())
    buf = io.BytesIO()
    sf.write(buf, audio, SAMPLE_RATE, format="WAV", subtype="PCM_16")
    data = buf.getvalue()
    seconds = audio.size / SAMPLE_RATE
    print(f"[{lang}/{voice}] {len(words)} words -> {seconds:.1f}s audio in {time.time() - t0:.1f}s (model {t_gen:.1f}s)", flush=True)

    with cache_lock:
        cache[key] = data
        if len(cache) > CACHE_SIZE:
            cache.popitem(last=False)
    return Response(data, media_type="audio/wav")


if __name__ == "__main__":
    port = int(os.environ.get("TTS_PORT", "8002"))
    print(f"Agriflow TTS (YarnGPT2) on http://localhost:{port}")
    uvicorn.run(app, host="127.0.0.1", port=port)
