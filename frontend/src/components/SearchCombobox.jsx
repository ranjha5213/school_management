import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, User, GraduationCap } from 'lucide-react';
import { searchApi } from '../api/endpoints';

export default function SearchCombobox() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({ students: [], teachers: [] });
  const ref = useRef();
  const nav = useNavigate();

  useEffect(() => {
    const onDoc = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => {
    if (q.trim().length < 2) { setData({ students: [], teachers: [] }); return; }
    const t = setTimeout(() => {
      searchApi.query(q).then((d) => { setData(d || { students: [], teachers: [] }); setOpen(true); }).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const go = (type, id) => {
    setOpen(false); setQ('');
    nav(type === 'student' ? `/students/${id}` : `/teachers/${id}`);
  };

  const has = data.students?.length || data.teachers?.length;

  return (
    <div ref={ref} className="relative w-full max-w-md">
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => has && setOpen(true)}
          placeholder="Search students or teachers…"
          className="input pl-9 w-full"
        />
      </div>
      {open && has && (
        <div className="absolute z-30 mt-1 w-full bg-white dark:bg-slate-900 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 dark:border-slate-700 rounded-lg shadow-lg max-h-80 overflow-auto">
          {data.students?.length > 0 && (
            <div className="py-1">
              <div className="px-3 py-1 text-xs uppercase text-slate-400">Students</div>
              {data.students.map((s) => (
                <button key={s.id} onClick={() => go('student', s.id)}
                  className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:hover:bg-slate-700 flex items-center gap-2 text-sm">
                  <User className="w-3.5 h-3.5 text-brand-500" />
                  <span className="flex-1">{s.name}</span>
                  <span className="text-xs text-slate-400">{s.class_name} · {s.section_name}</span>
                </button>
              ))}
            </div>
          )}
          {data.teachers?.length > 0 && (
            <div className="py-1 border-t border-slate-100 dark:border-slate-700">
              <div className="px-3 py-1 text-xs uppercase text-slate-400">Teachers</div>
              {data.teachers.map((t) => (
                <button key={t.id} onClick={() => go('teacher', t.id)}
                  className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:hover:bg-slate-700 flex items-center gap-2 text-sm">
                  <GraduationCap className="w-3.5 h-3.5 text-purple-500" />
                  <span className="flex-1">{t.name}</span>
                  <span className="text-xs text-slate-400">{t.employee_code}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
