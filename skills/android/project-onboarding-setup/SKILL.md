---
name: project-onboarding-setup
description: Set up a developer machine for an Android project — toolchain, agent-workflow global skills and project kit, official Android skills, ARTEMIS and its model, GitHub CLI. Use when setup-env reports a failure or a tool is missing.
---

# Onboarding

Run the doctor first; it checks the table below, offers fixes and prints what it can't do.

```bash
bash scripts/setup-env.sh                                         # macOS / Linux / Git Bash
powershell -ExecutionPolicy ByPass -File scripts/setup-env.ps1   # Windows, if the project has it
```

| Component | Requirement |
| --- | --- |
| JDK | 21, `JAVA_HOME` set |
| Android SDK | API/Build-Tools per `gradle/libs.versions.toml`, `ANDROID_HOME` set, `platform-tools` on `PATH` |
| NDK / CMake *(if used)* | `NDK_VERSION` in `agent-kit.env` |
| Submodules *(if any)* | `git submodule update --init --recursive` |
| Git hooks | `git config core.hooksPath .githooks` |
| agent-workflow | cloned next to the project, `install.sh` run, project kit linked (below) |
| Android skills | `android` CLI + the named skills below |
| GitHub CLI | `gh auth login` with push access |
| Python / uv | Python 3.10+, `uv` |
| ARTEMIS | cloned, MCP registered, Gemini key in its `.env` |
| Device | physical phone, `adb devices -l` shows `device`; emulator (`emu up`) only if none or asked |

## agent-workflow — ask the user first

Global skills (`local-model`, `code-graph`, `headless-emulator`, …) and the shared project kit
(these skills and rules) come from https://github.com/raghavsatyadev/agent-workflow. On a yes:

```bash
git clone --recurse-submodules https://github.com/raghavsatyadev/agent-workflow.git ../agent-workflow  # once
bash ../agent-workflow/install.sh                 # global skills; re-run after a pull
bash ../agent-workflow/scripts/link-project.sh .  # project kit: relative, gitignored links in .agents/
```

The project keeps only its own files in `.agents/` (`rules/project.md`, `flows/`, project-only
rules/skills); everything shared is a link. Windows needs Developer Mode for symlinks (the linker
falls back to junctions without it). Restart the agent afterwards.

## Android skills — official, from the `android` CLI

```bash
# Install the CLI if `android --version` fails:
#   Windows: curl -fsSL https://dl.google.com/android/cli/latest/windows_x86_64/install.cmd -o "%TEMP%\i.cmd" && "%TEMP%\i.cmd"
#   macOS:   curl -fsSL https://dl.google.com/android/cli/latest/darwin_arm64/install.sh | bash
#   Linux:   curl -fsSL https://dl.google.com/android/cli/latest/linux_x86_64/install.sh | bash
# Named skills only; never --all (adds TV, Wear, XR, Cast, billing…). Drop ones the app doesn't use.
for s in adaptive android-cli android-intent-security android-permissions-security android-profiler appfunctions edge-to-edge ml-kit-genai-prompt-api navigation-3 navigation-event play-policy-insights r8-analyzer testing-setup; do
  [ -d ~/.claude/skills/"$s" ] || android skills add "$s" --agent=claude-code --project=.   # .claude/skills is gitignored
  android skills add "$s" --agent=gemini
done
android skills update --project=.   # later
```

## ARTEMIS

Own clone, found at `$ARTEMIS_HOME`, else `../artemis`.

```bash
git clone https://github.com/google/artemis.git ../artemis && cd ../artemis
./start.sh                            # Windows: .\start.bat
uv run artemis mcp --install claude   # or codex / antigravity / all
```

Put `GEMINI_API_KEY=` in `../artemis/.env` (two keys? see `artemis-key-rotation`), restart the
agent, then `mobile_diagnose` must say `ready` or `degraded`. If the project ships its own
`.mcp.json` pointing at `$ARTEMIS_HOME`, set it as a user env var
(PowerShell: `[Environment]::SetEnvironmentVariable('ARTEMIS_HOME','<abs path>','User')`), restart
the IDE, approve the server, and **don't** also run `--install claude` (a second user-scoped server
plus its rules in every session). `.mcp.json` also avoids Claude Code keying servers by exact path
case (`C:/` vs `c:/`).

### Gemini or local Qwen

A local model must be vision + tool-calling (Qwen3-VL `-instruct`, `num_ctx 32768`,
`temperature 0`): ≥24 GB VRAM `qwen3-vl:30b-a3b-instruct`, 10–24 GB `8b`, 6–10 GB `4b`, less →
Gemini only. If the project has `scripts/artemis_model.py`: `gemini` (Qwen on 429), `qwen`
(local only), `status`; restart ARTEMIS once after the first switch. Qwen handles short explicit
steps but loops on open-ended exploration. Blank `OPENAI_API_KEY=` silently falls back to Gemini.

## Decision model (optional)

Yes/no and pick-one helpers for the hooks: see the global `local-model` skill. No model → the
hooks stay silent.
