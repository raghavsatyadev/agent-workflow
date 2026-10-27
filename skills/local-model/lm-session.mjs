#!/usr/bin/env node
// UserPromptSubmit hook: says when a session has grown long enough that a new request is cheaper
// in a new session. Every reply re-reads the whole context, so a 150k-token session pays for those
// tokens on every turn, even when the new request has nothing to do with them.
//   Warns when the context (input + cache write + cache read of the latest main-chain reply) is
//   over LM_SESSION_CTX (default 100000) tokens, or the session is older than LM_SESSION_HOURS
//   (default 3) and its context is over half that.
//   After a warning, stays quiet for LM_SESSION_EVERY (default 5) prompts.
// Output: systemMessage (shown to the user) and additionalContext (Claude mentions it in one line
// if the new request is unrelated). Warns only; never blocks. Any error -> no output.
// Reads only the first 64 KB (start time) and last 512 KB (latest usage) of the transcript.
// Off: LOCAL_MODEL_HOOKS=0 or LOCAL_MODEL_SESSION=0.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { usage } from "./lm-client.mjs";

const env = process.env;
const CTX = Number(env.LM_SESSION_CTX) || 100000;
const HOURS = Number(env.LM_SESSION_HOURS) || 3;
const EVERY = Number(env.LM_SESSION_EVERY) || 5;

function readSlice(f, start, len) {
  const fd = fs.openSync(f, "r");
  try {
    const buf = Buffer.alloc(len);
    const n = fs.readSync(fd, buf, 0, len, start);
    return buf.subarray(0, n).toString("utf8");
  } finally {
    fs.closeSync(fd);
  }
}

const parse = (line) => {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
};

// First timestamp in the file, in ms.
function startTime(f) {
  for (const line of readSlice(f, 0, 64 * 1024).split("\n")) {
    const t = Date.parse(parse(line)?.timestamp ?? "");
    if (t) return t;
  }
  return null;
}

// Context size of the latest main-chain assistant reply, or null.
function contextTokens(f) {
  const size = fs.statSync(f).size;
  const tail = 512 * 1024;
  const lines = readSlice(f, Math.max(0, size - tail), tail).split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const d = parse(lines[i]);
    const u = d?.message?.usage;
    if (d?.type !== "assistant" || !u || d.isSidechain || d.message.model === "<synthetic>") continue;
    return (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
  }
  return null;
}

function main() {
  if (env.LOCAL_MODEL_HOOKS === "0" || env.LOCAL_MODEL_SESSION === "0") return;
  const input = JSON.parse(fs.readFileSync(0, "utf8"));
  const f = input.transcript_path;
  if (!f || !fs.existsSync(f)) return;

  const sid = String(input.session_id || path.basename(f, ".jsonl")).replace(/[^\w.-]/g, "_");
  const dir = path.join(os.homedir(), ".local-model", "state");
  const sf = path.join(dir, `session-${sid}.json`);
  let st = { prompts: 0, warnedAt: -1e9 };
  try {
    st = { ...st, ...JSON.parse(fs.readFileSync(sf, "utf8")) };
  } catch {}
  st.prompts++;

  const ctx = contextTokens(f);
  const t0 = startTime(f);
  const hours = t0 ? (Date.now() - t0) / 3600e3 : 0;
  const long = ctx !== null && (ctx > CTX || (hours > HOURS && ctx > CTX / 2));
  const warn = long && st.prompts - st.warnedAt >= EVERY;
  if (warn) st.warnedAt = st.prompts;
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(sf, JSON.stringify(st));
  } catch {}
  if (!warn) return;

  const k = Math.round(ctx / 1000);
  const age = hours >= 1 ? `${hours.toFixed(1)} h old, ` : "";
  const msg =
    `This session is ${age}${k}k tokens of context; every reply re-reads all of it. ` +
    `If this is a new request, a new session is cheaper (carry over only what it needs).`;
  const ctxNote =
    `[lm-session] ${msg} If the user's request is unrelated to the earlier work in this session, ` +
    `do not do it here: reply only that it is a new task for a new session, plus a short brief to paste ` +
    `there (only the context it needs). Do it here only if the user then insists. ` +
    `If it continues the same work, say nothing about this.`;
  process.stdout.write(
    JSON.stringify({
      systemMessage: msg,
      hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: ctxNote },
    }),
  );
  return { k, hours };
}

try {
  const r = main();
  if (r) await usage("lm-session", 0, 0, `warned ${r.k}k ${r.hours.toFixed(1)}h`, "");
} catch {}
