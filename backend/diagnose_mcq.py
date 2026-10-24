#!/usr/bin/env python3
"""
diagnose_mcq.py v2 — Termux-friendly. Understands `unwrap()` helpers,
multiline interceptors, prints the exact `path=` line, and probes
the real backend route names used in endpoints.js.

    python3 diagnose_mcq.py                  # auto, picks first OPEN exam
    EXAM_ID=1 python3 diagnose_mcq.py        # target exam 1
    BACKEND=http://127.0.0.1:5000 python3 diagnose_mcq.py
"""
from __future__ import annotations
import json, os, re, socket, sqlite3, sys, urllib.request, urllib.error, http.cookiejar
from pathlib import Path

BACKEND = os.environ.get("BACKEND", "http://127.0.0.1:5000")
EMAIL   = os.environ.get("EMAIL",   "student@example.com")
PASSWD  = os.environ.get("PASSWORD","password")
EXAM_ID = os.environ.get("EXAM_ID")
API     = f"{BACKEND}/api"

HERE  = Path(__file__).resolve().parent
ROOT  = HERE.parent
FRONT = Path(os.environ.get("FRONT", ROOT / "frontend" / "src"))

G,Y,R,B,D,X = "\033[32m","\033[33m","\033[31m","\033[34m","\033[2m","\033[0m"
def ok(m):   print(f"{G}✔ {m}{X}")
def warn(m): print(f"{Y}⚠ {m}{X}")
def bad(m):  print(f"{R}✘ {m}{X}")
def info(m): print(f"{B}ℹ {m}{X}")
def dim(m):  print(f"{D}  {m}{X}")
def head(t): print(f"\n{B}━━━ {t} ━━━{X}")

# ── HTTP ───────────────────────────────────────────────────
_cj = http.cookiejar.CookieJar()
_opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(_cj))
def http(method, path, body=None):
    url = f"{API}{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method,
        headers={"Content-Type":"application/json","Accept":"application/json"})
    try:
        with _opener.open(req, timeout=8) as r:
            return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        try:   return e.code, json.loads(e.read().decode() or "{}")
        except Exception: return e.code, {}
    except Exception as e:
        return 0, {"_error": str(e)}

def port_open(host_port: str) -> bool:
    host, _, port = host_port.replace("http://","").partition(":")
    try:
        s = socket.create_connection((host or "127.0.0.1", int(port or 5000)), timeout=2)
        s.close(); return True
    except Exception:
        return False

# ── SQLite ─────────────────────────────────────────────────
def find_db():
    for p in [HERE/"data", HERE, ROOT]:
        if p.exists():
            for f in p.glob("*.db"): return f
def q(db, sql, args=()):
    with sqlite3.connect(str(db)) as con: return con.execute(sql, args).fetchall()

# ── 1. endpoints.js ────────────────────────────────────────
def check_endpoints():
    head("1. Frontend API layer — endpoints.js")
    f = FRONT/"api"/"endpoints.js"
    if not f.exists():
        bad(f"not found: {f}"); return {}
    src = f.read_text(encoding="utf-8", errors="replace")
    info(f"reading {f}")

    # extract unwrap definition
    m = re.search(r"(?:const|function)\s+unwrap\s*=?\s*(?:\([^)]*\)\s*=>|\([^)]*\)\s*\{|function)", src)
    if m:
        line_end = src.find("\n", src.find("{", m.start()) if "{" in src[m.start():m.start()+60] else m.start()+40)
        dim(f"unwrap def: {src[m.start():line_end].strip()}")
        body = src[m.start(): m.start()+400]
        # decide what unwrap strips
        if re.search(r"\.data\.data", body):
            strips = "data.data"
        elif re.search(r"\.data\b", body):
            strips = "data"
        else:
            strips = "nothing"
        info(f"unwrap strips: {strips}")
    else:
        strips = "unknown"
        warn("no unwrap() helper found")

    # find each mcq method and its URL
    urls = {}
    for name in ("startAttempt","submitAttempt","getMyAttempt","logProctorEvent",
                 "uploadSnapshot","uploadRecordingChunk","listRecordings"):
        for mm in re.finditer(rf"{name}\s*:\s*\([^)]*\)\s*=>\s*unwrap\(client\.(\w+)\(([^`]+)`", src):
            verb, url = mm.group(1).lower(), mm.group(2)
            urls[name] = (verb, url.strip())
            dim(f"{name}: {verb.upper()} {url.strip()}")

    return {"file": str(f), "strips": strips, "urls": urls,
            "has_unwrap": strips != "unknown"}

