// src/pages/Timetable.jsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowRight, CalendarDays, Layers, Settings } from 'lucide-react';
import Card from '../components/Card';
import Button from '../components/Button';
import Loader from '../components/Loader';
import Empty from '../components/Empty';
import { classesApi } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';

const normalizeList = (res) => (Array.isArray(res) ? res : res?.data ?? []);

export default function Timetable() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [classes, setClasses] = useState([]);
  const [sectionsByClass, setSectionsByClass] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const rawClasses = await classesApi.list();
        const clsList = normalizeList(rawClasses);
        if (cancelled) return;

        setClasses(clsList);

        const secEntries = await Promise.all(
          clsList.map(async (c) => {
            const cId = c.id ?? c.class_id;
            try {
              const rawSecs = await classesApi.sections(cId);
              return [String(cId), normalizeList(rawSecs)];
            } catch {
              return [String(cId), []];
            }
          })
        );

        if (!cancelled) {
          setSectionsByClass(Object.fromEntries(secEntries));
        }
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || 'Failed to load timetable classes.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <Loader />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-brand-600" /> Timetable Overview
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <Button
              size="sm"
              variant="secondary"
              icon={Settings}
              onClick={() => navigate('/timetable/settings')}
            >
              Timings Settings
            </Button>
          )}
          <Button
            size="sm"
            icon={ArrowRight}
            onClick={() => navigate('/timetable/grid?view=full')}
          >
            View Full Timetable
          </Button>
        </div>
      </div>

      {error ? (
        <Card className="p-4 border-red-200 dark:border-red-900/60">
          <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        </Card>
      ) : classes.length === 0 ? (
        <Empty title="No classes found" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {classes.map((cls) => {
            const cId = cls.id ?? cls.class_id;
            const secs = sectionsByClass[String(cId)] ?? [];

            return (
              <Card key={cId} className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-sm flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-brand-600" />
                    {cls.class_name ?? cls.name}
                  </h2>
                  <span className="text-xs text-slate-500">
                    {secs.length} {secs.length === 1 ? 'section' : 'sections'}
                  </span>
                </div>

                {secs.length === 0 ? (
                  <p className="text-xs text-slate-400">No sections configured yet.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {secs.map((sec) => {
                      const sId = sec.id ?? sec.section_id;
                      return (
                        <button
                          key={sId}
                          type="button"
                          onClick={() =>
                            navigate(`/timetable/grid?class=${cId}&section=${sId}`)
                          }
                          className="px-3 py-1.5 rounded-md text-xs font-medium bg-slate-100 hover:bg-brand-100 hover:text-brand-800 dark:bg-slate-800 dark:hover:bg-brand-900/40 dark:hover:text-brand-200 border border-slate-200 dark:border-slate-700 transition-colors"
                        >
                          Section {sec.section_name ?? sec.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

