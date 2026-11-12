# Rules (`rules/`)

Global agent rules live in [`config/`](../config/README.md) (`CLAUDE.md`, `GEMINI.md`, agy rules).
This folder holds rules that are linked per project.

## Android (`rules/android/`)

Linked, together with [`skills/android`](../skills/README.md#android), into each Android / Compose
Multiplatform project's `.agents/` as relative, gitignored symlinks:

```bash
bash scripts/link-project.sh ../MyApp            # link + managed .gitignore block
bash scripts/link-project.sh ../MyApp --replace  # also swap old copies (moved to tmp/agents-replaced/)
bash scripts/link-project.sh ../MyApp --check    # report missing links
```

Windows needs Developer Mode for symlinks (falls back to junctions).

| Rule | Applies | What it says |
| --- | --- | --- |
| [android-build](android/android-build.md) | always | Verify the code compiles before calling a task done |
| [branch-pr-policy](android/branch-pr-policy.md) | always | Branch, commit, push and PR policy from `GIT_FLOW` and `BASE_BRANCH` |
| [format](android/format.md) | `*.kt` edits | ktfmt through `scripts/ci-local.sh`, or the file's own style when `FORMAT_CHECK=0` |
| [compose-previews](android/compose-previews.md) | previews | Render any `@Preview` to a PNG with the Android CLI |
| [artemis-mobile-testing](android/artemis-mobile-testing.md) | ARTEMIS use | How to explore and test on a device with ARTEMIS |
| [parallel-agents](android/parallel-agents.md) | on request | Several agents at once, each in its own git worktree |

### Per-project values (`agent-kit.env`)

Each project keeps an `agent-kit.env` at its root; the shared skills and rules read it.

| Key | Meaning |
| --- | --- |
| `APP_MODULE` | Gradle module of the app, e.g. `:app` |
| `APP_VARIANT` | Build variant, e.g. `Debug` |
| `APPLICATION_ID` | App package name on the device |
| `BASE_BRANCH` | Branch that work starts from and PRs target |
| `GIT_FLOW` | `direct` (push to base), `pr` (branch + PR, the default) or `local` (commit only) |
| `GRADLE_DIR` | Folder holding `gradlew`, when not the repo root |
| `FORMAT_CHECK` | `1` (default) runs ktfmt, `0` keeps each file's own style |

### What stays in the project

Only its own files: `.agents/rules/project.md` (theme path, build quirks, strings and test
policy), `.agents/flows/` (Maestro flows and `flows.md`) and any project-only rules or skills. App
IDs, device names and other private facts go there, never here (this repo is public).
