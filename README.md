# Agriflow

Farm management for modern African livestock operations. This is the web app
built from the Agriflow Figma design, with an AI assistant powered by
[N-ATLaS](https://huggingface.co/NCAIR1/N-ATLaS), Nigeria's multilingual LLM
(English, Hausa, Igbo, Yoruba).

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in the N-ATLaS settings
npm run dev
```

Open http://localhost:3000. Requires Node 22+ (the app uses Node's built-in
SQLite for local data, stored in `.data/agriflow.db` and seeded with sample batches
on first run; delete that file to reset). Set `AGRIFLOW_DB_PATH` to keep the
database somewhere else, e.g. a persistent disk in production or a scratch copy
for testing.

## Accounts, farms and roles

- **Sign up** at `/signup`. The first account on a fresh install claims the existing
  data (Farm 1) and names it; later accounts start with an empty farm.
- **Multi-farm:** add farms on **My Farms** (`/farms`), compare them on **Overview**
  (`/overview`), and switch with the farm name in the header.
- **Team:** invite people with the farm join code, link or QR code on the Team
  page. They sign up at `/join` as **workers**.
- **Roles:**
  - **Workers** log daily records, deliveries and stock counts.
  - **Managers** also manage batches, items, finances, meetings and settings.
  - **Owners** also change roles.

## Voice (AgriTalk)

```bash
npm run asr   # local speech-to-text server on :8001 (Whisper "small", downloads ~460 MB once)
```

With `ASR_BASE_URL` set in `.env.local`, the microphone in Agriflow AI records
you and transcribes on your machine. Without it, the app falls back to the
browser's own speech recognition (Chrome/Edge). The AI page (`/ai`) has the chat,
voice settings and InsightEngine thresholds.

### Languages

- **Reply language:** the picker in the chat ("Auto language" by default) answers
  in the language of your question, or always in English, Hausa, Igbo or Yoruba.
  Your choice is saved for your account as soon as you change it.
- **Every answer** has its own **EN / HA / IG / YO** buttons to show it in another
  language (translated once, then instant) and its own **Listen** button, which
  reads the version on screen in that language.
- Settings on the AI page save automatically.

### Speed (Ollama)

With Ollama, the app keeps N-ATLaS loaded for an hour (`LLM_KEEP_ALIVE`) and
warms it up as soon as a chat opens, so answers start in about 5 seconds
instead of a minute or more. On a laptop CPU, N-ATLaS writes about 3–4 words per
second. Translating between Hausa, Igbo and Yoruba goes through English for
better results, so it takes about twice as long as translating to English.

### Spoken replies (YarnGPT)

```bash
npm run tts:setup   # one time: Python env, YarnGPT2 for Ollama, WavTokenizer (~2 GB)
npm run tts         # local text-to-speech server on :8002 (needs Ollama running)
```

With `TTS_BASE_URL` set, **Listen** speaks answers with
[YarnGPT2](https://huggingface.co/saheedniyi/YarnGPT2) (Apache-2.0): Nigerian
voices in English, Hausa, Igbo and Yoruba. If the server is off or fails, the
device's own voice takes over.

How it works:

- The speech model runs in Ollama as `agriflow-yarngpt2` (the GGUF build from
  mradermacher/YarnGPT2-GGUF), 4–5 times faster than PyTorch on a CPU.
  `npm run tts` starts its own Ollama on port 11435 that makes 3 sentences at
  once (`TTS_PARALLEL`), about twice the throughput of one at a time.
- Answers are split only at sentence ends (or commas in long sentences).
  Playback waits until the rest of the answer will be ready before it's needed,
  then plays every sentence back to back with a short pause, so speech doesn't
  stop mid-answer. The button shows "Preparing audio" with a percentage.
- **Voices:** pick one per language on the AI page (**Try** plays a sample).
  Only the clearest, most stable YarnGPT voices are offered: in tests, the
  English voices joke, emma, umar, remi and tayo were often unintelligible.

On an i5-1135G7 laptop, speech is generated about 2–3 times slower than it is
spoken, so a 3-sentence answer waits about 30 seconds and a 7-sentence answer
about 75 seconds before playing straight through. On an NVIDIA GPU it's about
real time. Remove `TTS_BASE_URL` to go back to instant device voices.

## Project layout

| Path | What it is |
| --- | --- |
| `src/app/(auth)/` | Log in, Sign up, Join a farm, and the auth Server Actions |
| `src/app/(portfolio)/` | Multi-farm Overview and My Farms |
| `src/app/(main)/` | The farm app: Dashboard, Production, Inventory, Finances, Analytics, Meetings, Team, AI |
| `src/app/api/ai/` | Chat (streams N-ATLaS), transcribe (voice in), speak (voice out), settings |
| `src/proxy.ts` | Sends signed-out visitors to the login page |
| `src/lib/auth.ts` | Passwords, sessions, and `getContext()` / `authorize()` (the data access layer) |
| `src/lib/schema.ts`, `seed.ts` | All tables and migrations; sample data for a brand-new install |
| `src/lib/db.ts` | Connection, batches and daily records |
| `src/lib/farms.ts` | Farms, memberships, join codes, team |
| `src/lib/inventory.ts`, `finances.ts`, `analytics.ts`, `meetings.ts`, `notifications.ts` | Each page's data and calculations |
| `src/lib/ai/` | N-ATLaS client and service status checks |
| `scripts/asr_server.py` | Local speech-to-text server (`npm run asr`) |
| `scripts/tts_server.py`, `tts.mjs` | Local YarnGPT text-to-speech server (`npm run tts`, `npm run tts:setup`) |
| `scripts/check-ai.mjs` | `npm run ai:check`: tests the N-ATLaS connection |

## N-ATLaS on Hugging Face

N-ATLaS isn't offered on Hugging Face's shared, pay-per-request Inference
Providers, so `router.huggingface.co` can't run it. Instead you deploy it to
your own **Inference Endpoint**: a dedicated GPU server on your Hugging Face
account, billed per hour while it's running.

1. **Accept the model terms.** Sign in to Hugging Face, open
   https://huggingface.co/NCAIR1/N-ATLaS and accept the licence (access is granted
   automatically).
2. **Create the endpoint.** On the model page choose **Deploy → Inference
   Endpoints** (or go to https://endpoints.huggingface.co and click **New**), then:
   - **Instance:** a GPU with 24GB, e.g. *NVIDIA L4* or *A10G*. 16GB cards are too
     small for the full-precision model.
   - **Container / engine:** vLLM (or TGI). Both give an OpenAI-compatible API.
   - **Security:** *Protected* (requests need your Hugging Face token).
   - **Autoscaling:** turn on *scale to zero* after ~15 minutes idle, so you only
     pay while it's in use. The first question after a pause takes a minute or two
     while it wakes; the app tells the user "the AI model is starting up".
   - Check the hourly price shown before you click **Create**.
3. **Create a token** at https://huggingface.co/settings/tokens. A fine-grained
   token with permission to *make calls to Inference Endpoints* is enough.
4. **Fill in `.env.local`** once the endpoint shows *Running*:
   ```bash
   LLM_BASE_URL=https://<your-endpoint>.endpoints.huggingface.cloud/v1
   LLM_MODEL=NCAIR1/N-ATLaS
   HF_TOKEN=hf_...
   LLM_REPETITION_PENALTY=1.12
   ```
5. **Check it:** `npm run ai:check`. It confirms the URL, token and model name, and
   tells you the right `LLM_MODEL` if the server uses a different name (TGI
   sometimes serves it as `tgi`). Then restart `npm run dev`.

Keep `HF_TOKEN` in `.env.local` only. It is git-ignored, and the token is used
on the server and never sent to the browser.

### Other ways to run it

- **vLLM on your own GPU:** `HF_TOKEN=hf_... vllm serve NCAIR1/N-ATLaS`, then
  `LLM_BASE_URL=http://localhost:8000/v1`.
- **Ollama** (CPU or small GPU, 4-bit community build):
  `ollama run hf.co/tosinamuda/N-ATLaS-GGUF:Q4_K_M`, then
  `LLM_BASE_URL=http://localhost:11434/v1`.

Without any AI settings the app still works, and the assistant shows a
"not configured" message.

### Licence notes

- N-ATLaS uses a custom research and innovation licence: free use is capped at
  **1,000 monthly active users**. Beyond that you need a commercial licence from
  Awarri and the Federal Ministry of Communications, Innovation and Digital Economy.
- Attribution is required. The chat panel already shows it.
- The model has an ~8K token context and no livestock or veterinary training.
  The app keeps prompts short, grounds answers in the farm's data, and tells
  users to consult a vet on health questions.
