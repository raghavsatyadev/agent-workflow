---
name: ats-smart
description: Judgement-based resume review against a job description - scripted ATS baseline, conservative keyword scan with synonym credit, formatting audit, recruiter 6-second screen, binary interview verdict, then a ranked rewrite plan with exact before/after text. Invoked only via /ats-smart.
disable-model-invocation: true
argument-hint: "[job description text or file] [resume.pdf]"
---

# /ats-smart - recruiter-grade ATS review

Merges three sources: the scripted scorer (`/ats`), the keyword-placement method from resume-ats-optimizer, and the recruiter screen from LoreJob/cv-screener. Unlike cv-screener, this skill DOES coach - the verdict comes first and is not softened, then the fix plan follows.

## Step 0 - Inputs

- **Resume**: path in `$ARGUMENTS`, else the one named in `~/.agent-local/ats.md` (see the end).
- **Job description**: strongly preferred. A title alone is not a JD. If none is given, say once that the review runs against a generic Senior Android profile and is less reliable, then continue (skip the verdict's JD-specific disqualifiers).

## Step 1 - Scripted baseline

Write `jd_keywords.json` from the JD (see `/ats` for the format, include `synonyms`) and run
`python -I ~/.claude/skills/ats/ats_score.py <resume> [jd_keywords.json]`. Keep its numbers as the reproducible baseline; everything below adds judgement on top.

## Step 2 - Keyword scan (judgement)

Extract from the JD, using its exact spelling:
- **Hard skills** - languages, frameworks, tools, platforms, methodologies, certifications
- **Soft skills** - only those stated verbatim in the JD; never inferred
- **Experience & credentials** - years, seniority, domain, degree
- **Role terminology** - titles, functions, domain language

Classify each against the resume. Be conservative - a real ATS gives no benefit of the doubt:

| State | Meaning | Credit |
|---|---|---|
| ✓ exact | verbatim or trivial variant (plural, case, spelling) | 1.0 |
| ~ partial | close synonym or equivalent (k8s for Kubernetes, Google Play for Play Store, SOA for microservices) | 0.5 |
| ✗ missing | not present in any recognisable form | 0 |

Doubt between exact and partial -> partial; between partial and missing -> missing.
`ATS match = (exact + 0.5 x partial) / total`. 80%+ is a strong match.

For every ✓ also note **frequency and placement**: critical terms should appear 2-4x, and in Summary or Experience bullets, not only in Skills (many ATS weight Experience higher). Flag stuffing (same term repeated with no context, or long tool lists with no evidence of use).

## Step 3 - Formatting audit

Look at the PDF pages themselves (Read the PDF), not just extracted text. Flag: tables or multi-column layout, critical info in headers/footers, images or graphics, non-standard section titles, missing or inconsistent dates, special glyphs that extract badly, image-only PDF. Note when `pdftotext -layout` reorders text (e.g. a right-aligned location landing on a heading line) - that is how a parser may see it.

## Step 4 - Recruiter screen

- **6-second scan**: is the current title relevant and visible, the recent employer credible, the seniority obvious, the page clean?
- **Experience relevance** per role (high/medium/low), trajectory, gaps over 6 months, short stints.
- **Achievements vs responsibilities**: quantified outcomes, impact verbs, scope (team size, users, scale).
- **Education & credentials** vs the JD's requirements.
- **Tech fit signals**: primary stack match (full/partial/mismatch), scale of systems, company tier, portfolio/GitHub, built-from-scratch vs features vs maintenance.
- **Hard disqualifiers** (automatic not-shortlisted): demonstrably below the required years, a mandatory requirement missing, ATS match under 40%, evidence of inconsistency in dates or roles.

Overall score out of 10 (tech weights): ATS match 30%, experience relevance 30%, achievement quality 25%, formatting 5%, education 5%, trajectory 5%. Calibrate honestly - 7 means "likely gets a call", 5 should feel uncomfortable. Do not inflate.

**Verdict**: `SHORTLISTED` only if overall >= 7.0 and ATS match >= 60% and no hard disqualifier; otherwise `NOT SHORTLISTED`.

## Step 5 - Output

One code block, lines <= 60 chars:

```
VERDICT: SHORTLISTED / NOT SHORTLISTED
Overall X.X/10 | ATS match XX% | Script XX.X/100
Role: <title>  Company: <if known>

ASSESSMENT  2-4 direct sentences, no softening.

KEYWORD SCAN (n/m)
 Hard skills   ✓ ..  ~ ..  ✗ ..
 Soft skills   ✓ ..  ✗ ..
 Experience    ✓ ..  ✗ ..
 Role terms    ✓ ..  ✗ ..
 Formatting flags: ... or None

TECH FIT  stack | scale | tier | portfolio
SCORE BREAKDOWN  component, weight, score
```

List ✗ items in JD-importance order and never truncate them; compress long ✓ lists.

Then, outside the block, the **fix plan** ranked by impact:
1. Exact before -> after text for each change (bullet rewrites, Summary keyword line, Skills additions, variant -> exact term swaps).
2. The estimated new ATS match / script score.

Rules for fixes: only skills the user actually has - ask about any you are unsure of; never invent metrics - ask for the real number; prefer weaving a keyword into an existing true bullet over adding Skills entries; keep bullets <= 35 words and the resume at 2 pages.

## Step 6 - Apply (only when the user says so)

Edit the .tex, rebuild with `bash ~/.claude/skills/ats/build_resume.sh`, check the page count is still 2 and render page 1 (`pdftoppm -r 60 -png -f 1 -l 1`) to eyeball layout. Re-run Step 1 and report before/after for the script score and the ATS match.

## Your resume

Personal details (resume path, employer rules, target score) live outside this repo in
`~/.agent-local/ats.md`. Read it first and follow it; if it is missing, ask the user for the resume
path. `build_resume.sh` takes the .tex path as its argument, else `RESUME_TEX` from
`~/.agent-local/ats.env`.
