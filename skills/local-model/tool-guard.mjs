#!/usr/bin/env node
// Enforce: makes the agent use lm-ask, jgl and lm-rank instead of pouring logs into its context.
// Instructions and memory do not do this on their own; a refused call does. One script, two hooks
// (the token-saver plugin adds them):
//
//   PreToolUse   Bash|Read|Grep   denies a log dump before it runs, and names the fix:
//     - `adb logcat -d` (no -t N), `cat`/`less`/`tac` on a log, `head`/`tail -n` over the line
//       limit, `tail -f`, `sed` on a log (except -i or a small `-n 'a,bp'` range), `rg`/`grep` on a
//       log without -c/-l/-q or -m N. Allowed when a later pipe stage cuts it down (lm-ask, lm-rank,
//       wc, rg -c, head/tail within the limit) or stdout goes to a file (`> tmp/x.log`).
//     - Read of a log with no `limit` or one over the line limit; Grep content mode on a log
//       with no head_limit within the line limit.
//     The body of `bash -c "..."`, `sh -c`, `powershell -Command "..."` (Get-Content, Select-String),
//     $(...) and backticks is checked the same way, two levels deep.
//     A log is a path matching LOCAL_MODEL_ENFORCE_LOGS (default: *.log, *.trace, tmp/gradle-agent-*,
//     tombstones, hs_err_pid*, *crash*.txt, anr*.txt, logcat*.txt, bugreport*.txt).
//     Nothing is denied when neither the local model nor a Jev key could answer lm-ask.
//   PostToolUse  Bash|Grep|Read|Edit|Write|MultiEdit|NotebookEdit   adds a note to the agent's context:
//     - LOCAL_MODEL_ENFORCE_SEARCHES (default 3) code searches in a row -> names the better tool for
//       that search (search-steer.mjs): gq for a code name in a repo with a code graph, jgl for free
//       text, else the jgl / lm-rank hint. A code search is rg/grep over a folder, a glob or the
//       working folder as the first pipeline stage, or the Grep tool on a folder outside count mode;
//       `cmd | grep x` and a look inside a named file do not count.
//     - LOCAL_MODEL_ENFORCE_READS (default 6) different source files Read in a repo with a code
//       graph -> "ask gq query".
//     gq, jgl, jg, lm-rank or a file edit resets the counts.
//   Forcing: after the second search note, PreToolUse refuses the next code search that gq or jgl
//     answers better, once, and says how to run it anyway. Exact strings are never refused.
//
// Hooks also run inside subagents, so this covers them. Off: LOCAL_MODEL_HOOKS=0 or
// LOCAL_MODEL_ENFORCE=0 in the environment, or LM_ENFORCE=0 in one command.
// LOCAL_MODEL_ENFORCE_LINES (default 30) is the line limit. One line per deny or note in usage.log.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { canAnswer, usage } from "./lm-client.mjs";
import { GREPS, grepInfo, num, parse } from "./shell-parse.mjs";
import { findGraph, pick } from "./search-steer.mjs";

const env = process.env;
if (env.LOCAL_MODEL_HOOKS === "0" || env.LOCAL_MODEL_ENFORCE === "0") process.exit(0);
const LINES = Number(env.LOCAL_MODEL_ENFORCE_LINES || 30);
const SEARCHES = Number(env.LOCAL_MODEL_ENFORCE_SEARCHES || 3);
const READS = Number(env.LOCAL_MODEL_ENFORCE_READS || 6);
const LOG_RE = new RegExp(
  env.LOCAL_MODEL_ENFORCE_LOGS ||
    String.raw`(\.log(\.\d+)?|\.trace)$|(^|/)tmp/gradle-agent-[^/]*$|(^|/)(tombstone[^/]*|hs_err_pid[^/]*|[^/]*crash[^/]*\.txt|anr[^/]*\.txt|logcat[^/]*\.txt|bugreport[^/]*\.txt)$`,
  "i",
);
const LM = "~/.local-model/lm-ask";
const EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);

let input;
try {
  input = JSON.parse(fs.readFileSync(0, "utf8"));
} catch {
  process.exit(0);
}
const event = input.hook_event_name;
const tool = input.tool_name;
const ti = input.tool_input || {};
const isLog = (p) => typeof p === "string" && LOG_RE.test(p.replace(/\\/g, "/"));
const emit = (o) => process.stdout.write(JSON.stringify(o));

