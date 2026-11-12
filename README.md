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

## Contents

| Folder | What's in it | Installed |
| --- | --- | --- |
| [`skills/`](skills/README.md) | All skills: `global/` (every agent: `local-model`, `code-graph`, `headless-emulator`, `agent-routing`, `ats`…) and `android/` (Android project kit) | `global/`: linked into every agent's skill folder. `android/`: per project, by `scripts/link-project.sh` |
| [`rules/`](rules/README.md) | Android project rules, `agent-kit.env` keys, how to link a project | Per project, with `skills/android` |
| [`plugins/`](plugins/README.md) | Claude Code plugins: `plan-keeper` (and where `token-saver` lives) | Local marketplaces |
| [`config/`](config/README.md) | Global `CLAUDE.md`, `GEMINI.md`, settings, agy rules, git ignore | `~/.claude`, `~/.gemini`, git config |
| [`scripts/`](scripts/README.md) | `link-project.sh` and the installer's helpers | — |
| [`third-party/`](third-party/README.md) | Other people's code copied as used ([THIRD_PARTY.md](THIRD_PARTY.md)) | Linked |

Each folder's README is its index: one line per skill, rule, plugin or file, with links.

## MCP servers

| Server | Where | Notes |
| --- | --- | --- |
| `artemis` | its own project ([google/artemis](https://github.com/google/artemis)) | Registered for agy and for some Claude Code projects; not copied here |

## Not in this repo

- Ollama models: `nimble` (Bespoke-Nimble-9B LoRA fused into Qwen3.5-9B, Apache-2.0), `qwen3.6:35b-a3b`.
  Pull or build them with Ollama; see `skills/global/local-model/SKILL.md`.
- Anything personal or machine-specific: credentials, `usage.log` and other logs, session history,
  hook state, the Claude desktop app's synced skills.

## Changing things

- **Edit a skill:** edit it under `skills/global/` or `skills/android/`, commit. It's live at once (links).
- **Edit a tool** (`lm-*`, `gq`, `emu`): edit it under `skills/global/<skill>/`. It's live at once: the
  `~/.<tool>` folders hold one-line shims that run the repo files (plus logs and state), not copies.
  Re-run `bash install.sh` only after adding or renaming a tool file.
- **Add a global skill:** `skills/global/<name>/SKILL.md` (plus an optional `install.sh`), then `bash install.sh`.
- **Project kit:** edit `skills/android` or `rules/android`; linked projects see it at once. A new
  shared skill/rule: re-run `scripts/link-project.sh` in each project. App-specific facts go in that
  project's `.agents/rules/project.md`, never here (this repo is public).
- **Update plan-keeper:** edit `plugins/plan-keeper/` here; Claude Code reads the plugin from this folder.
- Never commit keys, tokens, `.env` files or logs; `.gitignore` blocks the usual names.
