#!/usr/bin/env bash
# Compile a resume .tex to a PDF beside it, keeping aux/log files out of the resume folder.
# Usage: bash build_resume.sh [path/to/resume.tex]
set -euo pipefail
# Default .tex: RESUME_TEX in ~/.agent-local/ats.env (private, outside this repo).
[ -f "$HOME/.agent-local/ats.env" ] && . "$HOME/.agent-local/ats.env"
TEX="${1:-${RESUME_TEX:-}}"
[ -n "$TEX" ] || { echo "Usage: build_resume.sh <resume.tex> (or set RESUME_TEX in ~/.agent-local/ats.env)" >&2; exit 2; }
export PATH="$LOCALAPPDATA/Programs/MiKTeX/miktex/bin/x64:$PATH"
command -v pdflatex >/dev/null || { echo "pdflatex not found - install MiKTeX: winget install MiKTeX.MiKTeX --scope user" >&2; exit 1; }
DIR=$(cd "$(dirname "$TEX")" && pwd); NAME=$(basename "$TEX" .tex)
BUILD=$(mktemp -d)
trap 'rm -rf "$BUILD"' EXIT
cd "$DIR"
if ! pdflatex -interaction=nonstopmode -halt-on-error -output-directory="$BUILD" "$NAME.tex" > "$BUILD/build.log" 2>&1; then
  grep -E -A3 "^!" "$BUILD/build.log" >&2 || tail -20 "$BUILD/build.log" >&2
  exit 1
fi
cp "$BUILD/$NAME.pdf" "$DIR/$NAME.pdf"
echo "Built $DIR/$NAME.pdf"