// ---- what counts as a dump, and what cuts one down ---------------------------------------------

// head/tail: lines it prints (Infinity for -f or +N), 10 by default
function headTailLines(st) {
  let n = 10;
  const a = st.args;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    if (/^-[a-zA-Z]*f/.test(x) || x === "--follow" || x.startsWith("--follow=")) return Infinity;
    let v = null;
    if (x === "-n" || x === "--lines") v = a[++i];
    else if (/^-n.+/.test(x)) v = x.slice(2);
    else if (x.startsWith("--lines=")) v = x.slice(8);
    else if (/^-\d+$/.test(x)) v = x.slice(1);
    else if (x === "-c" || x === "--bytes" || /^-c\d/.test(x) || x.startsWith("--bytes=")) return 1; // bytes: small enough
    if (v === null) continue;
    if (String(v).startsWith("+") && st.cmd === "tail") return Infinity;
    n = num(String(v).replace(/^-/, ""));
    if (Number.isNaN(n)) return Infinity;
  }
  return n;
}

// stage -> kind of dump it is ("logcat" | "read" | "search") or null
function dump(st) {
  const { cmd, args } = st;
  if (cmd === "adb") {
    const words = args.join(" ").split(/\s+/);
    const at = words.indexOf("logcat");
    if (at < 0) return null;
    const after = words.slice(at + 1);
    const dumpFlag = after.some((x) => x === "-d" || x === "--dump" || /^-[a-zA-Z]*d[a-zA-Z]*$/.test(x));
    const t = after.findIndex((x) => x === "-t" || x === "-T");
    const tail = t >= 0 ? num(after[t + 1] ?? "") : NaN;
    if (dumpFlag && !(tail <= LINES)) return "logcat";
    return null;
  }
  const files = () => [...args.filter((x) => !x.startsWith("-")), ...st.in];
  if (["cat", "tac", "less", "more", "bat", "batcat", "nl", "type", "strings"].includes(cmd))
    return files().some(isLog) ? "read" : null;
  if (cmd === "head" || cmd === "tail")
    return files().some(isLog) && headTailLines(st) > LINES ? "read" : null;
  if (cmd === "sed") {
    if (!files().some(isLog) || args.some((x) => /^-[a-zA-Z]*i/.test(x) || x.startsWith("--in-place"))) return null;
    const script = args.find((x) => /^\d+(,\d+)?p$/.test(x));
    if (args.includes("-n") && script) {
      const [a, b = a] = script.slice(0, -1).split(",").map(Number);
      if (b - a + 1 <= LINES) return null;
    }
    return "read";
  }
  if (GREPS.has(cmd)) {
    const g = grepInfo(st);
    return g.files.some(isLog) && !g.small ? "search" : null;
  }
  // PowerShell, reached through `powershell -Command "..."`
  if (cmd === "get-content" || cmd === "gc") {
    if (!files().some(isLog)) return null;
    const n = args.findIndex((x) => /^-(tail|totalcount|head|first|last)$/i.test(x));
    const small = n >= 0 && num(args[n + 1] ?? "") <= LINES && !args.some((x) => /^-wait$/i.test(x));
    return small ? null : "read";
  }
  if (cmd === "select-string" || cmd === "sls")
    return files().some(isLog) && !args.some((x) => /^-(quiet|list)$/i.test(x)) ? "search" : null;
  return null;
}

// a later stage that cuts the output down to a verdict, a count or a few lines
function cuts(st) {
  if (["lm-ask", "lm-rank", "wc", "jgl", "measure-object"].includes(st.cmd)) return true;
  if (st.cmd === "select-object") {
    const n = st.args.findIndex((x) => /^-(first|last)$/i.test(x));
    return n >= 0 && num(st.args[n + 1] ?? "") <= LINES;
  }
  if (st.cmd === "head" || st.cmd === "tail") return headTailLines(st) <= LINES;
  if (GREPS.has(st.cmd)) return grepInfo(st).small;
  return st.out;
}

