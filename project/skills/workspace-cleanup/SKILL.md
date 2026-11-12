---
name: workspace-cleanup
description: Where agent files go (tmp/ vs memory/) and how to clean them. Read before deleting anything in either — only when the user asks.
---

# Workspace cleanup

Both folders are at the repo root and gitignored.

| Folder | Holds | Lifetime |
| --- | --- | --- |
| `tmp/` | screenshots, recordings, UI dumps, logcat, PR bodies, scratch scripts, `dev.sh` `artifacts/` | disposable |
| `memory/` | `last-serial`, `devices/<serial>/` (`device.env`, `coords.tsv`), ARTEMIS keys (`artemis.env`, `artemis-keys.md`), local plans | project lifetime |

No session-spanning data in `tmp/`; no media or full logs in `memory/`.

**Clean only when the user says so** — no end-of-task cleanup, no scheduled jobs.

- "Clean tmp": `rm -rf tmp/*` (keep `tmp/.ci-ok` if a PR still needs it).
- "Reset device memory": delete only `memory/devices/` and `memory/last-serial`. Never wipe all of
  `memory/` — it may hold the only copy of the ARTEMIS keys
  ([artemis-key-rotation](../artemis-key-rotation/SKILL.md)). Delete other files there only when
  the user names them.
