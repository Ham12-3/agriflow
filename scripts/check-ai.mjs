// Checks that the N-ATLaS endpoint in .env.local is reachable and answering.
// Usage: npm run ai:check

const ok = (msg) => console.log(`  ✔ ${msg}`);
const fail = (msg, hint) => {
  console.error(`  ✖ ${msg}`);
  if (hint) console.error(`    → ${hint}`);
  process.exit(1);
};

let baseURL = process.env.LLM_BASE_URL?.trim().replace(/\/+$/, "");
const model = process.env.LLM_MODEL?.trim();
const apiKey = process.env.LLM_API_KEY || process.env.HF_TOKEN;

console.log("\nAgriflow AI connection check\n");

if (!baseURL) fail("LLM_BASE_URL is not set", "Copy .env.example to .env.local and fill it in.");
if (baseURL.includes(".endpoints.huggingface.cloud") && !baseURL.endsWith("/v1")) {
  baseURL += "/v1";
}
ok(`Endpoint: ${baseURL}`);
if (!apiKey && baseURL.startsWith("https://")) {
  fail("No HF_TOKEN / LLM_API_KEY set", "Create a token at https://huggingface.co/settings/tokens");
}
if (apiKey) ok(`Token: ${apiKey.slice(0, 3)}… (${apiKey.length} chars)`);

const headers = {
  "Content-Type": "application/json",
  ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
};

function explain(status) {
  if (status === 401) return "The token was rejected. Check HF_TOKEN is correct and not expired.";
  if (status === 403) return "The token can't access this endpoint. Use a token from the account that owns it.";
  if (status === 404) return "Nothing at this URL. Copy the endpoint URL again from the Hugging Face dashboard.";
  if (status === 503) return "The endpoint is starting or scaled to zero. Wait a minute or two and run this again.";
  return undefined;
}

// 1. Which model names does the server expose?
let served = [];
try {
  const res = await fetch(`${baseURL}/models`, { headers, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) fail(`GET /models returned ${res.status}`, explain(res.status));
  const body = await res.json();
  served = (body.data ?? []).map((m) => m.id);
  ok(`Server is up. Models served: ${served.join(", ") || "(none listed)"}`);
} catch (err) {
  fail(`Could not reach the endpoint: ${err.message}`, "Check the URL and that the endpoint is running.");
}

if (!model) {
  fail("LLM_MODEL is not set", served.length ? `Set LLM_MODEL=${served[0]}` : undefined);
}
if (served.length && !served.includes(model)) {
  fail(`LLM_MODEL "${model}" is not one of the served models`, `Set LLM_MODEL=${served[0]}`);
}
ok(`Model: ${model}`);

// 2. Can it actually answer?
// The first request can be slow: the server may need to load the model into memory.
console.log("  … asking a test question (the first one can take a few minutes)");
const started = Date.now();
const res = await fetch(`${baseURL}/chat/completions`, {
  method: "POST",
  headers,
  signal: AbortSignal.timeout(300_000),
  body: JSON.stringify({
    model,
    temperature: 0.1,
    max_tokens: 40,
    messages: [
      { role: "system", content: "You are a helpful assistant. Answer in one short sentence." },
      { role: "user", content: "Kí ni ìtumọ̀ 'ẹran ọ̀sìn' ní èdè Gẹ̀ẹ́sì?" },
    ],
  }),
}).catch((err) =>
  fail(
    `No answer: ${err.name === "TimeoutError" ? "timed out after 5 minutes" : err.message}`,
    "The model may still be loading. Run this again in a minute.",
  ),
);
if (!res.ok) {
  fail(`Chat request returned ${res.status}: ${(await res.text()).slice(0, 200)}`, explain(res.status));
}
const reply = (await res.json()).choices?.[0]?.message?.content?.trim();
if (!reply) fail("The model returned an empty reply.");
ok(`Reply in ${((Date.now() - started) / 1000).toFixed(1)}s: "${reply}"`);

console.log("\nAll good — restart `npm run dev` and try Ask Agriflow AI.\n");