const FIX = {
  logcat: (ex) =>
    `\`${ex}\` dumps the whole log buffer into your context. Save it to a file and ask the local model:\n` +
    `  adb logcat -d > tmp/logcat.txt\n` +
    `  ${LM} choice "What is the root cause of the failure?" crash="app crash" anr="ANR" other="other" < tmp/logcat.txt\n` +
    `For exact lines: \`rg -c PATTERN tmp/logcat.txt\`, then \`rg -m 20 PATTERN tmp/logcat.txt\`, or \`adb logcat -d -t ${LINES}\`.`,
  read: (ex) =>
    `\`${ex}\` prints a log into your context. Ask the local model instead:\n` +
    `  ${LM} yesno "Did it succeed?" < FILE\n` +
    `  ${LM} choice "What is the root cause?" a="..." b="..." other="other" < FILE\n` +
    `For exact lines: \`rg -c PATTERN FILE\` first, then \`rg -m 20 PATTERN FILE\` or \`tail -n ${LINES} FILE\`.`,
  search: (ex) =>
    `\`${ex}\` prints every match in a log into your context. Count first (\`rg -c PATTERN FILE\`), then ` +
    `print a few (\`rg -m 20 PATTERN FILE\`, or pipe to \`head -n ${LINES}\`), or ask the local model: ` +
    `\`${LM} choice "<question>" a="..." other="other" < FILE\`.`,
};

// first dump that nothing after it cuts down; a wrapper or $(...) body counts unless its own
// stage or a later one cuts it (`bash -c "cat a.log" | head -5`, `lm-ask q <<< "$(cat a.log)"`)
function findDump(pipelines) {
  for (const pipe of pipelines)
    for (let i = 0; i < pipe.length; i++) {
      if (pipe.slice(i).some(cuts)) continue;
      if (pipe[i].inner.length) {
        const hit = findDump(pipe[i].inner);
        if (hit) return hit;
      }
      const kind = dump(pipe[i]);
      if (kind) return { kind, st: pipe[i] };
    }
  return null;
}

// lm-ask can answer: a Jev key (env or file) or the local model up
const canAsk = () => canAnswer({ jev: true });

// needAsk: only deny when lm-ask could answer (the log fixes point at it)
async function deny(kind, detail, reason, needAsk = true) {
  if (needAsk && !(await canAsk())) process.exit(0);
  await usage("tool-guard", 0, 0, `denied ${kind}`, detail);
  emit({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: `[tool-guard] ${reason}`,
    },
  });
  process.exit(0);
}

const command = String(ti.command ?? "");
const short = (s) => (s.length > 100 ? s.slice(0, 97) + "..." : s);
const bypass = /\bLM_ENFORCE=0\b/.test(command);
const cwd = input.cwd || process.cwd();

// Per-session counters: searches since the last nudge, nudges and source files read since the last
// gq/jgl/jg/lm-rank or edit, and `force` (deny the next steerable search once).
const sid = String(input.session_id || "").replace(/[^\w-]/g, "");
const dir = path.join(os.homedir(), ".local-model", "state");
const file = path.join(dir, `enforce-${sid}.json`);
let state = {};
try {
  if (sid) state = JSON.parse(fs.readFileSync(file, "utf8"));
} catch {}
const save = () => {
  if (!sid) return;
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(state));
    // Old sessions: drop state files untouched for 2 days.
    const cut = Date.now() - 2 * 86400e3;
    for (const f of fs.readdirSync(dir))
      if (f.startsWith("enforce-") && fs.statSync(path.join(dir, f)).mtimeMs < cut) fs.rmSync(path.join(dir, f), { force: true });
  } catch {}
};
const reset = () => {
  const had = state.searches || state.nudges || state.force || state.reads?.length;
  state = {};
  if (had) save();
};

