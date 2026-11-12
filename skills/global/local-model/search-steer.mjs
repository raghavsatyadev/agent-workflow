// Picks the better tool for a code search, for the tool-guard hook:
//   gq   (code graph) for a code name (CamelCase, snake_case, `class X`, `fun X`, a|b of names) in
//        a repo that uses Graphify (graphify-out/graph.json at its root, or at the main checkout
//        of a worktree; gq builds the worktree's own graph on first use in a few seconds)
//   jgl  (search by meaning, local model) for free text: several plain words
//   rg   for anything else: exact strings, error messages, regexes. No steering.
// Only checks that a graph file exists; never reads it (some are 15 MB).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { backend, canAnswer } from "./lm-client.mjs";

const exists = (p) => {
  try {
    fs.statSync(p);
    return true;
  } catch {
    return false;
  }
};

// Repo root above cwd and whether the repo uses Graphify. Stops at the first .git.
export function findGraph(cwd) {
  let d = path.resolve(cwd);
  for (;;) {
    const g = path.join(d, ".git");
    if (exists(g)) {
      const roots = [d];
      try {
        if (fs.statSync(g).isFile()) {
          // worktree: "gitdir: <main>/.git/worktrees/<name>"
          const m = /^gitdir:\s*(.+)$/m.exec(fs.readFileSync(g, "utf8"));
          if (m) roots.push(path.resolve(d, m[1].trim(), "..", "..", ".."));
        }
      } catch {}
      return { root: d, graph: roots.some((r) => exists(path.join(r, "graphify-out", "graph.json"))) };
    }
    const up = path.dirname(d);
    if (up === d) return { root: null, graph: false };
    d = up;
  }
}

const KEYWORD = /^(class|interface|object|enum|struct|trait|fun|func|fn|def|function|val|var|const|let|type)\s+/;
const NAME = /^[A-Za-z_$][\w$]*$/;
// A word that is clearly an identifier: has an inner capital, an underscore, or starts upper then lower.
const IDENT = (w) => NAME.test(w) && (/[a-z][A-Z]/.test(w) || /[A-Za-z]_[A-Za-z]/.test(w) || /^[A-Z][a-z]/.test(w));

// "name" | "meaning" | "exact"; names = the identifiers to ask gq about
export function classify(pattern) {
  let p = String(pattern ?? "").trim();
  if (!p) return { kind: "exact", names: [] };
  p = p.replace(/^\\b|\\b$/g, "").replace(/^\(|\)$/g, "");
  const kw = KEYWORD.exec(p);
  if (kw) {
    const n = p.slice(kw[0].length).replace(/\\b|\\s\*|[(\\].*$/g, "").trim();
    if (NAME.test(n)) return { kind: "name", names: [n] };
  }
  const parts = p.split(/\\?\|/).map((x) => x.trim().replace(/^\\b|\\b$/g, ""));
  if (parts.length && parts.every(NAME.test.bind(NAME)) && parts.some(IDENT)) return { kind: "name", names: parts };
  const words = p.split(/\s+/);
  if (words.length >= 3 && words.every((w) => /^[A-Za-z][a-z'-]*[,.?]?$/.test(w))) return { kind: "meaning", names: [] };
  return { kind: "exact", names: [] };
}

// jgl can judge snippets: the main backend is Jev with a key, or the local model is up.
export const localUp = () => canAnswer({ jev: backend() === "jev" });

const GQ = "bash ~/.code-graph/gq";
const gqInstalled = () => exists(process.env.LOCAL_MODEL_GQ || path.join(os.homedir(), ".code-graph", "gq"));

// { tool: "gq" | "jgl", text } with the command to run instead, or null when rg is the right tool
// (or the better tool cannot run here).
export async function pick(pattern, cwd) {
  const c = classify(pattern);
  if (c.kind === "name" && gqInstalled() && findGraph(cwd).graph) {
    const n = c.names[0];
    return {
      tool: "gq",
      text:
        `\`${GQ} explain "${n}"\` (where it is defined, what it calls, what calls it, with file:line)` +
        (c.names.length > 1 ? `, once per name (${c.names.join(", ")})` : "") +
        `, \`${GQ} affected "${n}"\` before changing it, or \`${GQ} query "<question>"\`. ` +
        `If gq says "No node matching", the name is not in the code graph: then rg is right.`,
    };
  }
  if (c.kind === "meaning" && (await localUp()))
    return { tool: "jgl", text: `\`~/.local-model/jgl --files "${String(pattern).trim()}"\` (search by meaning, local model)` };
  return null;
}
