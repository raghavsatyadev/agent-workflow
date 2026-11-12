---
name: local-model
description: Ask a local model instead of reading. lm-ask for verdicts on long logs, jgl to find code by meaning, lm-rank to pick files.
---

# Local model: cheap verdicts instead of long reads

Commands live in `~/.local-model/`; run them with bash (Claude Code and Gemini/Antigravity alike).

1. **Turn it on first:** `bash ~/.local-model/lm-on`. It returns at once and loads the model and the
   jgl proxy in the background. Claude Code's token-saver plugin does this at session start;
   Gemini/Antigravity has no hook, so always run it there.
2. **Use these before the usual tools:**
   - How a named class or function fits in, in a repo with `graphify-out/` → `bash ~/.code-graph/gq
     explain "Name"` (skill code-graph).
   - Code whose exact name you do not know → `jgl`, then `rg` to confirm. Exact names and error
     strings → `rg` directly.
   - A log, test output or file over ~200 lines when you need a verdict → `lm-ask`.
   - `rg` hits in more than ~5 files → pipe them to `lm-rank "<task>"` and open its top 2-3.
   - Before reviewing your own branch → `lm-diffcheck`.
3. **When done:** `bash ~/.local-model/lm-off --own` frees the GPU (Claude Code does it at session end).

```bash
~/.local-model/lm-ask yesno  "Did the build pass?"                                < log.txt
~/.local-model/lm-ask choice "What kind of failure?" kotlin="e: lines" deps="Could not resolve" other="none" < log.txt
~/.local-model/jgl --files "where is the database migration defined"
rg -n "Prompt" app/src | ~/.local-model/lm-rank "where is the tone prompt built"
~/.local-model/lm-diffcheck                     # rules from .agents/diff-checks.txt over this branch
```

- `lm-ask` prints `<answer> <probability> <backend>`; exit 2 = no backend answered, read the text
  yourself. Only the **tail** is sent, so cut with `rg`/`tail` first so the part that matters is last.
- `lm-rank` prints `<P> <path> (<hits> hits)` for the best 3; exit 2 = no score.
- `lm-diffcheck` prints `<P(yes)> <file>: <question>` per flag, or `no flags`. A flag is a lead to check.

## Trust

- Act on an answer alone only at ≥ 0.9 (yesno ≥ 0.9 or ≤ 0.1); in between, read that part yourself.
- Always offer an `other` label in `choice`.
- A "passed" verdict is not evidence: quote the real line (`BUILD SUCCESSFUL`, the test count).
- Never send secrets, tokens or `.env` content.

## Hook messages (Claude Code)

- `[lm-gate]`: long Bash output was compressed or got a pass/fail verdict. The full output is in the
  file named at the end. Raw output: `LM_GATE=0 <command>`.
- `[lm-loop]`: the same command keeps failing the same way. Stop retrying; change the approach or ask.
- `[tool-guard]`: a log dump was refused, or you searched text 3 times in a row. Do what it names
  (save to a file, `lm-ask`, `rg -c`, `gq`, `jgl`). An exact string anyway: `LM_ENFORCE=0 rg ...`.
- `[session-size]`: the session is long. An unrelated request belongs in a new session: give a short brief.

## Backend

`lm-backend` prints the main backend; `lm-backend local|jev` sets it. `local` (default) is Nimble on
Ollama, free. `jev` is TypeSafe's hosted Jev: paid, needs `JEV_API_KEY` or
`~/.config/typesafe/api_key`, falls back to the local model when a call fails. It applies to
lm-ask, lm-rank, lm-diffcheck and jgl; hooks always stay local. Details: README.md.
