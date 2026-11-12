---
name: ats
description: Fast, deterministic ATS resume score (0-100) from a Python script - parseability, keyword match (exact + variant), content quality, format. Invoked only via /ats.
disable-model-invocation: true
argument-hint: "[resume.pdf] [job description text or file]"
---

# /ats - scripted ATS score

Reproducible estimate: the same resume always gets the same number. For judgement-based analysis (recruiter screen, verdict, rewrites) the user runs `/ats-smart` instead.

There is no official ATS score. Workday, Greenhouse, Lever, Taleo, iCIMS parse resumes and recruiters filter by keywords; Jobscan-style tools suggest ~75-80%+ match against a specific JD. Always report the breakdown, not just the number.

## Rubric (100 pts)

1. **Parseability (20)** - clean text extraction, email/phone/LinkedIn, standard headings (Summary, Experience, Skills, Education), `Month YYYY` dates.
2. **Keyword match (45)** - with a JD: required 75% + preferred 25%, -5% if the exact job title is absent. Without a JD: generic role bank (say it is less reliable). Exact term = full credit; only a variant (e.g. "Google Play" for "Play Store", "k8s" for "Kubernetes") = half credit, because many ATS match literally. 15% of this category rewards keywords that appear in Summary/Experience/Projects, not only in Skills.
3. **Content quality (20)** - bullets open with action verbs, 40%+ quantified, no weak phrases ("responsible for", "worked on"), no first-person pronouns, bullets <= 35 words.
4. **Format (15)** - text-based PDF, 1-2 pages, ~450-1000 words.

The script also reports: required terms that appear only once (critical terms ideally appear 2-4x), terms that look stuffed (>6x), and bullet openers missing from its verb list (check by eye; extend `VERBS` if they are real verbs).

## Procedure

1. Resume: the path in `$ARGUMENTS`, else the one named in `~/.agent-local/ats.md`. PDF preferred; a `.txt` works but skips format checks. Needs `pdftotext` (Git for Windows ships it).
2. If a job description is given, read it and write `jd_keywords.json` in the scratchpad:
   `{"title": "...", "required": [...], "preferred": [...], "synonyms": {"term": ["variant", ...]}}`
   Use the JD's exact spelling; hard skills/tools/methodologies only, no soft-skill fluff. Add `synonyms` for any JD term the resume might phrase differently.
3. Run: `python -I ~/.claude/skills/ats/ats_score.py <resume> [jd_keywords.json] [--role=android] [--json]`
4. Report the total, the four sub-scores, missing keywords, variant-only keywords, Skills-only keywords and issues. Then list concrete fixes ranked by points gained (each generic preferred keyword is worth ~0.45 pts, each required ~1.8 pts).
5. When editing to raise the score: only add skills the user actually has (ask if unsure); weave keywords into real bullets, never stuff; never invent metrics. Re-run and report before/after.

To support another role, add a bank to `ROLE_BANKS` in `ats_score.py`.

## Your resume

Personal details (resume path, employer rules, target score) live outside this repo in
`~/.agent-local/ats.md`. Read it first and follow it; if it is missing, ask the user for the resume
path. `build_resume.sh` takes the .tex path as its argument, else `RESUME_TEX` from
`~/.agent-local/ats.env`.

After editing the .tex, rebuild the PDF locally with `bash ~/.claude/skills/ats/build_resume.sh [file.tex]`
(MiKTeX, output identical to Overleaf), then re-score. Poppler (`pdfinfo`, `pdftoppm`) gives page counts
and page renders.
