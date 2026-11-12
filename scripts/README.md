# Scripts (`scripts/`)

| Script | Run by | What it does |
| --- | --- | --- |
| [link-project.sh](link-project.sh) | you, per project | Links the [Android project kit](../rules/README.md) into a project: `<dir> [--replace] [--check]` |
| [lib.sh](lib.sh) | `install.sh` | Helpers: cross-platform folder links, settings merge, config copy, git excludes |
| [shim.sh](shim.sh) | `skills/global/*/install.sh` | Puts one-line launchers for repo tools in `~/.<tool>` folders instead of copies |

The installer itself is [`install.sh`](../install.sh) at the repo root.
