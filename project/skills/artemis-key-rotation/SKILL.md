---
name: artemis-key-rotation
description: Switch ARTEMIS to the other Gemini API key when runs fail on quota or rate limits (429, RESOURCE_EXHAUSTED, "quota exceeded").
---

# ARTEMIS key rotation

ARTEMIS reads `GEMINI_API_KEY` from its clone's `.env` (`../artemis/.env` next to the repo). Both
keys live only in the repo's gitignored `memory/`:

- `memory/artemis.env`: `GEMINI_API_KEY_1`, `GEMINI_API_KEY_2`, and the active `GEMINI_API_KEY`
- `memory/artemis-keys.md`: which key is active, which ran out and when

Never write a key into a tracked file, commit, PR, chat or memory. Don't search env vars or other
folders for keys.

A 503 "model is experiencing high demand" is overload, not quota: don't rotate, retry later or use
adb.

## Rotate (from the repo root; prints only the last 4 chars)

```bash
M=memory/artemis.env; E=../artemis/.env
CUR=$(grep '^GEMINI_API_KEY=' "$E" | cut -d= -f2-)
K1=$(grep '^GEMINI_API_KEY_1=' "$M" | cut -d= -f2-); K2=$(grep '^GEMINI_API_KEY_2=' "$M" | cut -d= -f2-)
[ "$CUR" = "$K1" ] && NEW=$K2 || NEW=$K1
cp "$E" "$E.bak"
sed -i "s|^GEMINI_API_KEY=.*|GEMINI_API_KEY=$NEW|" "$E" "$M"
grep -q "^GEMINI_API_KEY=$NEW$" "$E" && rm -f "$E.bak" || mv "$E.bak" "$E"
echo "ARTEMIS now on key ending ${NEW: -4}"
```

Then:

1. Update `memory/artemis-keys.md` (active / ran out, date) with a script writing a raw string
   (Python `r'...'`) — sed/perl turn `\a` in `..\artemis\.env` into a bell.
2. Restart the ARTEMIS task daemon: it reads `.env` only at startup, and `/mcp` leaves it running.
   Stop whatever listens on port 8000 (PowerShell: `Get-NetTCPConnection -LocalPort 8000 -State
   Listen` → `Stop-Process -Id <OwningProcess>`); the next `mobile_run_task` starts a fresh one. The
   old `retryDelay` still showing means it wasn't restarted.

Both keys out → tell the user and fall back to adb
([android-device-test](../android-device-test/SKILL.md)).
