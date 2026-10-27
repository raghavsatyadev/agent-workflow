#!/usr/bin/env python3
"""ATS score estimator.
Usage: python ats_score.py <resume.pdf|resume.txt> [jd_keywords.json] [--role=android] [--json]
Scores 0-100: Parseability (20), Keyword match (45), Content quality (20), Format (15).
jd_keywords.json: {"title": "...", "required": [...], "preferred": [...], "synonyms": {"term": ["variant", ...]}}
"""
import json, re, subprocess, sys

ROLE_BANKS = {
 "android": {
  "required": ["kotlin", "java", "android sdk", "jetpack compose", "coroutines", "mvvm", "clean architecture",
               "room", "retrofit", "rest api", "git", "unit testing", "ci/cd", "firebase", "android studio"],
  "preferred": ["flow", "hilt", "dagger", "kotlin multiplatform", "compose multiplatform", "mvi", "workmanager",
                "jetpack navigation", "espresso", "junit", "mockk", "gradle", "play store", "material design",
                "agile", "scrum", "code review", "mentoring", "performance optimization", "modularization",
                "on-device", "llm", "tensorflow lite", "python", "github actions", "crashlytics"]}}

# Variants an ATS may NOT treat as the canonical term. A variant hit earns half credit
# and is reported so the exact term can be added. Extend per JD via "synonyms" in the JD file.
VARIANTS = {
 "rest api": ["restful api", "restful", "rest apis", "rest services"],
 "ci/cd": ["continuous integration", "continuous delivery", "ci cd", "cicd"],
 "unit testing": ["unit tests", "unit test"],
 "kotlin multiplatform": ["kmp", "kmm"],
 "compose multiplatform": ["cmp"],
 "jetpack navigation": ["navigation component", "navigation compose", "navigation 3"],
 "play store": ["google play"],
 "mentoring": ["mentored", "mentor"],
 "code review": ["code reviews", "reviewed code", "pull request review"],
 "dependency injection": ["hilt", "dagger", "koin"],
 "kubernetes": ["k8s"], "aws": ["amazon web services"], "gcp": ["google cloud"],
 "javascript": ["js"], "typescript": ["ts"],
 "microservices": ["soa", "service-oriented"], "distributed systems": ["large-scale systems"],
 "machine learning": ["ml"], "llm": ["large language model", "large language models"],
 "agile": ["scrum", "kanban"], "performance optimization": ["optimized", "performance tuning"],
}

SECTIONS = {"summary": ["summary", "professional summary", "profile", "objective"],
            "experience": ["experience", "work experience", "professional experience", "employment", "work history"],
            "projects": ["projects", "personal projects"],
            "skills": ["skills", "technical skills", "core skills"],
            "education": ["education"]}
REQUIRED_SECTIONS = ["summary", "experience", "skills", "education"]
WEAK = ["responsible for", "worked on", "helped with", "duties included", "involved in", "tasked with"]
PRONOUNS = re.compile(r"\b(i|me|my|we|our)\b", re.I)
VERBS = set("""accelerated achieved added architected automated benchmarked boosted built co-founded coded
collaborated conducted contributed created curated cut delivered designed developed directed diversified drove
enabled engaged engineered established expanded generated grew helped implemented improved increased initiated
integrated introduced launched led maintained managed mentored migrated modernized open-sourced optimized
orchestrated owned pioneered presented published redesigned reduced refactored released resolved scaled set
shipped simplified spearheaded standardized streamlined trained upgraded wrote""".split())


def norm(t): return re.sub(r"\s+", " ", t.lower())


def count(k, t):
    return len(re.findall(r"(?<![a-z0-9])" + re.escape(k) + r"(?:s|es)?(?![a-z0-9])", t))


