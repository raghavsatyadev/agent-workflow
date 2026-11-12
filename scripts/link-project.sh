#!/usr/bin/env bash
# Link agent-workflow's Android project kit (skills/android, rules/android) into an Android project.
#
#   bash scripts/link-project.sh <project-dir> [--replace] [--check]
#
# For every shared skill/rule it makes a RELATIVE link in <project>/.agents/{skills,rules}/, links
# each .agents/skills/<name> into .claude/skills/ (Claude Code only reads that folder), and keeps a
# managed block in <project>/.gitignore listing exactly those links. Project-only files in .agents/
# (rules/project.md, flows/, project-only rules or skills) are never touched.
#
# An existing real file/folder where a link should go is left alone unless --replace: then it is
# untracked (git rm --cached) and moved to <project>/tmp/agents-replaced/ so nothing is lost.
# --check only reports what is missing or not a link. Nothing is committed.
#
# Windows: needs Developer Mode for symlinks (MSYS=winsymlinks:nativestrict). Without it, folders
# fall back to junctions (absolute) and rule files to copies, with a warning.
set -euo pipefail
export MSYS=winsymlinks:nativestrict

AW="$(cd "$(dirname "$0")/.." && pwd)"
SKILLS="$AW/skills/android" RULES="$AW/rules/android"
P="" REPLACE=0 CHECK=0
for a in "$@"; do
  case "$a" in
    --replace) REPLACE=1 ;;
    --check) CHECK=1 ;;
    -h | --help) sed -n '2,16p' "$0"; exit 0 ;;
    *) P="$a" ;;
  esac
done
[ -n "$P" ] && [ -d "$P" ] || { echo "usage: link-project.sh <project-dir> [--replace] [--check]" >&2; exit 2; }
P="$(cd "$P" && pwd)"
[ "$P" = "$AW" ] && { echo "refusing to link agent-workflow into itself" >&2; exit 2; }

is_windows() { case "$(uname -s)" in MINGW* | MSYS* | CYGWIN*) return 0 ;; esac; return 1; }
rel() { realpath --relative-to="$1" "$2"; }

made=0 kept=0 missing=0 fallback=0
declare -a IGNORED=()

# link <target-abs> <link-path-relative-to-P>
link() {
  local target="$1" l="$2" abs="$P/$2"
  IGNORED+=("/$l")
  # Keep only a correct RELATIVE link; junctions and absolute links are redone.
  if [ -L "$abs" ] && [ "$(realpath "$abs")" = "$(realpath "$target")" ] \
    && case "$(readlink "$abs")" in /* | [A-Za-z]:*) false ;; *) true ;; esac; then
    kept=$((kept + 1)); return
  fi
  if [ "$CHECK" = 1 ]; then echo "  needs link: $l"; missing=$((missing + 1)); return; fi
  if [ -L "$abs" ]; then rm -f "$abs"            # stale or wrong link
  elif [ -e "$abs" ]; then
    if [ "$REPLACE" = 0 ]; then echo "  skip (real copy, use --replace): $l"; missing=$((missing + 1)); return; fi
    git -C "$P" rm -r -q --cached --ignore-unmatch -- "$l" >/dev/null 2>&1 || true
    mkdir -p "$P/tmp/agents-replaced/$(dirname "$l")"
    rm -rf "$P/tmp/agents-replaced/$l"
    mv "$abs" "$P/tmp/agents-replaced/$l"
  fi
  mkdir -p "$(dirname "$abs")"
  if ln -s "$(rel "$(dirname "$abs")" "$target")" "$abs" 2>/dev/null && [ -L "$abs" ]; then
    made=$((made + 1)); return
  fi
  rm -rf "$abs"; fallback=$((fallback + 1))
  if [ -d "$target" ] && is_windows; then
    MSYS_NO_PATHCONV=1 cmd /c mklink /J "$(cygpath -w "$abs")" "$(cygpath -w "$target")" >/dev/null
    echo "  junction (enable Developer Mode for relative links): $l"
  else
    cp -r "$target" "$abs"
    echo "  COPY (symlinks unavailable; re-run after enabling them): $l"
  fi
}

echo "Linking $SKILLS, $RULES -> $P"
for d in "$SKILLS"/*/; do
  n="$(basename "$d")"; link "$SKILLS/$n" ".agents/skills/$n"
done
for f in "$RULES"/*.md; do
  n="$(basename "$f")"; link "$f" ".agents/rules/$n"
done
# Claude Code reads .claude/skills/ only: link every skill there, shared or project-only.
for d in "$P"/.agents/skills/*/; do
  [ -e "$d" ] || continue
  n="$(basename "$d")"; link "$P/.agents/skills/$n" ".claude/skills/$n"
done

# Managed .gitignore block: exactly the links above.
if [ "$CHECK" = 0 ]; then
  gi="$P/.gitignore" begin="# >>> agent-workflow project kit (scripts/link-project.sh) >>>"
  end="# <<< agent-workflow project kit <<<"
  touch "$gi"
  tmp="$(mktemp)"
  awk -v b="$begin" -v e="$end" '$0==b{skip=1;next} $0==e{skip=0;next} !skip' "$gi" > "$tmp"
  [ -s "$tmp" ] && [ -n "$(tail -c1 "$tmp")" ] && echo >> "$tmp"
  { echo "$begin"; printf '%s\n' "${IGNORED[@]}" /tmp/agents-replaced/ | sort -u; echo "$end"; } >> "$tmp"
  mv "$tmp" "$gi"
fi

echo "done: $made linked, $kept already linked, $missing not linked, $fallback fallback(s)"
[ "$CHECK" = 1 ] && [ "$missing" -gt 0 ] && exit 1
exit 0
