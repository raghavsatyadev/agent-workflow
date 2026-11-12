---
trigger: always_on
description: Verify the code compiles before calling any task done.
---

# RULE: BUILD VERIFICATION

After formatting and before presenting the result, check that it compiles. `APP_MODULE` and
`GRADLE_DIR` come from `agent-kit.env`; run Gradle in `GRADLE_DIR` (default: repo root).
`.agents/rules/project.md` overrides the commands below (extra tasks, a wrapper script, memory
limits).

| You edited | Run |
| --- | --- |
| `*.gradle.kts` / `libs.versions.toml` | `./gradlew help -q --console=plain` |
| Kotlin / XML sources | `./gradlew <APP_MODULE>:compileDebugKotlin -q --console=plain` (the task CI runs) |

Windows PowerShell: `.\gradlew.bat`. Build fails → read the error, fix that issue, retry. Don't
guess imports.
