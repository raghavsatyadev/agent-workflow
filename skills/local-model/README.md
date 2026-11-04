# local-model / token-saver

The `local-model` skill (Claude Code, Gemini, Antigravity) and the **token-saver** Claude Code plugin
are this one folder. SKILL.md is what agents load; this file is for people and is never loaded.

- Skill: SKILL.md (linked into `~/.agents/skills` and `~/.gemini/skills`; Claude Code gets it from the plugin).
- Plugin: `.claude-plugin/plugin.json`, `hooks/hooks.json` (the hooks and the `/tool-savings` mod in
  `hooks/register.js`). The folder is also its own marketplace (`.claude-plugin/marketplace.json`).
- `install.sh` writes the shims in `~/.local-model/`, registers the plugin and migrates older installs.
  The hooks run the shims, so an edit to a script applies at once. Claude Code keeps a copy of the
  plugin per version: after changing SKILL.md, `hooks/hooks.json` or `hooks/register.js`, bump
  `version` in both `.claude-plugin` files and re-run `install.sh`.

No MCP server: every tool is a shell command that prints one short line, so nothing costs context
until it is used.

## Tools

| Tool | Calls the model | What it does |
| --- | --- | --- |
| `lm-ask` | yes | yes/no or pick-one verdict about text on stdin |
| `jgl` (+ `jg-local-proxy.mjs`) | yes | `jg` (jevgrep) with snippets judged by the main backend |
| `lm-rank` | yes | best files from `rg` hits or a file list |
| `lm-diffcheck` | yes | the project's yes/no rules over a diff |
| `lm-on` / `lm-off` | no (loads/unloads) | start Ollama, load the model, start the jgl proxy / unload |
| `lm-backend` | no | print or set the main backend |
| `local-model.sh`, `lm-client.mjs` | client | the bash and Node clients for `/v1/systemone` |

Hooks (Claude Code, from the plugin):

| Hook | Event | Calls the model |
| --- | --- | --- |
| `lm-gate.mjs` (+ `lm-compress.mjs`) | PostToolUse Bash | yes |
| `lm-loop.mjs` | Pre/PostToolUse, PostToolUseFailure | yes, only with edits between failures |
| `tool-guard.mjs` (+ `shell-parse.mjs`, `search-steer.mjs`) | Pre/PostToolUse | no |
| `lm-route.mjs` | UserPromptSubmit | yes |
| `session-size.mjs` | UserPromptSubmit | no |
| `lm-diffcheck.mjs --hook` | UserPromptExpansion (`/code-review` ...) | yes |
| `lm-on`, `lm-off --own` | SessionStart, SessionEnd | no |

## Backends

| Backend | Where | Cost | Reads |
| --- | --- | --- | --- |
| Nimble | Ollama on this PC (`LOCAL_MODEL_URL`, default `127.0.0.1:11434`) | free | last ~6K tokens |
| Tev1 | Ollama (`LOCAL_MODEL_NAME=tev1:4b` or `tev1:0.8b`, `LOCAL_MODEL_MAX_BYTES=3600`) | free | last ~1.5K tokens |
| Laya | pip server (`LOCAL_MODEL_URL=http://127.0.0.1:8000`, `LOCAL_MODEL_NAME=laya`) | free | last ~400 tokens |
| Jev | TypeSafe hosted (`api.typesafe.ai`) | paid per input token | last ~28K tokens |

The main backend is `LM_BACKEND`, else the word in `~/.local-model/backend` (`lm-backend local|jev`
writes it), else `local`. `LOCAL_MODEL_LOCAL=0` is the older way to say `jev`.

- **local** (default): `lm-ask` uses Jev only when a key is set and the input is over the local budget
  (`LOCAL_MODEL_MAX_BYTES`) or no local model answered. `lm-rank`, `lm-diffcheck` and `jgl` stay local.
- **jev**: `lm-ask`, `lm-rank`, `lm-diffcheck` and `jgl` ask Jev first; when Jev fails (bad key, quota,
  offline) the local model answers if it is reachable, else they exit 2. `lm-on` does not load Nimble.
- **Hooks always stay local**, so they never cost money (`lm-compress` alone can make 40 calls on one
  long output). With `jev` and no Ollama running they do nothing.
- Key: `JEV_API_KEY` (set but empty = no key), else `~/.config/typesafe/api_key`. Every Jev call is
  logged with its input tokens in `~/.config/typesafe/usage.log`. `LOCAL_MODEL_ALLOW_JEV=0` keeps one
  `lm-ask` call local.

## lm-gate: long Bash output

Bash output over 8 KB (`LOCAL_MODEL_COMPRESS_KB`) is shrunk to about 6 KB
(`LOCAL_MODEL_COMPRESS_BUDGET`) the way Headroom does: ANSI codes and progress bars dropped, JSON
arrays cut to 3 items plus a count, repeated lines collapsed, then the local model keeps the blocks
that matter for the call's `description`. The first 12 and last 25 lines and every error line stay.
Exact reads are never compressed: `cat`/`sed`/`head`/`tail`/`nl` of a file that is not a log,
`git diff`/`show`/`blame`, `gh pr diff`, and `lm-*`/`jgl` calls.

