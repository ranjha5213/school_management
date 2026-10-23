import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { noticesApi } from '../api/endpoints';
import { useSocket } from '../context/SocketContext';

export default function NoticeBell() {
  const nav = useNavigate();
  const { socket } = useSocket();
  const [data, setData] = useState({ notices: [], unread_count: 0 });
  const [open, setOpen] = useState(false);
  const [pulse, setPulse] = useState(false);
  const ref = useRef();

  const load = () => {
    noticesApi.inbox({ unread: true }).then(setData).catch(() => {});
  };

  useEffect(() => { load(); }, []);

  // ─── Live socket: new notice → prepend + pulse ───
  useEffect(() => {
    if (!socket) return;

    const onNew = (n) => {
      setData((d) => ({
        notices: [n, ...(d.notices || [])].slice(0, 50),
        unread_count: (d.unread_count || 0) + 1,
      }));
      setPulse(true);
      setTimeout(() => setPulse(false), 2000);
    };

    socket.on('notice:new', onNew);
    return () => socket.off('notice:new', onNew);
  }, [socket]);

  // ─── Fallback poll every 60s ───
  useEffect(() => {
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const onDoc = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const count = data?.unread_count || 0;

  const openNotice = async (n) => {
    setOpen(false);
    await noticesApi.markRead(n.id).catch(() => {});
    nav(`/notices/${n.id}`);
    setTimeout(load, 400);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`relative p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:bg-slate-800 transition ${pulse ? 'animate-bounce' : ''}`}
        title="Notices"
      >
        <Bell className="w-4 h-4" />
        {count > 0 && (
          <span className={`absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full
                           bg-red-500 text-white text-[10px] font-bold flex items-center justify-center
                           ${pulse ? 'ring-2 ring-red-300' : ''}`}>
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-80 bg-white dark:bg-slate-900 dark:bg-slate-900
                        border border-slate-200 dark:border-slate-800 dark:border-slate-700 rounded-xl shadow-lg
                        max-h-96 overflow-auto z-40">
          <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 text-xs font-medium text-slate-500">
            {count > 0 ? `${count} unread notice${count === 1 ? '' : 's'}` : 'No unread notices'}
          </div>
          {data?.notices?.length === 0 ? (
            <div className="p-4 text-sm text-slate-500 text-center">All caught up ✓</div>
          ) : (
            data.notices.map((n) => (
              <button key={n.id} onClick={() => openNotice(n)}
                className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:hover:bg-slate-800 border-b border-slate-50 dark:border-slate-800 last:border-0">
                <div className="font-medium text-sm line-clamp-1">{n.title}</div>
                <div className="text-xs text-slate-500 line-clamp-2 mt-0.5">{n.content}</div>
                <div className="text-[10px] text-slate-400 mt-1">
                  {n.posted_by_name || '—'} · {n.published_at || n.posted_at || ''}
                </div>
              </button>
            ))
          )}
          <button onClick={() => { setOpen(false); nav('/notices'); }}
            className="w-full text-center text-xs text-brand-600 hover:underline py-2 border-t border-slate-100 dark:border-slate-800">
            View all notices →
          </button>
        </div>
      )}
    </div>
  );
}
