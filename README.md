# agent-workflow

Everything that makes up my AI coding setup, in one place: skills, hooks, local tools, MCP servers,
plugins and global agent rules, for Claude Code and Antigravity (agy / Gemini). This repo is the
**single source**: edit things here, commit, and run the installer. Installed skills are links back
into this repo, so a skill edit is live in every agent at once.

```bash
git clone https://github.com/raghavsatyadev/agent-workflow.git
cd agent-workflow
bash install.sh             # everything; safe to re-run after every pull
bash install.sh --no-tools  # links and config only
bash install.sh --config    # also overwrite CLAUDE.md, GEMINI.md, rules, git ignore (keeps .bak)
```

On Windows, run it from Git Bash (`"C:/Program Files/Git/bin/bash.exe" install.sh`), not WSL's
`bash`. Skills are linked with junctions, which need no admin rights. Restart the agents afterwards.

## What's inside

### My own skills and tools (`skills/`)

| Skill | What it does | Installs |
| --- | --- | --- |
| `local-model` | Local Ollama model (`nimble`) for yes/no verdicts on long output (`lm-ask`), search by meaning (`jgl`), file ranking (`lm-rank`), diff rule checks (`lm-diffcheck`); main backend local or Jev (`lm-backend`) | `~/.local-model/`, the `token-saver` Claude Code plugin |
| `code-graph` | Graphify code graph: `gq query/explain/affected/path` instead of grep-and-read; skips submodules | Graphify (uv tool `graphifyy`), `~/.code-graph/gq` |
| `headless-emulator` | Android emulators with no window, viewed in a browser tab (`emu up/shot/web/down/idle`) | `~/.headless-emu/emu` |
| `agent-routing` | Picks the cheapest model per subtask (Claude plans, agy implements, local model for verdicts) | — |
| `ats`, `ats-smart` | Resume ATS score (script) and a judgement-based resume review against a job description | — |
| `tool-usage-report` | Temporary: end-of-session report on lm-ask / jgl / rg use | — |

Hooks in the `token-saver` plugin (`skills/local-model` is the plugin; its `install.sh` registers it):

| Event | Hook | Effect |
| --- | --- | --- |
| SessionStart / SessionEnd | `lm-on` / `lm-off --own` | Load and unload the local model |
| PostToolUse (Bash) | `lm-gate.mjs` | Compresses long build/test output into a verdict |
| Pre/PostToolUse(Failure) | `lm-loop.mjs` | Spots the same failure repeating |
| Pre/PostToolUse | `tool-guard.mjs` | Blocks log dumps, nudges toward `jgl`/`gq` after repeated text searches |
| UserPromptSubmit | `lm-route.mjs` | Request-size hint (which model fits the task) |
| UserPromptSubmit | `session-size.mjs` | Warns when the session is long (context over 100k tokens, or 3 h old and over 50k): start a new session for a new request |
| UserPromptExpansion (`/code-review`, `/simplify`…) | `lm-diffcheck.mjs` | Runs the project's rule checks over the diff first |

### Plugins (`plugins/`)

| Plugin | What it does |
| --- | --- |
| `plan-keeper` | Keeps `.claude/PLAN.md` / `DECISIONS.md` / `HISTORY.md` per project; agy rewrites the plan after each turn |
| `token-saver` (in `skills/local-model/`) | The hooks above and `/tool-savings`: tokens saved by the local model and the code graph |

Official plugins the installer also turns on (not copied here): `commit-commands`, `code-review`,
`kotlin-lsp` from `claude-plugins-official`. agy plugins in use: `android-cli-plugin`,
`chrome-devtools-plugin`, `firebase`, `code-review`, `commit-commands`, `plan-keeper`.

### MCP servers

| Server | Where | Notes |
| --- | --- | --- |
| `artemis` | its own project ([google/artemis](https://github.com/google/artemis)) | Registered for agy and for some Claude Code projects; not copied here |

### Third-party (`third-party/`), copied as used

See [THIRD_PARTY.md](THIRD_PARTY.md) for sources and licenses.

- Google's Android skills: not copied; Claude Code gets them from the `android-cli@android-cli-plugin` plugin (listed in `settings.base.json`).
- `prompt-cache-control/`: Claude Code prompt-cache meter mod (davila7/claude-code-templates, MIT).
- Graphify: installed from PyPI by `code-graph/install.sh`, not copied.

### Global config (`config/`)

| File | Installed to |
| --- | --- |
| `claude/settings.base.json` | merged into `~/.claude/settings.json`: model, effort, output style, env, plugins, marketplaces. Keys you already have always win |
| `claude/CLAUDE.md` | `~/.claude/CLAUDE.md` (global rules, e.g. the 500-line file limit) |
| `gemini/GEMINI.md`, `gemini/rules/` | `~/.gemini/` (agy global rules) |
| `git/ignore` | `~/.config/git/ignore` (keeps PLAN.md, DECISIONS.md, HISTORY.md, `graphify-out/` out of every repo) |

### Not in this repo

- Ollama models: `nimble` (Bespoke-Nimble-9B LoRA fused into Qwen3.5-9B, Apache-2.0), `qwen3.6:35b-a3b`.
  Pull or build them with Ollama; see `skills/local-model/SKILL.md`.
- Anything personal or machine-specific: credentials, `usage.log` and other logs, session history,
  hook state, the Claude desktop app's synced skills.

## Changing things

- **Edit a skill:** edit it under `skills/`, commit. It's live at once (links).
- **Edit a tool** (`lm-*`, `gq`, `emu`): edit it under `skills/<skill>/`. It's live at once: the
  `~/.<tool>` folders hold one-line shims that run the repo files (plus logs and state), not copies.
  Re-run `bash install.sh` only after adding or renaming a tool file.
- **Add a skill:** `skills/<name>/SKILL.md` (plus an optional `install.sh`), then `bash install.sh`.
- **Update plan-keeper:** edit `plugins/plan-keeper/` here; Claude Code reads the plugin from this folder.
- Never commit keys, tokens, `.env` files or logs; `.gitignore` blocks the usual names.
