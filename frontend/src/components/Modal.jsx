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
                    bg-white dark:bg-slate-900 dark:bg-slate-900
                    border border-slate-200 dark:border-slate-800 dark:border-slate-800
                    animate-modal-in max-h-[92vh] flex flex-col`}
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800 dark:border-slate-800">
          <h3 className="font-semibold text-slate-800 dark:text-slate-100 dark:text-slate-100">{title}</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:bg-slate-800
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
          <div className="flex justify-end gap-2 p-4 border-t border-slate-200 dark:border-slate-800 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
