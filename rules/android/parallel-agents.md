---
trigger: model_decision
description: When the user asks for two or more agents to work at the same time, each in its own git worktree.
---

# RULE: PARALLEL AGENTS IN WORKTREES

Only when the user asks for them.

## Before the agents start

1. **Pin the base commit.** Worktrees have been cut several commits behind `BASE_BRANCH`. Put the
   base in every prompt: "Run `git log -1`. If HEAD is not `<sha>`, `git reset --hard <sha>` before
   you start." Then check each worktree yourself:
   ```bash
   for d in .claude/worktrees/*/; do git -C "$d" merge-base --is-ancestor <sha> HEAD && echo "OK $d" || echo "STALE $d"; done
   ```
2. **Cap Gradle memory for three or more parallel builds.** Each build takes the project
   `gradle.properties` heap for Gradle plus Kotlin daemon. Create `~/.gradle/gradle.properties`
   (overrides the project file):
   ```properties
   # TEMPORARY parallel-agent cap. DELETE THIS FILE when the wave ends.
   org.gradle.jvmargs=-Xmx3072M -Dkotlin.daemon.jvm.options="-Xmx3072M"
   org.gradle.parallel=false
   org.gradle.workers.max=3
   ```
   `GRADLE_OPTS=-Xmx…` doesn't cap anything: `org.gradle.jvmargs` wins, the Kotlin daemon ignores it.
   `project.md` may forbid parallel builds outright (low-RAM PCs).
3. **One device per agent.** Two agents installing to one phone overwrite each other's APK and
   grants.

## When the wave ends

- Delete `~/.gradle/gradle.properties` if you made it (it slows every later build, Studio too).
- `git worktree remove <path>` for merged or stopped branches, then `git worktree prune`. Ask before
  removing one with uncommitted changes.