# ── 2. client.js interceptor ───────────────────────────────
def check_interceptor():
    head("2. Axios interceptor — client.js")
    f = FRONT/"api"/"client.js"
    if not f.exists(): bad(f"not found: {f}"); return {}
    src = f.read_text(encoding="utf-8", errors="replace")
    info(f"reading {f}")

    # grab a 400-char window starting at interceptors.response.use
    m = re.search(r"interceptors\.response\.use\s*\(", src)
    if not m:
        warn("no response interceptor"); return {"returns": "none"}
    block = src[m.start(): m.start()+400].splitlines()[:8]
    for ln in block: dim(ln)

    # heuristic
    if re.search(r"data\.data", src[m.start(): m.start()+300]):
        r = "data.data"
    elif re.search(r"(?:r|res|response)\s*=>\s*(?:r|res|response)\.data\b", src[m.start(): m.start()+300]):
        r = "data"
    elif re.search(r"(?:r|res|response)\s*=>\s*(?:r|res|response)\b", src[m.start(): m.start()+300]):
        r = "raw"
    else:
        r = "unknown"
    info(f"interceptor returns: {r}")
    return {"file": str(f), "returns": r}

def resolve_shape(ep, it):
    """Does endpoints.unwrap strip the exact layer the interceptor leaves?"""
    head("2b. Do the two layers agree?")
    inter = it.get("returns"); strip = ep.get("strips")
    info(f"interceptor returns → {inter}   |   unwrap strips → {strip}")
    # after interceptor you have `inter`; after unwrap you must end at the payload
    payload = {"raw": "data.data", "data": "data", "data.data": "identity"}.get(inter)
    rule = {"raw":"data.data", "data":"data", "data.data":"nothing"}.get(inter)
    if payload is None: warn("cannot decide — inspect manually"); return False
    if strip == rule:
        ok(f"agreement: after unwrap you have the payload (`.data` contents)")
        return True
    bad(f"MISMATCH: interceptor leaves `{inter}`, unwrap strips `{strip}`, "
        f"but should strip `{rule}` → component gets wrong object")
    return False

# ── 3. route param ─────────────────────────────────────────
def check_route():
    head("3. React route — param must be :examId")
    app = FRONT/"App.jsx"
    if not app.exists(): warn(f"no {app}"); return {}
    lines = app.read_text(encoding="utf-8", errors="replace").splitlines()
    for i, ln in enumerate(lines):
        if "TakeMcq" in ln:
            ctx = lines[max(0,i-2):i+1]
            for c in ctx: dim(c.strip())
            blob = " ".join(ctx)
            if re.search(r'path="[^"]*:examId[^"]*"', blob):
                ok("uses :examId"); return {"ok": True}
            if re.search(r':\w+', blob):
                bad("uses a different param name — useParams().examId will be undefined")
                return {"ok": False}
            warn("no `path=` found near TakeMcq — check the route definition")
    return {}

# ── 4. DB ──────────────────────────────────────────────────
def check_db(force_id):
    head("4. Database")
    db = find_db()
    if not db: bad("no *.db"); return {}
    info(f"db = {db}")
    rows = q(db, "SELECT id,title,time_limit_minutes,schedule_state FROM mcq_exams ORDER BY id")
    print(f"\n{D}  {'id':>4}  {'tl_min':>7}  {'state':<10} {'q_count':>7}  title{X}")
    for id_, title, tl, state in rows:
        n = q(db, "SELECT COUNT(*) FROM mcq_questions WHERE mcq_exam_id=?", (id_,))[0][0]
        mark = " ←" if force_id and id_ == force_id else ""
        print(f"  {id_:>4}  {str(tl):>7}  {state:<10} {n:>7}  {title}{mark}")

    if force_id:
        exam_id = force_id
    else:
        # pick the first OPEN exam with questions and a time limit
        pick = None
        for id_, title, tl, state in rows:
            n = q(db, "SELECT COUNT(*) FROM mcq_questions WHERE mcq_exam_id=?", (id_,))[0][0]
            if state == "open" and n > 0 and tl:
                pick = id_; break
        exam_id = pick or (rows[-1][0] if rows else None)
        info(f"auto-picked exam id = {exam_id}")

    if not exam_id: return {}

    tl, state = q(db, "SELECT time_limit_minutes,schedule_state FROM mcq_exams WHERE id=?",
                  (exam_id,))[0]
    n = q(db, "SELECT COUNT(*) FROM mcq_questions WHERE mcq_exam_id=?", (exam_id,))[0][0]

    (ok if (tl and int(tl)>0) else bad)(f"time_limit_minutes = {tl}")
    (ok if state == "open"  else bad)(f"schedule_state = {state!r}")
    (ok if n > 0            else bad)(f"questions = {n}")
    return {"db": str(db), "exam_id": exam_id, "tl": tl, "state": state, "n": n}

