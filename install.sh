#!/usr/bin/env bash
# Installs agent-workflow on this PC. Re-run after every pull: it is safe to repeat.
#   skills/*                                 linked into ~/.agents/skills, ~/.claude/skills, ~/.gemini/skills
#   Google's Android skills                  installed by the android CLI (android skills add --all)
#   third-party/prompt-cache-control         linked into ~/.claude/skills (Claude Code mod)
#   skills/*/install.sh                      tool shims in ~/.local-model, ~/.code-graph, ~/.headless-emu; hooks
#   plugins/plan-keeper                      Claude Code marketplace "raghav-plugins"
#   config/claude/settings.base.json         merged into ~/.claude/settings.json (your values win)
#   config/claude/CLAUDE.md                  ~/.claude/CLAUDE.md becomes a one-line @import of it
#   config/gemini/rules, config/git/ignore   linked (~/.gemini/rules junction; git core.excludesFile)
#   config/gemini/GEMINI.md                  copied when missing (agy ignores imports; --config overwrites, with .bak)
# Skills are links, so editing a skill here changes it everywhere at once. A real folder found where
# a link goes is moved to ~/.agents/backup-<date>/, never deleted.
# Usage: bash install.sh [--config] [--no-tools]
# Windows: run from Git Bash ("C:/Program Files/Git/bin/bash.exe" install.sh), not WSL's bash.
set -eu
REPO="$(cd "$(dirname "$0")" && pwd)"
. "$REPO/scripts/lib.sh"
FORCE_CONFIG=0 TOOLS=1
for a in "$@"; do
  case "$a" in
    --config) FORCE_CONFIG=1 ;;
    --no-tools) TOOLS=0 ;;
    *) sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'; exit 2 ;;
  esac
done
BACKUP="$HOME/.agents/backup-$(date +%Y-%m-%d)"
export REPO BACKUP FORCE_CONFIG


echo "Skills"
agents=("$HOME/.agents/skills" "$HOME/.claude/skills" "$HOME/.gemini/skills")
for d in "$REPO"/skills/*/; do
  [ -f "$d/SKILL.md" ] || continue
  s="$(basename "$d")"
  for t in "${agents[@]}"; do link_dir "${d%/}" "$t/$s"; done
done
link_dir "$REPO/third-party/prompt-cache-control" "$HOME/.claude/skills/prompt-cache-control"
for t in "${agents[@]}"; do prune_dead_links "$t"; done
echo "  linked $(ls -d "$REPO"/skills/*/ | wc -l | tr -d ' ') skills"
# Google's Android skills are not copied here (their license files are not redistributed): the
# android CLI installs and updates them for every agent it finds.
if [ "${AW_NO_CLI:-0}" != 1 ] && command -v android >/dev/null 2>&1; then
  prune_dead_links "$HOME/.gemini/antigravity/skills"   # the CLI crashes on a dead link there
  android skills add --all >/dev/null 2>&1 && android skills update --all >/dev/null 2>&1 &&
    echo "  Android skills: installed/updated by the android CLI" ||
    echo "  Android skills: run android skills add --all"
else
  echo "  Android skills: install the android CLI, then run android skills add --all"
fi

if [ "$TOOLS" = 1 ]; then
  echo "Tools"
  for i in "$REPO"/skills/*/install.sh; do bash "$i" | sed 's/^/  /'; done
fi

echo "Config"
merge_settings "$REPO/config/claude/settings.base.json" "$HOME/.claude/settings.json" && echo "  merged ~/.claude/settings.json"
import_md "$REPO/config/claude/CLAUDE.md" "$HOME/.claude/CLAUDE.md"
# agy ignores @imports in GEMINI.md and Windows file symlinks need developer mode, so this one is a copy.
copy_config "$REPO/config/gemini/GEMINI.md" "$HOME/.gemini/GEMINI.md"
link_dir "$REPO/config/gemini/rules" "$HOME/.gemini/rules"
git_excludes "$REPO/config/git/ignore"

if [ "${AW_NO_CLI:-0}" != 1 ] && command -v claude >/dev/null 2>&1; then
  echo "Claude Code plugins"
  claude plugin marketplace list 2>/dev/null | grep -q raghav-plugins ||
    claude plugin marketplace add "$(winpath "$REPO/plugins/plan-keeper")" >/dev/null 2>&1 || true
  for p in commit-commands@claude-plugins-official code-review@claude-plugins-official \
    kotlin-lsp@claude-plugins-official plan-keeper@raghav-plugins; do
    claude plugin install "$p" >/dev/null 2>&1 && echo "  $p" || echo "  $p: install it from /plugin"
  done
fi
[ "${MOVED:-0}" = 1 ] && echo "Moved replaced folders to $BACKUP"
echo "Done. Restart your agents so they load the changes."
