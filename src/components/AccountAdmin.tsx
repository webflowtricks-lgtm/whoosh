import React, { useEffect, useMemo, useState } from 'react';
import {
  AtSign,
  CalendarClock,
  Check,
  KeyRound,
  Mail,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  Users,
} from 'lucide-react';
import { configFetch } from '../lib/api';
import { useLanguage } from '../lib/i18n';

interface AdminAccount {
  username: string;
  name: string;
  email: string;
  passwordLoginEnabled: boolean;
  googleLinked: boolean;
  createdAt?: string;
}

interface AccountDraft {
  username: string;
  name: string;
  email: string;
  password: string;
}

type AccountTab = 'all' | 'new';

export default function AccountAdmin() {
  const { t, language } = useLanguage();
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [drafts, setDrafts] = useState<Record<string, AccountDraft>>({});
  const [activeTab, setActiveTab] = useState<AccountTab>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingUsername, setSavingUsername] = useState('');
  const [deletingUsername, setDeletingUsername] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadAccounts = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await configFetch('/api/admin/accounts');
      const result = await response.json().catch(() => null) as {
        success?: boolean;
        error?: string;
        accounts?: AdminAccount[];
      } | null;
      if (!response.ok || !result?.success || !Array.isArray(result.accounts)) {
        throw new Error(result?.error || t('Não foi possível carregar as contas.', 'Could not load accounts.'));
      }
      setAccounts(result.accounts);
      setDrafts(Object.fromEntries(result.accounts.map(account => [
        account.username,
        {
          username: account.username,
          name: account.name,
          email: account.email || '',
          password: '',
        },
      ])));
    } catch (cause) {
      console.error('Falha ao carregar contas administrativas:', cause);
      setError(cause instanceof Error ? cause.message : t('Não foi possível carregar as contas.', 'Could not load accounts.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAccounts();
  }, []);

  const sortedAccounts = useMemo(
    () => [...accounts].sort((a, b) => Date.parse(b.createdAt || '') - Date.parse(a.createdAt || '')),
    [accounts],
  );
  const filteredAccounts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return sortedAccounts.filter(account =>
      (!query || `${account.username} ${account.name} ${account.email || ''}`.toLowerCase().includes(query)),
    );
  }, [search, sortedAccounts]);

  const updateDraft = (username: string, change: Partial<AccountDraft>) => {
    setDrafts(current => ({
      ...current,
      [username]: { ...current[username], ...change },
    }));
    setSuccess('');
  };

  const saveAccount = async (account: AdminAccount) => {
    const draft = drafts[account.username];
    if (!draft || !draft.username.trim() || !draft.name.trim()) {
      setError(t('ID e nome de usuário são obrigatórios.', 'Account ID and display name are required.'));
      return;
    }
    if (draft.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim())) {
      setError(t('Informe um e-mail válido.', 'Enter a valid email address.'));
      return;
    }
    setSavingUsername(account.username);
    setError('');
    setSuccess('');
    try {
      const response = await configFetch('/api/admin/accounts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: account.username,
          newUsername: draft.username,
          name: draft.name,
          email: draft.email,
          ...(draft.password ? { password: draft.password } : {}),
        }),
      });
      const result = await response.json().catch(() => null) as { success?: boolean; error?: string } | null;
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || t('Não foi possível atualizar a conta.', 'Could not update the account.'));
      }
      if (account.username === '2' && draft.password) {
        setSuccess(t(
          'Senha do administrador alterada. A sessão foi encerrada; entre novamente com a nova senha.',
          'Administrator password changed. The session was ended; sign in again with the new password.',
        ));
        return;
      }
      setSuccess(t('Conta atualizada. Alterações de ID ou senha encerram as sessões existentes.', 'Account updated. ID or password changes end existing sessions.'));
      await loadAccounts();
    } catch (cause) {
      console.error('Falha ao atualizar conta:', cause);
      setError(cause instanceof Error ? cause.message : t('Não foi possível atualizar a conta.', 'Could not update the account.'));
    } finally {
      setSavingUsername('');
    }
  };

  const deleteAccount = async (account: AdminAccount) => {
    if (!window.confirm(t(
      `Tem certeza que deseja apagar a conta "${account.username}"? Esta ação não pode ser desfeita.`,
      `Are you sure you want to delete account "${account.username}"? This cannot be undone.`,
    ))) return;
    setDeletingUsername(account.username);
    setError('');
    setSuccess('');
    try {
      const response = await configFetch('/api/admin/accounts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: account.username }),
      });
      const result = await response.json().catch(() => null) as { success?: boolean; error?: string } | null;
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || t('Não foi possível apagar a conta.', 'Could not delete the account.'));
      }
      setSuccess(t('Conta apagada.', 'Account deleted.'));
      await loadAccounts();
    } catch (cause) {
      console.error('Falha ao apagar conta:', cause);
      setError(cause instanceof Error ? cause.message : t('Não foi possível apagar a conta.', 'Could not delete the account.'));
    } finally {
      setDeletingUsername('');
    }
  };

  const displayedAccounts = activeTab === 'new' ? filteredAccounts.slice(0, 20) : filteredAccounts;
  const locale = language === 'pt' ? 'pt-BR' : 'en-US';
  const passwordCount = accounts.filter(account => account.passwordLoginEnabled).length;
  const googleCount = accounts.filter(account => account.googleLinked).length;
  const emailCount = accounts.filter(account => Boolean(account.email)).length;
  const metrics = [
    { label: t('Total de contas', 'Total accounts'), value: accounts.length, icon: Users, color: 'text-sky-300' },
    { label: t('Acesso por senha', 'Password access'), value: passwordCount, icon: KeyRound, color: 'text-amber-300' },
    { label: t('Google vinculado', 'Google linked'), value: googleCount, icon: ShieldCheck, color: 'text-emerald-300' },
    { label: t('Com e-mail', 'With email'), value: emailCount, icon: Mail, color: 'text-violet-300' },
  ];

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 p-4 md:p-6">
      <section className="relative overflow-hidden rounded-3xl border border-sky-500/15 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950/80 p-5 shadow-2xl shadow-black/20 sm:p-7">
        <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-sky-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 left-1/3 h-56 w-56 rounded-full bg-violet-500/10 blur-3xl" />

        <header className="relative mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <div className="mb-2 flex items-center gap-2">
              <span className="rounded-lg border border-sky-400/20 bg-sky-400/10 p-2 text-sky-300">
                <Users className="h-5 w-5" />
              </span>
              <h2 className="font-mono text-lg font-bold uppercase tracking-wider text-white sm:text-xl">
                {t('Gerenciar contas', 'Manage accounts')}
              </h2>
            </div>
            <p className="text-sm leading-relaxed text-slate-400">
              {t(
                'Edite o ID, nome, e-mail administrativo e senha. O acesso é identificado como ID/senha e/ou Google; senhas atuais nunca são exibidas.',
                'Edit the ID, display name, contact email, and password. Sign-in is shown as ID/password and/or Google; current passwords are never displayed.',
              )}
            </p>
            <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-slate-500">
              <AtSign className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {t(
                'O e-mail é um dado administrativo e não altera o e-mail verificado da conta Google.',
                'The email is an administrative contact and does not change the Google account’s verified email.',
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadAccounts()}
            disabled={loading}
            className="flex min-h-10 items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/70 px-3 text-xs font-bold text-slate-300 transition hover:border-slate-500 hover:text-white disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {t('Atualizar', 'Refresh')}
          </button>
        </header>

        <div className="relative mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
          {metrics.map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="rounded-2xl border border-white/5 bg-slate-950/45 p-3.5 sm:p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 sm:text-xs">{label}</span>
                <Icon className={`h-4 w-4 ${color}`} />
              </div>
              <span className="font-mono text-2xl font-bold text-white">{value}</span>
            </div>
          ))}
        </div>

        <div className="relative mb-4 flex flex-col gap-3 rounded-2xl border border-white/5 bg-black/15 p-3 sm:flex-row sm:items-center">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`min-h-10 rounded-xl border px-3.5 text-xs font-bold uppercase tracking-wide transition ${activeTab === 'all' ? 'border-sky-400/60 bg-sky-500/15 text-sky-200' : 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-white'}`}
            >
              {t('Todas as contas', 'All accounts')} <span className="ml-1 opacity-70">{accounts.length}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('new')}
              className={`min-h-10 rounded-xl border px-3.5 text-xs font-bold uppercase tracking-wide transition ${activeTab === 'new' ? 'border-emerald-400/60 bg-emerald-500/15 text-emerald-200' : 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-white'}`}
            >
              {t('Novos usuários', 'New users')}
            </button>
          </div>
          <label className="flex min-h-10 w-full items-center gap-2 rounded-xl border border-slate-700 bg-slate-950/80 px-3 transition focus-within:border-sky-500 sm:ml-auto sm:max-w-sm">
            <Search className="h-4 w-4 shrink-0 text-slate-500" />
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder={t('Buscar por ID, nome ou e-mail...', 'Search ID, name, or email...')}
              aria-label={t('Buscar contas', 'Search accounts')}
              className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-600"
            />
          </label>
        </div>

        {(error || success) && (
          <p role={error ? 'alert' : 'status'} className={`relative mb-4 flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm ${error ? 'border-red-500/40 bg-red-950/30 text-red-300' : 'border-emerald-500/40 bg-emerald-950/30 text-emerald-300'}`}>
            {!error && <Check className="h-4 w-4 shrink-0" />}
            {error || success}
          </p>
        )}

        {loading ? (
          <p className="relative py-10 text-center text-sm text-slate-400">{t('Carregando contas...', 'Loading accounts...')}</p>
        ) : displayedAccounts.length === 0 ? (
          <p className="relative py-10 text-center text-sm text-slate-500">{t('Nenhuma conta encontrada.', 'No accounts found.')}</p>
        ) : (
          <div className="relative space-y-3">
            {displayedAccounts.map(account => {
              const draft = drafts[account.username] || {
                username: account.username,
                name: account.name,
                email: account.email || '',
                password: '',
              };
              const isSaving = savingUsername === account.username;
              const isDeleting = deletingUsername === account.username;
              const createdAt = account.createdAt ? new Date(account.createdAt) : null;
              const formattedDate = createdAt && Number.isFinite(createdAt.getTime())
                ? createdAt.toLocaleString(locale)
                : t('Data indisponível', 'Date unavailable');
              const isDirty = draft.username !== account.username ||
                draft.name !== account.name ||
                draft.email !== (account.email || '') ||
                Boolean(draft.password);
              return (
                <article key={account.username} className="overflow-hidden rounded-2xl border border-slate-800/90 bg-slate-950/65 p-4 transition hover:border-slate-700 sm:p-5">
                  <div className="mb-4 flex flex-col gap-3 border-b border-white/5 pb-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-sky-400/15 bg-gradient-to-br from-sky-500/20 to-indigo-500/20 font-mono text-lg font-bold text-sky-200">
                        {(draft.name || account.username).trim().charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <h3 className="truncate font-mono text-sm font-bold text-white">{account.username}</h3>
                          {account.username === '2' && (
                            <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-200">
                              {t('Administrador', 'Administrator')}
                            </span>
                          )}
                        </div>
                        <p className="truncate text-xs text-slate-400">{account.name || t('Sem nome de exibição', 'No display name')}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold ${account.passwordLoginEnabled ? 'border-amber-400/20 bg-amber-400/10 text-amber-200' : 'border-slate-700 bg-slate-800/60 text-slate-500'}`}>
                        <KeyRound className="h-3 w-3" />
                        {account.passwordLoginEnabled ? t('Senha ativa', 'Password enabled') : t('Sem senha', 'No password')}
                      </span>
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold ${account.email ? 'border-violet-400/20 bg-violet-400/10 text-violet-200' : 'border-slate-700 bg-slate-800/60 text-slate-500'}`}>
                        <Mail className="h-3 w-3" />
                        {account.email ? t('E-mail cadastrado', 'Email on file') : t('Sem e-mail', 'No email')}
                      </span>
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold ${account.googleLinked ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200' : 'border-slate-700 bg-slate-800/60 text-slate-500'}`}>
                        <ShieldCheck className="h-3 w-3" />
                        {account.googleLinked ? t('Google vinculado', 'Google linked') : t('Google não vinculado', 'Google not linked')}
                      </span>
                    </div>
                  </div>

                  <div className="mb-4 flex items-center gap-1.5 text-[10px] text-slate-500">
                    <CalendarClock className="h-3.5 w-3.5 text-sky-400" />
                    {t('Cadastrado em', 'Registered on')} {formattedDate}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1.2fr_1.4fr_1fr_auto]">
                    <label className="block min-w-0">
                      <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">{t('ID de acesso', 'Login ID')}</span>
                      <input
                        value={draft.username}
                        onChange={event => updateDraft(account.username, { username: event.target.value })}
                        maxLength={100}
                        autoComplete="off"
                        className="min-h-10 w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 text-sm text-white outline-none transition focus:border-sky-500"
                      />
                    </label>
                    <label className="block min-w-0">
                      <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">{t('Nome de usuário', 'Display name')}</span>
                      <input
                        value={draft.name}
                        onChange={event => updateDraft(account.username, { name: event.target.value })}
                        maxLength={100}
                        className="min-h-10 w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 text-sm text-white outline-none transition focus:border-sky-500"
                      />
                    </label>
                    <label className="block min-w-0">
                      <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">{t('E-mail da conta', 'Account email')}</span>
                      <input
                        type="email"
                        value={draft.email}
                        onChange={event => updateDraft(account.username, { email: event.target.value })}
                        maxLength={254}
                        autoComplete="off"
                        placeholder={t('Sem e-mail cadastrado', 'No email on file')}
                        className="min-h-10 w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 text-sm text-white outline-none transition focus:border-sky-500"
                      />
                    </label>
                    <label className="block min-w-0">
                      <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">{t('Nova senha (opcional)', 'New password (optional)')}</span>
                      <input
                        type="password"
                        value={draft.password}
                        onChange={event => updateDraft(account.username, { password: event.target.value })}
                        maxLength={256}
                        autoComplete="new-password"
                        className="min-h-10 w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 text-sm text-white outline-none transition focus:border-sky-500"
                      />
                    </label>
                    <div className="flex items-end gap-2 sm:col-span-2 xl:col-span-1">
                      <button
                        type="button"
                        onClick={() => void saveAccount(account)}
                        disabled={!isDirty || loading || isSaving || isDeleting}
                        className="flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-sky-600 px-3 text-xs font-extrabold uppercase tracking-wide text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Save className="h-4 w-4" />
                        {isSaving ? t('Salvando...', 'Saving...') : t('Salvar', 'Save')}
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteAccount(account)}
                        disabled={account.username === '2' || loading || isSaving || isDeleting}
                        title={account.username === '2' ? t('A conta administradora não pode ser apagada.', 'The administrator account cannot be deleted.') : t('Apagar conta', 'Delete account')}
                        className="flex min-h-10 items-center justify-center gap-2 rounded-xl border border-red-500/30 px-3 text-xs font-bold text-red-300 transition hover:bg-red-950/40 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Trash2 className="h-4 w-4" />
                        {isDeleting ? t('Apagando...', 'Deleting...') : t('Apagar', 'Delete')}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
        {activeTab === 'new' && !loading && displayedAccounts.length > 0 && (
          <p className="relative mt-3 text-[10px] text-slate-500">
            {t('Exibindo os 20 cadastros mais recentes.', 'Showing the 20 most recent registrations.')}
          </p>
        )}
      </section>
    </main>
  );
}
