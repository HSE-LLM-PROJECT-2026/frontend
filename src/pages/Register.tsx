import { useState, type FormEvent } from 'react';
import { Lock, Mail, User, UserPlus } from 'lucide-react';
import { register, type UserResponse } from '../api/security';

export function Register({
  onRegister,
  onSwitchToLogin,
}: {
  onRegister: (user: UserResponse) => void;
  onSwitchToLogin: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (password !== confirmPassword) {
      setErrorMessage('Пароли не совпадают.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await register({
        name: name.trim(),
        email: email.trim(),
        password,
      });
      onRegister(response.user);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Не удалось выполнить регистрацию.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-2xl shadow-sm p-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Регистрация в HSE LLM platform</h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-2">Создайте новый аккаунт</p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {errorMessage && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
              {errorMessage}
            </div>
          )}

          <label className="block">
            <span className="text-sm font-medium text-gray-700 dark:text-slate-300">Имя</span>
            <div className="mt-1 relative">
              <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Иван Петров"
                className="w-full rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
              />
            </div>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-gray-700 dark:text-slate-300">Email</span>
            <div className="mt-1 relative">
              <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="name@hse.ru"
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
                required
                minLength={4}
                placeholder="Минимум 4 символа"
                className="w-full rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
              />
            </div>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-gray-700 dark:text-slate-300">Подтверждение пароля</span>
            <div className="mt-1 relative">
              <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={4}
                placeholder="Повторите пароль"
                className="w-full rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
              />
            </div>
          </label>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full mt-2 inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 dark:disabled:bg-indigo-800 text-white px-4 py-2.5 text-sm font-medium transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            {isSubmitting ? 'Регистрируем...' : 'Зарегистрироваться'}
          </button>
        </form>

        <div className="mt-5 text-center">
          <button
            type="button"
            onClick={onSwitchToLogin}
            className="text-sm text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 font-medium"
          >
            Уже есть аккаунт? Войти
          </button>
        </div>
      </div>
    </div>
  );
}
