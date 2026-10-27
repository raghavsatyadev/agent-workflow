#!/usr/bin/env bash
# Helpers for install.sh: cross-platform directory links and a settings merge.

is_win() { case "${OSTYPE:-}" in msys* | cygwin*) return 0 ;; *) return 1 ;; esac; }
winpath() { if is_win; then cygpath -w "$1"; else printf '%s' "$1"; fi; }
# Forward-slash absolute path (C:/Users/... on Windows): safe inside JSON.
fwdpath() { if is_win; then cygpath -m "$1"; else printf '%s' "$1"; fi; }

# Remove a link without touching what it points at. On Windows junctions, rm -rf would follow it.
unlink_dir() {
  if is_win; then MSYS2_ARG_CONV_EXCL='*' cmd /c rmdir "$(winpath "$1")" >/dev/null; else rm -f "$1"; fi
}

# link_dir <target> <link>: point <link> at <target>. A real folder already at <link> is moved to
# $BACKUP (never deleted). Windows uses a junction: no admin rights or developer mode needed.
link_dir() {
  local target="$1" link="$2"
  mkdir -p "$(dirname "$link")"
  if [ -L "$link" ]; then
    unlink_dir "$link"
  elif [ -e "$link" ]; then
    # ~/.claude/skills/x -> $BACKUP/.claude/skills/x (both .claude and .gemini have a "skills" folder)
    local dest="$BACKUP/$(basename "$(dirname "$(dirname "$link")")")/$(basename "$(dirname "$link")")"
    mkdir -p "$dest"
    local to="$dest/$(basename "$link")"
    [ -e "$to" ] && to="$to.$(date +%H%M%S)"
    mv "$link" "$to" && MOVED=1
  fi
  if is_win; then
    MSYS2_ARG_CONV_EXCL='*' cmd /c mklink /J "$(winpath "$link")" "$(winpath "$target")" >/dev/null
  else
    ln -s "$target" "$link"
  fi
}

# Drop links in a folder whose target is gone (for example a deleted skill).
prune_dead_links() {
  local d
  for d in "$1"/*; do
    [ -L "$d" ] && [ ! -e "$d" ] && { unlink_dir "$d"; echo "  removed dead link $(basename "$d")"; }
  done
  return 0
}

# copy_config <src> <dest>: copy when missing; with FORCE_CONFIG=1 overwrite after a .bak copy.
copy_config() {
  local src="$1" dest="$2"
  mkdir -p "$(dirname "$dest")"
  if [ ! -e "$dest" ]; then
    cp "$src" "$dest" && echo "  added $dest"
  elif ! cmp -s "$src" "$dest"; then
    if [ "${FORCE_CONFIG:-0}" = 1 ]; then
      cp "$dest" "$dest.bak" && cp "$src" "$dest" && echo "  updated $dest (old copy: $dest.bak)"
    else
      echo "  kept your $dest (differs from repo; re-run with --config to overwrite)"
    fi
  fi
}

# import_md <src> <dest>: make <dest> a one-line `@<src>` import (Claude Code follows it), so the
# repo file is the only copy. A <dest> with your own edits is kept; --config replaces it after a .bak.
import_md() {
  local src="$1" dest="$2" line
  line="@$(fwdpath "$src")"
  mkdir -p "$(dirname "$dest")"
  [ -f "$dest" ] && [ "$(cat "$dest")" = "$line" ] && return 0
  if [ -e "$dest" ] && ! cmp -s "$src" "$dest" && [ "${FORCE_CONFIG:-0}" != 1 ]; then
    echo "  kept your $dest (differs from repo; re-run with --config to replace it with an import)"
    return 0
  fi
  [ -e "$dest" ] && ! cmp -s "$src" "$dest" && cp "$dest" "$dest.bak"
  printf '%s
' "$line" >"$dest" && echo "  $dest imports $(fwdpath "$src")"
}

# git_excludes <file>: point git's global core.excludesFile at <file> unless it points elsewhere.
# An identical ~/.config/git/ignore copy is moved to $BACKUP.
git_excludes() {
  local f cur old="${XDG_CONFIG_HOME:-$HOME/.config}/git/ignore"
  f="$(fwdpath "$1")"
  cur="$(git config --global core.excludesFile || true)"
  if [ -n "$cur" ] && [ "$cur" != "$f" ]; then echo "  kept core.excludesFile=$cur"; return 0; fi
  git config --global core.excludesFile "$f"
  if [ -f "$old" ] && cmp -s "$1" "$old"; then mkdir -p "$BACKUP/git" && mv "$old" "$BACKUP/git/ignore" && MOVED=1; fi
  echo "  core.excludesFile=$f"
}

# merge_settings <base.json> <settings.json>: add missing keys from base, recursively. Values
# already in settings.json always win. {{HOME}} and {{REPO}} in base are filled in first.
merge_settings() {
  local base="$1" dest="$2"
  mkdir -p "$(dirname "$dest")"
  [ -f "$dest" ] && cp "$dest" "$dest.bak-agent-workflow"
  node - "$(fwdpath "$base")" "$(fwdpath "$dest")" "$(fwdpath "$HOME")" "$(fwdpath "$REPO")" <<'JS'
const fs = require("fs");
const [base, dest, home, repo] = process.argv.slice(2);
const b = JSON.parse(fs.readFileSync(base, "utf8").replaceAll("{{HOME}}", home).replaceAll("{{REPO}}", repo));
const s = fs.existsSync(dest) ? JSON.parse(fs.readFileSync(dest, "utf8")) : {};
const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
const merge = (t, src) => {
  for (const [k, v] of Object.entries(src)) {
    if (!(k in t)) t[k] = v;
    else if (isObj(t[k]) && isObj(v)) merge(t[k], v);
  }
  return t;
};
fs.writeFileSync(dest, JSON.stringify(merge(s, b), null, 2) + "\n");
JS
}
