---
name: tool-usage-report
description: At the end of every session, before the final message, report how often lm-ask, jgl, rg and grep were used and how many tokens lm-ask saved, and say where they could have been used but were not.
---

# Tool usage report (temporary)

Global skill (all projects). To remove it, delete this folder (~/.claude/skills/tool-usage-report).

## At the end of every session

1. Run `python ~/.claude/skills/tool-usage-report/report.py` (newest transcript of the current project), or
   pass a transcript path.
2. Add a short "Tool usage" section to the final message:
   - calls: lm-ask, jgl, rg (own searches and pipe filters), grep, Grep tool;
   - tokens saved by lm-ask (from `~/.local-model/usage.log`);
   - **missed chances**: go through the large tool results the script lists, and the searches you
     made. For each, say whether `lm-ask` (you needed only a verdict) or `jgl` (you did not
     know the exact name) would have been better, and the approximate tokens it would have saved.
     If none, say so.
3. Be honest. Report zero uses as zero.

## How the numbers are made

- Token counts are estimates at 4 bytes per token.
- lm-ask saving = input bytes / 4 − 40 tokens (command + answer) for each answered call.
- jgl: output tokens read are shown; no saving is claimed, because the alternative search is not
  known.
- Calls are counted from the Bash commands in the transcript. The log lines are matched by the
  session's time window, so a parallel session in the same window adds its calls too.
