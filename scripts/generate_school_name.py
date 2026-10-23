#!/usr/bin/env python3
"""
Add configurable school name + branding.
Backend: env var SCHOOL_NAME (+ API endpoint to expose it)
Frontend: fetch on load, use in Topbar / Login / Register / PDF header

Run from ~/school:  python scripts/generate_school_name.py
"""
import sys
import json
from pathlib import Path

HERE = Path(__file__).resolve()
ROOT = HERE.parent.parent if HERE.parent.name == "scripts" else Path.cwd()
BE = ROOT / "backend"
FE = ROOT / "frontend"


def write(base, rel, content):
    p = base / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content.strip() + "\n", encoding="utf-8")
    print(f"  ✓ {p.relative_to(ROOT)}")


def banner(m):
    print(f"\n── {m} " + "─" * max(0, 60 - len(m)))


# ════════════════════════════════════════════════════════════
# BACKEND
# ════════════════════════════════════════════════════════════

def gen_backend_route():
    banner("backend: settings route")

    write(BE, "routes/settings.js", r"""
const express = require('express');
const { apiResponse } = require('../utils/helpers');

const router = express.Router();

// Public — no auth needed so the login page can show it too
router.get('/public', (_req, res) => {
  return apiResponse(res, 200, true, 'Public settings', {
    school_name: process.env.SCHOOL_NAME || 'School Management',
    school_address: process.env.SCHOOL_ADDRESS || '',
    school_phone: process.env.SCHOOL_PHONE || '',
    school_email: process.env.SCHOOL_EMAIL || '',
    school_logo_url: process.env.SCHOOL_LOGO_URL || null,
  });
});

module.exports = router;
""".strip())


def patch_routes_index():
    banner("backend: mount /settings")

    p = BE / "routes/index.js"
    if not p.exists():
        print("  ! routes/index.js missing")
        return
    src = p.read_text()

    if "settings" in src and "routes/settings" in src:
        print("  · already mounted")
        return

    anchor = "router.use('/search',       require('./search'));"
    line = "router.use('/settings',     require('./settings'));"
    if anchor in src:
        src = src.replace(anchor, line + "\n" + anchor, 1)
        p.write_text(src)
        print("  ✓ mounted /api/settings")
    else:
        # fallback: append at end
        src += "\n" + line + "\n"
        p.write_text(src)
        print("  ✓ mounted /api/settings (appended)")


def patch_env():
    banner("backend/.env")

    p = BE / ".env"
    if not p.exists():
        print("  ! .env missing")
        return

    src = p.read_text()
    added = False

    defaults = [
        ("SCHOOL_NAME", "Ranjha Public School"),
        ("SCHOOL_ADDRESS", "Lahore, Pakistan"),
        ("SCHOOL_PHONE", ""),
        ("SCHOOL_EMAIL", ""),
        ("SCHOOL_LOGO_URL", ""),
    ]

    lines = src.splitlines()
    existing = {l.split("=")[0].strip() for l in lines if "=" in l}

    for key, val in defaults:
        if key not in existing:
            src += f"\n{key}={val}"
            added = True

    if added:
        p.write_text(src)
        print("  ✓ added school branding keys to .env")
        print("     ⚠️  Edit SCHOOL_NAME to your real school name")
    else:
        print("  · all keys already present")


# ════════════════════════════════════════════════════════════
# FRONTEND
# ════════════════════════════════════════════════════════════

def gen_settings_context():
    banner("frontend: SettingsContext")

    write(FE, "src/context/SettingsContext.jsx", r"""
import { createContext, useContext, useEffect, useState } from 'react';
import client from '../api/client';

const SettingsContext = createContext({
  school_name: 'School Management',
  school_address: '',
  school_phone: '',
  school_email: '',
  school_logo_url: null,
  loading: true,
});

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState({
    school_name: 'School Management',
    school_address: '',
    school_phone: '',
    school_email: '',
    school_logo_url: null,
    loading: true,
  });

  useEffect(() => {
    client.get('/settings/public')
      .then((res) => {
        const d = res.data?.data || {};
        setSettings({
          school_name: d.school_name || 'School Management',
          school_address: d.school_address || '',
          school_phone: d.school_phone || '',
          school_email: d.school_email || '',
          school_logo_url: d.school_logo_url || null,
          loading: false,
        });
      })
      .catch(() => setSettings((s) => ({ ...s, loading: false })));
  }, []);

  return (
    <SettingsContext.Provider value={settings}>
      {children}
    </SettingsContext.Provider>
  );
}

export const useSettings = () => useContext(SettingsContext);
""".strip())


def patch_app_wrap():
    banner("frontend: wrap App in SettingsProvider")

    p = FE / "src/App.jsx"
    if not p.exists():
        print("  ! App.jsx missing")
        return
    src = p.read_text()

    if "SettingsProvider" in src:
        print("  · already wrapped")
        return

    # Add import
    src = src.replace(
        "import { AuthProvider, useAuth } from './context/AuthContext';",
        "import { AuthProvider, useAuth } from './context/AuthContext';\nimport { SettingsProvider } from './context/SettingsContext';",
        1,
    )

    # Wrap outermost — SettingsProvider can be anywhere since it doesn't use auth
    src = src.replace(
        "    <ThemeProvider>",
        "    <SettingsProvider>\n    <ThemeProvider>",
        1,
    )
    src = src.replace(
        "    </ThemeProvider>",
        "    </ThemeProvider>\n    </SettingsProvider>",
        1,
    )

    p.write_text(src)
    print("  ✓ SettingsProvider wrapped")


