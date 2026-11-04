#!/usr/bin/env node
// Self-test for tool-guard.mjs: feeds it hook events and checks deny / allow / notes.
//   node skills/local-model/test/tool-guard.test.mjs     (exit 0 = all passed)
// JEV_API_KEY=x makes the "can lm-ask answer?" check pass without Ollama; nothing is sent anywhere.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const hook = path.join(here, "..", "tool-guard.mjs");
const sid = `selftest-${process.pid}`;
const state = path.join(os.homedir(), ".local-model", "state", `enforce-${sid}.json`);
const cwd = path.join(here, ".."); // has a folder (mod/) and files (SKILL.md)
const env = { ...process.env, JEV_API_KEY: "x", LOCAL_MODEL_USAGE_LOG: "0" };
for (const k of ["LOCAL_MODEL_HOOKS", "LOCAL_MODEL_ENFORCE"]) delete env[k];

fs.rmSync(state, { force: true }); // a leftover `force` from an aborted run would deny allow-list cases
const run = (o, envx = {}) => {
  const r = spawnSync("node", [hook], { input: JSON.stringify({ session_id: sid, cwd, ...o }), env: { ...env, ...envx }, cwd: o.cwd ?? cwd });
  return r.stdout.toString() + r.stderr.toString();
};
const pre = (tool_name, tool_input) => run({ hook_event_name: "PreToolUse", tool_name, tool_input }).includes('"deny"');
const post = (tool_name, tool_input, tool_response = { stdout: "ok" }) =>
  run({ hook_event_name: "PostToolUse", tool_name, tool_input, tool_response });

const DENY = [
  "adb logcat -d",
  "adb -s emulator-5554 logcat -d -v time",
  "adb shell logcat -d",
  "cat tmp/ci.log",
  "tail -n 200 tmp/gradle-agent-1.log",
  "tail -f app.log",
  "tail -n +5 x.log",
  "sed -n '1,500p' tmp/a1.log",
  "rg -n ERROR tmp/app.log",
  "grep -i fatal tmp/*.log",
  "adb logcat -d | rg FATAL",
  "cd x && cat tmp/all.log",
  "cat tombstone_03",
  "rg Exception -- hs_err_pid123.log",
  "adb logcat -d | tee x.txt",
  "rg -A 5 'a|b' tmp/ci.log",
  "less build/crash-dump.txt",
  "cat < tmp/a1.log",
  // wrappers
  'bash -c "cat tmp/ci.log"',
  "sh -c 'adb logcat -d'",
  'echo "$(cat tmp/ci.log)"',
  "echo `tail -n 500 x.log`",
  'powershell -Command "Get-Content tmp/ci.log"',
  'pwsh -Command "Select-String -Path tmp/ci.log -Pattern ERROR"',
  'bash -c "echo $(cat tmp/ci.log)"',
];
const ALLOW = [
  "adb logcat -d > tmp/logcat.txt",
  "adb logcat -d | ~/.local-model/lm-ask yesno 'crash?'",
  "adb logcat -d | rg -c FATAL",
  "adb logcat -d -t 20",
  "tail -n 20 tmp/ci.log",
  "tail tmp/ci.log",
  "head -30 tmp/ci.log",
  "sed -n '100,120p' tmp/ci.log",
  "sed -i 's/a/b/' x.log",
  "rg -c ERROR tmp/app.log",
  "rg -l ERROR tmp/",
  "rg -m 10 ERROR tmp/app.log",
  "rg -n ERROR tmp/app.log | head -20",
  "rg crash src/",
  "rg -n 'tombstone' app/src",
  "cat README.md",
  "~/.local-model/lm-ask choice 'root?' a=b c=d < tmp/x.log",
  "bash ~/.local-model/lm-ask yesno q < tmp/x.log",
  "LM_ENFORCE=0 cat tmp/ci.log",
  "adb logcat",
  "grep -nc x a.log",
  "wc -l tmp/*.log",
  "rg -n x a.log 2>&1 | tail -n 15",
  "cat x.log > /dev/null",
  "git log --oneline",
  "echo 'cat a.log'",
  // wrappers
  'bash -c "cat tmp/ci.log" | head -5',
  'bash -c "tail -n 10 tmp/ci.log"',
  "n=$(rg -c ERROR tmp/ci.log)",
  "~/.local-model/lm-ask yesno 'ok?' <<< \"$(cat tmp/ci.log)\"",
  "echo '$(cat tmp/ci.log)'",
  'powershell -Command "Get-Content tmp/ci.log -Tail 20"',
  'powershell -Command "Get-Content tmp/ci.log | Measure-Object -Line"',
  'pwsh -Command "Select-String -Path tmp/ci.log -Pattern ERROR -Quiet"',
];

