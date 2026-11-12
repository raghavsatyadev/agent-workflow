---
trigger: always_on
description: Branch, commit, push and PR policy, set per project by GIT_FLOW and BASE_BRANCH in agent-kit.env.
---

# RULE: BRANCHES, COMMITS, PRs (STRICT)

Read `GIT_FLOW` and `BASE_BRANCH` from `agent-kit.env`. `GIT_FLOW` missing → treat it as `pr`.

| `GIT_FLOW` | Do |
| --- | --- |
| `direct` | Commit finished, checked work on `BASE_BRANCH` and push to `origin` without asking. From a worktree branch: `git push origin HEAD:<BASE_BRANCH>`. PRs only when asked. |
| `pr` | Never push to `BASE_BRANCH` or `master`/`main`. `git fetch origin && git checkout -b <type>/<slug> origin/<BASE_BRANCH>` (`feat/`, `fix/<n>-`, `refactor/`, `docs/`, `chore/`), `git push -u origin <branch>`, `gh pr create --base <BASE_BRANCH> --body-file tmp/pr_body.md`. Hand the PR URL to the user. |
| `local` | Commit on the current branch only. Never push unless the user asks in this conversation. |

Always:

- **Never** force-push, rewrite pushed history, or `git reset --hard` over uncommitted work.
- **Never** merge or approve a PR (`gh pr merge`, `gh pr review --approve`).
- PR bodies via `--body-file`, never inline `--body`.
- Before committing: `bash scripts/ci-local.sh` green and the build in
  [android-build](android-build.md).
- Conventional Commits (`feat:`, `fix(scope):`, `docs:` …) unless `project.md` says otherwise.
- Never commit `local.properties`, `secret.properties`, keystores, keys or tokens.
