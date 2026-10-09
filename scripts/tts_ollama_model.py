"""Installs YarnGPT2 into Ollama as `agriflow-yarngpt2` (run by `npm run tts:setup`).

Uses the GGUF build of YarnGPT2 (mradermacher/YarnGPT2-GGUF, Apache-2.0). Its
audio-code tokens are marked as "control" tokens, which Ollama leaves out of
its output, so they are re-marked as user-defined tokens before importing.
"""

import os
import subprocess
import sys

from gguf import GGUFReader
from huggingface_hub import hf_hub_download

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TTS_DIR = os.path.join(ROOT, ".data", "tts")
NAME = os.environ.get("TTS_OLLAMA_MODEL", "agriflow-yarngpt2")
GGUF = os.path.join(TTS_DIR, "YarnGPT2.Q8_0.gguf")

CONTROL, USER_DEFINED = 3, 4
FIRST_ADDED_TOKEN = 49152  # YarnGPT's tokens (<|text_start|>, codes, timings) follow SmolLM2's vocabulary


def main():
    if not os.path.exists(GGUF):
        print("Downloading YarnGPT2 (GGUF, 390 MB) …", flush=True)
        hf_hub_download("mradermacher/YarnGPT2-GGUF", "YarnGPT2.Q8_0.gguf", local_dir=TTS_DIR)

    reader = GGUFReader(GGUF, "r+")
    tokens = reader.fields["tokenizer.ggml.tokens"]
    types = reader.fields["tokenizer.ggml.token_type"]
    changed = 0
    for tid in range(FIRST_ADDED_TOKEN, len(types.data)):
        name = bytes(tokens.parts[tokens.data[tid]]).decode("utf-8", "replace")
        part = types.parts[types.data[tid]]
        if name.startswith("<|") and int(part[0]) == CONTROL:
            part[0] = USER_DEFINED
            changed += 1
    del reader  # flushes the edits to disk
    print(f"Marked {changed} audio tokens as visible", flush=True)

    modelfile = os.path.join(TTS_DIR, "Modelfile.yarngpt")
    with open(modelfile, "w", encoding="utf-8") as f:
        f.write(
            f"FROM ./{os.path.basename(GGUF)}\n"
            'TEMPLATE "{{ .Prompt }}"\n'
            "PARAMETER temperature 0.1\n"
            "PARAMETER repeat_penalty 1.1\n"
            "PARAMETER num_ctx 4096\n"
            'PARAMETER stop "<|audio_end|>"\n'
            'PARAMETER stop "<|im_end|>"\n'
        )
    print(f"Creating Ollama model {NAME} …", flush=True)
    subprocess.run(["ollama", "create", NAME, "-f", modelfile], cwd=TTS_DIR, check=True)


if __name__ == "__main__":
    try:
        main()
    except FileNotFoundError:
        sys.exit("Ollama isn't installed. Get it from https://ollama.com, then run npm run tts:setup again.")