const fails = [];
for (const c of DENY) if (!pre("Bash", { command: c })) fails.push(`should deny: ${c}`);
for (const c of ALLOW) if (pre("Bash", { command: c })) fails.push(`should allow: ${c}`);
const check = (ok, what) => ok || fails.push(what);
check(pre("Read", { file_path: "C:/x/tmp/ci.log" }), "Read log: deny");
check(!pre("Read", { file_path: "C:/x/tmp/ci.log", limit: 20 }), "Read log limit 20: allow");
check(!pre("Read", { file_path: "C:/x/a.kt" }), "Read .kt: allow");
check(pre("Grep", { pattern: "E", path: "tmp/ci.log", output_mode: "content" }), "Grep log content: deny");
check(!pre("Grep", { pattern: "E", path: "tmp/ci.log", output_mode: "count" }), "Grep log count: allow");
check(!pre("Grep", { pattern: "E", path: "tmp/ci.log", output_mode: "content", head_limit: 20 }), "Grep log head_limit 20: allow");

// big output: no note any more (lm-gate compresses it)
const big = { stdout: "x".repeat(6000) };
check(!post("Bash", { command: "git diff" }, big).includes("KB"), "6 KB output: no note");

// search counter: only code searches count
const SEARCH = "text searches";
const reset = () => post("Bash", { command: "~/.local-model/jgl q" });
const third = (a, b, c) => {
  reset();
  post(...a);
  post(...b);
  return post(...c).includes(SEARCH);
};
check(third(["Bash", { command: "rg foo" }], ["Grep", { pattern: "x" }], ["Bash", { command: "rg bar hooks" }]), "3 code searches: note");
check(!third(["Bash", { command: "rg foo" }], ["Bash", { command: "rg bar" }], ["Bash", { command: "grep -c x SKILL.md" }]), "grep -c on a named file: not a search");
check(!third(["Bash", { command: "rg foo" }], ["Bash", { command: "rg bar" }], ["Bash", { command: "git status | grep -n M" }]), "pipe filter: not a search");
check(!third(["Bash", { command: "rg foo" }], ["Bash", { command: "rg bar" }], ["Bash", { command: "rg -n x tool-guard.mjs" }]), "rg in a named file: not a search");
check(!third(["Bash", { command: "rg foo" }], ["Bash", { command: "rg bar" }], ["Grep", { pattern: "x", output_mode: "count" }]), "Grep count: not a search");
check(!third(["Bash", { command: "rg foo" }], ["Bash", { command: "rg bar" }], ["Grep", { pattern: "x", path: "SKILL.md" }]), "Grep in a named file: not a search");
check(third(["Bash", { command: "rg foo" }], ["Bash", { command: "grep -rn x ." }], ["Bash", { command: "rg x 'src/*.kt'" }]), "grep -r and glob: searches");
reset();
post("Bash", { command: "rg a" });
post("Edit", {});
post("Bash", { command: "rg b" });
check(!post("Bash", { command: "rg c" }).includes(SEARCH), "edit resets the count");

// ---- steering to gq / jgl, and the one-time deny ----------------------------------------------
// Temp repos, so the result does not depend on graphs on this machine. The local model is made
// unreachable, so jgl is never the pick here (classify covers "meaning").
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tool-guard-"));
const mk = (...p) => fs.mkdirSync(path.join(tmp, ...p), { recursive: true });
mk("g", ".git"); mk("g", "graphify-out"); mk("g", "src");
fs.writeFileSync(path.join(tmp, "g", "graphify-out", "graph.json"), "{}");
mk("n", ".git"); mk("n", "src");
mk("wt"); fs.writeFileSync(path.join(tmp, "wt", ".git"), `gitdir: ${path.join(tmp, "g", ".git", "worktrees", "wt")}
`);
const gqFile = path.join(tmp, "gq");
fs.writeFileSync(gqFile, "");
const senv = { LOCAL_MODEL_GQ: gqFile, LOCAL_MODEL_URL: "http://127.0.0.1:9", JEV_API_KEY: "" };
const at = (dirName) => path.join(tmp, dirName);
const spost = (d, tool_name, tool_input) => run({ hook_event_name: "PostToolUse", cwd: at(d), tool_name, tool_input }, senv);
const spre = (d, tool_name, tool_input) => run({ hook_event_name: "PreToolUse", cwd: at(d), tool_name, tool_input }, senv).includes('"deny"');
const three = (d, cmd) => (spost(d, "Bash", { command: cmd }), spost(d, "Bash", { command: cmd }), spost(d, "Bash", { command: cmd }));

