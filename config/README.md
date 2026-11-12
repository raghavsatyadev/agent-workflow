# Global config (`config/`)

Agent-wide settings and rules. `install.sh` installs them; `--config` overwrites existing copies
(keeping a `.bak`).

| File | Installed to | How |
| --- | --- | --- |
| [claude/CLAUDE.md](claude/CLAUDE.md) | `~/.claude/CLAUDE.md` | One-line `@import` of this file, so edits here are live |
| [claude/settings.base.json](claude/settings.base.json) | `~/.claude/settings.json` | Merged: model, effort, output style, env, plugins, marketplaces. Your existing keys win |
| [gemini/GEMINI.md](gemini/GEMINI.md) | `~/.gemini/GEMINI.md` | Copied when missing (agy ignores imports) |
| [gemini/rules/](gemini/rules/) | `~/.gemini/rules` | Linked folder (agy global rules, e.g. ARTEMIS testing) |
| [git/ignore](git/ignore) | `~/.config/git/ignore` | Set as git `core.excludesFile`: keeps plan files and `graphify-out/` out of every repo |

Machine-specific notes (no local model, which phone to test on) belong in your own
`~/.claude/CLAUDE.md` below the `@import` line, not here.
