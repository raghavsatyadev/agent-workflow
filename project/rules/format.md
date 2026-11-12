---
trigger: glob
globs: "**/*.kt"
description: Kotlin formatting after every .kt edit — ktfmt through scripts/ci-local.sh, or the file's own style when FORMAT_CHECK=0.
---

# RULE: KOTLIN FORMATTING

Right after editing a `.kt` file, before the build check:

- **`FORMAT_CHECK=1`** (default, `agent-kit.env`): `bash scripts/ci-local.sh --fix --format-only`.
  It fetches the ktfmt version CI pins. Never use a `ktfmt` from `PATH` (0.61 output fails a 0.64
  check). Don't hand-adjust whitespace or print the file again.
- **`FORMAT_CHECK=0`**: ktfmt is off. Match the style of the file you edit, don't reformat lines you
  didn't change, never reformat the whole tree unless asked.
