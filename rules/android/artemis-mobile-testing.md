---
trigger: model_decision
description: When exploring, testing or writing tests against the app on a device with ARTEMIS MCP tools (mobile_run_task, mobile_diagnose, mobile_get_device_state).
---

# ARTEMIS mobile-testing rules

The full rules ship with ARTEMIS (`$ARTEMIS_HOME/mcp_server/rules.md`). Don't copy them here.
Claude Code gets them from `uv run artemis mcp --install claude` (`~/.claude/rules/artemis.md`);
other agents read that file once before driving a device. If the project's `.mcp.json` starts
ARTEMIS from `$ARTEMIS_HOME` and no `mobile_*` tools show up, `ARTEMIS_HOME` is unset or the server
wasn't approved — see [project-onboarding-setup](../skills/project-onboarding-setup/SKILL.md).

Essentials:

- **ARTEMIS only for really dynamic flows.** Fixed steps run as Maestro/Mobly flows in
  `.agents/flows/` ([android-device-test](../skills/android-device-test/SKILL.md)); when a run finds
  a stable path, save it as a flow.
- Any ARTEMIS error or no device → `mobile_diagnose` first (`attempt_fix=true` before manual ADB),
  then its `next_steps` in order.
- Several devices → ask which serial, pass `device_serial`.
- `Flash` for short deterministic flows; `Pro` for exploration, checkpoints, reports.
- Pull artifacts with `adb -s <serial> pull …`. API keys go in the ARTEMIS `.env`, never the chat.
