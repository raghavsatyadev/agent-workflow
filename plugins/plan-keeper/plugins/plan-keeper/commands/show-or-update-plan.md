---
description: Show, create or update the project plan (.claude/PLAN.md)
argument-hint: "[optional: what to add or change]"
disable-model-invocation: true
---

Use the plan-writing-rules skill.

- If `.claude/PLAN.md` doesn't exist, create it from the skill's template. Base it on $ARGUMENTS, or on the current conversation if no arguments were given.
- If $ARGUMENTS is given, merge it into the plan: add, change or remove items as described.
- If no arguments were given and the plan exists, reply with a 3-line status: Now, next up, blockers.

Do it in one edit. Don't start working on the tasks themselves.
