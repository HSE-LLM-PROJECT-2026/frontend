/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Dashboard } from './pages/Dashboard';
import { DeployModel } from './pages/DeployModel';
import { Deployments } from './pages/Deployments';
import { TrafficManagement } from './pages/TrafficManagement';
import { Releases } from './pages/Releases';
import { Costs } from './pages/Costs';
import { Quotas } from './pages/Quotas';
import { AuditLog } from './pages/AuditLog';
import { AccessControl } from './pages/AccessControl';
import { EconomicsSettings } from './pages/EconomicsSettings';
import { ClusterManagement } from './pages/ClusterManagement';
import { ApiTokens } from './pages/ApiTokens';
import { DeploymentConfig } from './pages/DeploymentConfig';
import {
  SESSION_EXPIRED_EVENT,
  clearSecuritySession,
  getCurrentSessionUser,
  hasActiveSessionToken,
  type SessionExpiredReason,
  verifyCurrentPrincipal,
  type UserResponse,
} from './api/security';
import { isDemoModeEnabled } from './api/demoMode';
import { ClusterProvider } from './context/ClusterContext';
import { LanguageProvider } from './context/LanguageContext';

const THEME_STORAGE_KEY = 'platform.theme';
const DEMO_MODE = isDemoModeEnabled();

function demoUser(): UserResponse {
  const now = new Date().toISOString();
  return {
    id: 'demo-admin',
    email: 'demo.admin@hse-llm-project-2026.ru',
    name: 'Demo Platform Admin',
    team: 'Platform',
    role: 'admin',
    is_service_account: false,
    created_at: now,
    updated_at: now,
  };
}

function AppShell({
  darkMode,
  setDarkMode,
}: {
  darkMode: boolean;
  setDarkMode: Dispatch<SetStateAction<boolean>>;
}) {
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <LanguageProvider>
      <ClusterProvider>
        <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-slate-900 transition-colors duration-200">
          <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
          <div className="flex flex-col flex-1 w-full overflow-hidden">
            <Header darkMode={darkMode} setDarkMode={setDarkMode} />
            <main className="flex-1 overflow-y-auto custom-scrollbar p-6">
              {activeTab === 'dashboard' && <Dashboard />}
              {activeTab === 'deploy' && <DeployModel />}
              {activeTab === 'deployments' && <Deployments />}
              {activeTab === 'releases' && <Releases />}
              {activeTab === 'traffic' && <TrafficManagement />}
              {activeTab === 'clusters' && <ClusterManagement />}
              {activeTab === 'costs' && <Costs />}
              {activeTab === 'quotas' && <Quotas />}
              {activeTab === 'audit' && <AuditLog />}
              {activeTab === 'access' && <AccessControl />}
              {activeTab === 'economics' && <EconomicsSettings />}
              {activeTab === 'tokens' && <ApiTokens />}
              {activeTab === 'deployment-config' && <DeploymentConfig />}
            </main>
          </div>
        </div>
      </ClusterProvider>
    </LanguageProvider>
  );
}

