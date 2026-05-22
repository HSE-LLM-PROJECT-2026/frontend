import React from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

type ConfirmDialogVariant = 'default' | 'warning' | 'danger';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmDialogVariant;
  isLoading?: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}

const VARIANT_STYLES: Record<ConfirmDialogVariant, { icon: string; button: string }> = {
  default: {
    icon: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300',
    button: 'bg-indigo-600 hover:bg-indigo-700 text-white',
  },
  warning: {
    icon: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
    button: 'bg-amber-600 hover:bg-amber-700 text-white',
  },
  danger: {
    icon: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300',
    button: 'bg-red-600 hover:bg-red-700 text-white',
  },
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Подтвердить',
  cancelLabel = 'Отмена',
  variant = 'default',
  isLoading = false,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  if (!open) return null;

  const styles = VARIANT_STYLES[variant];

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950">
        <div className="p-6">
          <div className="mb-4 flex items-start gap-3">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${styles.icon}`}>
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h3>
              {description ? (
                <p className="mt-1 text-sm leading-5 text-gray-600 dark:text-slate-300">{description}</p>
              ) : null}
            </div>
          </div>

          <div className="mt-5 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={isLoading}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={() => void onConfirm()}
              disabled={isLoading}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${styles.button}`}
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

