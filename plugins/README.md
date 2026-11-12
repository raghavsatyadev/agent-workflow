# Plugins (`plugins/`)

Claude Code plugins kept in this repo. `install.sh` registers each folder as a local marketplace.

| Plugin | What it does | Marketplace |
| --- | --- | --- |
| [plan-keeper](plan-keeper/README.md) | Keeps `.claude/PLAN.md`, `DECISIONS.md` and `HISTORY.md` per project; agy rewrites the plan after each turn | `raghav-plugins` (this folder) |
| `token-saver` | Local-model hooks and `/tool-savings`. Lives in [`skills/global/local-model`](../skills/global/local-model/README.md) because it ships with that skill's tools | `token-saver` |

`plan-keeper/plugins/plan-keeper/` is nested on purpose: the outer folder is the marketplace
(`.claude-plugin/marketplace.json`), the inner one is the plugin. Edit the inner one.

Official plugins the installer turns on (not copied): `commit-commands`, `code-review`,
`kotlin-lsp` from `claude-plugins-official`, and `android-cli` from `android-cli-plugin`.