# ── 5. live API (only if server is up) ─────────────────────
def check_api(exam_id):
    head("5. Live API")
    host = BACKEND.replace("http://","").replace("https://","")
    if not port_open(host):
        bad(f"nothing listening on {host} — start the backend first")
        info("hint: `cd ~/school/backend && npm start` in another Termux tab")
        return {"up": False}

    c, b = http("POST", "/auth/login", {"email": EMAIL, "password": PASSWD})
    if c != 200:
        bad(f"login failed: {c} {b.get('message') or b}")
        return {"up": True, "login": False}
    ok("logged in")

    # Try both the frontend-declared path and the controller-documented path
    paths = [f"/mcq/{exam_id}/attempt/start", f"/mcq-exams/{exam_id}/start"]
    chosen, body = None, None
    for p in paths:
        c, b = http("POST", p, {})
        print(f"  POST {p} → {c}  {b.get('message','')}")
        if c in (200,201): chosen, body = p, b; break
    if not chosen:
        bad("both start paths failed — see backend routes")
        return {"up": True, "login": True, "started": False}

    d = body.get("data", {})
    att = d.get("attempt") or {}
    qs  = d.get("questions") or []
    ok(f"started via {chosen}  attempt.id={att.get('id')}  "
       f"tl={att.get('time_limit_seconds')}  questions={len(qs)}")
    for qq in qs[:2]:
        dim(f"q{qq.get('q_number')}: {str(qq.get('question_text'))[:60]}")

    # GET attempt + dry submit
    if att.get("id"):
        c, b = http("GET", f"/mcq/attempts/{att['id']}")
        if c == 404:
            c, b = http("GET", f"/mcq-attempts/{att['id']}")
        print(f"  GET attempt → {c}  data keys={list(b.get('data',{}).keys())}")

        sample = {str(qq["q_number"]):"A" for qq in qs[:1] if "q_number" in qq}
        c, b = http("POST", f"/mcq/attempts/{att['id']}/submit", {"answers": sample})
        if c == 404:
            c, b = http("POST", f"/mcq-attempts/{att['id']}/submit", {"answers": sample})
        print(f"  POST submit → {c}  data keys={list(b.get('data',{}).keys())}")
        if "score" in (b.get("data") or {}):
            ok(f"submit returns data.score = {b['data']['score']}")
    return {"up": True, "login": True, "started": True,
            "questions": len(qs), "tl": att.get("time_limit_seconds"),
            "attempt_id": att.get("id")}

# ── verdict ────────────────────────────────────────────────
def verdict(ep, it, shape_ok, rt, db, api):
    head("VERDICT")
    fixes = []
    if db.get("state") and db["state"] != "open":
        fixes.append(f"Exam {db['exam_id']} schedule_state='{db['state']}' — set to 'open' "
                     f"(`sqlite3 {db['db']} \"UPDATE mcq_exams SET schedule_state='open' WHERE id={db['exam_id']}\";`) "
                     f"or test a different exam id.")
    if db and db.get("n", 1) == 0:
        fixes.append("0 questions for this exam — seed mcq_questions.")
    if db and (db.get("tl") in (None, 0)):
        fixes.append("time_limit_minutes is NULL — timer will be hidden by design.")
    if ep and it and not shape_ok:
        fixes.append(f"Fix unwrap/interceptor mismatch: interceptor returns "
                     f"'{it.get('returns')}', unwrap strips '{ep.get('strips')}'.")
    if rt and rt.get("ok") is False:
        fixes.append("Route path must use `:examId` (App.jsx).")
    if api and api.get("up") is False:
        fixes.append("Backend not listening on " + BACKEND + " — start it.")
    if api and api.get("started") is True and api.get("questions",0) == 0:
        fixes.append("start returns 0 questions — check mcqModel.questionsWithoutAnswers.")
    if not fixes:
        print(f"{G}All checks passed — open DevTools → Network on the TakeMcq page "
              f"and paste the /start request body.{X}")
    else:
        print(f"{Y}Fix these, in order:{X}\n")
        for i,m in enumerate(fixes,1): print(f"  {i}. {m}")

def main():
    print(f"{B}MCQ diagnostic v2 — {BACKEND}{X}")
    print(f"  FRONT = {FRONT}")
    ep  = check_endpoints()
    it  = check_interceptor()
    shape_ok = resolve_shape(ep, it) if (ep and it) else False
    rt  = check_route()
    db  = check_db(int(EXAM_ID) if EXAM_ID else None)
    api = check_api(db["exam_id"]) if db.get("exam_id") else {"up": False}
    verdict(ep, it, shape_ok, rt, db, api)

if __name__ == "__main__":
    main()