fs.rmSync(state, { force: true });
let out = three("g", "rg -n MainActivity");
check(out.includes('gq explain \\"MainActivity\\"') && !out.includes("refused"), "name search, graph: steer to gq");
check(!spre("g", "Bash", { command: "rg -n MainActivity" }), "one nudge: no deny yet");
out = three("g", "rg -n MainActivity");
check(out.includes("refused once"), "second nudge warns of the deny");
check(!spre("g", "Bash", { command: 'rg -n "error: cannot find"' }), "forced, exact string: allow");
check(spre("g", "Bash", { command: "rg -n MainActivity src" }), "forced, name: deny");
check(!spre("g", "Bash", { command: "rg -n MainActivity src" }), "deny happens once");
three("g", "rg UserRepo"); three("g", "rg UserRepo");
check(!spre("g", "Bash", { command: "LM_ENFORCE=0 rg UserRepo" }), "forced, LM_ENFORCE=0: allow");
const gdeny = run({ hook_event_name: "PreToolUse", cwd: at("g"), tool_name: "Grep", tool_input: { pattern: "UserRepo" } }, senv);
check(gdeny.includes('"deny"') && gdeny.includes("repeat the same Grep"), "forced Grep: deny, says retry runs");
for (const gq of ["bash ~/.code-graph/gq explain X", "~/.code-graph/gq query x"]) {
  fs.rmSync(state, { force: true });
  spost("g", "Bash", { command: "rg A1" }); spost("g", "Bash", { command: "rg A2" });
  spost("g", "Bash", { command: gq });
  check(!spost("g", "Bash", { command: "rg A3" }).includes(SEARCH), `${gq.split(" ").slice(-2, -1)} via ${gq.split(" ")[0]}: resets`);
}
fs.rmSync(state, { force: true });
out = three("n", "rg -n MainActivity");
check(out.includes(SEARCH) && !out.includes("gq"), "no graph: generic note, no gq");
check(three("wt", "rg -n MainActivity").includes("gq explain"), "worktree of a repo with a graph: gq");
for (const d of ["g", "n"]) {
  fs.rmSync(state, { force: true });
  out = "";
  for (let i = 0; i < 6; i++) out = spost(d, "Read", { file_path: path.join(at(d), "src", `f${i}.kt`) });
  check(out.includes("gq query") === (d === "g"), `6 reads: ${d === "g" ? "gq note" : "no note without a graph"}`);
}
fs.rmSync(state, { force: true });
for (let i = 0; i < 6; i++) out = spost("g", "Read", { file_path: path.join(at("g"), "src", "same.kt") });
check(!out.includes("gq query"), "same file read 6 times: no note");

const { classify, findGraph } = await import(new URL("../search-steer.mjs", import.meta.url));
const kinds = { [String.raw`\bUserRepo\b`]: "name", "class MainActivity": "name", [String.raw`fun onCreate\(`]: "name", "grepInfo|parse": "name",
  user_id: "name", "where is the token refreshed": "meaning", "error: cannot find": "exact", foo: "exact", TODO: "exact" };
for (const [p, k] of Object.entries(kinds)) check(classify(p).kind === k, `classify ${p}: ${k}`);
check(findGraph(at("wt")).graph && !findGraph(at("n")).graph, "findGraph: worktree yes, plain no");

fs.rmSync(tmp, { recursive: true, force: true });
fs.rmSync(state, { force: true });
const total = DENY.length + ALLOW.length + 17 + 17 + Object.keys(kinds).length;
if (fails.length) {
  console.log(fails.join("\n"));
  console.log(`${fails.length} of ${total} FAILED`);
  process.exit(1);
}
console.log(`all ${total} passed`);
