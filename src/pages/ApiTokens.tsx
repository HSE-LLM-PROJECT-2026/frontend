import React, { useState, useEffect } from 'react';
import { Key, Shield, Trash2, Calendar, HardDrive, Cpu, AlertTriangle } from 'lucide-react';
import { getTokens, revokeToken, deleteToken, TechnicalToken } from '../api/platform';
import { useLanguage } from '../context/LanguageContext';
import { ConfirmDialog } from '../components/ConfirmDialog';

export function ApiTokens() {
  const { t } = useLanguage();
  const [tokens, setTokens] = useState<TechnicalToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<
    { id: string; mode: 'revoke' | 'delete'; label: string } | null
  >(null);
  const [isApplyingAction, setIsApplyingAction] = useState(false);

  const fetchTokens = async () => {
    setLoading(true);
    const data = await getTokens();
    setTokens(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchTokens();
  }, []);

  const handleRevoke = async (id: string) => {
    const token = tokens.find((item) => item.id === id);
    setPendingAction({
      id,
      mode: 'revoke',
      label: token?.name?.trim() || token?.id || id,
    });
  };

  const handleDelete = async (id: string) => {
    const token = tokens.find((item) => item.id === id);
    setPendingAction({
      id,
      mode: 'delete',
      label: token?.name?.trim() || token?.id || id,
    });
  };

  const confirmPendingAction = async () => {
    if (!pendingAction) return;
    setIsApplyingAction(true);
    try {
      if (pendingAction.mode === 'revoke') {
        await revokeToken(pendingAction.id);
      } else {
        await deleteToken(pendingAction.id);
      }
      await fetchTokens();
      setPendingAction(null);
    } finally {
      setIsApplyingAction(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
             <Key className="w-8 h-8 text-indigo-600" />
             {t('apiTokens') || 'API Tokens'}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
             Manage all active technical tokens across model deployments.
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-950 rounded-xl shadow-sm border border-gray-200 dark:border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-slate-900/50 text-xs font-semibold uppercase tracking-wider text-gray-500 border-b border-gray-200 dark:border-slate-800">
                <th className="px-6 py-4">Name / ID</th>
                <th className="px-6 py-4">Deployment</th>
                <th className="px-6 py-4">Created</th>
                <th className="px-6 py-4">Expires</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-slate-900">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                     Loading tokens...
                  </td>
                </tr>
              ) : tokens.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                     No tokens found.
                  </td>
                </tr>
              ) : (
                tokens.map(token => (
                  <tr key={token.id} className="hover:bg-gray-50/50 dark:hover:bg-slate-900/20 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-gray-900 dark:text-slate-200 text-xs">{token.name || 'Unnamed Token'}</div>
                      <div className="text-[10px] text-gray-400 font-mono mt-0.5">{token.id}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Cpu className="w-4 h-4 text-indigo-500" />
                        <span className="font-semibold text-gray-900 dark:text-slate-200">{token.model}</span>
                      </div>
                      <div className="text-[10px] text-gray-500 mt-1 flex items-center gap-1">
                        <HardDrive className="w-3 h-3" /> {token.cluster}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-600 dark:text-gray-400">
                      {new Date(token.createdAt).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-gray-600 dark:text-gray-400">
                      {token.expiresAt === 'never' ? 'Never' : new Date(token.expiresAt).toLocaleString()}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${
                        token.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 
                        token.status === 'revoked' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'
                      }`}>
                         {token.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                         {token.status === 'active' && (
                           <button 
                             onClick={() => handleRevoke(token.id)}
                             className="p-1.5 text-gray-400 hover:text-amber-500 transition-colors"
                             title="Revoke Token"
                           >
                             <AlertTriangle className="w-4 h-4" />
                           </button>
                         )}
                         <button 
                           onClick={() => handleDelete(token.id)}
                           className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                           title="Delete Token permanently"
                         >
                           <Trash2 className="w-4 h-4" />
                         </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(pendingAction)}
        title={pendingAction?.mode === 'revoke' ? 'Отозвать токен?' : 'Удалить токен?'}
        description={
          pendingAction?.mode === 'revoke'
            ? `Токен ${pendingAction?.label ? `'${pendingAction.label}' ` : ''}перестанет работать немедленно.`
            : `Токен ${pendingAction?.label ? `'${pendingAction.label}' ` : ''}будет удален без возможности восстановления.`
        }
        confirmLabel={pendingAction?.mode === 'revoke' ? 'Отозвать' : 'Удалить'}
        cancelLabel="Отмена"
        variant={pendingAction?.mode === 'revoke' ? 'warning' : 'danger'}
        isLoading={isApplyingAction}
        onCancel={() => setPendingAction(null)}
        onConfirm={confirmPendingAction}
      />
    </div>
  );
}
