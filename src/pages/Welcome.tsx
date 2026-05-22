import { Rocket, GitMerge, Sparkles } from 'lucide-react';

export function Welcome({ onNavigate }: { onNavigate: (tab: string) => void }) {
  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="bg-white dark:bg-slate-950 rounded-2xl border border-gray-200 dark:border-slate-800 p-8 shadow-sm">
        <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 px-3 py-1 text-xs font-medium">
          <Sparkles className="w-3.5 h-3.5" />
          HSE LLM platform
        </div>

        <h1 className="mt-4 text-3xl font-bold text-gray-900 dark:text-white">
          Добро пожаловать в HSE LLM platform
        </h1>
        <p className="mt-3 text-gray-600 dark:text-slate-300 max-w-3xl">
          Разворачивайте, отслеживайте и управляйте LLM-нагрузками в Kubernetes из единого
          интерфейса.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            onClick={() => onNavigate('deploy')}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 text-sm font-medium transition-colors"
          >
            <Rocket className="w-4 h-4" />
            Развернуть модель
          </button>
          <button
            onClick={() => onNavigate('deployments')}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 dark:border-slate-700 text-gray-800 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-900 px-4 py-2.5 text-sm font-medium transition-colors"
          >
            <GitMerge className="w-4 h-4" />
            Открыть деплойменты
          </button>
          <button
            onClick={() => onNavigate('clusters')}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 dark:border-slate-700 text-gray-800 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-900 px-4 py-2.5 text-sm font-medium transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            Открыть кластеры
          </button>
        </div>
      </div>
    </div>
  );
}
