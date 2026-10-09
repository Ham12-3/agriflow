// YarnGPT spoken replies.
//   npm run tts:setup   one-time install (~2.5 GB): Python env, YarnGPT2, WavTokenizer
//   npm run tts         start the voice server on http://localhost:8002
//
// YarnGPT pins old versions of transformers and outetts, so it gets its own
// virtual environment (.venv-tts) instead of sharing the speech-to-text one.

import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const venv = path.join(root, ".venv-tts");
const py = path.join(venv, process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
const tts = path.join(root, ".data", "tts");
const env = { ...process.env, PYTHONIOENCODING: "utf-8" };

const run = (cmd, args) => execFileSync(cmd, args, { stdio: "inherit", cwd: root, env });
const pip = (...args) => run(py, ["-m", "pip", "install", "--quiet", ...args]);

function setup() {
  if (!existsSync(py)) {
    console.log("Creating .venv-tts …");
    run(process.platform === "win32" ? "python" : "python3", ["-m", "venv", venv]);
    pip("--upgrade", "pip");
  }
  console.log("Installing PyTorch (CPU) and YarnGPT dependencies …");
  pip("torch", "torchaudio", "--index-url", "https://download.pytorch.org/whl/cpu");
  pip("transformers==4.47.1", "uroman", "inflect", "einops", "pyyaml", "huggingface_hub", "fastapi", "uvicorn",
    "soundfile", "numpy", "scipy", "gdown", "loguru", "mecab-python3", "openai-whisper");
  // outetts' own requirements are mostly training tools; YarnGPT only needs its decoder.
  pip("--no-deps", "outetts==0.2.3");

  if (!existsSync(path.join(tts, "yarngpt"))) {
    console.log("Downloading YarnGPT code …");
    run("git", ["clone", "--quiet", "--depth", "1", "https://github.com/saheedniyi02/yarngpt.git", path.join(tts, "yarngpt")]);
  }
  console.log("Downloading the YarnGPT2 model and WavTokenizer config …");
  run(py, ["-c", `
from huggingface_hub import snapshot_download, hf_hub_download
snapshot_download('saheedniyi/YarnGPT2', local_dir=r'${path.join(tts, "YarnGPT2")}', allow_patterns=['*.json','*.txt','model.safetensors'])
hf_hub_download('novateur/WavTokenizer-medium-speech-75token', 'wavtokenizer_mediumdata_frame75_3s_nq1_code4096_dim512_kmeans200_attn.yaml', local_dir=r'${tts}')
`]);
  const ckpt = path.join(tts, "wavtokenizer_large_speech_320_24k.ckpt");
  if (!existsSync(ckpt)) {
    console.log("Downloading the WavTokenizer checkpoint (1.75 GB) …");
    run(py, ["-m", "gdown", "1-ASeEkrn4HY49yZWHTASgfGFNXdVnLTt", "-O", ckpt]);
  }
  console.log("\nDone. Start the voice server with: npm run tts");
}

if (process.argv[2] === "setup") {
  setup();
} else {
  if (!existsSync(py) || !existsSync(path.join(tts, "YarnGPT2"))) {
    console.error("YarnGPT isn't installed yet. Run: npm run tts:setup");
    process.exit(1);
  }
  const child = spawn(py, [path.join(root, "scripts", "tts_server.py")], { stdio: "inherit", cwd: root, env });
  child.on("exit", (code) => process.exit(code ?? 0));
}