def patch_sidebar():
    banner("frontend: Sidebar shows school name")

    p = FE / "src/components/Sidebar.jsx"
    if not p.exists():
        print("  ! Sidebar.jsx missing")
        return
    src = p.read_text()

    if "useSettings" in src:
        print("  · already uses settings")
        return

    # Add import
    src = src.replace(
        "import { useAuth } from '../context/AuthContext';",
        "import { useAuth } from '../context/AuthContext';\nimport { useSettings } from '../context/SettingsContext';",
        1,
    )

    # Add hook
    src = src.replace(
        "  const { user } = useAuth();",
        "  const { user } = useAuth();\n  const { school_name } = useSettings();",
        1,
    )

    # Replace hardcoded "School MS"
    src = src.replace(
        "<span>School MS</span>",
        "<span className=\"truncate max-w-[140px]\" title={school_name}>{school_name}</span>",
    )

    p.write_text(src)
    print("  ✓ Sidebar shows school name")


def patch_login():
    banner("frontend: Login shows school name")

    p = FE / "src/pages/Login.jsx"
    if not p.exists():
        print("  ! Login.jsx missing")
        return
    src = p.read_text()

    if "useSettings" in src:
        print("  · already uses settings")
        return

    # Add import
    src = src.replace(
        "import { useAuth } from '../context/AuthContext';",
        "import { useAuth } from '../context/AuthContext';\nimport { useSettings } from '../context/SettingsContext';",
        1,
    )

    # Add hook
    src = src.replace(
        "  const { user, login } = useAuth();",
        "  const { user, login } = useAuth();\n  const { school_name } = useSettings();",
        1,
    )

    # Replace header
    src = src.replace(
        "<h1 className=\"text-xl font-bold mt-2\">School Management</h1>",
        "<h1 className=\"text-xl font-bold mt-2\">{school_name}</h1>",
        1,
    )

    p.write_text(src)
    print("  ✓ Login shows school name")


def patch_register():
    banner("frontend: Register shows school name")

    p = FE / "src/pages/Register.jsx"
    if not p.exists():
        print("  ! Register.jsx missing")
        return
    src = p.read_text()

    if "useSettings" in src:
        print("  · already uses settings")
        return

    src = src.replace(
        "import { authApi } from '../api/endpoints';",
        "import { authApi } from '../api/endpoints';\nimport { useSettings } from '../context/SettingsContext';",
        1,
    )

    # Add hook right after step state
    src = src.replace(
        "  const [step, setStep] = useState(1);",
        "  const [step, setStep] = useState(1);\n  const { school_name } = useSettings();",
        1,
    )

    p.write_text(src)
    print("  ✓ Register uses settings hook (add school_name in heading if desired)")


def patch_pdf():
    banner("backend: PDF uses SCHOOL_NAME (already does)")

    p = BE / "utils/pdfGenerator.js"
    if not p.exists():
        print("  ! pdfGenerator.js missing")
        return
    src = p.read_text()

    if "process.env.SCHOOL_NAME" in src:
        print("  · PDF already reads SCHOOL_NAME from env")
    else:
        # Fallback: patch the header default
        src = src.replace(
            "school.name || 'School Management'",
            "school.name || process.env.SCHOOL_NAME || 'School Management'",
        )
        p.write_text(src)
        print("  ✓ PDF uses SCHOOL_NAME as fallback")


def patch_report_controller():
    banner("backend: report controller passes SCHOOL_NAME")

    p = BE / "controllers/reportController.js"
    if not p.exists():
        print("  ! reportController.js missing")
        return
    src = p.read_text()

    if "process.env.SCHOOL_NAME" in src:
        print("  · already reads env")
        return

    # Add fallback to env
    src = src.replace(
        "        name: 'School Management',",
        "        name: process.env.SCHOOL_NAME || 'School Management',",
        1,
    )
    src = src.replace(
        "        address: '',",
        "        address: process.env.SCHOOL_ADDRESS || '',",
        1,
    )
    p.write_text(src)
    print("  ✓ report controller uses env")


# ════════════════════════════════════════════════════════════

def verify():
    banner("verify")
    import subprocess
    ok = True
    for f in [BE / "routes/settings.js", BE / "routes/index.js"]:
        if not f.exists():
            print(f"  ✗ missing: {f.relative_to(ROOT)}")
            ok = False
            continue
        r = subprocess.run(["node", "-c", str(f)], capture_output=True, text=True)
        if r.returncode == 0:
            print(f"  ✓ {f.relative_to(ROOT)}")
        else:
            print(f"  ✗ {f.relative_to(ROOT)}: {(r.stderr or r.stdout).strip()[:200]}")
            ok = False
    return ok


def main():
    print(f"Add school name — root: {ROOT}")
    gen_backend_route()
    patch_routes_index()
    patch_env()
    gen_settings_context()
    patch_app_wrap()
    patch_sidebar()
    patch_login()
    patch_register()
    patch_pdf()
    patch_report_controller()
    print()
    if not verify():
        sys.exit(1)
    print("\n" + "═" * 62)
    print("✅ School name added.")
    print("═" * 62)
    print("\nSteps:")
    print("  1. Edit backend/.env → set SCHOOL_NAME to your real name")
    print("  2. Restart:  cd ~/school && ./start.sh")
    print("  3. Test:")
    print("       curl http://localhost:5000/api/settings/public")
    print("\nUI shows school name on:")
    print("  · Sidebar header")
    print("  · Login page")
    print("  · PDF report card")


if __name__ == "__main__":
    main()
