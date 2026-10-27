#!/usr/bin/env bash
# Extra setup for the headless-emulator skill; agent-workflow/install.sh runs it after it links the skill.
#   ~/.headless-emu/emu, a shim that runs this folder's emu (the folder also keeps the idle stamps and emulator logs). Re-run to update.
set -eu
here="$(cd "$(dirname "$0")" && pwd)"
. "$here/../../scripts/shim.sh"
shim "$HOME/.headless-emu" "$here/emu"
rm -f "$HOME/.headless-emu/emu-web.mjs"   # was a copy; emu runs the repo one
for t in emulator adb node; do command -v "$t" >/dev/null 2>&1 || echo "headless-emulator: $t is not on PATH" >&2; done
echo "headless-emulator: emu in ~/.headless-emu"
