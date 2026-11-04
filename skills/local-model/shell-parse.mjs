// Shell parsing for the tool-guard hook: enough of bash to find pipeline stages, their words and
// redirects, plus rg/grep option parsing. No side effects; tool-guard.mjs imports it.
import path from "node:path";

const LINES = Number(process.env.LOCAL_MODEL_ENFORCE_LINES || 30);

// ---- shell parsing: enough to find pipeline stages, their words and redirects ----------------
export function lex(s) {
  const out = [];
  let w = null;
  let q = null;
  const push = () => {
    if (w !== null) out.push({ w });
    w = null;
  };
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === q) q = null;
      else if (ch === "\\" && q === '"' && i + 1 < s.length) w += s[++i];
      else w += ch;
      continue;
    }
    if (ch === "'" || ch === '"') {
      q = ch;
      w ??= "";
      continue;
    }
    if (ch === "\\" && i + 1 < s.length) {
      w = (w ?? "") + s[++i];
      continue;
    }
    if (ch === " " || ch === "\t" || ch === "\r") {
      push();
      continue;
    }
    if (!"|;&\n<>()".includes(ch)) {
      w = (w ?? "") + ch;
      continue;
    }
    let op = ch;
    if ((ch === ">" || ch === "<") && w !== null && /^\d+$/.test(w)) {
      op = w + ch;
      w = null;
    } else push();
    const two = s.slice(i, i + 2);
    if (["||", "&&", "|&", ">>", "&>", "<<"].includes(two)) {
      op = op.slice(0, -1) + two;
      i++;
    }
    if (op.endsWith(">") && s[i + 1] === "&") {
      // 2>&1, >&2: a descriptor copy, not a file
      const m = /^&[\d-]+/.exec(s.slice(i + 1));
      if (m) {
        op += m[0];
        i += m[0].length;
      }
    }
    out.push({ op });
  }
  push();
  return out;
}

export const SEP = new Set([";", "&&", "||", "&", "\n", "(", ")"]);
export const PREFIX = new Set(["sudo", "time", "env", "command", "exec", "nice", "nohup", "timeout"]);
export const base = (p) => path.basename(String(p).replace(/\\/g, "/")).replace(/\.(exe|cmd|bat)$/i, "");

// $(...) and `...` -> placeholder words; returns [text, [inner strings]]. Not inside '...'.
export function subs(s) {
  const inner = [];
  let out = "";
  let q = null;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q === "'") {
      if (ch === "'") q = null;
      out += ch;
      continue;
    }
    if (ch === "\\" && i + 1 < s.length) {
      out += ch + s[++i];
      continue;
    }
    if (ch === "'" && !q) q = "'";
    else if (ch === '"') q = q ? null : '"';
    let end = -1;
    if (ch === "$" && s[i + 1] === "(") {
      let depth = 0;
      for (let j = i + 1; j < s.length; j++) {
        if (s[j] === "(") depth++;
        else if (s[j] === ")" && --depth === 0) {
          end = j;
          break;
        }
      }
      if (end > 0) inner.push(s.slice(i + 2, end));
    } else if (ch === "`") {
      end = s.indexOf("`", i + 1);
      if (end > 0) inner.push(s.slice(i + 1, end));
    }
    if (end > 0) {
      out += ` __LMSUB${inner.length - 1}__ `;
      i = end;
    } else out += ch;
  }
  return [out, inner];
}

