"""Local text-to-speech server for Agriflow AI, using YarnGPT2 (Apache-2.0).

Speaks Nigerian-accented English, Yoruba, Hausa and Igbo. Runs in its own
virtual environment (.venv-tts) because YarnGPT pins transformers 4.47 and
outetts 0.2.3. Set up once with `npm run tts:setup`, then `npm run tts`.

    POST /v1/audio/speech   JSON {input, language: en|yo|ha|ig, voice?}  ->  audio/wav
    GET  /health

The app sends one short chunk (about 25 words) per request and queues the
audio, so playback starts before the whole answer has been generated.
"""

import io
import os
import re
import sys
import threading
import time
from collections import OrderedDict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TTS_DIR = os.path.join(ROOT, ".data", "tts")
sys.path.insert(0, TTS_DIR)  # for the cloned `yarngpt` package

import soundfile as sf  # noqa: E402
import torch  # noqa: E402
import uvicorn  # noqa: E402
from fastapi import FastAPI, HTTPException  # noqa: E402
from fastapi.responses import Response  # noqa: E402
from pydantic import BaseModel  # noqa: E402
from transformers import AutoModelForCausalLM  # noqa: E402
from yarngpt.audiotokenizer import AudioTokenizerV2  # noqa: E402

MODEL_DIR = os.path.join(TTS_DIR, "YarnGPT2")
WAV_CKPT = os.path.join(TTS_DIR, "wavtokenizer_large_speech_320_24k.ckpt")
WAV_CONFIG = os.path.join(TTS_DIR, "wavtokenizer_mediumdata_frame75_3s_nq1_code4096_dim512_kmeans200_attn.yaml")
SAMPLE_RATE = 24000
MAX_WORDS = 60  # per request; the app sends ~25-word chunks

LANGS = {"en": "english", "yo": "yoruba", "ha": "hausa", "ig": "igbo"}
DEFAULT_VOICES = {"en": "idera", "yo": "yoruba_female2", "ha": "hausa_female2", "ig": "igbo_female2"}
VOICES = {
    "en": ["idera", "emma", "onye", "jude", "osagie", "tayo", "zainab", "joke", "regina", "remi", "umar", "chinenye"],
    "yo": ["yoruba_female2", "yoruba_male2", "yoruba_female1"],
    "ha": ["hausa_female2", "hausa_female1", "hausa_male1", "hausa_male2"],
    "ig": ["igbo_female2", "igbo_female1", "igbo_male2"],
}

# Hyper-threads slow generation down; use the physical cores (TTS_THREADS overrides).
torch.set_num_threads(int(os.environ.get("TTS_THREADS", max(1, (os.cpu_count() or 2) // 2))))
print("Loading YarnGPT2 …", flush=True)
started = time.time()
tokenizer = AudioTokenizerV2(MODEL_DIR, WAV_CKPT, WAV_CONFIG)
dtype = torch.float32 if tokenizer.device.type == "cpu" else torch.float16  # bf16 is slow on most CPUs
model = AutoModelForCausalLM.from_pretrained(MODEL_DIR, torch_dtype=dtype).to(tokenizer.device)
model.eval()
print(f"YarnGPT2 ready in {time.time() - started:.0f}s on {tokenizer.device}", flush=True)

app = FastAPI(title="Agriflow TTS")
lock = threading.Lock()  # one generation at a time on CPU
cache: "OrderedDict[tuple, bytes]" = OrderedDict()
CACHE_SIZE = 64


def normalize(text: str) -> str:
    """Make money and units readable; YarnGPT turns digits into words itself."""
    text = re.sub(r"(\d),(?=\d{3}\b)", r"\1", text)  # 2,050,000 -> 2050000
    text = re.sub(r"[₦N]\s?(\d+(?:\.\d+)?)\s?M\b", r"\1 million naira", text)
    text = re.sub(r"₦\s?(\d+(?:\.\d+)?)", r"\1 naira", text)
    text = re.sub(r"(\d)\s?kg\b", r"\1 kilograms", text)
    text = re.sub(r"(\d)\s?%", r"\1 percent", text)
    text = re.sub(r"[*_#`>|]", " ", text)  # markdown
    return re.sub(r"\s+", " ", text).strip()


class SpeechRequest(BaseModel):
    input: str
    language: str = "en"
    voice: str | None = None


@app.get("/health")
def health():
    return {"ok": True, "engine": "yarngpt2", "device": str(tokenizer.device)}


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
    if key in cache:
        cache.move_to_end(key)
        return Response(cache[key], media_type="audio/wav", headers={"X-Cache": "hit"})

    with lock:
        t0 = time.time()
        prompt = tokenizer.create_prompt(text, lang=LANGS[lang], speaker_name=voice)
        input_ids = tokenizer.tokenize_prompt(prompt)
        with torch.inference_mode():
            output = model.generate(
                input_ids=input_ids,
                temperature=0.1,
                repetition_penalty=1.1,
                # ~75 audio codes per second of speech plus timing tokens.
                max_new_tokens=60 * len(words) + 200,
            )
        t_gen = time.time() - t0
        codes = tokenizer.get_codes(output)
        if not codes:
            raise HTTPException(500, "The model produced no audio.")
        audio = tokenizer.get_audio(codes)  # (1, samples) float tensor at 24 kHz
        buf = io.BytesIO()
        sf.write(buf, audio.squeeze().float().cpu().numpy(), SAMPLE_RATE, format="WAV", subtype="PCM_16")
        data = buf.getvalue()
        seconds = audio.shape[-1] / SAMPLE_RATE
        print(f"[{lang}/{voice}] {len(words)} words -> {seconds:.1f}s audio in {time.time() - t0:.1f}s (model {t_gen:.1f}s)", flush=True)

    cache[key] = data
    if len(cache) > CACHE_SIZE:
        cache.popitem(last=False)
    return Response(data, media_type="audio/wav")


if __name__ == "__main__":
    port = int(os.environ.get("TTS_PORT", "8002"))
    print(f"Agriflow TTS (YarnGPT2) on http://localhost:{port}")
    uvicorn.run(app, host="127.0.0.1", port=port)
