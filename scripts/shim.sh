#!/usr/bin/env bash
# shim <bin dir> <file>...: put a one-line launcher for each repo file in <bin dir>, instead of a
# copy. The launcher runs the repo file, so a pull updates every tool at once and nothing drifts.
# Used by skills/global/*/install.sh. (File symlinks need admin or developer mode on Windows; shims don't.)
#   *.mjs  -> export * from "file:///.../x.mjs"   (runs it; re-exports for modules that import it)
#   *.sh   -> . "/.../x.sh"                        (sourced helpers)
#   others -> exec bash "/.../x" "$@"              (the script's dirname is the repo folder)
shim() {
  local bin="$1" f src name url
  shift
  mkdir -p "$bin"
  for f in "$@"; do
    src="$(cd "$(dirname "$f")" && pwd)/$(basename "$f")"
    command -v cygpath >/dev/null 2>&1 && src="$(cygpath -m "$src")"   # C:/... works in any Windows tool
    name="$(basename "$f")"
    rm -f "$bin/$name"
    case "$name" in
      *.mjs)
        case "$src" in /*) url="file://$src" ;; *) url="file:///$src" ;; esac
        printf '// Shim from agent-workflow install.sh; edit the repo file instead.\nexport * from "%s";\n' "$url" >"$bin/$name"
        ;;
      *.sh)
        printf '# Shim from agent-workflow install.sh; edit the repo file instead.\n. "%s"\n' "$src" >"$bin/$name"
        ;;
      *)
        printf '#!/usr/bin/env bash\n# Shim from agent-workflow install.sh; edit the repo file instead.\nexec bash "%s" "$@"\n' "$src" >"$bin/$name"
        chmod +x "$bin/$name"
        ;;
    esac
  done
}
