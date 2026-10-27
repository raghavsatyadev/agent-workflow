---
name: agent-routing
description: Pick the cheapest model for each subtask before delegating. Claude plans and reviews (Opus as lead and advisor, Haiku for small Claude subagents that never call the advisor); implementation, edits to named files, search and reading go to agy with Gemini 3.8 Flash High; yes/no verdicts and tiny jobs go to local models (lm-ask, Ollama qwen3.6:35b-a3b) first. Fall back to Sonnet only when agy fails, needs a shell, or the task needs design judgment. Use before spawning any subagent or delegating work.
---

# Agent routing: Claude plans and reviews, agy implements

Shared by Claude Code and Antigravity (agy); lives in `~/.agents/skills/agent-routing`. Goal: as little
Claude usage as possible. Claude thinks (plan, review, decide); agy types (implement); local models
answer small questions. Escalate only when the lower tier fails or the task clearly needs more.
Record a routing that worked well (or failed) in the Log at the end.

| Work | Goes to |
| - | - |
| yes/no, pick-one, "did it pass", short rewording, small commit message | Tier 0, local |
| implementation, edits to named files, tests/boilerplate from a spec, search, reading docs | Tier 1, agy Flash High |
| plan, design, review of agy's diff, final check, tricky debugging | Tier 2, Claude |

## Tier 0 — local, free (this PC, Ollama). Try first.

For: yes/no and pick-one verdicts, classifying, "did this pass", short summaries or rewording,
commit message from a small diff, filling a template, simple regex/shell one-liners.

- Verdicts on logs/files: `~/.local-model/lm-ask yesno|choice ...` (skill `local-model`; decision model
  `nimble`). Decision 2.0 models (vllm-sr) only as a second opinion until evaluated against nimble.
- Short generation: Qwen 3.6 35B-A3B (22 GB, ~18 s cold, faster warm):
  ```bash
  curl -s 127.0.0.1:11434/api/generate -d '{"model":"qwen3.6:35b-a3b","prompt":"...","stream":false,"think":false,"keep_alive":"5m"}' | jq -r .response
  ```
- Check the output yourself before using it; never send secrets. Unload when done
  (`ollama stop qwen3.6:35b-a3b`) so the GPU is free for nimble.

## Tier 1 — agy + Gemini 3.8 Flash (High): all implementation

For: writing and changing code in named files, multi-file edits from a written plan, tests and
boilerplate from a clear spec, codebase search ("where/how is X done"), reading docs or long files and
reporting back, web research.

```bash
# read-only / report back
agy -p "<self-contained task>. Use only file tools, do not run commands." \
    --model gemini-3.8-flash-high --print-timeout 600s
# implement: may edit only the files it is told to
agy -p "<plan + files to change + done criteria>. Use only file tools, do not run commands." \
    --model gemini-3.8-flash-high --mode accept-edits --print-timeout 900s
```

- Claude writes the plan first; the agy prompt carries it in full (agy sees none of your
  conversation): files, what to change, output format, what "done" looks like.
- agy `-p` cannot run shell commands headless (auto-denied; it then stops). Always say "use only file
  tools, do not run commands", and run tests/builds yourself afterwards.
- Do not use `--dangerously-skip-permissions`.
- Run independent agy tasks in parallel (background shells). Never two writers on the same files.
- If Flash High is unavailable, `gemini-3.8-flash-medium` is the next choice (`agy models` lists them).
- Its claims are leads, not proof: Claude reviews the diff and runs the tests before calling it done.

## Tier 2 — Claude: plan, review, decide

- **Lead (main session): Opus** (`model: "opus"`, also for scheduled tasks). Plans, writes the agy
  prompts, reviews agy's diff, runs tests.
- **Advisor: Opus** (`advisorModel: "opus"`). Called by the lead at decision points: before choosing
  an approach, when stuck, before declaring done.
- **Claude subagents: Haiku** by default (`CLAUDE_CODE_SUBAGENT_MODEL=haiku`). Use them only for
  Claude-side checks that agy cannot do; prefer agy for reading and searching.
- **Haiku subagents never call the advisor.** Subagents inherit `advisorModel`, Haiku accepts Opus,
  and no setting turns it off per subagent (hooks can't block it: it's a server-side tool). So end
  every Haiku subagent prompt with: "Do not call the advisor tool." If a subtask needs Opus-level
  judgment, give it a Sonnet subagent or do it in the lead.

Fall back to a **Sonnet** subagent or the lead itself (Agent tool `model: "sonnet"`) when:
- agy produced nothing, or failed the same task twice;
- the task needs a shell (agy headless cannot run commands) and is more than running tests;
- the task needs design judgment, or a wrong answer is costly.

Use `model: "opus"` only for the hardest parts, after Sonnet and the advisor are not enough.

## Log

- 2026-10-19: agy Flash High and qwen3.6:35b-a3b smoke-tested (both answered; 14 s / 18 s cold).
- 2026-10-19: `agy -p` cannot run shell commands headless (auto-denied; it then produces nothing).
  Tell it "use only file tools, do not run commands" and run tests yourself. With that, it split
  x-digest's 533-line `xdigest.py` into `xd/` correctly first try (AST-identical, tests pass).
- 2026-10-24: routing changed to "Claude plans/reviews, agy implements". agy 1.4.5 smoke test
  (`agy -p ... --model gemini-3.8-flash-high`) answered. Claude Code 2.1.304.
