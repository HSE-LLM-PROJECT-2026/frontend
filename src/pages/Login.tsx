import { useState, type FormEvent } from 'react';
import { Lock, User, LogIn, ChevronDown } from 'lucide-react';
import { login, type UserResponse } from '../api/security';

type DemoAccount = {
  title: string;
  email: string;
  password: string;
};

const DEMO_PASSWORD = 'demo123';

const DEMO_ACCOUNTS: DemoAccount[] = [
  { title: 'Admin', email: 'admin.demo@platform.local', password: DEMO_PASSWORD },
  { title: 'Manager', email: 'manager.demo@platform.local', password: DEMO_PASSWORD },
  { title: 'Developer (AI)', email: 'dev.ai.demo@platform.local', password: DEMO_PASSWORD },
  { title: 'Developer (ML)', email: 'dev.ml.demo@platform.local', password: DEMO_PASSWORD },
  { title: 'Viewer', email: 'viewer.demo@platform.local', password: DEMO_PASSWORD },
];

export function Login({
  onLogin,
  onSwitchToRegister,
}: {
  onLogin: (user: UserResponse) => void;
  onSwitchToRegister: () => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDemoMenuOpen, setIsDemoMenuOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const performLogin = async (targetEmail: string, targetPassword: string) => {
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await login(targetEmail.trim(), targetPassword);
      onLogin(response.user);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Не удалось выполнить вход.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await performLogin(email, password);
  };

  const handleDemoLogin = async (account: DemoAccount) => {
    setIsDemoMenuOpen(false);
    setEmail(account.email);
    setPassword(account.password);
    await performLogin(account.email, account.password);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-2xl shadow-sm p-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Вход в HSE LLM platform</h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-2">
            Вход
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {errorMessage && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
              {errorMessage}
            </div>
          )}

          <label className="block">
            <span className="text-sm font-medium text-gray-700 dark:text-slate-300">Email</span>
            <div className="mt-1 relative">
              <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
              />
            </div>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-gray-700 dark:text-slate-300">Пароль</span>
            <div className="mt-1 relative">
              <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
              />
            </div>
          </label>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full mt-2 inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 dark:disabled:bg-indigo-800 text-white px-4 py-2.5 text-sm font-medium transition-colors"
          >
            <LogIn className="w-4 h-4" />
            {isSubmitting ? 'Выполняем вход...' : 'Войти'}
          </button>
        </form>

        <div className="mt-6 border-t border-gray-200 dark:border-slate-800 pt-4">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-slate-200">
            Демо аккаунты
          </h2>
          <div className="mt-3 relative">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => setIsDemoMenuOpen((prev) => !prev)}
              className="w-full inline-flex items-center justify-between rounded-lg border border-gray-300 dark:border-slate-700 bg-gray-50 hover:bg-gray-100 dark:bg-slate-900 dark:hover:bg-slate-800 px-3 py-2 text-sm transition-colors disabled:opacity-60"
            >
              <span className="text-gray-900 dark:text-white">Выбрать демо аккаунт</span>
              <ChevronDown
                className={`w-4 h-4 text-gray-500 transition-transform ${isDemoMenuOpen ? 'rotate-180' : ''}`}
              />
            </button>
            {isDemoMenuOpen && (
              <div className="absolute z-20 mt-2 w-full rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg overflow-hidden">
                <div className="max-h-56 overflow-y-auto">
                  {DEMO_ACCOUNTS.map((account) => (
                    <button
                      key={account.email}
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => handleDemoLogin(account)}
                      className="w-full text-left px-3 py-2 border-b last:border-b-0 border-gray-200 dark:border-slate-800 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-60"
                    >
                      <div className="font-medium text-gray-900 dark:text-white">{account.title}</div>
                      <div className="text-[11px] text-gray-500 dark:text-slate-400">{account.email}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-5 text-center">
          <button
            type="button"
            onClick={onSwitchToRegister}
            className="text-sm text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 font-medium"
          >
            Нет аккаунта? Зарегистрироваться
          </button>
        </div>
      </div>
    </div>
  );
}
