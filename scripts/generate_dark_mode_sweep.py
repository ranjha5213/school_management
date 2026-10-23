#!/usr/bin/env python3
"""
Dark-mode polish sweep.
- Global CSS improvements (index.css)
- Per-component fixes where Tailwind classes are missing dark variants
- Print override (always light)

Run from ~/school:  python scripts/generate_dark_mode_sweep.py
"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve()
ROOT = HERE.parent.parent if HERE.parent.name == "scripts" else Path.cwd()
FE = ROOT / "frontend"


def write(base, rel, content):
    p = base / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content.strip() + "\n", encoding="utf-8")
    print(f"  ✓ {p.relative_to(ROOT)}")


def banner(m):
    print(f"\n── {m} " + "─" * max(0, 60 - len(m)))


# ════════════════════════════════════════════════════════════
# 1. Global CSS — the single most impactful change
# ════════════════════════════════════════════════════════════

def gen_index_css():
    banner("index.css")

    write(FE, "src/index.css", r"""
@tailwind base;
@tailwind components;
@tailwind utilities;

/* ═══════════════════════════════════════════════════════════
   Base
   ═══════════════════════════════════════════════════════════ */
@layer base {
  html { -webkit-tap-highlight-color: transparent; }
  html.dark { color-scheme: dark; }
  html:not(.dark) { color-scheme: light; }

  body {
    @apply bg-slate-50 text-slate-800 dark:bg-slate-950 dark:text-slate-100;
    -webkit-font-smoothing: antialiased;
  }

  /* Native form controls in dark mode */
  html.dark input,
  html.dark select,
  html.dark textarea {
    color-scheme: dark;
  }
  html.dark input[type="date"]::-webkit-calendar-picker-indicator,
  html.dark input[type="time"]::-webkit-calendar-picker-indicator,
  html.dark input[type="datetime-local"]::-webkit-calendar-picker-indicator {
    filter: invert(0.85);
  }

  /* Selects don't inherit bg-color on some Android browsers */
  html.dark select option {
    background-color: #0f172a;   /* slate-900 */
    color: #f1f5f9;               /* slate-100 */
  }

  /* Scrollbars (WebKit) */
  html.dark ::-webkit-scrollbar { width: 10px; height: 10px; }
  html.dark ::-webkit-scrollbar-track { background: #0f172a; }
  html.dark ::-webkit-scrollbar-thumb { background: #334155; border-radius: 6px; }
  html.dark ::-webkit-scrollbar-thumb:hover { background: #475569; }

  ::-webkit-scrollbar { width: 10px; height: 10px; }
  ::-webkit-scrollbar-track { background: #f1f5f9; }
  ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 6px; }
  ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
}

/* ═══════════════════════════════════════════════════════════
   Component utilities
   ═══════════════════════════════════════════════════════════ */
@layer components {
  .input {
    @apply w-full px-3 py-2 rounded-lg text-sm
           border border-slate-200 dark:border-slate-700
           bg-white dark:bg-slate-900
           text-slate-800 dark:text-slate-100
           placeholder:text-slate-400 dark:placeholder:text-slate-500
           focus:outline-none focus:ring-2 focus:ring-brand-500
           disabled:opacity-60 disabled:cursor-not-allowed
           transition-colors;
  }
  .input:hover:not(:disabled) {
    @apply border-slate-300 dark:border-slate-600;
  }

  .label {
    @apply block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1;
  }

  .badge {
    @apply inline-flex items-center px-2 py-0.5 rounded text-xs font-medium;
  }
  .badge-blue   { @apply bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300; }
  .badge-purple { @apply bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300; }
  .badge-gray   { @apply bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300; }

  /* Table defaults */
  .tbl         { @apply w-full text-sm; }
  .tbl thead   { @apply bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300; }
  .tbl th      { @apply text-left p-3 font-medium; }
  .tbl tbody tr { @apply border-t border-slate-100 dark:border-slate-700 transition-colors; }
  .tbl tbody tr:hover { @apply bg-slate-50/70 dark:bg-slate-800/40; }
}

/* ═══════════════════════════════════════════════════════════
   Animations
   ═══════════════════════════════════════════════════════════ */
@keyframes fade-in {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: none; }
}
.animate-fade-in { animation: fade-in .2s ease-out; }

@keyframes modal-in {
  from { opacity: 0; transform: scale(.98); }
  to   { opacity: 1; transform: scale(1); }
}
.animate-modal-in { animation: modal-in .15s ease-out; }

/* ═══════════════════════════════════════════════════════════
   Print — force light theme regardless of current mode
   ═══════════════════════════════════════════════════════════ */
@media print {
  html, html.dark {
    color-scheme: light !important;
  }
  html.dark body {
    background: #ffffff !important;
    color: #000000 !important;
  }
  .print\:hidden { display: none !important; }
  .print\:shadow-none { box-shadow: none !important; }
  .print\:border-0 { border: 0 !important; }
  * {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
}
""".strip())


# ════════════════════════════════════════════════════════════
# 2. Modal dark-mode polish
# ════════════════════════════════════════════════════════════

def gen_modal():
    banner("Modal.jsx")

    write(FE, "src/components/Modal.jsx", r"""
import { X } from 'lucide-react';
import { useEffect } from 'react';

export default function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  useEffect(() => {
    const onEsc = (e) => e.key === 'Escape' && onClose?.();
    if (open) {
      document.addEventListener('keydown', onEsc);
      // prevent background scroll
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.removeEventListener('keydown', onEsc);
        document.body.style.overflow = prev;
      };
    }
  }, [open, onClose]);

  if (!open) return null;
  const sizes = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={`relative w-full ${sizes[size]} rounded-t-2xl sm:rounded-2xl shadow-2xl
                    bg-white dark:bg-slate-900
                    border border-slate-200 dark:border-slate-800
                    animate-modal-in max-h-[92vh] flex flex-col`}
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
          <h3 className="font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800
                       dark:text-slate-400 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 overflow-y-auto flex-1 text-slate-700 dark:text-slate-200">
          {children}
        </div>
        {footer && (
          <div className="flex justify-end gap-2 p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
""".strip())


# ════════════════════════════════════════════════════════════
# 3. Card polish — softer borders in dark
# ════════════════════════════════════════════════════════════

def gen_card():
    banner("Card.jsx")

    write(FE, "src/components/Card.jsx", r"""
export default function Card({ children, className = '' }) {
  return (
    <div
      className={`bg-white dark:bg-slate-900
                  rounded-2xl border border-slate-200 dark:border-slate-800
                  shadow-sm dark:shadow-none
                  ${className}`}
    >
      {children}
    </div>
  );
}
""".strip())


# ════════════════════════════════════════════════════════════
# 4. Toast options — better dark
# ════════════════════════════════════════════════════════════

def patch_toaster():
    banner("App.jsx — Toaster dark options")

    p = FE / "src/App.jsx"
    if not p.exists():
        print("  ! App.jsx missing")
        return
    src = p.read_text()

    if "toastOptions" in src:
        print("  · already has toastOptions")
        return

    old = "<Toaster position=\"top-right\" />"
    new = """<Toaster
            position="top-right"
            toastOptions={{
              duration: 3500,
              className: 'text-sm',
              style: {
                background: 'var(--toast-bg, #fff)',
                color: 'var(--toast-fg, #0f172a)',
                border: '1px solid var(--toast-border, #e2e8f0)',
              },
              success: { duration: 3000, iconTheme: { primary: '#10b981', secondary: '#fff' } },
              error:   { duration: 5000, iconTheme: { primary: '#ef4444', secondary: '#fff' } },
            }}
          />"""
    if old in src:
        src = src.replace(old, new, 1)
        p.write_text(src)
        print("  ✓ patched Toaster")
    else:
        # try a looser match
        m = re.search(r"<Toaster[^/]*/>", src)
        if m:
            src = src[:m.start()] + new + src[m.end():]
            p.write_text(src)
            print("  ✓ patched Toaster (loose match)")
        else:
            print("  ! could not find Toaster — manual edit needed")


# ════════════════════════════════════════════════════════════
# 5. Sweep pages/components for common dark-mode gaps
# ════════════════════════════════════════════════════════════

# Patterns that frequently miss dark: variants
COMMON_FIXES = [
    # Any bg-white without dark: sibling → add dark:bg-slate-900
    (
        re.compile(r'(?<!dark:)bg-white(?![\w/-])'),
        'bg-white dark:bg-slate-900',
    ),
    # Any text-slate-800 without dark: sibling
    (
        re.compile(r'(?<!dark:)text-slate-800(?![\w/-])'),
        'text-slate-800 dark:text-slate-100',
    ),
    # Any text-slate-900 without dark: sibling
    (
        re.compile(r'(?<!dark:)text-slate-900(?![\w/-])'),
        'text-slate-900 dark:text-slate-100',
    ),
    # border-slate-200 without dark: sibling
    (
        re.compile(r'(?<!dark:)border-slate-200(?![\w/-])'),
        'border-slate-200 dark:border-slate-800',
    ),
    # divide-slate-100 without dark: sibling
    (
        re.compile(r'(?<!dark:)divide-slate-100(?![\w/-])'),
        'divide-slate-100 dark:divide-slate-700',
    ),
    # Hover states on rows
    (
        re.compile(r'hover:bg-slate-50(?![\w/-])'),
        'hover:bg-slate-50 dark:hover:bg-slate-800/50',
    ),
    (
        re.compile(r'hover:bg-slate-100(?![\w/-])'),
        'hover:bg-slate-100 dark:hover:bg-slate-800',
    ),
]


def sweep_file(path: Path):
    """Apply generic dark-mode fixes to a JSX file. Returns count of fixes."""
    if not path.exists() or path.suffix != ".jsx":
        return 0
    src = path.read_text()
    original = src
    fixes = 0

    for pattern, repl in COMMON_FIXES:
        def sub(m):
            nonlocal fixes
            # Skip if the match already has dark: on the same className string right after
            start = m.start()
            lookahead = original[start:start + 200]
            if 'dark:' in m.group(0):
                return m.group(0)
            fixes += 1
            return repl

        src = pattern.sub(sub, src)

    if src != original:
        path.write_text(src)
    return fixes


def sweep_all():
    banner("sweep pages + components")

    total = 0
    for d in ["src/pages", "src/components"]:
        folder = FE / d
        if not folder.exists():
            continue
        for f in sorted(folder.glob("*.jsx")):
            n = sweep_file(f)
            if n:
                print(f"  ✓ {f.relative_to(FE)}  ({n} fix{'es' if n != 1 else ''})")
                total += n

    print(f"\n  total fixes applied: {total}")


# ════════════════════════════════════════════════════════════
# 6. Toast CSS variables in dark
# ════════════════════════════════════════════════════════════

def patch_theme_context():
    banner("ThemeContext — toast vars")

    p = FE / "src/context/ThemeContext.jsx"
    if not p.exists():
        print("  ! ThemeContext.jsx missing")
        return
    src = p.read_text()

    if "toast-bg" in src:
        print("  · already patched")
        return

    old = """useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);"""

    new = """useEffect(() => {
    const root = document.documentElement;
    const isDark = theme === 'dark';
    root.classList.toggle('dark', isDark);
    root.style.setProperty('--toast-bg', isDark ? '#1e293b' : '#ffffff');
    root.style.setProperty('--toast-fg', isDark ? '#f1f5f9' : '#0f172a');
    root.style.setProperty('--toast-border', isDark ? '#334155' : '#e2e8f0');
    localStorage.setItem('theme', theme);
  }, [theme]);"""

    if old in src:
        src = src.replace(old, new, 1)
        p.write_text(src)
        print("  ✓ ThemeContext sets toast CSS vars")
    else:
        print("  ! could not find effect anchor — manual edit needed")


# ════════════════════════════════════════════════════════════
# MAIN
# ════════════════════════════════════════════════════════════

def main():
    print(f"Dark-mode sweep — root: {ROOT}")
    gen_index_css()
    gen_modal()
    gen_card()
    patch_toaster()
    patch_theme_context()
    sweep_all()

    print("\n" + "═" * 62)
    print("✅ Dark-mode sweep done.")
    print("═" * 62)
    print("\nRestart:")
    print("  cd ~/school && ./start.sh")
    print("\nThen walk through:")
    print("  /dashboard  /classes  /students  /teachers  /attendance")
    print("  /exams  /homework  /timetable  /fees  /library  /notices")
    print("  /profile  /students/4/report-card")
    print("\nToggle dark mode (moon icon in topbar) and look for:")
    print("  · white select/date inputs")
    print("  · unreadable text on light backgrounds")
    print("  · hard-to-see borders")
    print("  · washed-out badges")


if __name__ == "__main__":
    main()
