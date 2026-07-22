'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function TimesheetsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Timesheets route error:', error);
  }, [error]);

  return (
    <div className="min-h-[400px] flex flex-col items-center justify-center p-8 text-center bg-white dark:bg-[#12121a] rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
      <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 flex items-center justify-center mb-4">
        <AlertTriangle size={24} />
      </div>
      <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
        Timesheets Page Error
      </h2>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-md mb-6">
        An error occurred while loading the timesheets page. This may be due to a connection issue or unexpected data format from the server.
      </p>
      <button
        onClick={() => reset()}
        className="btn btn-primary flex items-center gap-2"
      >
        <RefreshCw size={15} /> Try Again
      </button>
    </div>
  );
}
