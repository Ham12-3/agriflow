// YarnGPT spoken replies.
//   npm run tts:setup   one-time install (~2 GB): Python env, YarnGPT2 for Ollama, WavTokenizer
//   npm run tts         start the voice server on http://localhost:8002
//
// YarnGPT's speech model runs in Ollama (much faster on a CPU); the Python
// server only builds prompts and decodes audio. YarnGPT pins old versions of
// transformers and outetts, so it gets its own virtual environment (.venv-tts).

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
    "soundfile", "numpy", "scipy", "gdown", "gguf", "loguru", "mecab-python3", "openai-whisper");
  // outetts' own requirements are mostly training tools; YarnGPT only needs its decoder.
  pip("--no-deps", "outetts==0.2.3");

  if (!existsSync(path.join(tts, "yarngpt"))) {
    console.log("Downloading YarnGPT code …");
    run("git", ["clone", "--quiet", "--depth", "1", "https://github.com/saheedniyi02/yarngpt.git", path.join(tts, "yarngpt")]);
  }
  console.log("Downloading the YarnGPT2 tokenizer and WavTokenizer config …");
  run(py, ["-c", `
from huggingface_hub import snapshot_download, hf_hub_download
snapshot_download('saheedniyi/YarnGPT2', local_dir=r'${path.join(tts, "YarnGPT2")}', allow_patterns=['*.json','*.txt'])
hf_hub_download('novateur/WavTokenizer-medium-speech-75token', 'wavtokenizer_mediumdata_frame75_3s_nq1_code4096_dim512_kmeans200_attn.yaml', local_dir=r'${tts}')
`]);
  const ckpt = path.join(tts, "wavtokenizer_large_speech_320_24k.ckpt");
  if (!existsSync(ckpt)) {
    console.log("Downloading the WavTokenizer checkpoint (1.75 GB) …");
    run(py, ["-m", "gdown", "1-ASeEkrn4HY49yZWHTASgfGFNXdVnLTt", "-O", ckpt]);
  }
  run(py, [path.join(root, "scripts", "tts_ollama_model.py")]);
  console.log("\nDone. Start the voice server with: npm run tts");
}

const reachable = (url) =>
  fetch(url, { signal: AbortSignal.timeout(1500) }).then(
    () => true,
    () => false,
  );

/**
 * Speech gets its own Ollama on :11435 that makes up to 3 clips at once,
 * about twice the throughput of one at a time. It shares the downloaded
 * models with your normal Ollama and stops with this command.
 */
async function startVoiceOllama() {
  if (process.env.OLLAMA_URL) return { url: process.env.OLLAMA_URL, child: null };
  const port = process.env.TTS_OLLAMA_PORT ?? "11435";
  const url = `http://127.0.0.1:${port}`;
  if (await reachable(url)) return { url, child: null };
  const child = spawn("ollama", ["serve"], {
    stdio: "ignore",
    env: {
      ...process.env,
      OLLAMA_HOST: `127.0.0.1:${port}`,
      OLLAMA_NUM_PARALLEL: process.env.TTS_PARALLEL ?? "3",
      OLLAMA_MAX_LOADED_MODELS: "1",
    },
  });
  child.on("error", () => {
    console.error("Couldn't start Ollama. Install it from https://ollama.com and try again.");
    process.exit(1);
  });
  for (let i = 0; i < 60 && !(await reachable(url)); i++) await new Promise((r) => setTimeout(r, 500));
  return { url, child };
}

if (process.argv[2] === "setup") {
  setup();
} else {
  if (!existsSync(py) || !existsSync(path.join(tts, "YarnGPT2"))) {
    console.error("YarnGPT isn't installed yet. Run: npm run tts:setup");
    process.exit(1);
  }
  const ollama = await startVoiceOllama();
  const child = spawn(py, [path.join(root, "scripts", "tts_server.py")], {
    stdio: "inherit",
    cwd: root,
    env: { ...env, OLLAMA_URL: ollama.url },
  });
  const stop = () => {
    ollama.child?.kill();
    child.kill();
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  child.on("exit", (code) => {
    ollama.child?.kill();
    process.exit(code ?? 0);
  });
}
