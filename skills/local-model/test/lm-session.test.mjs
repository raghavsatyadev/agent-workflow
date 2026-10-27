#!/usr/bin/env node
// Self-test for lm-session.mjs: synthetic transcripts in a temp folder, checks warn / quiet.
//   node skills/local-model/test/lm-session.test.mjs     (exit 0 = all passed)
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const hook = path.join(here, "..", "lm-session.mjs");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lm-session-"));
const stateDir = path.join(os.homedir(), ".local-model", "state");
const env = { ...process.env, LOCAL_MODEL_USAGE_LOG: "0" };
for (const k of ["LOCAL_MODEL_HOOKS", "LOCAL_MODEL_SESSION", "LM_SESSION_CTX", "LM_SESSION_HOURS", "LM_SESSION_EVERY"]) delete env[k];

const iso = (hAgo) => new Date(Date.now() - hAgo * 3600e3).toISOString();
const reply = (ctx, extra = {}) => ({
  type: "assistant",
  timestamp: iso(0),
  requestId: "r" + Math.random(),
  message: { model: "claude-opus-5-5", usage: { input_tokens: 5, cache_creation_input_tokens: 1000, cache_read_input_tokens: ctx - 1005, output_tokens: 50 } },
  ...extra,
});
let n = 0;
const transcript = (entries) => {
  const f = path.join(tmp, `t${n++}.jsonl`);
  fs.writeFileSync(f, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
  return f;
};
const sids = [];
const run = (f, sid = `selftest-${process.pid}-${n}`, envx = {}) => {
  sids.push(sid);
  const r = spawnSync("node", [hook], { input: JSON.stringify({ session_id: sid, transcript_path: f, prompt: "next thing" }), env: { ...env, ...envx } });
  return r.stdout.toString();
};
const start = (hAgo) => ({ type: "user", timestamp: iso(hAgo), message: { role: "user", content: "hi" } });

let fail = 0;
const check = (name, ok) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}`);
  if (!ok) fail++;
};

const big = transcript([start(0.5), reply(150000)]);
const out = run(big);
check("over 100k warns", out.includes('"systemMessage"') && out.includes("150k") && out.includes("additionalContext"));
check("small context is quiet", run(transcript([start(0.5), reply(20000)])) === "");
check("old + over half warns", run(transcript([start(5), reply(60000)])).includes("5.0 h old"));
check("old + small context is quiet (after /compact)", run(transcript([start(5), reply(30000)])) === "");
check("sidechain reply ignored", run(transcript([start(0.5), reply(20000), reply(180000, { isSidechain: true })])) === "");
check("synthetic reply ignored", run(transcript([start(0.5), reply(20000), { ...reply(180000), message: { model: "<synthetic>", usage: { input_tokens: 180000 } } }])) === "");
check("threshold env", run(transcript([start(0.5), reply(60000)]), undefined, { LM_SESSION_CTX: "50000" }).includes("60k"));
check("off switch", run(big, undefined, { LOCAL_MODEL_SESSION: "0" }) === "");
check("missing transcript is quiet", run(path.join(tmp, "nope.jsonl")) === "");
const bad = spawnSync("node", [hook], { input: "not json", env });
check("bad input is quiet, exit 0", bad.stdout.toString() === "" && bad.status === 0);

// Repeat: one warning, then quiet for 4 prompts, then again.
const sid = `selftest-${process.pid}-repeat`;
const seq = Array.from({ length: 6 }, () => run(big, sid) !== "");
check("warns every 5th prompt", JSON.stringify(seq) === JSON.stringify([true, false, false, false, false, true]));

for (const s of sids) fs.rmSync(path.join(stateDir, `session-${s}.json`), { force: true });
fs.rmSync(tmp, { recursive: true, force: true });
console.log(fail ? `${fail} failed` : "all passed");
process.exit(fail ? 1 : 0);
