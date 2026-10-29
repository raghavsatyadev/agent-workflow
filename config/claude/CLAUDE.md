# Global rules

- Keep every source file at or under 500 lines. Before finishing a change that pushes a file you
  wrote or own past that, split it by responsibility into smaller modules and keep the entry point
  thin. Generated files, lockfiles, vendored code and data files are exempt. In clones or forks of
  someone else's project, don't split upstream files; follow that project's conventions.
- Before building a feature you haven't built before, search GitHub for open-source projects that
  already do it and compare their approaches; don't start from scratch.
- Pick the search tool by question: how a named class/function fits in → `gq explain|affected`
  (repos with `graphify-out/`); code by meaning → `jgl --files`; an exact string → `rg`.
- Don't dump files through the shell (`cat`, `sed -n`, `head`). Find the lines with `rg -n` first,
  then `Read` with `offset`/`limit`. Read a whole file only when it is under about 200 lines.
- Run tests and builds quietly: `-q`, failures only, or `| tail -40`. Send long logs to `lm-ask`
  instead of reading them.
- Start a new session when a task is done or the context passes about 100k tokens; don't carry
  unrelated tasks through one session.
- End every Haiku subagent prompt with "Do not call the advisor tool." (Opus advisor tokens are
  for the main session only.)
