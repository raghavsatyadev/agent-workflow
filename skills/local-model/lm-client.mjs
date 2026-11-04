// Shared client for the Node hooks and tools (lm-rank, lm-diffcheck, lm-loop, lm-route, lm-compress,
// jg-local-proxy): one /v1/systemone call. Every failure returns null, so the caller does nothing;
// nothing here prints.
//
//   import { ask, yesno, choice } from "./lm-client.mjs";
//   await yesno(text, "Is this about X?")           -> 0.97 (P(yes)) | null
//   await choice(text, "Which?", { a: "...", b: "..." }) -> { choice: "a", p: 0.93 } | null
//       (p = probability of the chosen label)
//   await ask(text, { key: { type: "noul", instructions: "..." } }) -> answers object | null
//
// Backend: the local model (Nimble on Ollama) unless the main backend is Jev (backend() below) AND
// the caller passes { jev: true }. Hooks never pass it, so they stay local and free; the tools a
// user or agent runs on purpose (lm-rank, lm-diffcheck, jgl) do. A failed Jev call falls back to
// the local model.
//
// Env, as for lm-ask: LM_BACKEND (local | jev; else ~/.local-model/backend, else local),
// LOCAL_MODEL_URL, LOCAL_MODEL_NAME, LOCAL_MODEL_MAX_BYTES, LOCAL_MODEL_KEEP_ALIVE,
// LOCAL_MODEL_HOOKS=0 (all off), LOCAL_MODEL_LOCAL=0 (no local model; legacy for LM_BACKEND=jev),
// JEV_API_KEY (else ~/.config/typesafe/api_key), JEV_URL, JEV_MODEL, JEV_MAX_BYTES.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const env = process.env;
const URL_ = (env.LOCAL_MODEL_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
const MODEL = env.LOCAL_MODEL_NAME || "nimble";
const BUDGET = Number(env.LOCAL_MODEL_MAX_BYTES || 16000);
const KEEP = env.LOCAL_MODEL_KEEP_ALIVE || "10m";
const HOME = os.homedir();

const read = (f) => {
  try {
    return fs.readFileSync(f, "utf8").trim();
  } catch {
    return "";
  }
};

// Main backend: LM_BACKEND, else the word in ~/.local-model/backend (written by lm-backend), else
// local. LOCAL_MODEL_LOCAL=0 is the older way to say jev.
export function backend() {
  const b = env.LM_BACKEND || read(path.join(HOME, ".local-model", "backend")) || (env.LOCAL_MODEL_LOCAL === "0" ? "jev" : "");
  return b === "jev" ? "jev" : "local";
}

// TypeSafe key: JEV_API_KEY when set (empty = none), else ~/.config/typesafe/api_key.
export function jevKey() {
  if (env.JEV_API_KEY !== undefined) return env.JEV_API_KEY.trim() || null;
  return read(path.join(HOME, ".config", "typesafe", "api_key")).replace(/\s+/g, "") || null;
}

// The local model's server answers (any HTTP reply counts).
export async function localUp() {
  if (env.LOCAL_MODEL_HOOKS === "0" || env.LOCAL_MODEL_LOCAL === "0") return false;
  try {
    await fetch(URL_, { signal: AbortSignal.timeout(800) });
    return true;
  } catch {
    return false;
  }
}

// Some backend can answer a call; jev as for targets().
export async function canAnswer({ jev = false } = {}) {
  if (env.LOCAL_MODEL_HOOKS === "0") return false;
  if (jev && jevKey()) return true;
  return localUp();
}

export const enabled = () => env.LOCAL_MODEL_HOOKS !== "0" && env.LOCAL_MODEL_LOCAL !== "0";

// Where to send a call, in order. jev: the caller allows Jev.
export function targets({ jev = false } = {}) {
  if (env.LOCAL_MODEL_HOOKS === "0") return [];
  const local = { name: "local", url: URL_, model: MODEL, key: null, budget: BUDGET };
  const out = [];
  const key = jev && backend() === "jev" ? jevKey() : null;
  if (key) {
    out.push({
      name: "jev",
      url: (env.JEV_URL || "https://api.typesafe.ai").replace(/\/$/, ""),
      model: env.JEV_MODEL || "jev-latest",
      key,
      budget: Number(env.JEV_MAX_BYTES || 100000),
    });
  }
  if (env.LOCAL_MODEL_LOCAL !== "0") out.push(local);
  return out;
}

// One POST to a target. Returns the raw response text, or null on a network error or timeout.
export async function post(t, body, timeoutMs) {
  const headers = { "Content-Type": "application/json" };
  if (t.key) headers.Authorization = `Bearer ${t.key}`;
  else body = { keep_alive: KEEP, ...body };
  try {
    const r = await fetch(`${t.url}/v1/systemone`, {
      method: "POST",
      headers,
      body: JSON.stringify({ model: t.model, ...body }),
      signal: AbortSignal.timeout(Math.max(500, timeoutMs)),
    });
    const text = await r.text();
    if (t.key) jevLog(text);
    return text;
  } catch {
    return null;
  }
}

// One line per Jev call in ~/.config/typesafe/usage.log (time, input tokens, caller), as
// local-model.sh does, so the spend is visible.
function jevLog(res) {
  const tok = /"input_tokens":(\d+)/.exec(res)?.[1] || "?";
  const f = path.join(HOME, ".config", "typesafe", "usage.log");
  const t = new Date().toISOString().replace("T", " ").slice(0, 19);
  try {
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.appendFileSync(f, `${t}\t${tok}\t${env.LOCAL_MODEL_CALLER || path.basename(process.argv[1] || "node")}\n`);
  } catch {}
}

// ASCII only (as local-model.sh does), CR dropped, tabs to spaces; the TAIL is kept.
const clean = (s) =>
  String(s)
    .replace(/\r/g, "")
    .replace(/\t/g, " ")
    .replace(/[^\n\x20-\x7e]/g, "?");

// One target: retries smaller when the server says the prompt has too many tokens.
async function askOne(t, all, questions, deadline) {
  let keep = t.budget - JSON.stringify(questions).length;
  if (keep < 1000) return null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await post(t, { state: all.slice(-keep), questions }, deadline - Date.now());
    if (res === null) return null;
    try {
      const j = JSON.parse(res);
      if (j.answers) return j.answers;
    } catch {}
    // Over the context: "prompt 0 has N tokens; expected 1-M tokens" -> cut to ~85% and retry.
    const n = /has (\d+) tokens/.exec(res)?.[1];
    const m = /expected \d*\D*(\d+)/.exec(res)?.[1];
    if (!n || !m) return null;
    keep = Math.floor((keep * Number(m) * 0.85) / Number(n));
    if (keep < 500) return null;
  }
  return null;
}

