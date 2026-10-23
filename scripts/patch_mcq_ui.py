import shutil, sys, datetime
from pathlib import Path

ROOT = Path(".").resolve()
TARGET = ROOT / "frontend/src/pages/Mcq.jsx"
BAK = ROOT / (".patch_backup_mcqjsx_" + datetime.datetime.now().strftime("%Y%m%d_%H%M%S"))
BAK.mkdir(exist_ok=True)

if not TARGET.exists():
    print(f"[FAIL] {TARGET} not found"); sys.exit(1)

src = TARGET.read_text(encoding="utf-8")
shutil.copy2(TARGET, BAK / TARGET.name)
changes = 0

# ────────────────────────────────────────────────────────────
# 1. Import: add Globe to lucide list + import McqPublishModal
# ────────────────────────────────────────────────────────────
old_icons = "  FileText, Plus, Trash2, ChevronRight, ArrowLeft, Save,\n  Printer, Camera, CheckCircle2, XCircle, AlertCircle, Upload, Users, FileUp,\n"
new_icons = "  FileText, Plus, Trash2, ChevronRight, ArrowLeft, Save,\n  Printer, Camera, CheckCircle2, XCircle, AlertCircle, Upload, Users, FileUp,\n  Globe,\n"
if "Globe" not in src:
    assert old_icons in src, "icon list not matched"
    src = src.replace(old_icons, new_icons, 1)
    changes += 1

old_import = "import BulkImportModal from '../components/BulkImportModal';"
new_import = (
    "import BulkImportModal from '../components/BulkImportModal';\n"
    "import McqPublishModal from '../components/McqPublishModal';"
)
if "McqPublishModal" not in src:
    assert old_import in src, "import anchor not matched"
    src = src.replace(old_import, new_import, 1)
    changes += 1

# ────────────────────────────────────────────────────────────
# 2. State: add publishTarget inside McqList
#    We anchor on `const [confirm, setConfirm] = useState(null);`
#    which is unique to McqList.
# ────────────────────────────────────────────────────────────
old_state = "  const [confirm, setConfirm] = useState(null);"
new_state = (
    "  const [confirm, setConfirm] = useState(null);\n"
    "  const [publishTarget, setPublishTarget] = useState(null);"
)
if "publishTarget" not in src:
    assert old_state in src, "state anchor not matched"
    src = src.replace(old_state, new_state, 1)
    changes += 1

# ────────────────────────────────────────────────────────────
# 3. Row buttons: add a Globe icon button between title and ChevronRight
#    Row is a <button onClick={nav}> — so we need a span with stopPropagation.
#    Also add a delete (Trash2) button since it's missing entirely (ConfirmDelete
#    exists but isn't wired to this list — that's why delete is broken).
# ────────────────────────────────────────────────────────────
old_row = """                <div className="flex-1 min-w-0">
                  <div className="font-medium">{r.title}</div>
                  <div className="text-xs text-slate-500">
                    {r.class_name || '—'} {r.section_name ? `· ${r.section_name}` : ''}
                    {' · '}{r.question_count} questions
                    {' · '}{r.submission_count} scanned
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400" />"""

new_row = """                <div className="flex-1 min-w-0">
                  <div className="font-medium">{r.title}</div>
                  <div className="text-xs text-slate-500">
                    {r.class_name || '—'} {r.section_name ? `· ${r.section_name}` : ''}
                    {' · '}{r.question_count} questions
                    {' · '}{r.submission_count} scanned
                    {r.scheduled_start_at && (
                      <span className="ml-1 text-amber-600 font-medium">
                        · scheduled {new Date(r.scheduled_start_at).toLocaleString()}
                      </span>
                    )}
                    {!r.scheduled_start_at && r.is_published ? (
                      <span className="ml-1 text-emerald-600 font-medium">· live</span>
                    ) : null}
                  </div>
                </div>
                {canWrite && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); setPublishTarget(r); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); setPublishTarget(r); } }}
                    title="Publish & schedule"
                    className="p-1.5 rounded hover:bg-brand-50 dark:hover:bg-brand-500/10 text-brand-600 cursor-pointer"
                  >
                    <Globe className="w-4 h-4" />
                  </span>
                )}
                {canWrite && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); setConfirm(r); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); setConfirm(r); } }}
                    title="Delete"
                    className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-500/10 text-red-500 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </span>
                )}
                <ChevronRight className="w-4 h-4 text-slate-400" />"""

if old_row in src:
    src = src.replace(old_row, new_row, 1)
    changes += 1
else:
    print("[WARN] row markup not matched — inspect manually")

# ────────────────────────────────────────────────────────────
# 4. Render modal at bottom of McqList, right before </div>
#    Anchor on the ConfirmDelete block which is unique to McqList.
# ────────────────────────────────────────────────────────────
old_confirm = """      <ConfirmDelete open={!!confirm} title="Delete MCQ test?"
        message={`"${confirm?.title || ''}" and all its data will be removed.`}
        onClose={() => setConfirm(null)} onConfirm={handleDelete} />
    </div>
  );
}"""

new_confirm = """      <ConfirmDelete open={!!confirm} title="Delete MCQ test?"
        message={`"${confirm?.title || ''}" and all its data will be removed.`}
        onClose={() => setConfirm(null)} onConfirm={handleDelete} />

      {publishTarget && (
        <McqPublishModal
          exam={publishTarget}
          onClose={() => setPublishTarget(null)}
          onSaved={() => { setPublishTarget(null); load(); }}
        />
      )}
    </div>
  );
}"""

if old_confirm in src:
    src = src.replace(old_confirm, new_confirm, 1)
    changes += 1
else:
    print("[WARN] ConfirmDelete anchor not matched — inspect manually")

# ────────────────────────────────────────────────────────────
# Write
# ────────────────────────────────────────────────────────────
TARGET.write_text(src, encoding="utf-8")
print(f"\n[OK] {changes} change(s) applied to {TARGET.relative_to(ROOT)}")
print(f"[OK] backup: {BAK}")

# ────────────────────────────────────────────────────────────
# Verify
# ────────────────────────────────────────────────────────────
print("\n" + "=" * 60)
print("VERIFY")
print("=" * 60)
s = TARGET.read_text(encoding="utf-8")

checks = [
    ("imports Globe",                  "Globe," in s),
    ("imports McqPublishModal",        "McqPublishModal" in s),
    ("state publishTarget",            "publishTarget" in s),
    ("row Globe button",               'setPublishTarget(r)' in s),
    ("row Trash2 button",              'setConfirm(r)' in s),
    ("renders modal",                  "<McqPublishModal" in s),
    ("modal onSaved calls load()",     'onSaved={() => { setPublishTarget(null); load(); }}' in s),
    ("schedule badge in row",          "scheduled_start_at" in s),
]
all_ok = True
for label, ok in checks:
    print(("[OK ]  " if ok else "[BAD]  ") + label)
    if not ok: all_ok = False

print()
print("=" * 60)
print("RESULT: " + ("ALL PASSED" if all_ok else "SOME CHECKS FAILED — inspect"))
print("=" * 60)
sys.exit(0 if all_ok else 1)
