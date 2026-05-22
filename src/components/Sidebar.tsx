import { 
  LayoutDashboard, 
  Rocket, 
  GitMerge, 
  Route, 
  Settings,
  DollarSign, 
  Shield, 
  Users, 
  Database,
  Server,
  Zap,
  Activity,
  Hexagon,
  Key
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

import { useLanguage } from '../context/LanguageContext';

export function Sidebar({ activeTab, setActiveTab }: { activeTab: string, setActiveTab: (tab: string) => void }) {
  const { t } = useLanguage();
  
  const mainNav = [
    { id: 'dashboard', label: t('dashboard'), icon: LayoutDashboard },
    { id: 'deploy', label: t('deploy'), icon: Rocket },
    { id: 'deployments', label: t('deployments'), icon: GitMerge },
    { id: 'releases', label: t('releases'), icon: Activity },
    { id: 'traffic', label: t('traffic'), icon: Route },
    { id: 'costs', label: t('costs'), icon: DollarSign },
  ];

  const adminNav = [
    { id: 'clusters', label: t('clusters'), icon: Hexagon },
    { id: 'quotas', label: t('quotas'), icon: Database },
    { id: 'deployment-config', label: t('deploymentConfig') || 'Конфиг деплойментов', icon: Settings },
    { id: 'access', label: t('access'), icon: Users },
    { id: 'economics', label: t('economics'), icon: Settings },
    { id: 'audit', label: t('audit'), icon: Shield },
    { id: 'tokens', label: t('apiTokens') || 'API Tokens', icon: Key },
  ];

  return (
    <aside className="w-64 flex-shrink-0 border-r border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex flex-col transition-colors duration-200">
      <div className="h-16 flex items-center px-6 border-b border-gray-200 dark:border-slate-800">
        <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-bold text-xl tracking-tight">
          <Server className="w-6 h-6" />
          <span>HSE LLM PROJECT 2026</span>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto py-4 px-3 custom-scrollbar flex flex-col">
        <nav className="space-y-1">
          {mainNav.map((item) => (
            <NavItem 
              key={item.id} 
              item={item} 
              activeTab={activeTab} 
              setActiveTab={setActiveTab} 
            />
          ))}
        </nav>

        <div className="mt-8 mb-2 px-3">
          <span className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-[0.2em]">{t('adminSection')}</span>
        </div>

        <nav className="space-y-1">
          {adminNav.map((item) => (
            <NavItem 
              key={item.id} 
              item={item} 
              activeTab={activeTab} 
              setActiveTab={setActiveTab} 
            />
          ))}
        </nav>
      </div>

      <div className="p-4 border-t border-gray-200 dark:border-slate-800">
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-100 dark:bg-slate-800/50">
          <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white font-semibold text-sm">
            IM
          </div>
          <div className="flex flex-col text-left overflow-hidden">
            <span className="text-sm font-medium text-gray-900 dark:text-gray-200 truncate">Igor Malysh</span>
            <span className="text-xs text-gray-500 dark:text-slate-400 truncate">Platform Admin</span>
          </div>
        </div>
      </div>
    </aside>
  );
}

function NavItem({ item, activeTab, setActiveTab }: any) {
  const Icon = item.icon;
  const isActive = activeTab === item.id;
  
  return (
    <button
      onClick={() => setActiveTab(item.id)}
      className={cn(
        "w-full flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
        isActive 
          ? "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400" 
          : "text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800/50 hover:text-gray-900 dark:hover:text-gray-200"
      )}
    >
      <div className="flex items-center gap-3">
        <Icon className={cn("w-5 h-5", isActive ? "text-indigo-600 dark:text-indigo-400" : "text-gray-400 dark:text-slate-500")} />
        {item.label}
      </div>
    </button>
  );
}