def extract(path):
    if path.lower().endswith(".txt"):
        return open(path, encoding="utf-8").read(), None
    raw = subprocess.run(["pdftotext", "-enc", "UTF-8", "-layout", path, "-"],
                         capture_output=True, text=True, encoding="utf-8").stdout
    try:
        info = subprocess.run(["pdfinfo", path], capture_output=True, text=True).stdout
        pages = int(re.search(r"Pages:\s+(\d+)", info).group(1))
    except Exception:  # no pdfinfo on this machine: count form feeds
        pages = raw.rstrip("\f").count("\f") + 1
    return raw, pages


def split_sections(raw):
    """Return {section: text} using heading lines (a heading may share its line with right-aligned text)."""
    lines = raw.split("\n"); marks = []
    for i, ln in enumerate(lines):
        head = re.split(r"\s{3,}", ln.strip())[0].lower().rstrip(":")
        for s, hs in SECTIONS.items():
            if head in hs:
                marks.append((i, s))
    out = {"header": "\n".join(lines[:marks[0][0]]) if marks else raw}
    for n, (i, s) in enumerate(marks):
        end = marks[n + 1][0] if n + 1 < len(marks) else len(lines)
        out[s] = out.get(s, "") + "\n".join(lines[i + 1:end])
    return out


def score(path, jd=None, role="android"):
    raw, pages = extract(path); t = norm(raw); out = {"issues": []}
    secs = split_sections(raw); nsecs = {k: norm(v) for k, v in secs.items()}

    # --- Parseability (20)
    p = 4 if len(t) > 800 else 0
    p += 2 if re.search(r"[\w.+-]+@[\w-]+\.\w+", t) else 0
    p += 2 if re.search(r"\+?\d[\d\s-]{9,}", t) else 0
    p += 2 if "linkedin.com" in t else 0
    found = {s: s in secs for s in REQUIRED_SECTIONS}
    p += 2 * sum(found.values())
    dates = re.findall(r"(january|february|march|april|may|june|july|august|september|october|november|december"
                       r"|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\.?\s+\d{4}", t)
    p += 2 if len(dates) >= 4 else 0
    p += 0 if "�" in raw or re.search(r"\(cid:\d+\)", raw) else 2
    for s, v in found.items():
        if not v: out["issues"].append(f"Missing standard section heading: {s}")
    out["parseability"] = min(p, 20)

    # --- Keywords (45)
    variants = dict(VARIANTS)
    if jd:
        for k, v in jd.get("synonyms", {}).items(): variants[k.lower()] = [x.lower() for x in v]
        req = [k.lower() for k in jd["required"]]; pref = [k.lower() for k in jd.get("preferred", [])]
        out["keyword_mode"] = "job description"
    else:
        bank = ROLE_BANKS[role]; req, pref = bank["required"], bank["preferred"]
        out["keyword_mode"] = f"generic {role} bank (no JD) - less reliable"

    def credit(k):
        if count(k, t): return 1.0, None
        hit = next((v for v in variants.get(k, []) if count(v, t)), None)
        return (0.5, hit) if hit else (0.0, None)

    detail = {}
    for k in req + pref:
        c, via = credit(k)
        detail[k] = {"credit": c, "via": via, "total": count(k, t),
                     "where": [s for s in ("summary", "experience", "projects", "skills") if count(k, nsecs.get(s, ""))]}
    rr = sum(detail[k]["credit"] for k in req) / max(len(req), 1)
    pr = sum(detail[k]["credit"] for k in pref) / len(pref) if pref else rr
    ratio = (0.75 * rr + 0.25 * pr) if jd else (0.7 * rr + 0.3 * pr)
    if jd and jd.get("title") and not count(jd["title"].lower(), t):
        ratio -= 0.05; out["issues"].append(f"Exact job title '{jd['title']}' not found in resume")
    hit = [k for k in req + pref if detail[k]["credit"] == 1.0]
    in_ctx = [k for k in hit if set(detail[k]["where"]) & {"summary", "experience", "projects"}]
    ctx_bonus = len(in_ctx) / len(hit) if hit else 0
    out["keywords"] = round(45 * max(0.85 * ratio + 0.15 * ctx_bonus, 0), 1)
    out["required_missing"] = [k for k in req if detail[k]["credit"] == 0]
    out["preferred_missing"] = [k for k in pref if detail[k]["credit"] == 0]
    out["variant_only"] = {k: detail[k]["via"] for k in req + pref if detail[k]["credit"] == 0.5}
    out["only_in_skills"] = [k for k in hit if detail[k]["where"] == ["skills"]]
    out["required_once"] = [k for k in req if detail[k]["total"] == 1]  # critical terms ideally appear 2-4x
    out["stuffed"] = [k for k in req + pref if detail[k]["total"] > 6]

    # --- Content quality (20)
    bullets = [norm(b) for b in re.findall(r"•\s*(.+?)(?=\n\s*\n|\n\s*•|\n\s*[A-Z][^\n]*\s{3,}|\Z)", raw, re.S)]
    n = max(len(bullets), 1)
    first = lambda b: b.split(" ")[0].strip(",.")
    verb = sum(1 for b in bullets if first(b) in VERBS) / n
    quant = sum(1 for b in bullets if re.search(r"\d", b)) / n
    weak = [w for w in WEAK if w in t]
    pron = len(PRONOUNS.findall(" ".join(bullets)))
    long_b = [b[:60] for b in bullets if len(b.split()) > 35]
    c = 8 * verb + 8 * min(quant / 0.4, 1) + (2 if not weak else 0) + (2 if pron == 0 else 0) - min(len(long_b), 2)
    out["content"] = round(max(c, 0), 1)
    out["bullets"] = n; out["action_verb_ratio"] = round(verb, 2); out["quantified_ratio"] = round(quant, 2)
    out["non_verb_starts"] = sorted({first(b) for b in bullets if first(b) not in VERBS})
    if weak: out["issues"].append(f"Weak phrases: {weak}")
    if pron: out["issues"].append(f"{pron} first-person pronouns in bullets")
    if quant < 0.4: out["issues"].append(f"Only {quant:.0%} of bullets have numbers (target 40%+)")
    if long_b: out["issues"].append(f"{len(long_b)} bullets over 35 words: {long_b}")

    # --- Format (15)
    words = len(t.split()); f = 0
    if pages is None:
        f = 15; out["issues"].append("Text input: format/page checks skipped (scored as full)")
    else:
        f += 5 if pages <= 2 else 0
        f += 5 if 450 <= words <= 1000 else 2
        f += 5 if len(t) > 800 else 0
    out["format"] = f; out["pages"] = pages; out["words"] = words
    out["total"] = round(out["parseability"] + out["keywords"] + out["content"] + out["format"], 1)
    return out


def report(o):
    L = [f"ATS score: {o['total']}/100  ({o['keyword_mode']})",
         f"  Parseability {o['parseability']}/20 | Keywords {o['keywords']}/45 | Content {o['content']}/20 | Format {o['format']}/15",
         f"  {o['pages']} pages, {o['words']} words, {o['bullets']} bullets, "
         f"{o['quantified_ratio']:.0%} quantified, {o['action_verb_ratio']:.0%} start with action verb"]
    for key, label in [("required_missing", "Missing required"), ("preferred_missing", "Missing preferred"),
                       ("variant_only", "Only a variant found (add exact term)"), ("only_in_skills", "Only in Skills"),
                       ("required_once", "Required term appears once"), ("stuffed", "Possibly stuffed (>6x)"),
                       ("non_verb_starts", "Bullet openers not in verb list"), ("issues", "Issues")]:
        if o[key]: L.append(f"  {label}: {o[key]}")
    return "\n".join(L)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    role = next((a.split("=")[1] for a in sys.argv if a.startswith("--role=")), "android")
    jd = json.load(open(args[1], encoding="utf-8")) if len(args) > 1 else None
    res = score(args[0], jd, role)
    print(json.dumps(res, indent=2) if "--json" in sys.argv else report(res))
