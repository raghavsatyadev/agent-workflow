---
name: fix-issue
description: Fix a GitHub issue end to end — device repro, fix, device verification, commit or PR per the repo's branch policy. Use when given an issue link or number.
argument-hint: <github-issue-url-or-number>
---

Fix GitHub issue: $ARGUMENTS

Project values (`APP_MODULE`, `APP_VARIANT`, `BASE_BRANCH`, `GIT_FLOW`) come from `agent-kit.env`;
`.agents/rules/project.md` and the project's test policy override anything below.

## Before you start

- `gh api user -q .login` must work; else ask the user to run `gh auth login`.
- Call `mobile_diagnose`. No ARTEMIS tools → point to
  [project-onboarding-setup](../project-onboarding-setup/SKILL.md). Several devices → ask which.

## Steps

1. **Read** — `gh issue view <n> --comments`: expected vs actual, repro steps, area.
2. **Branch** per [branch-pr-policy](../../rules/branch-pr-policy.md) (`fix/<n>-<slug>` when
   `GIT_FLOW=pr`).
3. **Reproduce on the device before touching code** — build, install, reproduce with ARTEMIS
   ([android-device-test](../android-device-test/SKILL.md)). Notes in
   `tmp/YYYY-MM-DD-issue-<n>.md`.
4. **Fix** following [cmp-best-practices](../cmp-best-practices/SKILL.md) and the rules in
   `.agents/rules/` for that area. Add a failing-first test only if the project allows unit tests.
5. **Format and build** — `bash scripts/ci-local.sh --fix`, then
   [android-build](../../rules/android-build.md) (plus screenshot tests if UI changed).
6. **Verify** — `./gradlew <APP_MODULE>:install<APP_VARIANT>` and rerun the *same* reproduction.
7. **Commit** `fix: <summary> (closes #<n>)`; body: root cause, change, test, device evidence
   (model, steps, before/after). No screenshots or serials committed. Push / open the PR only as
   the branch policy says.

Stop and report instead of pushing if it won't reproduce, needs a product decision, or still fails
on the device. End with the PR URL or commit hash and: root cause, fix, test, device evidence.
