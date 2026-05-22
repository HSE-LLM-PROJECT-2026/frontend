import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Code2,
  Copy,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import {
  BACKEND_UNAVAILABLE_MESSAGE,
  createDeploymentInferenceToken,
  getDeployments,
  listDeploymentInferenceTokens,
  revokeDeploymentInferenceToken,
  type DeploymentResponse,
  type InferenceApiTokenInfo,
} from '../api/deployments';

type TokenType = 'fine-grained' | 'read' | 'write';

interface PermissionOption {
  id: string;
  label: string;
  hint?: string;
}

interface ParsedTokenMetadata {
  version: 1;
  name: string;
  token_type: TokenType;
  permissions: string[];
}

const TOKEN_META_PREFIX = 'hfmeta:v1:';
const MINUTES_PER_DAY = 60 * 24;
const DEFAULT_TOKEN_TTL_MINUTES = 60 * 24 * 180;
const DEFAULT_TOKEN_TTL_DAYS = Math.floor(DEFAULT_TOKEN_TTL_MINUTES / MINUTES_PER_DAY);
const CURL_PUBLIC_BASE_URL = 'https://frontend.hse-llm-project-2026.ru';

const READ_PERMISSIONS = ['deployments.read', 'inference.chat'];
const WRITE_PERMISSIONS = [
  'deployments.read',
  'deployments.manage',
  'inference.chat',
  'tokens.manage',
];
const FINE_GRAINED_DEFAULT_PERMISSIONS = ['inference.chat'];

const PERMISSION_GROUPS: ReadonlyArray<{
  title: string;
  options: PermissionOption[];
}> = [
  {
    title: 'Deployments',
    options: [
      {
        id: 'deployments.read',
        label: 'View deployments and their runtime status',
      },
      {
        id: 'deployments.manage',
        label: 'Create / redeploy / delete deployments',
      },
      {
        id: 'deployments.access',
        label: 'Manage team access rules for deployments',
      },
    ],
  },
  {
    title: 'Inference',
    options: [
      {
        id: 'inference.chat',
        label: 'Call chat/completions proxy endpoints',
      },
      {
        id: 'inference.models',
        label: 'Read deployed model metadata via proxy',
      },
      {
        id: 'inference.stream',
        label: 'Use streaming responses',
      },
    ],
  },
  {
    title: 'Audit & Security',
    options: [
      {
        id: 'audit.read',
        label: 'Read audit events in UI and API',
      },
      {
        id: 'security.roles.read',
        label: 'View teams and role assignments',
      },
    ],
  },
  {
    title: 'Token Management',
    options: [
      {
        id: 'tokens.read',
        label: 'List technical tokens for selected deployment',
      },
      {
        id: 'tokens.manage',
        label: 'Create and revoke technical tokens',
      },
    ],
  },
];

const ALL_PERMISSION_OPTIONS = PERMISSION_GROUPS.flatMap((group) => group.options);
const PERMISSION_LABEL_BY_ID = new Map(
  ALL_PERMISSION_OPTIONS.map((option) => [option.id, option.label])
);

function canManageDeployment(dep: DeploymentResponse): boolean {
  return dep.can_manage !== false;
}

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return value;
  return new Date(ts).toLocaleString('ru-RU');
}

