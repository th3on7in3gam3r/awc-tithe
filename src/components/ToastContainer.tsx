import React from 'react';
import { useChurch } from '../context/ChurchContext';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';

export const ToastContainer: React.FC = () => {
  const { notifications, dismissNotification } = useChurch();

  if (notifications.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full no-print">
      {notifications.map((n) => {
        let Icon = Info;
        let colorClass = 'bg-slate-900 text-white dark:bg-slate-800 border-slate-700';

        if (n.type === 'success') {
          Icon = CheckCircle2;
          colorClass = 'bg-emerald-950 text-emerald-100 border-emerald-800';
        } else if (n.type === 'warning') {
          Icon = AlertTriangle;
          colorClass = 'bg-church-burgundy-dark text-church-gold-light border-church-gold/50';
        } else if (n.type === 'error') {
          Icon = AlertCircle;
          colorClass = 'bg-red-950 text-red-100 border-red-800';
        }

        return (
          <div
            key={n.id}
            className={`p-3.5 rounded-xl border shadow-xl flex items-start justify-between gap-3 text-xs transition-all animate-in slide-in-from-bottom-2 ${colorClass}`}
          >
            <div className="flex items-start gap-2.5">
              <Icon className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <span className="font-bold block">{n.title}</span>
                <p className="opacity-90 text-[11px] leading-snug mt-0.5">{n.message}</p>
              </div>
            </div>
            <button
              onClick={() => dismissNotification(n.id)}
              className="opacity-70 hover:opacity-100 shrink-0 text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