// { jev: true } lets the call use Jev when it is the main backend (Jev gets at least 20 s).
export async function ask(text, questions, { timeoutMs = 10000, jev = false } = {}) {
  const all = clean(text);
  const start = Date.now();
  for (const t of targets({ jev })) {
    const ms = t.key ? Math.max(timeoutMs, 20000) : timeoutMs;
    const a = await askOne(t, all, questions, Math.max(start + ms, Date.now() + 1000));
    if (a) return a;
  }
  return null;
}

export async function yesno(text, question, opts) {
  const a = await ask(text, { a: { type: "noul", instructions: question } }, opts);
  const v = a?.a?.noul;
  return typeof v === "number" ? v : null;
}

export async function choice(text, question, criteria, opts) {
  const a = await ask(text, { a: { type: "choice", instructions: question, criteria } }, opts);
  const c = a?.a?.choice;
  if (typeof c !== "string") return null;
  const p = a.a.probabilities?.[c];
  return { choice: c, p: typeof p === "number" ? p : null };
}

// Runs fn over items, `limit` at a time, keeping the order.
export async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// One tab-separated line in ~/.local-model/usage.log, like lm-ask. Never throws.
export async function usage(tool, ms, bytesIn, result, detail) {
  if (env.LOCAL_MODEL_USAGE_LOG === "0") return;
  const f = env.LOCAL_MODEL_USAGE_LOG_FILE || path.join(HOME, ".local-model", "usage.log");
  const flat = (s) => String(s).replace(/[\t\r\n]+/g, " ");
  try {
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.appendFileSync(f, [new Date().toISOString(), tool, ms, bytesIn, flat(result), process.cwd(), flat(detail)].join("\t") + "\n");
  } catch {}
}
