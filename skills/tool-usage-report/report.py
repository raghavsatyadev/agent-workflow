"""Per-session report of lm-ask / jgl / rg use and the tokens lm-ask saved.

python .agents/skills/tool-usage-report/report.py [transcript.jsonl]

Default transcript: the newest *.jsonl in ~/.claude/projects/<dir matching this repo>/.
Token numbers are estimates at 4 bytes per token.
"""

import glob
import json
import os
import re
import sys
from datetime import datetime

BYTES_PER_TOKEN = 4
ASK_OVERHEAD = 40  # tokens for the lm-ask command line and its one-line answer
BIG_RESULT = 8000  # bytes; a tool result this large was a lm-ask candidate
LOG = os.environ.get("LOCAL_MODEL_USAGE_LOG_FILE", os.path.expanduser("~/.local-model/usage.log"))


def newest_transcript():
    repo = os.path.basename(os.getcwd()).lower()
    dirs = [d for d in glob.glob(os.path.expanduser("~/.claude/projects/*")) if d.lower().endswith(repo)]
    files = [f for d in dirs for f in glob.glob(os.path.join(d, "*.jsonl"))]
    if not files:
        sys.exit(f"no transcript found for {repo}")
    return max(files, key=os.path.getmtime)


def ts(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


SEG = r"(?:^|[;&(]|&&|\|\||\$\()\s*"  # start of a command, not after a pipe
PIPE = r"\|\s*"


def count(cmd, name):
    word = rf"(?:[\w~/.-]*/)?{re.escape(name)}\b"
    own = len(re.findall(SEG + word, cmd, re.M))
    piped = len(re.findall(PIPE + word, cmd))
    return own, piped


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else newest_transcript()
    first = last = None
    bash = []
    tools = {}
    uses = {}
    big = []
    seen_msg = set()
    out_tokens = 0
    peak_ctx = 0
    for line in open(path, encoding="utf-8"):
        try:
            e = json.loads(line)
        except ValueError:
            continue
        if e.get("timestamp"):
            t = ts(e["timestamp"])
            first = first or t
            last = t
        msg = e.get("message") or {}
        content = msg.get("content")
        if e.get("type") == "assistant":
            u = msg.get("usage") or {}
            if msg.get("id") not in seen_msg:
                seen_msg.add(msg.get("id"))
                out_tokens += u.get("output_tokens", 0)
            ctx = u.get("input_tokens", 0) + u.get("cache_read_input_tokens", 0) + u.get("cache_creation_input_tokens", 0)
            peak_ctx = max(peak_ctx, ctx)
            for c in content if isinstance(content, list) else []:
                if c.get("type") == "tool_use":
                    tools[c["name"]] = tools.get(c["name"], 0) + 1
                    inp = c.get("input") or {}
                    label = inp.get("command") or inp.get("file_path") or inp.get("pattern") or ""
                    uses[c["id"]] = (c["name"], label)
                    if c["name"] == "Bash":
                        bash.append(label)
        elif e.get("type") == "user" and isinstance(content, list):
            for c in content:
                if c.get("type") != "tool_result":
                    continue
                body = c.get("content")
                if isinstance(body, list):
                    body = "".join(x.get("text", "") for x in body if isinstance(x, dict))
                size = len((body or "").encode("utf-8"))
                if size >= BIG_RESULT:
                    name, label = uses.get(c.get("tool_use_id"), ("?", ""))
                    big.append((size, name, label))

    print(f"Session  {os.path.basename(path)[:8]}  {first:%Y-%m-%d %H:%M} to {last:%H:%M} UTC")
    print(f"Tokens   output {out_tokens:,}   peak context {peak_ctx:,}")
    print()
    print("Calls from the transcript")
    for name in ("lm-ask", "nimble-ask", "jgl"):
        print(f"  {name:<11} {sum(sum(count(c, name)) for c in bash):>3}")
    for name in ("rg", "grep"):  # own = a search; pipe = a filter after |
        own = sum(count(c, name)[0] for c in bash)
        piped = sum(count(c, name)[1] for c in bash)
        print(f"  {name:<11} {own:>3} searches, {piped} pipe filters")
    print(f"  Grep tool   {tools.get('Grep', 0):>3}   (ripgrep)   Read {tools.get('Read', 0)}   Glob {tools.get('Glob', 0)}")
    print()

    rows = []
    if os.path.exists(LOG):
        for line in open(LOG, encoding="utf-8", errors="replace"):
            f = line.rstrip("\n").split("\t")
            if len(f) >= 7 and first and first <= ts(f[0]) <= last:
                rows.append(f)
    asks = [r for r in rows if r[1] in ("lm-ask", "nimble-ask")]
    jgls = [r for r in rows if r[1] == "jgl"]
    saved = sum(max(0, int(r[3]) // BYTES_PER_TOKEN - ASK_OVERHEAD) for r in asks if r[4] != "failed")
    print(f"usage.log in this window: lm-ask {len(asks)}, jgl {len(jgls)}")
    for r in asks:
        print(f"  ask  {r[3]:>7} B  {r[2]:>5} ms  {r[4][:28]:<28} {r[6][:60]}")
    for r in jgls:
        print(f"  jgl  {r[3]:>7} B  {r[2]:>5} ms  {r[4]:<28} {r[6][:60]}")
    print(f"Saved by lm-ask: ~{saved:,} tokens (input it did not read, minus ~{ASK_OVERHEAD} per call)")
    print(f"Read from jgl output: ~{sum(int(r[3]) for r in jgls) // BYTES_PER_TOKEN:,} tokens (no saving claimed)")
    print()
    print(f"Tool results >= {BIG_RESULT} B read into context (lm-ask candidates when only a verdict was needed):")
    for size, name, label in sorted(big, reverse=True)[:8]:
        print(f"  ~{size // BYTES_PER_TOKEN:>6,} tok  {name:<5} {label.splitlines()[0][:80] if label else ''}")
    if not big:
        print("  none")


if __name__ == "__main__":
    main()