Build, test or lint runs (`gradlew`, `gradle-agent.sh`, `ci-local.sh`, `npm test`, `pytest`, `cargo
test`, `am instrument` ...) over 200 lines (`LOCAL_MODEL_GATE_LINES`) get a verdict instead:
`[lm-gate] PASSED` with the result lines (yes ≥ 0.9 and a result line such as `BUILD SUCCESSFUL`), or
`[lm-gate] Not a clean pass` with each failure line and the lines after it. The full output is saved
in `~/.local-model/gate/` and named at the end. Self-test: `node test/lm-gate.test.mjs`.

## lm-loop

The same Bash command failing 3 times in a row with the same error and nothing changed in between
→ a warning; the next identical run is blocked once. With edits in between, the model is asked
whether the 3 errors are the same; yes ≥ 0.9 → a warning that the edits are not reaching the cause.

## tool-guard

Denies a log dump before it runs: `adb logcat -d` (no `-t N`), `cat`/`less` on a log, `head`/`tail`
over 30 lines, `tail -f`, `sed` over a log, `rg`/`grep` on a log without `-c`/`-l`/`-q`/`-m N`, a Read
of a log without a small `limit`, a Grep content search of a log without a small `head_limit`. The
body of `bash -c`, `powershell -Command`, `$(...)` and backticks is checked too. A pipe into
`lm-ask`, `lm-rank`, `wc`, `rg -c` or `head -n 30`, or `> file`, makes it fine. A log is `*.log`,
`*.trace`, `tmp/gradle-agent-*`, tombstones, `hs_err_pid*`, `*crash*.txt`, `anr*.txt`,
`logcat*.txt`, `bugreport*.txt`. Nothing is denied when no backend could answer `lm-ask`.

After 3 code searches in a row it adds a note naming the better tool (`gq` for a code name in a repo
with a code graph, `jgl` for free text); after 6 source files Read in a graph repo it points at `gq
query`. After the second note the next such search is refused once (exact strings never are;
`LM_ENFORCE=0` runs it). Self-test: `node test/tool-guard.test.mjs`.

## lm-route and session-size

`lm-route` sizes each prompt; only a sure answer (≥ 0.9) adds a line. On 34 real prompts its sure
answers were right 14 of 14. `session-size` (no model) reads the latest context size from the
transcript: over 100k tokens (`LM_SESSION_CTX`), or older than 3 h (`LM_SESSION_HOURS`) and over 50k,
the user sees a note; then it stays quiet for 5 prompts (`LM_SESSION_EVERY`). Self-test:
`node test/session-size.test.mjs`.

## lm-rank and lm-diffcheck

`lm-rank` reads each file's hit lines with a few lines around them (a whole file: its best 3 KB
chunk). On 8 code questions in a test app the right file was in its top 3 every time; `rg` ordered by
hit count got 3 of 8. About 4-8 s for 30-40 files.

`lm-diffcheck` asks each changed file's diff the questions in `.agents/diff-checks.txt` (one per line,
`<glob> | <question>`, phrased so that yes is the problem; `<glob> | !<message>` flags any change
there without asking). The base is `BASE_BRANCH` from `agent-kit.env`, else `origin/HEAD`. The
UserPromptExpansion hook runs it for `/code-review`, `/review`, `/security-review` and `/simplify`.

## Settings

`LM_BACKEND` (local | jev), `LOCAL_MODEL_URL`, `LOCAL_MODEL_NAME`, `LOCAL_MODEL_MAX_BYTES`,
`LOCAL_MODEL_KEEP_ALIVE` (default `10m`), `LOCAL_MODEL_TIMEOUT` (default 30 s), `LOCAL_MODEL_HOOKS=0`
(all off), `LOCAL_MODEL_GATE=0`, `LOCAL_MODEL_GATE_LINES` (200), `LOCAL_MODEL_COMPRESS=0`,
`LOCAL_MODEL_COMPRESS_KB` (8), `LOCAL_MODEL_COMPRESS_BUDGET` (6000), `LOCAL_MODEL_LOOP=0`,
`LOCAL_MODEL_LOOP_MAX` (3), `LOCAL_MODEL_ENFORCE=0` (tool-guard off; `LM_ENFORCE=0` for one command),
`LOCAL_MODEL_ENFORCE_LINES` (30), `LOCAL_MODEL_ENFORCE_SEARCHES` (3), `LOCAL_MODEL_ENFORCE_LOGS`,
`LOCAL_MODEL_ROUTE=0`, `LOCAL_MODEL_SESSION=0`, `LM_DIFFCHECK_MIN` (0.7), `JEV_API_KEY`, `JEV_URL`,
`JEV_MODEL` (`jev-latest`), `JEV_MAX_BYTES` (100000).

## Usage log

Each tool and hook adds one tab-separated line per call to `~/.local-model/usage.log`: time, tool,
milliseconds, bytes in, result, working directory, detail. `LOCAL_MODEL_USAGE_LOG=0` turns it off;
`LOCAL_MODEL_USAGE_LOG_FILE` moves it. `/tool-savings [days|today|all]` sums it per tool without a
Claude turn (rows from the old names `lm-enforce`, `lm-session` and `nimble-ask` count under the new ones).