function formatDateOrRelative(value: string | null): string {
  if (!value) return '—';
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return value;

  const minutes = Math.floor((Date.now() - ts) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(ts).toLocaleDateString('ru-RU');
}

function tokenStatus(token: InferenceApiTokenInfo): {
  label: string;
  className: string;
} {
  if (token.revoked_at) {
    return {
      label: 'revoked',
      className:
        'bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-slate-300',
    };
  }
  const expiresAt = Date.parse(token.expires_at);
  if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
    return {
      label: 'expired',
      className:
        'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
    };
  }
  return {
    label: 'active',
    className:
      'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  };
}

function toBase64Utf8(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

function fromBase64Utf8(encoded: string): string {
  const binary = atob(encoded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodeTokenMetadata(meta: ParsedTokenMetadata): string {
  return `${TOKEN_META_PREFIX}${toBase64Utf8(JSON.stringify(meta))}`;
}

function decodeTokenMetadata(rawDescription: string | null): ParsedTokenMetadata | null {
  const description = (rawDescription || '').trim();
  if (!description.startsWith(TOKEN_META_PREFIX)) return null;
  const payload = description.slice(TOKEN_META_PREFIX.length).trim();
  if (!payload) return null;
  try {
    const parsed = JSON.parse(fromBase64Utf8(payload)) as Partial<ParsedTokenMetadata>;
    if (parsed.version !== 1) return null;
    if (!['fine-grained', 'read', 'write'].includes(String(parsed.token_type || ''))) {
      return null;
    }
    const name = String(parsed.name || '').trim();
    if (!name) return null;
    const permissions = Array.isArray(parsed.permissions)
      ? parsed.permissions
          .map((item) => String(item || '').trim())
          .filter((item, idx, arr) => item.length > 0 && arr.indexOf(item) === idx)
      : [];
    return {
      version: 1,
      name,
      token_type: parsed.token_type as TokenType,
      permissions,
    };
  } catch {
    return null;
  }
}

function resolvedPermissionsForType(
  tokenType: TokenType,
  selectedPermissions: string[]
): string[] {
  if (tokenType === 'read') {
    return [...READ_PERMISSIONS];
  }
  if (tokenType === 'write') {
    return [...WRITE_PERMISSIONS];
  }
  return selectedPermissions.filter(
    (value, index, list) => value && list.indexOf(value) === index
  );
}

function buildCurlCommand(params: {
  deploymentId: string;
  modelName: string;
  tokenValue: string;
}): string {
  const baseUrl = CURL_PUBLIC_BASE_URL.replace(/\/+$/, '');
  const encodedId = encodeURIComponent(params.deploymentId);
  return [
    `curl -X POST '${baseUrl}/deployments/${encodedId}/proxy/v1/chat/completions' \\`,
    `  -H 'Authorization: Bearer ${params.tokenValue}' \\`,
    "  -H 'Content-Type: application/json' \\",
    "  -d '{",
    `    \"model\": \"${params.modelName}\",`,
    '    \"messages\": [{\"role\": \"user\", \"content\": \"Привет! Ответь одним предложением.\"}],',
    '    \"max_tokens\": 128,',
    '    \"temperature\": 0.7,',
    '    \"stream\": false',
    "  }'",
  ].join('\n');
}

export function TechnicalTokens() {
  const [deployments, setDeployments] = useState<DeploymentResponse[]>([]);
  const [isLoadingDeployments, setIsLoadingDeployments] = useState(true);
  const [selectedDeploymentId, setSelectedDeploymentId] = useState('');
  const [tokens, setTokens] = useState<InferenceApiTokenInfo[]>([]);
  const [isLoadingTokens, setIsLoadingTokens] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [revokingTokenId, setRevokingTokenId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [tokenTypeDraft, setTokenTypeDraft] = useState<TokenType>('fine-grained');
  const [tokenNameDraft, setTokenNameDraft] = useState('');
  const [selectedPermissionIds, setSelectedPermissionIds] = useState<string[]>(
    FINE_GRAINED_DEFAULT_PERMISSIONS
  );
  const [ttlDaysDraft, setTtlDaysDraft] = useState(DEFAULT_TOKEN_TTL_DAYS);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [createdPlainToken, setCreatedPlainToken] = useState<string | null>(null);
  const [plainTokenCopied, setPlainTokenCopied] = useState(false);
  const [curlHintToken, setCurlHintToken] = useState<InferenceApiTokenInfo | null>(null);
  const [curlCommandCopied, setCurlCommandCopied] = useState(false);
  const [copiedCurlTokenId, setCopiedCurlTokenId] = useState<string | null>(null);
  const [pendingRevokeToken, setPendingRevokeToken] = useState<InferenceApiTokenInfo | null>(null);

  const manageableDeployments = useMemo(
    () => deployments.filter(canManageDeployment),
    [deployments]
  );

  const selectedDeployment = useMemo(
    () => manageableDeployments.find((dep) => dep.id === selectedDeploymentId) ?? null,
    [manageableDeployments, selectedDeploymentId]
  );

  useEffect(() => {
    let active = true;

    const loadDeployments = async () => {
      setIsLoadingDeployments(true);
      try {
        const data = await getDeployments();
        if (!active) return;
        setDeployments(data);
        setErrorMessage(null);
      } catch (err) {
        if (!active) return;
        const message =
          err instanceof Error ? err.message : BACKEND_UNAVAILABLE_MESSAGE;
        setErrorMessage(message);
      } finally {
        if (active) {
          setIsLoadingDeployments(false);
        }
      }
    };

    void loadDeployments();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!manageableDeployments.length) {
      setSelectedDeploymentId('');
      return;
    }
    if (
      selectedDeploymentId &&
      manageableDeployments.some((dep) => dep.id === selectedDeploymentId)
    ) {
      return;
    }
    setSelectedDeploymentId(manageableDeployments[0].id);
  }, [manageableDeployments, selectedDeploymentId]);

  const loadTokens = async (deploymentId: string) => {
    setIsLoadingTokens(true);
    try {
      const items = await listDeploymentInferenceTokens(deploymentId);
      setTokens(items);
      setErrorMessage(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Не удалось загрузить технические токены.';
      setErrorMessage(message);
      setTokens([]);
    } finally {
      setIsLoadingTokens(false);
    }
  };

  useEffect(() => {
    if (!selectedDeploymentId) {
      setTokens([]);
      setCurlHintToken(null);
      return;
    }
    void loadTokens(selectedDeploymentId);
  }, [selectedDeploymentId]);

  const curlCommand = useMemo(() => {
    if (!selectedDeployment || !curlHintToken) {
      return '';
    }
    const isKnownFreshToken =
      Boolean(createdPlainToken) &&
      createdPlainToken.startsWith(curlHintToken.token_prefix);
    const tokenValue = isKnownFreshToken
      ? createdPlainToken
      : '<PASTE_TECHNICAL_TOKEN_HERE>';
    return buildCurlCommand({
      deploymentId: selectedDeployment.id,
      modelName: selectedDeployment.model_name,
      tokenValue,
    });
  }, [selectedDeployment, curlHintToken, createdPlainToken]);

  const resolvedDraftPermissions = useMemo(
    () => resolvedPermissionsForType(tokenTypeDraft, selectedPermissionIds),
    [tokenTypeDraft, selectedPermissionIds]
  );

  const selectedPermissionLabelText = useMemo(() => {
    if (resolvedDraftPermissions.length === 0) {
      return 'No permissions selected';
    }
    return resolvedDraftPermissions
      .map((id) => PERMISSION_LABEL_BY_ID.get(id) || id)
      .join(' • ');
  }, [resolvedDraftPermissions]);

  const createTokenValidationMessage = useMemo(() => {
    if (!selectedDeploymentId) {
      return 'Выберите deployment с правом manage.';
    }
    if (!tokenNameDraft.trim()) {
      return 'Введите token name.';
    }
    if (resolvedDraftPermissions.length === 0) {
      return 'Выберите хотя бы одно permission.';
    }
    return null;
  }, [selectedDeploymentId, tokenNameDraft, resolvedDraftPermissions]);

  const isCreateTokenDisabled = Boolean(createTokenValidationMessage) || isCreating;

  const openCreateModal = () => {
    setTokenTypeDraft('fine-grained');
    setTokenNameDraft('');
    setSelectedPermissionIds([...FINE_GRAINED_DEFAULT_PERMISSIONS]);
    setTtlDaysDraft(DEFAULT_TOKEN_TTL_DAYS);
    setErrorMessage(null);
    setIsCreateModalOpen(true);
  };

  const closeCreateModal = () => {
    if (isCreating) return;
    setIsCreateModalOpen(false);
  };

  const togglePermission = (permissionId: string) => {
    setSelectedPermissionIds((current) => {
      if (current.includes(permissionId)) {
        return current.filter((item) => item !== permissionId);
      }
      return [...current, permissionId];
    });
  };

  const handleCreateToken = async () => {
    if (!selectedDeploymentId) {
      setErrorMessage('Сначала выберите deployment.');
      return;
    }
    const trimmedName = tokenNameDraft.trim();
    if (!trimmedName) {
      setErrorMessage('Введите token name.');
      return;
    }

    const effectivePermissions = resolvedPermissionsForType(
      tokenTypeDraft,
      selectedPermissionIds
    );
    if (effectivePermissions.length === 0) {
      setErrorMessage('Выберите хотя бы одно permission для fine-grained токена.');
      return;
    }

    const metadata: ParsedTokenMetadata = {
      version: 1,
      name: trimmedName,
      token_type: tokenTypeDraft,
      permissions: effectivePermissions,
    };

    setIsCreating(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setCreatedPlainToken(null);
    setPlainTokenCopied(false);
    try {
      const created = await createDeploymentInferenceToken(selectedDeploymentId, {
        description: encodeTokenMetadata(metadata),
        ttl_minutes: Math.max(1, ttlDaysDraft) * MINUTES_PER_DAY,
      });
      setCreatedPlainToken(created.token);
      setSuccessMessage(
        `Token '${trimmedName}' created. Prefix: ${created.token_prefix}, expires ${formatDateTime(created.expires_at)}`
      );
      setIsCreateModalOpen(false);
      await loadTokens(selectedDeploymentId);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Не удалось создать технический токен.';
      setErrorMessage(message);
    } finally {
      setIsCreating(false);
    }
  };

  const performRevoke = async (token: InferenceApiTokenInfo) => {
    if (!selectedDeploymentId || token.revoked_at) return;
    setRevokingTokenId(token.id);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await revokeDeploymentInferenceToken(selectedDeploymentId, token.id);
      setSuccessMessage(`Токен ${token.token_prefix} отозван.`);
      await loadTokens(selectedDeploymentId);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Не удалось отозвать технический токен.';
      setErrorMessage(message);
    } finally {
      setRevokingTokenId(null);
    }
  };

  const handleRevoke = (token: InferenceApiTokenInfo) => {
    if (!selectedDeploymentId || token.revoked_at) return;
    setPendingRevokeToken(token);
  };

  const confirmRevoke = async () => {
    if (!pendingRevokeToken) return;
    const token = pendingRevokeToken;
    setPendingRevokeToken(null);
    await performRevoke(token);
  };

  const handleCopyPlainToken = async () => {
    if (!createdPlainToken) return;
    try {
      await navigator.clipboard.writeText(createdPlainToken);
      setPlainTokenCopied(true);
      setTimeout(() => setPlainTokenCopied(false), 1500);
    } catch {
      setErrorMessage('Не удалось скопировать токен в буфер обмена.');
    }
  };

  const handleCopyCurlCommand = async () => {
    if (!curlCommand) return;
    try {
      await navigator.clipboard.writeText(curlCommand);
      setCurlCommandCopied(true);
      setTimeout(() => setCurlCommandCopied(false), 1500);
    } catch {
      setErrorMessage('Не удалось скопировать cURL-команду.');
    }
  };

  const handleCopyCurlForToken = async (token: InferenceApiTokenInfo) => {
    if (!selectedDeployment) return;

    const isKnownFreshToken =
      Boolean(createdPlainToken) &&
      createdPlainToken.startsWith(token.token_prefix);
    const tokenValue = isKnownFreshToken
      ? createdPlainToken
      : '<PASTE_TECHNICAL_TOKEN_HERE>';
    const command = buildCurlCommand({
      deploymentId: selectedDeployment.id,
      modelName: selectedDeployment.model_name,
      tokenValue,
    });

    try {
      await navigator.clipboard.writeText(command);
      setCopiedCurlTokenId(token.id);
      setTimeout(() => setCopiedCurlTokenId((current) => (current === token.id ? null : current)), 1500);
      if (!isKnownFreshToken) {
        setSuccessMessage(
          'cURL скопирован. Вставьте реальный токен вручную вместо <PASTE_TECHNICAL_TOKEN_HERE>.'
        );
      } else {
        setSuccessMessage('cURL скопирован в буфер обмена.');
      }
    } catch {
      setErrorMessage('Не удалось скопировать cURL-команду.');
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Access Tokens
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
            Токены аутентифицируют доступ к OpenAI-compatible proxy для выбранного deployment.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedDeploymentId && (
            <button
              type="button"
              onClick={() => void loadTokens(selectedDeploymentId)}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              disabled={isLoadingTokens}
            >
              {isLoadingTokens ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Refresh
            </button>
          )}
          <button
            type="button"
            onClick={openCreateModal}
            disabled={!selectedDeploymentId}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Plus className="h-4 w-4" />
            Create new token
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {errorMessage}
        </div>
      )}
      {successMessage && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
          {successMessage}
        </div>
      )}

      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-300">
              Deployment
            </label>
            <select
              value={selectedDeploymentId}
              onChange={(event) => {
                setSelectedDeploymentId(event.target.value);
                setCreatedPlainToken(null);
                setPlainTokenCopied(false);
                  setCurlHintToken(null);
                  setCurlCommandCopied(false);
                  setCopiedCurlTokenId(null);
                  setSuccessMessage(null);
                  setErrorMessage(null);
                }}
              disabled={isLoadingDeployments || manageableDeployments.length === 0}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              {isLoadingDeployments && <option>Загрузка...</option>}
              {!isLoadingDeployments && manageableDeployments.length === 0 && (
                <option value="">Нет deployment с правом manage</option>
              )}
              {manageableDeployments.map((dep) => (
                <option key={dep.id} value={dep.id}>
                  {dep.crd_name} ({dep.team})
                </option>
              ))}
            </select>
            {selectedDeployment && (
              <p className="mt-2 text-xs text-gray-500 dark:text-slate-400">
                Namespace: {selectedDeployment.namespace} | Model: {selectedDeployment.model_name}
              </p>
            )}
          </div>
          <div className="text-xs text-gray-500 dark:text-slate-400">
            Токен показывается только один раз сразу после создания.
          </div>
        </div>

        {createdPlainToken && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-500/10">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                  New access token
                </p>
                <code className="mt-1 block break-all rounded bg-white/80 px-2 py-1 text-xs text-amber-900 dark:bg-slate-900 dark:text-amber-200">
                  {createdPlainToken}
                </code>
              </div>
              <button
                type="button"
                onClick={() => void handleCopyPlainToken()}
                className="inline-flex items-center gap-1 rounded-md border border-amber-300 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 dark:border-amber-400/40 dark:text-amber-300 dark:hover:bg-amber-500/10"
              >
                {plainTokenCopied ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    Скопировано
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Копировать
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="border-b border-gray-200 px-4 py-3 dark:border-slate-800">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
              User Access Tokens
            </h2>
            <span className="rounded-full border border-gray-200 px-2 py-0.5 text-xs text-gray-600 dark:border-slate-700 dark:text-slate-300">
              {tokens.length} total
            </span>
          </div>
        </div>

        {!selectedDeploymentId ? (
          <div className="px-4 py-6 text-sm text-gray-500 dark:text-slate-400">
            Выберите deployment, чтобы увидеть токены.
          </div>
        ) : isLoadingTokens ? (
          <div className="px-4 py-8 text-center">
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-indigo-500" />
            <p className="mt-2 text-sm text-gray-500 dark:text-slate-400">Загружаем токены...</p>
          </div>
        ) : tokens.length === 0 ? (
          <div className="px-4 py-6 text-sm text-gray-500 dark:text-slate-400">
            Для этого deployment токенов пока нет.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-slate-800">
              <thead className="bg-gray-50 dark:bg-slate-900/60">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-gray-600 dark:text-slate-300">
                    Name
                  </th>
                  <th className="px-4 py-2 text-left font-medium text-gray-600 dark:text-slate-300">
                    Value
                  </th>
                  <th className="px-4 py-2 text-left font-medium text-gray-600 dark:text-slate-300">
                    Last Refreshed Date
                  </th>
                  <th className="px-4 py-2 text-left font-medium text-gray-600 dark:text-slate-300">
                    Last Used Date
                  </th>
                  <th className="px-4 py-2 text-left font-medium text-gray-600 dark:text-slate-300">
                    Permissions
                  </th>
                  <th className="px-4 py-2 text-left font-medium text-gray-600 dark:text-slate-300">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-slate-800">
                {tokens.map((token) => {
                  const metadata = decodeTokenMetadata(token.description);
                  const status = tokenStatus(token);
                  const isRevokeDisabled =
                    Boolean(token.revoked_at) || revokingTokenId === token.id;
                  const tokenName =
                    metadata?.name || token.description || token.token_prefix;
                  const permissionBadgeLabel =
                    metadata?.token_type === 'write'
                      ? 'WRITE'
                      : metadata?.token_type === 'read'
                        ? 'READ'
                        : metadata?.token_type === 'fine-grained'
                          ? 'FINE-GRAINED'
                          : 'INFERENCE';
                  return (
                    <tr key={token.id}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 dark:text-slate-100">
                          {tokenName}
                        </div>
                        <div className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                          {token.crd_name}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1 font-mono text-xs text-gray-700 dark:bg-slate-800 dark:text-slate-300">
                          <KeyRound className="h-3 w-3" />
                          {token.token_prefix}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-700 dark:text-slate-300">
                        {formatDateOrRelative(token.updated_at)}
                        <div className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">
                          expires: {formatDateTime(token.expires_at)}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-700 dark:text-slate-300">
                        {formatDateOrRelative(token.last_used_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col items-start gap-1">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                              metadata?.token_type === 'write'
                                ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300'
                                : metadata?.token_type === 'fine-grained'
                                  ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300'
                                  : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
                            }`}
                          >
                            {permissionBadgeLabel}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-slate-400">
                            {metadata?.permissions?.length
                              ? `${metadata.permissions.length} scope(s)`
                              : 'default deployment inference scope'}
                          </span>
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${status.className}`}
                          >
                            {status.label}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void handleCopyCurlForToken(token)}
                            className="inline-flex items-center gap-1 rounded-md border border-emerald-200 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/30 dark:text-emerald-300 dark:hover:bg-emerald-500/10"
                            title="Скопировать готовый cURL-запрос для этого токена"
                          >
                            {copiedCurlTokenId === token.id ? (
                              <>
                                <Check className="h-3.5 w-3.5" />
                                Copied
                              </>
                            ) : (
                              <>
                                <Copy className="h-3.5 w-3.5" />
                                Copy cURL
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setCurlHintToken(token);
                              setCurlCommandCopied(false);
                            }}
                            className="inline-flex items-center gap-1 rounded-md border border-indigo-200 px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-50 dark:border-indigo-500/30 dark:text-indigo-300 dark:hover:bg-indigo-500/10"
                            title="Показать пример cURL-запроса к модели через этот токен"
                          >
                            <Code2 className="h-3.5 w-3.5" />
                            cURL
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleRevoke(token)}
                            disabled={isRevokeDisabled}
                            className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-500/30 dark:text-red-300 dark:hover:bg-red-500/10"
                          >
                            {revokingTokenId === token.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                            Revoke
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/70 p-4 pt-10 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-950 text-slate-100 shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-800 px-6 py-5">
              <div>
                <h3 className="text-xl font-semibold">Create Access Token</h3>
                <p className="mt-1 text-sm text-slate-400">
                  Deployment: {selectedDeployment?.crd_name || 'not selected'}
                </p>
              </div>
              <button
                type="button"
                onClick={closeCreateModal}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                aria-label="Close create token modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-6 px-6 py-5">
              {errorMessage && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                  {errorMessage}
                </div>
              )}

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-200">
                  Token type
                </label>
                <div className="inline-flex rounded-xl border border-slate-700 bg-slate-900 p-1">
                  {(['fine-grained', 'read', 'write'] as const).map((type) => {
                    const active = tokenTypeDraft === type;
                    const label =
                      type === 'fine-grained'
                        ? 'Fine-grained'
                        : type === 'read'
                          ? 'Read'
                          : 'Write';
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => {
                          setTokenTypeDraft(type);
                          if (type === 'read') {
                            setSelectedPermissionIds([...READ_PERMISSIONS]);
                          } else if (type === 'write') {
                            setSelectedPermissionIds([...WRITE_PERMISSIONS]);
                          } else if (selectedPermissionIds.length === 0) {
                            setSelectedPermissionIds([...FINE_GRAINED_DEFAULT_PERMISSIONS]);
                          }
                        }}
                        className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                          active
                            ? 'bg-white text-slate-900'
                            : 'text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-sm text-slate-400">
                  This cannot be changed after token creation.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-200">
                    Token name
                  </label>
                  <input
                    type="text"
                    value={tokenNameDraft}
                    onChange={(event) => setTokenNameDraft(event.target.value)}
                    maxLength={80}
                    placeholder="Token name"
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-indigo-400"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-200">
                    TTL (days)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={ttlDaysDraft}
                    onChange={(event) =>
                      setTtlDaysDraft(
                        Math.max(1, Number.parseInt(event.target.value || '1', 10))
                      )
                    }
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-indigo-400"
                  />
                  <p className="mt-2 text-xs text-slate-400">
                    Default: {DEFAULT_TOKEN_TTL_DAYS} days. The UI will convert this value to
                    minutes for the API automatically.
                  </p>
                </div>
              </div>

              <div>
                <h4 className="mb-3 text-lg font-semibold text-slate-100">
                  User permissions ({selectedDeployment?.team || 'team'})
                </h4>
                <div className="grid gap-5 md:grid-cols-2">
                  {PERMISSION_GROUPS.map((group) => (
                    <div
                      key={group.title}
                      className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"
                    >
                      <h5 className="mb-3 font-semibold text-slate-100">{group.title}</h5>
                      <div className="space-y-2">
                        {group.options.map((option) => {
                          const checked = resolvedDraftPermissions.includes(option.id);
                          const disabled = tokenTypeDraft !== 'fine-grained';
                          return (
                            <label
                              key={option.id}
                              className={`flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-sm ${
                                disabled ? 'opacity-70' : 'hover:bg-slate-800/80'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={disabled}
                                onChange={() => togglePermission(option.id)}
                                className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-950 text-indigo-500"
                              />
                              <span className="leading-5 text-slate-200">
                                {option.label}
                                {option.hint && (
                                  <span className="ml-1 text-xs text-slate-400">{option.hint}</span>
                                )}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                {tokenTypeDraft !== 'fine-grained' && (
                  <p className="mt-3 text-xs text-slate-400">
                    Для типов <strong>Read</strong> и <strong>Write</strong> permissions
                    фиксированы пресетом.
                  </p>
                )}
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 text-indigo-300" />
                  <div className="text-sm text-slate-300">
                    <p className="font-medium text-slate-100">Effective permissions</p>
                    <p className="mt-1 text-slate-300">{selectedPermissionLabelText}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-slate-800 px-6 py-4">
              <p className="min-h-5 text-xs text-amber-300">{createTokenValidationMessage || ''}</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={closeCreateModal}
                  className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleCreateToken()}
                  disabled={isCreateTokenDisabled}
                  title={
                    isCreateTokenDisabled
                      ? isCreating
                        ? 'Создание токена...'
                        : createTokenValidationMessage || 'Кнопка недоступна'
                      : 'Создать токен'
                  }
                  className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${
                    isCreateTokenDisabled
                      ? 'cursor-not-allowed border border-slate-600 bg-slate-700 text-slate-400'
                      : 'bg-indigo-600 text-white hover:bg-indigo-500'
                  }`}
                >
                  {isCreating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  Create token
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {curlHintToken && selectedDeployment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-xl border border-gray-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-950">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-slate-800">
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                  cURL-подсказка для токена
                </h3>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">
                  Prefix: {curlHintToken.token_prefix} | Deployment: {selectedDeployment.crd_name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCurlHintToken(null)}
                className="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                aria-label="Закрыть подсказку"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 p-5">
              {!createdPlainToken?.startsWith(curlHintToken.token_prefix) && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                  Полный токен в базе не хранится. Вставьте реальный токен вручную вместо
                  <span className="mx-1 font-mono">{'<PASTE_TECHNICAL_TOKEN_HERE>'}</span>.
                </div>
              )}
              <pre className="max-h-[50vh] overflow-auto rounded-lg bg-slate-900 px-4 py-3 text-xs text-slate-100">
                {curlCommand}
              </pre>
              <div className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => void handleCopyCurlCommand()}
                  className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  {curlCommandCopied ? (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      Скопировано
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      Копировать cURL
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(pendingRevokeToken)}
        title="Отозвать технический токен?"
        description={
          pendingRevokeToken
            ? `Токен ${pendingRevokeToken.token_prefix} перестанет работать немедленно.`
            : undefined
        }
        confirmLabel="Отозвать"
        cancelLabel="Отмена"
        variant="warning"
        isLoading={Boolean(revokingTokenId)}
        onCancel={() => setPendingRevokeToken(null)}
        onConfirm={confirmRevoke}
      />
    </div>
  );
}
