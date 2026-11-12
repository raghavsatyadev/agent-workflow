#!/usr/bin/env bash
# Extra setup for the local-model skill; agent-workflow/install.sh runs it after it links the skill.
#   ~/.local-model/          shims (one-line launchers, not copies) for local-model.sh, lm-ask, lm-on,
#                            lm-off, lm-backend, jgl, lm-rank, lm-diffcheck and the Node hooks (lm-client,
#                            lm-gate, lm-loop, tool-guard, lm-route, session-size, ...); they run this
#                            folder's files. The folder also keeps usage.log, backend, state/ and gate/.
#   token-saver plugin       this folder is a Claude Code plugin and its own marketplace: the hooks
#                            (hooks/hooks.json) and the /tool-savings mod. See README.md.
# Re-run to update. Migrates older installs: the `nimble` skill and ~/.nimble/ (keeps usage.log),
# the global hooks in ~/.claude/settings.json, the lm-savings@local-model mod, the shims of renamed
# scripts and the ~/.claude/skills/local-model link (the plugin loads the skill now).
set -eu
here="$(cd "$(dirname "$0")" && pwd)"
bin="$HOME/.local-model"
. "$here/../../../scripts/shim.sh"
shim "$bin" "$here/local-model.sh" "$here"/lm-ask "$here"/lm-off "$here"/lm-on "$here"/lm-backend "$here"/jgl "$here"/lm-rank "$here"/lm-diffcheck "$here"/*.mjs
# Shims of renamed scripts, and the copy of the old mod.
rm -rf "$bin/lm-enforce.mjs" "$bin/lm-steer.mjs" "$bin/lm-session.mjs" "$bin/lm-shell.mjs" "$bin/mod"
old="$HOME/.nimble"
if [ -d "$old" ]; then
  [ -f "$old/usage.log" ] && cat "$old/usage.log" >>"$bin/usage.log"
  rm -rf "$old"
fi
rm -rf "$HOME/.claude/nimble" "$HOME/.claude/skills/nimble" "$HOME/.gemini/skills/nimble" "$HOME/.agents/skills/nimble"
# The plugin loads the skill for Claude Code; a skills link too would list it twice.
lnk="$HOME/.claude/skills/local-model"
if [ -L "$lnk" ] || [ -d "$lnk" ]; then
  if command -v cygpath >/dev/null 2>&1; then MSYS2_ARG_CONV_EXCL='*' cmd /c rmdir "$(cygpath -w "$lnk")" >/dev/null 2>&1 || true
  else rm -f "$lnk" 2>/dev/null || true; fi
fi
# Old global hooks and the lm-savings mod entries in ~/.claude/settings.json: the plugin has them now.
node - "$HOME/.claude/settings.json" <<'JS'
const fs = require("fs"), f = process.argv[2];
if (!fs.existsSync(f)) process.exit(0);
const s = JSON.parse(fs.readFileSync(f, "utf8"));
const OLD = /\.local-model\/(lm-on|lm-off|lm-gate\.mjs|lm-loop\.mjs|lm-enforce\.mjs|tool-guard\.mjs|lm-route\.mjs|lm-session\.mjs|session-size\.mjs|lm-diffcheck\.mjs)|nimble-(on|off)/;
for (const [ev, list] of Object.entries(s.hooks ?? {})) {
  const keep = list
    .map((g) => ({ ...g, hooks: (g.hooks ?? []).filter((h) => !OLD.test(h.command ?? "")) }))
    .filter((g) => g.hooks.length);
  if (keep.length) s.hooks[ev] = keep;
  else delete s.hooks[ev];
}
if (s.hooks && !Object.keys(s.hooks).length) delete s.hooks;
delete s.enabledPlugins?.["lm-savings@local-model"];
delete s.extraKnownMarketplaces?.["local-model"];
fs.writeFileSync(f, JSON.stringify(s, null, 2) + "\n");
JS
# The plugin: this folder is its own marketplace. Updated every run (add and install do not pick up a
# new version on a re-run).
if [ "${AW_NO_CLI:-0}" != 1 ] && command -v claude >/dev/null 2>&1; then
  mp="$here"; command -v cygpath >/dev/null 2>&1 && mp="$(cygpath -w "$mp")"
  claude plugin uninstall lm-savings@local-model >/dev/null 2>&1 || true
  claude plugin marketplace remove local-model >/dev/null 2>&1 || true
  claude plugin marketplace add "$mp" >/dev/null 2>&1 || true
  claude plugin marketplace update token-saver >/dev/null 2>&1 || true
  claude plugin install token-saver@token-saver >/dev/null 2>&1 || true
  claude plugin update token-saver@token-saver >/dev/null 2>&1 || true
fi
echo "Installed: shims in $bin, plugin token-saver@token-saver (hooks, /tool-savings), backend $(bash "$here/lm-backend")"
