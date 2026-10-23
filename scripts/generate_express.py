#!/usr/bin/env python3
"""
School Management System — Directory Structure Generator
Usage:  python setup_school_structure.py [root_dir]
Creates the complete folder tree + placeholder files.
"""
import os
import sys
from pathlib import Path

# ────────────────────────────────────────────────────────────
# CONFIG
# ────────────────────────────────────────────────────────────
ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else "school_management").resolve()

# ────────────────────────────────────────────────────────────
# DIRECTORIES
# ────────────────────────────────────────────────────────────
DIRECTORIES = [
    # ─── root level ───
    "",

    # ─── Backend (Node/Express) ───
    "backend",
    "backend/config",
    "backend/controllers",
    "backend/middleware",
    "backend/models",
    "backend/routes",
    "backend/services",
    "backend/utils",
    "backend/jobs",
    "backend/realtime",
    "backend/migrations",
    "backend/scripts",
    "backend/tests",
    "backend/tests/unit",
    "backend/tests/integration",
    "backend/tests/fixtures",
    "backend/logs",
    "backend/uploads",
    "backend/uploads/avatars",
    "backend/uploads/homework",
    "backend/uploads/receipts",
    "backend/uploads/reports",
    "backend/public",
    "backend/public/assets",
    "backend/public/assets/css",
    "backend/public/assets/js",
    "backend/public/assets/img",

    # ─── Frontend (React/Vite) ───
    "frontend",
    "frontend/public",
    "frontend/public/icons",
    "frontend/src",
    "frontend/src/api",
    "frontend/src/components",
    "frontend/src/components/common",
    "frontend/src/components/layout",
    "frontend/src/components/forms",
    "frontend/src/components/ui",
    "frontend/src/context",
    "frontend/src/hooks",
    "frontend/src/pages",
    "frontend/src/pages/auth",
    "frontend/src/pages/dashboard",
    "frontend/src/pages/students",
    "frontend/src/pages/teachers",
    "frontend/src/pages/classes",
    "frontend/src/pages/attendance",
    "frontend/src/pages/exams",
    "frontend/src/pages/fees",
    "frontend/src/pages/homework",
    "frontend/src/pages/library",
    "frontend/src/pages/notices",
    "frontend/src/pages/reports",
    "frontend/src/pages/settings",
    "frontend/src/pages/parent",
    "frontend/src/pages/profile",
    "frontend/src/router",
    "frontend/src/services",
    "frontend/src/store",
    "frontend/src/styles",
    "frontend/src/utils",
    "frontend/src/assets",
    "frontend/src/assets/fonts",
    "frontend/src/assets/images",
    "frontend/tests",
    "frontend/tests/unit",
    "frontend/tests/e2e",

    # ─── Database ───
    "database",
    "database/backups",
    "database/migrations",
    "database/seeds",
    "database/schemas",

    # ─── Docs ───
    "docs",
    "docs/api",
    "docs/database",
    "docs/guides",
    "docs/architecture",
    "docs/diagrams",

    # ─── Scripts (ops, deploy, etc.) ───
    "scripts",
    "scripts/backup",
    "scripts/deploy",
    "scripts/seeds",
    "scripts/tools",

    # ─── Deployment ───
    "deploy",
    "deploy/docker",
    "deploy/nginx",
    "deploy/systemd",
    "deploy/kubernetes",

    # ─── CI/CD ───
    ".github",
    ".github/workflows",
    ".github/ISSUE_TEMPLATE",

    # ─── Tests at root ───
    "tests",
    "tests/e2e",
    "tests/load",
    "tests/fixtures",

    # ─── Python utilities ───
    "python_utils",
    "python_utils/scripts",
    "python_utils/tools",

    # ─── Runtime ───
    "logs",
    "backups",
    "tmp",
    "coverage",
]

# ────────────────────────────────────────────────────────────
# PLACEHOLDER FILES
# ────────────────────────────────────────────────────────────
FILES = {
    ".gitignore": """# Dependencies
node_modules/
venv/
__pycache__/

# Env files
.env
.env.local
.env.*.local

# Build output
dist/
build/
coverage/
*.log

# Runtime
logs/
uploads/
backups/
tmp/

# SQLite
*.db
*.db-wal
*.db-shm
*.sqlite
*.sqlite3

# Python
*.pyc
*.pyo
*.egg-info/
.pytest_cache/
.mypy_cache/

# Editor
.vscode/
.idea/
*.swp
*.save

# OS
.DS_Store
Thumbs.db
""",

    ".editorconfig": """root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true
indent_style = space
indent_size = 2

[*.py]
indent_size = 4

[*.md]
trim_trailing_whitespace = false
""",

    ".env.example": """# ─── Backend ───
PORT=5000
NODE_ENV=development
JWT_SECRET=change_me_in_production
JWT_EXPIRES_IN=7d
REFRESH_TOKEN_SECRET=change_me_too
DB_PATH=./school_management.db
UPLOAD_DIR=./uploads

# ─── Frontend ───
VITE_API_URL=http://localhost:5000

# ─── Optional SMTP ───
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
""",

    "package.json": """{
  "name": "school-management-system",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev:backend": "cd backend && npm run dev",
    "dev:frontend": "cd frontend && npm run dev",
    "build:frontend": "cd frontend && npm run build",
    "start:backend": "cd backend && npm start"
  }
}
""",

    "backend/package.json": """{
  "name": "school-management-backend",
  "version": "1.0.0",
  "main": "server.js",
  "type": "module",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "bcryptjs": "^2.4.3",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "express-rate-limit": "^7.2.0",
    "jsonwebtoken": "^9.0.2",
    "multer": "^1.4.5-lts.1",
    "sqlite": "^5.1.1",
    "sqlite3": "^5.1.7"
  },
  "devDependencies": {
    "nodemon": "^3.1.0"
  }
}
""",

    "backend/server.js": """import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
""",

    "frontend/package.json": """{
  "name": "school-management-frontend",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "axios": "^1.6.8",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.23.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.66",
    "@types/react-dom": "^18.2.22",
    "@vitejs/plugin-react": "^4.2.1",
    "autoprefixer": "^10.4.19",
    "postcss": "^8.4.38",
    "tailwindcss": "^3.4.3",
    "vite": "^5.2.0"
  }
}
"""
}

# ────────────────────────────────────────────────────────────
# CREATION LOGIC
# ────────────────────────────────────────────────────────────
def main():
    print(f"Creating project structure in: {ROOT}")

    # 1. Create directories
    for relative_dir in DIRECTORIES:
        dir_path = ROOT / relative_dir
        dir_path.mkdir(parents=True, exist_ok=True)

    # 2. Write placeholder files
    for relative_file, content in FILES.items():
        file_path = ROOT / relative_file
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_text(content.lstrip(), encoding="utf-8")

    print("Successfully created all directories and files!")

if __name__ == "__main__":
    main()