// A search for code: rg/grep over a folder, a glob or the working folder, as the first pipeline
// stage. Not `cmd | grep x` (a filter) and not a look inside files named explicitly.
const isDir = (p) => {
  try {
    return fs.statSync(path.resolve(cwd, p)).isDirectory();
  } catch {
    return false;
  }
};
function codeSearch(st) {
  if (!st || !GREPS.has(st.cmd)) return false;
  const { files } = grepInfo(st);
  if (files.length) return files.some((f) => isDir(f) || /[*?[]/.test(f));
  const plainGrep = ["grep", "egrep", "fgrep", "zgrep"].includes(st.cmd);
  return !plainGrep || st.args.some((x) => x === "--recursive" || /^-[a-zA-Z]*[rR]/.test(x));
}
const GOOD = ["gq", "jgl", "jg", "lm-rank"];
const pipelines = tool === "Bash" && command && !bypass ? parse(command) : [];
const usedGood = pipelines.flat().some((st) => GOOD.includes(st.cmd));
const searchStage = pipelines.map((p) => p[0]).find(codeSearch);
// pattern of this call when it is a code search, else null
const searchPattern =
  tool === "Grep" && ti.output_mode !== "count" && (!ti.path || isDir(ti.path))
    ? String(ti.pattern ?? "")
    : !usedGood && searchStage
      ? String(grepInfo(searchStage).pattern ?? "")
      : null;

if (event === "PreToolUse") {
  if (tool === "Bash") {
    if (!command || bypass) process.exit(0);
    const hit = findDump(pipelines);
    if (hit) await deny(hit.kind, command, FIX[hit.kind](short([hit.st.cmd, ...hit.st.args].join(" "))));
  } else if (tool === "Read" && isLog(ti.file_path)) {
    if (ti.limit && ti.limit <= LINES) process.exit(0);
    await deny(
      "read",
      ti.file_path,
      `Reading ${path.basename(ti.file_path)} loads the whole log into your context. Ask the local model:\n` +
        `  ${LM} choice "What is the root cause?" a="..." other="other" < "${ti.file_path}"\n` +
        `For exact lines: Grep with output_mode "count" first, then Read with offset and limit <= ${LINES}.`,
    );
  } else if (tool === "Grep" && (isLog(ti.path) || isLog(ti.glob)) && ti.output_mode === "content") {
    const limit = ti.head_limit ?? 250;
    if (limit > 0 && limit <= LINES) process.exit(0);
    await deny(
      "search",
      `${ti.pattern} ${ti.path ?? ti.glob}`,
      `Grep content mode on a log prints every match. Use output_mode "count" first, then head_limit <= ${LINES}, ` +
        `or ask the local model: \`${LM} choice "<question>" a="..." other="other" < FILE\`.`,
    );
  }
  // Forced: after repeated nudges, the next search that gq or jgl answers better is refused once.
  if (state.force && searchPattern !== null) {
    const better = await pick(searchPattern, cwd);
    if (better) {
      state.force = false;
      state.nudges = 0;
      save();
      const again =
        tool === "Grep"
          ? "Refused once: if you need this exact text, repeat the same Grep and it will run."
          : `Refused once: for an exact string, run it as \`LM_ENFORCE=0 rg -n "..."\`.`;
      await deny(`search-${better.tool}`, tool === "Grep" ? `Grep ${ti.pattern}` : command,
        `You keep searching text after earlier notes. For "${short(searchPattern)}" use ${better.text}\n${again}`, false);
    }
  }
  process.exit(0);
}

if (event !== "PostToolUse" || !sid) process.exit(0);

if (EDIT_TOOLS.has(tool) || usedGood) {
  reset();
  process.exit(0);
}

const notes = [];
if (searchPattern !== null) {
  state.searches = (state.searches || 0) + 1;
  if (state.searches >= SEARCHES) {
    const better = await pick(searchPattern, cwd);
    notes.push(
      `[tool-guard] ${state.searches} text searches in a row. ` +
        (better
          ? `For "${short(searchPattern)}" use ${better.text}`
          : `If you do not know the exact name, ask by meaning: \`~/.local-model/jgl --files "<what the code does>"\`. ` +
            `If the hits are many, let \`~/.local-model/lm-rank\` pick the files worth opening. Keep rg for exact names and error strings.`) +
        (state.nudges >= 1 ? ` The next search like this is refused once.` : ""),
    );
    await usage("tool-guard", 0, 0, `search-nudge${better ? "-" + better.tool : ""}`, tool === "Grep" ? `Grep ${ti.pattern}` : command);
    state.searches = 0;
    state.nudges = (state.nudges || 0) + 1;
    if (state.nudges >= 2) state.force = true;
  }
} else if (tool === "Read" && ti.file_path && !isLog(ti.file_path)) {
  // Opening file after file to learn how code fits together: the graph answers that in one call.
  const f = path.resolve(cwd, ti.file_path);
  const reads = new Set(state.reads || []);
  reads.add(f);
  state.reads = [...reads];
  if (reads.size >= READS) {
    if (findGraph(cwd).graph) {
      notes.push(
        `[tool-guard] ${reads.size} files opened with no edit. To learn how code fits together, ask the code graph: ` +
          `\`bash ~/.code-graph/gq query "<question>"\` or \`gq explain "<Name>"\` (file:line, callers, callees).`,
      );
      await usage("tool-guard", 0, 0, "read-nudge-gq", f);
    }
    state.reads = [];
  }
}
save();
if (notes.length) emit({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: notes.join("\n") } });