// -> [[stage, ...], ...]: statements, each a pipeline of { cmd, args, out, in, inner }.
// `inner` holds the pipelines of a `bash -c "..."` / `powershell -Command "..."` body or of a
// $(...) / `...` inside the stage, parsed the same way down to depth 2.
export function parse(command, depth = 0) {
  const [text, inner] = depth < 2 ? subs(command) : [command, []];
  const pipelines = [];
  let pipe = [];
  let cur = { words: [], redirs: [] };
  const endStage = () => {
    if (cur.words.length || cur.redirs.length) pipe.push(cur);
    cur = { words: [], redirs: [] };
  };
  const toks = lex(text);
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.w !== undefined) cur.words.push(t.w);
    else if (t.op === "|" || t.op === "|&") endStage();
    else if (SEP.has(t.op)) {
      endStage();
      if (pipe.length) pipelines.push(pipe);
      pipe = [];
    } else if (/[<>]/.test(t.op)) {
      if (/&[\d-]+$/.test(t.op)) continue;
      const target = toks[i + 1]?.w;
      if (target !== undefined) i++;
      cur.redirs.push({ op: t.op, target: target ?? "" });
    }
  }
  endStage();
  if (pipe.length) pipelines.push(pipe);
  return pipelines.map((p) =>
    p.map(({ words, redirs }) => {
      const nested = [];
      for (const w of words)
        for (const m of w.matchAll(/__LMSUB(\d+)__/g))
          if (inner[m[1]] !== undefined) nested.push(...parse(inner[m[1]], depth + 1)); // else the outer level's
      let k = 0;
      while (k < words.length && (/^\w+=/.test(words[k]) || PREFIX.has(words[k]))) k++;
      let cmd = base(words[k] ?? "").toLowerCase();
      if (/^(bash|sh|zsh|powershell|pwsh)$/.test(cmd) && depth < 2) {
        const c = words.findIndex((x, j) => j > k && /^-(c|command)$/i.test(x));
        if (c > 0 && words[c + 1] !== undefined) nested.push(...parse(words.slice(c + 1).join(" "), depth + 1));
        else if (words[k + 1] && !words[k + 1].startsWith("-")) cmd = base(words[++k]).toLowerCase();
      }
      if (cmd === "git" && words[k + 1] === "grep") cmd = "git-grep", k++;
      return {
        cmd,
        args: words.slice(k + 1),
        out: redirs.some((r) => /^(1?>>?|&>>?)$/.test(r.op)), // stdout to a file
        in: redirs.filter((r) => r.op === "<").map((r) => r.target),
        inner: nested,
      };
    }),
  );
}

export const num = (s) => (/^\+?\d+$/.test(s) ? Number(s.replace("+", "")) : NaN);

export const GREPS = new Set(["rg", "grep", "egrep", "fgrep", "zgrep", "git-grep", "ag", "ack"]);
// rg/grep options whose next word is a value, not a file or the pattern
export const GREP_VAL = new Set(["-A", "-B", "-C", "-m", "-e", "-f", "-g", "-t", "-T", "-d", "-D", "-M", "-j",
  "--glob", "--iglob", "--type", "--type-not", "--max-count", "--regexp", "--file", "--context",
  "--after-context", "--before-context", "--max-columns", "--threads", "--replace", "-r"]);

// rg/grep: { files, small, pattern } -- small when it only counts, lists or stops early
export function grepInfo(st) {
  const files = [];
  let small = false;
  let patternGiven = false;
  let pattern = null;
  let maxCount = Infinity;
  const a = st.args;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    if (x === "--") {
      files.push(...a.slice(i + 1 + (patternGiven ? 0 : 1)));
      break;
    }
    if (/^--(count|count-matches|files-with-matches|files-without-match|quiet|stats)$/.test(x)) small = true;
    else if (/^-[a-zA-Z]+$/.test(x) && /[clLq]/.test(x.replace(/[ABCmefgtTdDMj].*$/, ""))) small = true;
    if (x === "-m" || x === "--max-count") maxCount = num(a[i + 1] ?? "");
    else if (/^-m\d+$/.test(x)) maxCount = num(x.slice(2));
    else if (x.startsWith("--max-count=")) maxCount = num(x.slice(12));
    if (x === "-e" || x === "--regexp") pattern ??= a[i + 1] ?? null;
    else if (x.startsWith("--regexp=")) pattern ??= x.slice(9);
    if (x === "-e" || x === "--regexp" || x === "-f" || x === "--file" || x.startsWith("--regexp=")) patternGiven = true;
    if (x === "-r" && st.cmd !== "rg") continue; // grep -r: recursive, no value
    if (GREP_VAL.has(x)) {
      i++;
      continue;
    }
    if (x.startsWith("-")) continue;
    if (!patternGiven) {
      patternGiven = true;
      pattern = x;
      continue;
    }
    files.push(x);
  }
  if (maxCount <= LINES) small = true;
  return { files: [...files, ...st.in], small, pattern };
}