export default function App() {
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') {
      return true;
    }
    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (savedTheme === 'dark') {
      return true;
    }
    if (savedTheme === 'light') {
      return false;
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const [isAuthenticated, setIsAuthenticated] = useState(DEMO_MODE);
  const [isAuthBootstrapping, setIsAuthBootstrapping] = useState(!DEMO_MODE);
  const [authView, setAuthView] = useState<'login' | 'register'>('login');
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<UserResponse | null>(() =>
    DEMO_MODE ? demoUser() : getCurrentSessionUser()
  );
  const authNoticeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', darkMode);
    root.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    root.style.colorScheme = darkMode ? 'dark' : 'light';
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(THEME_STORAGE_KEY, darkMode ? 'dark' : 'light');
    }
  }, [darkMode]);

  const showAuthNotice = (message: string) => {
    if (authNoticeTimeoutRef.current) {
      clearTimeout(authNoticeTimeoutRef.current);
    }
    setAuthNotice(message);
    authNoticeTimeoutRef.current = setTimeout(() => {
      setAuthNotice(null);
      authNoticeTimeoutRef.current = null;
    }, 5000);
  };

  const redirectToAuth = (reason?: SessionExpiredReason) => {
    if (DEMO_MODE) {
      return;
    }
    setCurrentUser(null);
    setIsAuthenticated(false);
    setIsAuthBootstrapping(false);
    setAuthView('login');
    if (reason === 'token_expired') {
      showAuthNotice('Токен истёк. Войдите снова.');
    }
  };

  useEffect(() => {
    if (DEMO_MODE || typeof window === 'undefined') {
      return;
    }
    const onSessionExpired = (event: Event) => {
      const customEvent = event as CustomEvent<{ reason?: SessionExpiredReason }>;
      const reason = customEvent.detail?.reason;
      redirectToAuth(reason);
    };

    window.addEventListener(SESSION_EXPIRED_EVENT, onSessionExpired as EventListener);
    return () => {
      window.removeEventListener(SESSION_EXPIRED_EVENT, onSessionExpired as EventListener);
    };
  }, []);

  useEffect(() => {
    if (DEMO_MODE || !isAuthenticated || typeof window === 'undefined') {
      return;
    }

    const interval = window.setInterval(() => {
      if (!hasActiveSessionToken()) {
        redirectToAuth('token_expired');
      }
    }, 5000);

    return () => {
      window.clearInterval(interval);
    };
  }, [isAuthenticated]);

  useEffect(() => {
    return () => {
      if (authNoticeTimeoutRef.current) {
        clearTimeout(authNoticeTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (DEMO_MODE) {
      setIsAuthenticated(true);
      setCurrentUser((prev) => prev || demoUser());
      setIsAuthBootstrapping(false);
      return;
    }

    let active = true;

    const bootstrapAuth = async () => {
      if (!hasActiveSessionToken()) {
        if (!active) return;
        setIsAuthenticated(false);
        setCurrentUser(null);
        setIsAuthBootstrapping(false);
        setAuthView('login');
        return;
      }

      try {
        const principal = await verifyCurrentPrincipal();
        if (!active) return;
        setIsAuthenticated(true);
        setCurrentUser((prev) => {
          if (prev?.email?.trim()) {
            return prev;
          }
          const now = new Date().toISOString();
          return {
            id: principal.user_id,
            email: principal.email,
            name: principal.email,
            team: principal.team,
            role: principal.role,
            is_service_account: principal.is_service_account,
            created_at: now,
            updated_at: now,
          };
        });
      } catch {
        clearSecuritySession();
        if (!active) return;
        setIsAuthenticated(false);
        setCurrentUser(null);
        setAuthView('login');
      } finally {
        if (active) {
          setIsAuthBootstrapping(false);
        }
      }
    };

    void bootstrapAuth();
    return () => {
      active = false;
    };
  }, []);

  if (isAuthBootstrapping) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-sm text-gray-600 dark:text-slate-300">Восстанавливаем сессию...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    const authNoticeToast = authNotice ? (
      <div className="fixed top-4 right-4 z-[80] w-[calc(100%-2rem)] max-w-sm rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800 shadow-lg dark:border-yellow-500/30 dark:bg-yellow-500/10 dark:text-yellow-300">
        <div className="flex items-start justify-between gap-3">
          <span>{authNotice}</span>
          <button
            type="button"
            onClick={() => {
              setAuthNotice(null);
              if (authNoticeTimeoutRef.current) {
                clearTimeout(authNoticeTimeoutRef.current);
                authNoticeTimeoutRef.current = null;
              }
            }}
            className="text-current/70 hover:text-current"
            aria-label="Закрыть уведомление"
          >
            ×
          </button>
        </div>
      </div>
    ) : null;

    if (authView === 'register') {
      return (
        <>
          {authNoticeToast}
          <Register
            onRegister={(user) => {
              setCurrentUser(user);
              setIsAuthenticated(true);
              setIsAuthBootstrapping(false);
              setAuthView('login');
            }}
            onSwitchToLogin={() => setAuthView('login')}
          />
        </>
      );
    }

    return (
      <>
        {authNoticeToast}
        <Login
          onLogin={(user) => {
            setCurrentUser(user);
            setIsAuthenticated(true);
            setIsAuthBootstrapping(false);
            setAuthView('login');
          }}
          onSwitchToRegister={() => setAuthView('register')}
        />
      </>
    );
  }

  return <AppShell darkMode={darkMode} setDarkMode={setDarkMode} />;
}
