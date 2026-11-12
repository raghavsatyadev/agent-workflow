# Skills (`skills/`)

| Group | Who gets it | How |
| --- | --- | --- |
| [`global/`](#global) | Every agent on this machine, in every project | `install.sh` links each folder into `~/.claude/skills`, `~/.agents/skills` and `~/.gemini/skills` |
| [`android/`](#android) | Android / Compose Multiplatform projects only | [`scripts/link-project.sh`](../scripts/link-project.sh) links them per project (see [rules/README.md](../rules/README.md)) |

Each skill is a folder with a `SKILL.md`. Skills are links, so an edit here is live everywhere at once.

## Global

| Skill | What it does | Entry point | Installs |
| --- | --- | --- | --- |
| [agent-routing](global/agent-routing/SKILL.md) | Picks the cheapest model for each subtask before delegating | — | — |
| [code-graph](global/code-graph/SKILL.md) | Graphify code graph: ask how code fits together instead of grep-and-read | `gq query/explain/affected/path` | Graphify, `~/.code-graph/gq` |
| [headless-emulator](global/headless-emulator/SKILL.md) | Android emulators with no window, viewed in a browser tab | `emu up/shot/web/down/idle` | `~/.headless-emu/emu` |
| [local-model](global/local-model/SKILL.md) | Local Ollama model for verdicts on long output, search by meaning, file ranking. Also the `token-saver` plugin ([README](global/local-model/README.md)) | `lm-ask`, `jgl`, `lm-rank`, `lm-diffcheck` | `~/.local-model/`, `token-saver` plugin |
| [ats](global/ats/SKILL.md) | Scripted ATS resume score (0-100) | `/ats` | — |
| [ats-smart](global/ats-smart/SKILL.md) | Judgement-based resume review against a job description | — | — |
| [tool-usage-report](global/tool-usage-report/SKILL.md) | Temporary: end-of-session report on lm-ask / jgl / rg use | — | — |

A folder with its own `install.sh` also gets tool shims (one-line launchers that run the repo files)
in a `~/.<tool>` folder. **Add one:** `skills/global/<name>/SKILL.md` (plus an optional
`install.sh`), then `bash install.sh`.

## Android

| Skill | Use when |
| --- | --- |
| [android-device-test](android/android-device-test/SKILL.md) | A change needs checking on a phone: Maestro flows, ARTEMIS for dynamic flows, `scripts/dev.sh` for install, permissions, logcat and files |
| [fix-issue](android/fix-issue/SKILL.md) | Given a GitHub issue: repro, fix, verify on device, commit or PR |
| [material3-expressive](android/material3-expressive/SKILL.md) | Building or reviewing a Compose screen, component or animation |
| [cmp-best-practices](android/cmp-best-practices/SKILL.md) | Writing or reviewing shared Kotlin / Compose code |
| [compose-screenshot-test](android/compose-screenshot-test/SKILL.md) | A UI change needs a screenshot test, or goldens need updating |
| [artemis-key-rotation](android/artemis-key-rotation/SKILL.md) | ARTEMIS runs fail on quota or rate limits |
| [workspace-cleanup](android/workspace-cleanup/SKILL.md) | Deciding where agent files go (`tmp/` vs `memory/`) or cleaning them |
| [project-onboarding-setup](android/project-onboarding-setup/SKILL.md) | Setting up a developer machine, or a tool is missing |

Links inside these skills (`../other-skill/`, `../../rules/x.md`) are written for the linked
project's `.agents/` layout, where skills and rules sit side by side.

**Add one:** `skills/android/<name>/SKILL.md`, then re-run `scripts/link-project.sh` in each
project. App-specific facts go in that project's `.agents/rules/project.md`, never here (this repo
is public).
