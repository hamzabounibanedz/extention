import React, { useCallback, useEffect, useMemo, useState } from 'react';

import './style.css';

const STORAGE_SECRET = 'dt_admin_secret';
const STORAGE_LANG = 'dt_admin_lang';

type AdminLang = 'ar' | 'fr' | 'en';

const ADMIN_I18N: Record<AdminLang, Record<string, string>> = {
  ar: {
    app_title: 'Delivery Tool Admin – React',
    app_subtitle:
      'إصدار الأكواد، إدارة العملاء، ومتابعة إحصائيات الاشتراك لإضافة Google Sheets.',
    lang_label: 'اللغة',
    lang_ar: 'العربية',
    lang_fr: 'Français',
    lang_en: 'English',
    access_title: 'الوصول',
    admin_secret_label: 'كلمة سر الإدارة',
    admin_secret_placeholder: 'قيمة ADMIN_SECRET',
    admin_secret_hint: 'تُخزن في sessionStorage لهذه التبويبة فقط.',
    issue_title: 'إصدار كود ترخيص',
    issue_button: 'إصدار كود',
    email_label: 'بريد Google',
    email_placeholder: 'user@gmail.com',
    issue_success: 'تم إصدار {0} ({1}).',
    list_title: 'أحدث الأكواد',
    list_refresh: 'تحديث القائمة',
    list_search_placeholder: 'تصفية الأكواد حسب البريد (اختياري)…',
    list_search_label: 'تصفية الأكواد حسب البريد',
    clients_title: 'العملاء',
    clients_reload: 'إعادة تحميل العملاء',
    clients_search_placeholder: 'تصفية حسب البريد (اختياري)…',
    clients_search_label: 'البحث في العملاء حسب البريد',
    actions_extend_title: 'تمديد الاشتراك',
    actions_revoke_title: 'إلغاء الترخيص',
    target_email_label: 'البريد',
    extend_button: 'تمديد الاشتراك',
    revoke_button: 'إلغاء الترخيص',
    extend_days_label: 'عدد الأيام',
    stats_title: 'إحصائيات الترخيص',
    stats_reload: 'إعادة تحميل الإحصائيات',
    loading: 'جاري التحميل…',
    enter_secret_codes: 'أدخل كلمة سر الإدارة لتحميل الأكواد.',
    enter_secret_clients: 'أدخل كلمة سر الإدارة لتحميل العملاء.',
    enter_secret_stats: 'أدخل كلمة سر الإدارة لتحميل الإحصائيات.',
    no_codes: 'لا توجد أكواد بعد.',
    no_clients: 'لا يوجد عملاء بعد.',
    th_code: 'الكود',
    th_client_hash: 'بصمة العميل',
    th_email: 'البريد',
    th_status: 'الحالة',
    th_created: 'تاريخ الإنشاء',
    th_expires: 'الانتهاء',
    th_plan: 'الباقة',
    th_activated: 'التفعيل',
    admin_secret_required: 'كلمة سر الإدارة مطلوبة.',
    email_required: 'البريد مطلوب.',
    email_required_extend: 'البريد مطلوب لتمديد الترخيص.',
    email_required_revoke: 'البريد مطلوب لإلغاء الترخيص.',
    days_positive: 'الأيام يجب أن تكون رقماً موجباً.',
    extended_success: 'تم تمديد {0} لمدة {1} يوم/أيام.',
    revoked_success: 'تم إلغاء ترخيص {0}.',
    revoke_confirm: 'إلغاء ترخيص {0}؟ لا يمكن التراجع.',
    stats_active: 'نشط',
    stats_trial: 'تجريبي',
    stats_expired: 'منتهي',
    stats_revoked: 'ملغي',
    stats_total: 'إجمالي السجلات',
    status_active: 'نشط',
    status_trial: 'تجريبي',
    status_expired: 'منتهي',
    status_revoked: 'ملغي',
    status_unknown: 'غير معروف',
    status_pending: 'قيد الانتظار',
    status_used: 'مستخدم',
    status_unused: 'غير مستخدم',
  },
  fr: {
    app_title: 'Delivery Tool Admin ',
    app_subtitle:
      "Émettez des codes, gérez les clients et suivez les statistiques d'abonnement pour l'add-on Sheets.",
    lang_label: 'Langue',
    lang_ar: 'العربية',
    lang_fr: 'Français',
    lang_en: 'English',
    access_title: 'Accès',
    admin_secret_label: 'Secret admin',
    admin_secret_placeholder: 'Valeur ADMIN_SECRET',
    admin_secret_hint: 'Stocké dans sessionStorage pour cet onglet uniquement.',
    issue_title: 'Émettre un code de licence',
    issue_button: 'Émettre le code',
    email_label: 'Email Google',
    email_placeholder: 'user@gmail.com',
    issue_success: 'Code {0} émis ({1}).',
    list_title: 'Codes récents',
    list_refresh: 'Actualiser la liste',
    list_search_placeholder: 'Filtrer les codes par email (optionnel)…',
    list_search_label: 'Filtrer les codes par email',
    clients_title: 'Clients',
    clients_reload: 'Recharger les clients',
    clients_search_placeholder: 'Filtrer par email (optionnel)…',
    clients_search_label: 'Rechercher un client par email',
    actions_extend_title: "Prolonger l'abonnement",
    actions_revoke_title: 'Révoquer la licence',
    target_email_label: 'Email cible',
    extend_button: "Prolonger l'abonnement",
    revoke_button: 'Révoquer la licence',
    extend_days_label: 'Jours',
    stats_title: 'Statistiques licence',
    stats_reload: 'Recharger les stats',
    loading: 'Chargement…',
    enter_secret_codes: 'Saisissez le secret admin pour charger les codes.',
    enter_secret_clients: 'Saisissez le secret admin pour charger les clients.',
    enter_secret_stats: 'Saisissez le secret admin pour charger les statistiques.',
    no_codes: 'Aucun code pour le moment.',
    no_clients: 'Aucun client pour le moment.',
    th_code: 'Code',
    th_client_hash: 'Empreinte client',
    th_email: 'Email',
    th_status: 'Statut',
    th_created: 'Créé',
    th_expires: 'Expire',
    th_plan: 'Offre',
    th_activated: 'Activé',
    admin_secret_required: 'Le secret admin est requis.',
    email_required: "L'email est requis.",
    email_required_extend: "L'email est requis pour prolonger.",
    email_required_revoke: "L'email est requis pour révoquer.",
    days_positive: 'Les jours doivent être un nombre positif.',
    extended_success: '{0} prolongé de {1} jour(s).',
    revoked_success: 'Licence révoquée pour {0}.',
    revoke_confirm: 'Révoquer la licence de {0} ? Action irréversible.',
    stats_active: 'Actifs',
    stats_trial: 'Essai',
    stats_expired: 'Expirés',
    stats_revoked: 'Révoqués',
    stats_total: 'Total lignes',
    status_active: 'Actif',
    status_trial: 'Essai',
    status_expired: 'Expiré',
    status_revoked: 'Révoqué',
    status_unknown: 'Inconnu',
    status_pending: 'En attente',
    status_used: 'Utilisé',
    status_unused: 'Non utilisé',
  },
  en: {
    app_title: 'Delivery Tool Admin',
    app_subtitle:
      'Modern admin dashboard to issue licenses, manage clients, and view subscription stats for the Sheets add-on.',
    lang_label: 'Language',
    lang_ar: 'العربية',
    lang_fr: 'Français',
    lang_en: 'English',
    access_title: 'Access',
    admin_secret_label: 'Admin secret',
    admin_secret_placeholder: 'ADMIN_SECRET value',
    admin_secret_hint: 'Stored in session storage for this browser tab only.',
    issue_title: 'Issue license code',
    issue_button: 'Issue code',
    email_label: 'Google account email',
    email_placeholder: 'user@gmail.com',
    issue_success: 'Issued {0} ({1}).',
    list_title: 'Recent codes',
    list_refresh: 'Refresh list',
    list_search_placeholder: 'Filter codes by email (optional)…',
    list_search_label: 'Filter codes by email',
    clients_title: 'Clients',
    clients_reload: 'Reload clients',
    clients_search_placeholder: 'Filter by email (optional)…',
    clients_search_label: 'Search clients by email',
    actions_extend_title: 'Extend subscription',
    actions_revoke_title: 'Revoke license',
    target_email_label: 'Target email',
    extend_button: 'Extend subscription',
    revoke_button: 'Revoke license',
    extend_days_label: 'Days',
    stats_title: 'License stats',
    stats_reload: 'Reload stats',
    loading: 'Loading…',
    enter_secret_codes: 'Enter admin secret to load codes.',
    enter_secret_clients: 'Enter admin secret to load clients.',
    enter_secret_stats: 'Enter admin secret to load stats.',
    no_codes: 'No codes yet.',
    no_clients: 'No clients yet.',
    th_code: 'Code',
    th_client_hash: 'Client hash',
    th_email: 'Email',
    th_status: 'Status',
    th_created: 'Created',
    th_expires: 'Expires',
    th_plan: 'Plan',
    th_activated: 'Activated',
    admin_secret_required: 'Admin secret is required.',
    email_required: 'Email is required.',
    email_required_extend: 'Email is required to extend a license.',
    email_required_revoke: 'Email is required to revoke a license.',
    days_positive: 'Days must be a positive number.',
    extended_success: 'Extended {0} by {1} day(s).',
    revoked_success: 'Revoked license for {0}.',
    revoke_confirm: 'Revoke license for {0}? This cannot be undone.',
    stats_active: 'Active',
    stats_trial: 'Trial',
    stats_expired: 'Expired',
    stats_revoked: 'Revoked',
    stats_total: 'Total rows',
    status_active: 'Active',
    status_trial: 'Trial',
    status_expired: 'Expired',
    status_revoked: 'Revoked',
    status_unknown: 'Unknown',
    status_pending: 'Pending',
    status_used: 'Used',
    status_unused: 'Unused',
  },
};

type LicenseItem = {
  id: string;
  code: string;
  createdAt: string;
  durationDays: number;
  notes: string | null;
  activatedAt: string | null;
  activatedBy: string | null;
  revoked: boolean;
  revokedAt: string | null;
  status: string;
};

type ClientRow = {
  user_email_hmac: string;
  google_email: string | null;
  revoked: boolean;
  activated_at: string | null;
  expires_at: string | null;
  plan: string | null;
};

type AdminStats = {
  active: number;
  expired: number;
  revoked: number;
  trial: number;
  total: number;
};

function detectLang(): AdminLang {
  const raw = (navigator.language || 'en').toLowerCase();
  if (raw.startsWith('ar')) return 'ar';
  if (raw.startsWith('fr')) return 'fr';
  return 'en';
}

function getInitialLang(): AdminLang {
  const saved = localStorage.getItem(STORAGE_LANG);
  if (saved === 'ar' || saved === 'fr' || saved === 'en') {
    return saved;
  }
  return detectLang();
}

function t(lang: AdminLang, key: string, ...args: Array<string | number>): string {
  const dict = ADMIN_I18N[lang] ?? ADMIN_I18N.en;
  const base = dict[key] ?? ADMIN_I18N.en[key] ?? key;
  return base.replace(/\{(\d+)\}/g, (_m, i) => String(args[Number(i)] ?? ''));
}

function statusToken(raw: string | null | undefined): string {
  return (raw ?? 'unknown').toString().trim().toLowerCase() || 'unknown';
}

function statusLabel(lang: AdminLang, raw: string | null | undefined): string {
  const token = statusToken(raw);
  const map: Record<string, string> = {
    active: 'status_active',
    trial: 'status_trial',
    expired: 'status_expired',
    revoked: 'status_revoked',
    pending: 'status_pending',
    used: 'status_used',
    unused: 'status_unused',
    unknown: 'status_unknown',
  };
  return t(lang, map[token] ?? 'status_unknown');
}

function getSecretFromStorage(): string {
  return sessionStorage.getItem(STORAGE_SECRET)?.trim() ?? '';
}

function setSecretInStorage(value: string): void {
  const v = value.trim();
  if (v) {
    sessionStorage.setItem(STORAGE_SECRET, v);
  } else {
    sessionStorage.removeItem(STORAGE_SECRET);
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const secret = getSecretFromStorage();
  const headers = new Headers(init?.headers);
  headers.set('X-Admin-Secret', secret);
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(path, { ...init, headers });
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      data = { message: text };
    }
  }
  if (!res.ok) {
    let msg = res.statusText || `HTTP ${res.status}`;
    if (data && typeof data === 'object' && data !== null) {
      const errObj = data as Record<string, unknown>;
      if (typeof errObj.message === 'string' && errObj.message.trim() !== '') {
        msg = errObj.message;
      } else if (typeof errObj.error === 'string' && errObj.error.trim() !== '') {
        msg = errObj.error;
      } else if (typeof errObj.code === 'string' && errObj.code.trim() !== '') {
        msg = errObj.code;
      }
    }
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return data as T;
}

type MessageState = { type: 'error' | 'success'; text: string } | null;

const Header: React.FC<{
  lang: AdminLang;
  onChangeLang: (lang: AdminLang) => void;
}> = ({ lang, onChangeLang }) => {
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.title = t(lang, 'app_title');
  }, [lang]);

  return (
    <header className="bg-dt-surface border-b border-dt-border shadow-sm">
      <div className="max-w-6xl mx-auto px-6 py-4 flex flex-row gap-2 items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-dt-text">
            {t(lang, 'app_title')}
          </h1>
        </div>

        <div className="inline-flex items-center gap-2">
          <label htmlFor="admin-lang" className="text-xs font-medium text-dt-text-secondary">
            {t(lang, 'lang_label')}
          </label>
          <select
            id="admin-lang"
            className="rounded-dt-sm border border-dt-border bg-dt-surface px-2 py-1 text-sm text-dt-text"
            value={lang}
            onChange={(e) => onChangeLang(e.target.value as AdminLang)}
          >
            <option value="ar">{t(lang, 'lang_ar')}</option>
            <option value="fr">{t(lang, 'lang_fr')}</option>
            <option value="en">{t(lang, 'lang_en')}</option>
          </select>
        </div>
      </div>
    </header>
  );
};

const TextField: React.FC<
  React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }
> = ({ label, hint, ...props }) => (
  <div className="space-y-1">
    <label
      htmlFor={props.id}
      className="block text-xs font-semibold uppercase tracking-wide text-dt-text-secondary"
    >
      {label}
    </label>
    <input
      {...props}
      className={`w-full rounded-dt-sm border border-dt-border bg-dt-surface px-2.5 py-2 text-sm text-dt-text outline-none focus:border-dt-accent focus:ring-2 focus:ring-dt-accent/40 ${
        props.className ?? ''
      }`}
    />
    {hint ? <p className="text-xs text-dt-text-secondary">{hint}</p> : null}
  </div>
);

const PrimaryButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({
  className,
  children,
  ...props
}) => (
  <button
    {...props}
    className={`inline-flex items-center justify-center rounded-dt-sm border border-dt-accent bg-dt-accent px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-dt-accent-hover disabled:cursor-not-allowed disabled:opacity-60 ${className ?? ''}`}
  >
    {children}
  </button>
);

const SecondaryButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({
  className,
  children,
  ...props
}) => (
  <button
    {...props}
    className={`inline-flex items-center justify-center rounded-dt-sm border border-dt-border bg-dt-surface px-3 py-2 text-sm font-medium text-dt-text transition hover:bg-dt-surface-elevated disabled:cursor-not-allowed disabled:opacity-60 ${className ?? ''}`}
  >
    {children}
  </button>
);

const DangerButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({
  className,
  children,
  ...props
}) => (
  <button
    {...props}
    className={`inline-flex items-center justify-center rounded-dt-sm border border-dt-danger/60 bg-white px-3 py-2 text-sm font-medium text-dt-danger transition hover:bg-dt-danger hover:text-white disabled:cursor-not-allowed disabled:opacity-60 ${className ?? ''}`}
  >
    {children}
  </button>
);

const Panel: React.FC<{ title: string; children: React.ReactNode; className?: string }> = ({
  title,
  children,
  className,
}) => (
  <section
    className={`rounded-dt border border-dt-border bg-dt-surface shadow-sm ${className ?? ''}`}
  >
    <div className="border-b border-dt-border/70 px-4 py-3">
      <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-dt-text-secondary">
        {title}
      </h2>
    </div>
    <div className="px-4 py-4">{children}</div>
  </section>
);

const Message: React.FC<{ state: MessageState }> = ({ state }) => {
  if (!state) return null;
  const base =
    state.type === 'error'
      ? 'text-dt-danger bg-red-50 border-red-100'
      : 'text-dt-success bg-emerald-50 border-emerald-100';
  return (
    <p className={`mt-3 rounded-md border px-3 py-2 text-sm ${base}`}>
      {state.text}
    </p>
  );
};

const badgeClassMap: Record<string, string> = {
  active: 'bg-emerald-50 text-dt-success border-emerald-200',
  trial: 'bg-amber-50 text-dt-warning border-amber-200',
  expired: 'bg-gray-100 text-dt-text-secondary border-gray-200',
  revoked: 'bg-red-50 text-dt-danger border-red-200',
  unknown: 'bg-gray-50 text-dt-text-secondary border-gray-200',
  pending: 'bg-blue-50 text-dt-accent border-blue-200',
  used: 'bg-emerald-50 text-dt-success border-emerald-200',
  unused: 'bg-gray-50 text-dt-text-secondary border-gray-200',
};

const StatusBadge: React.FC<{ token: string; label: string }> = ({ token, label }) => {
  const cls = badgeClassMap[token] ?? badgeClassMap.unknown;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {label}
    </span>
  );
};

const App: React.FC = () => {
  const [lang, setLang] = useState<AdminLang>(() => getInitialLang());
  const [secret, setSecret] = useState<string>(() => getSecretFromStorage());

  const [issueEmail, setIssueEmail] = useState('');
  const [issueLoading, setIssueLoading] = useState(false);
  const [issueMessage, setIssueMessage] = useState<MessageState>(null);

  const [codes, setCodes] = useState<LicenseItem[] | null>(null);
  const [codesLoading, setCodesLoading] = useState(false);
  const [codesError, setCodesError] = useState<string | null>(null);
  const [codesSearch, setCodesSearch] = useState('');

  const [clients, setClients] = useState<ClientRow[] | null>(null);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [clientsError, setClientsError] = useState<string | null>(null);
  const [clientsMessage, setClientsMessage] = useState<MessageState>(null);
  const [clientsSearch, setClientsSearch] = useState('');

  const [extendEmail, setExtendEmail] = useState('');
  const [extendDays, setExtendDays] = useState('365');
  const [extendLoading, setExtendLoading] = useState(false);

  const [revokeEmail, setRevokeEmail] = useState('');
  const [revokeLoading, setRevokeLoading] = useState(false);

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_LANG, lang);
  }, [lang]);

  useEffect(() => {
    setSecretInStorage(secret);
  }, [secret]);

  const canQuery = secret.trim().length > 0;

  const loadCodes = useCallback(async () => {
    setCodesError(null);
    setIssueMessage(null);
    if (!canQuery) {
      setCodes(null);
      return;
    }
    setCodesLoading(true);
    try {
      const search = codesSearch.trim();
      const qs = search ? `&search=${encodeURIComponent(search)}` : '';
      const data = await api<{ items: LicenseItem[] }>(
        `/admin/v1/license-codes?limit=50${qs}`,
      );
      setCodes(data.items ?? []);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setCodesError(m);
      setCodes(null);
    } finally {
      setCodesLoading(false);
    }
  }, [canQuery, codesSearch]);

  const loadClients = useCallback(async () => {
    setClientsError(null);
    setClientsMessage(null);
    if (!canQuery) {
      setClients(null);
      return;
    }
    setClientsLoading(true);
    try {
      const search = clientsSearch.trim();
      const qs = search ? `?search=${encodeURIComponent(search)}` : '';
      const data = await api<{ clients: ClientRow[] }>(`/admin/v1/clients${qs}`);
      setClients(data.clients ?? []);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setClientsError(m);
      setClients(null);
    } finally {
      setClientsLoading(false);
    }
  }, [canQuery, clientsSearch]);

  const loadStats = async () => {
    setStatsError(null);
    if (!canQuery) {
      setStats(null);
      return;
    }
    setStatsLoading(true);
    try {
      const data = await api<AdminStats>('/admin/v1/stats');
      setStats(data);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setStatsError(m);
      setStats(null);
    } finally {
      setStatsLoading(false);
    }
  };

  useEffect(() => {
    if (!canQuery) {
      setStats(null);
      return;
    }
    void loadStats();
  }, [canQuery]);

  useEffect(() => {
    if (!canQuery) {
      setClients(null);
      return;
    }
    const delay = clientsSearch === '' ? 0 : 250;
    const id = window.setTimeout(() => {
      void loadClients();
    }, delay);
    return () => window.clearTimeout(id);
  }, [canQuery, clientsSearch, loadClients]);

  useEffect(() => {
    if (!canQuery) {
      setCodes(null);
      return;
    }
    const delay = codesSearch === '' ? 0 : 250;
    const id = window.setTimeout(() => {
      void loadCodes();
    }, delay);
    return () => window.clearTimeout(id);
  }, [canQuery, codesSearch, loadCodes]);

  const handleIssueCode = async () => {
    setIssueMessage(null);
    if (!canQuery) {
      setIssueMessage({ type: 'error', text: t(lang, 'admin_secret_required') });
      return;
    }
    const email = issueEmail.trim();
    if (!email) {
      setIssueMessage({ type: 'error', text: t(lang, 'email_required') });
      return;
    }
    setIssueLoading(true);
    try {
      const created = await api<{
        code: string;
        id: string;
        createdAt: string;
        durationDays: number;
        notes: string | null;
        activatedAt: string | null;
        revoked: boolean;
        status: string;
      }>('/admin/v1/license-codes', {
        method: 'POST',
        body: JSON.stringify({ durationDays: 365, googleEmail: email }),
      });
      setIssueMessage({
        type: 'success',
        text: t(
          lang,
          'issue_success',
          created.code,
          statusLabel(lang, created.status || 'pending'),
        ),
      });
      setIssueEmail('');
      await loadCodes();
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setIssueMessage({ type: 'error', text: m });
    } finally {
      setIssueLoading(false);
    }
  };

  const handleExtend = async () => {
    setClientsError(null);
    setClientsMessage(null);
    if (!canQuery) {
      setClientsError(t(lang, 'admin_secret_required'));
      return;
    }
    const email = extendEmail.trim();
    const days = Number(extendDays || '0');
    if (!email) {
      setClientsError(t(lang, 'email_required_extend'));
      return;
    }
    if (!Number.isFinite(days) || days <= 0) {
      setClientsError(t(lang, 'days_positive'));
      return;
    }
    setExtendLoading(true);
    try {
      await api('/admin/v1/licenses/extend', {
        method: 'POST',
        body: JSON.stringify({ email, days }),
      });
      setClientsMessage({
        type: 'success',
        text: t(lang, 'extended_success', email, days),
      });
      await loadClients();
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setClientsError(m);
    } finally {
      setExtendLoading(false);
    }
  };

  const handleRevoke = async () => {
    setClientsError(null);
    setClientsMessage(null);
    if (!canQuery) {
      setClientsError(t(lang, 'admin_secret_required'));
      return;
    }
    const email = revokeEmail.trim();
    if (!email) {
      setClientsError(t(lang, 'email_required_revoke'));
      return;
    }
    const confirmed = window.confirm(t(lang, 'revoke_confirm', email));
    if (!confirmed) return;

    setRevokeLoading(true);
    try {
      await api('/admin/v1/licenses/revoke', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setClientsMessage({
        type: 'success',
        text: t(lang, 'revoked_success', email),
      });
      await loadClients();
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setClientsError(m);
    } finally {
      setRevokeLoading(false);
    }
  };

  const totalLicenses = useMemo(() => {
    if (!stats) return 0;
    if (Number.isFinite(stats.total)) return stats.total;
    return stats.active + stats.expired + stats.revoked;
  }, [stats]);

  return (
    <div className="min-h-screen bg-dt-base font-dt text-dt-text">
      <Header
        lang={lang}
        onChangeLang={(next) => {
          setLang(next);
        }}
      />

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] items-start">
          <div className="space-y-4">
            <Panel title={t(lang, 'access_title')}>
              <div className="space-y-3">
                <TextField
                  id="admin-secret"
                  type="password"
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  placeholder={t(lang, 'admin_secret_placeholder')}
                  label={t(lang, 'admin_secret_label')}
                  autoComplete="off"
                  hint={t(lang, 'admin_secret_hint')}
                />
              </div>
            </Panel>

            <Panel title={t(lang, 'stats_title')}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-dt-text-secondary">
                  {canQuery ? t(lang, 'stats_title') : t(lang, 'enter_secret_stats')}
                </p>
                <SecondaryButton
                  type="button"
                  onClick={() => void loadStats()}
                  disabled={!canQuery || statsLoading}
                >
                  {t(lang, 'stats_reload')}
                </SecondaryButton>
              </div>

              {statsError ? (
                <p className="mt-3 text-sm text-dt-danger">{statsError}</p>
              ) : statsLoading ? (
                <p className="mt-3 text-sm text-dt-text-secondary">
                  {t(lang, 'loading')}
                </p>
              ) : stats ? (
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  <div className="rounded-md border border-dt-accent bg-dt-accent/5 px-3 py-2 text-center">
                    <div className="text-xl font-semibold text-dt-accent">
                      {stats.active}
                    </div>
                    <div className="mt-1 text-[11px] uppercase tracking-[0.14em] text-dt-text-secondary">
                      {t(lang, 'stats_active')}
                    </div>
                  </div>
                  <div className="rounded-md border border-dt-border bg-dt-surface-elevated px-3 py-2 text-center">
                    <div className="text-xl font-semibold">{stats.trial}</div>
                    <div className="mt-1 text-[11px] uppercase tracking-[0.14em] text-dt-text-secondary">
                      {t(lang, 'stats_trial')}
                    </div>
                  </div>
                  <div className="rounded-md border border-dt-border bg-dt-surface-elevated px-3 py-2 text-center">
                    <div className="text-xl font-semibold">{stats.expired}</div>
                    <div className="mt-1 text-[11px] uppercase tracking-[0.14em] text-dt-text-secondary">
                      {t(lang, 'stats_expired')}
                    </div>
                  </div>
                  <div className="rounded-md border border-dt-border bg-dt-surface-elevated px-3 py-2 text-center">
                    <div className="text-xl font-semibold">{stats.revoked}</div>
                    <div className="mt-1 text-[11px] uppercase tracking-[0.14em] text-dt-text-secondary">
                      {t(lang, 'stats_revoked')}
                    </div>
                  </div>
                  <div className="rounded-md border border-dt-border bg-dt-surface-elevated px-3 py-2 text-center sm:col-span-2 lg:col-span-1">
                    <div className="text-xl font-semibold">{totalLicenses}</div>
                    <div className="mt-1 text-[11px] uppercase tracking-[0.14em] text-dt-text-secondary">
                      {t(lang, 'stats_total')}
                    </div>
                  </div>
                </div>
              ) : null}
            </Panel>
          </div>

          <Panel title={t(lang, 'issue_title')}>
            <div className="space-y-3">
              <TextField
                id="google-email"
                type="email"
                label={t(lang, 'email_label')}
                placeholder={t(lang, 'email_placeholder')}
                value={issueEmail}
                onChange={(e) => setIssueEmail(e.target.value)}
                autoComplete="email"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleIssueCode();
                  }
                }}
              />
              <PrimaryButton
                type="button"
                onClick={() => void handleIssueCode()}
                disabled={issueLoading}
              >
                {t(lang, 'issue_button')}
              </PrimaryButton>
              <Message state={issueMessage} />
            </div>
          </Panel>
        </div>

        <Panel title={t(lang, 'list_title')}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-dt-text-secondary">
              {canQuery ? t(lang, 'list_title') : t(lang, 'enter_secret_codes')}
            </p>
            <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2 sm:max-w-md sm:flex-initial">
              <label className="sr-only" htmlFor="codes-search">
                {t(lang, 'list_search_label')}
              </label>
              <input
                id="codes-search"
                type="search"
                value={codesSearch}
                onChange={(e) => setCodesSearch(e.target.value)}
                placeholder={t(lang, 'list_search_placeholder')}
                disabled={!canQuery}
                className="min-w-0 flex-1 rounded-dt-sm border border-dt-border bg-dt-surface px-2.5 py-2 text-sm text-dt-text outline-none focus:border-dt-accent focus:ring-2 focus:ring-dt-accent/40 disabled:opacity-60 sm:min-w-[200px]"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void loadCodes();
                  }
                }}
              />
              <SecondaryButton
                type="button"
                onClick={() => void loadCodes()}
                disabled={!canQuery || codesLoading}
              >
                {t(lang, 'list_refresh')}
              </SecondaryButton>
            </div>
          </div>

          {codesError ? (
            <p className="mt-3 text-sm text-dt-danger">{codesError}</p>
          ) : !canQuery ? null : codesLoading ? (
            <p className="mt-3 text-sm text-dt-text-secondary">
              {t(lang, 'loading')}
            </p>
          ) : codes && codes.length === 0 ? (
            <p className="mt-3 text-sm text-dt-text-secondary">
              {t(lang, 'no_codes')}
            </p>
          ) : codes && codes.length > 0 ? (
            <div className="mt-4 overflow-x-auto rounded-md border border-dt-border bg-dt-surface-elevated">
              <table className="min-w-[640px] w-full border-collapse text-sm">
                <thead className="bg-dt-surface-elevated">
                  <tr className="text-left text-xs uppercase tracking-[0.14em] text-dt-text-secondary">
                    <th className="border-b border-dt-border px-3 py-2">
                      {t(lang, 'th_code')}
                    </th>
                    <th className="border-b border-dt-border px-3 py-2">
                      {t(lang, 'th_status')}
                    </th>
                    <th className="border-b border-dt-border px-3 py-2">
                      {t(lang, 'extend_days_label')}
                    </th>
                    <th className="border-b border-dt-border px-3 py-2">
                      {t(lang, 'th_created')}
                    </th>
                    <th className="border-b border-dt-border px-3 py-2">
                      {t(lang, 'th_activated')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {codes?.map((it) => {
                    const token = statusToken(it.status);
                    return (
                      <tr
                        key={it.id}
                        className="border-b border-dt-border/80 last:border-b-0 hover:bg-black/5"
                      >
                        <td className="px-3 py-2 align-top font-mono text-xs">
                          <code className="rounded bg-dt-accent/10 px-1.5 py-0.5">
                            {it.code}
                          </code>
                        </td>
                        <td className="px-3 py-2 align-top">
                          <StatusBadge
                            token={token}
                            label={statusLabel(lang, token)}
                          />
                        </td>
                        <td className="px-3 py-2 align-top">
                          {String(it.durationDays)}
                        </td>
                        <td className="px-3 py-2 align-top">
                          {new Date(it.createdAt).toLocaleString()}
                        </td>
                        <td className="px-3 py-2 align-top">
                          {it.activatedAt
                            ? new Date(it.activatedAt).toLocaleString()
                            : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </Panel>

        <Panel title={t(lang, 'clients_title')}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-1 items-center gap-2">
              <label className="sr-only" htmlFor="clients-search">
                {t(lang, 'clients_search_label')}
              </label>
              <input
                id="clients-search"
                type="search"
                value={clientsSearch}
                onChange={(e) => setClientsSearch(e.target.value)}
                placeholder={t(lang, 'clients_search_placeholder')}
                className="min-w-0 flex-1 rounded-dt-sm border border-dt-border bg-dt-surface px-2.5 py-2 text-sm text-dt-text outline-none focus:border-dt-accent focus:ring-2 focus:ring-dt-accent/40"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void loadClients();
                  }
                }}
              />
            </div>
            <SecondaryButton
              type="button"
              onClick={() => void loadClients()}
              disabled={!canQuery || clientsLoading}
            >
              {t(lang, 'clients_reload')}
            </SecondaryButton>
          </div>

          {clientsError ? (
            <p className="mt-3 text-sm text-dt-danger">{clientsError}</p>
          ) : null}

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-md border border-dt-border bg-dt-surface-elevated px-3 py-3 space-y-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-dt-text-secondary">
                {t(lang, 'actions_extend_title')}
              </div>
              <TextField
                id="extend-email"
                type="email"
                label={t(lang, 'target_email_label')}
                placeholder={t(lang, 'email_placeholder')}
                value={extendEmail}
                onChange={(e) => setExtendEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleExtend();
                  }
                }}
              />
              <TextField
                id="extend-days"
                type="number"
                min={1}
                max={3650}
                label={t(lang, 'extend_days_label')}
                value={extendDays}
                onChange={(e) => setExtendDays(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleExtend();
                  }
                }}
              />
              <PrimaryButton
                type="button"
                onClick={() => void handleExtend()}
                disabled={extendLoading}
              >
                {t(lang, 'extend_button')}
              </PrimaryButton>
            </div>

            <div className="rounded-md border border-dt-danger/40 bg-red-50/60 px-3 py-3 space-y-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-dt-danger">
                {t(lang, 'actions_revoke_title')}
              </div>
              <TextField
                id="revoke-email"
                type="email"
                label={t(lang, 'target_email_label')}
                placeholder={t(lang, 'email_placeholder')}
                value={revokeEmail}
                onChange={(e) => setRevokeEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleRevoke();
                  }
                }}
              />
              <DangerButton
                type="button"
                onClick={() => void handleRevoke()}
                disabled={revokeLoading}
              >
                {t(lang, 'revoke_button')}
              </DangerButton>
            </div>
          </div>

          <Message state={clientsMessage} />

          {clientsLoading ? (
            <p className="mt-4 text-sm text-dt-text-secondary">{t(lang, 'loading')}</p>
          ) : !canQuery ? (
            <p className="mt-4 text-sm text-dt-text-secondary">
              {t(lang, 'enter_secret_clients')}
            </p>
          ) : clients && clients.length === 0 ? (
            <p className="mt-4 text-sm text-dt-text-secondary">
              {t(lang, 'no_clients')}
            </p>
          ) : clients && clients.length > 0 ? (
            <div className="mt-4 overflow-x-auto rounded-md border border-dt-border bg-dt-surface-elevated">
              <table className="min-w-[640px] w-full border-collapse text-sm">
                <thead className="bg-dt-surface-elevated">
                  <tr className="text-left text-xs uppercase tracking-[0.14em] text-dt-text-secondary">
                    <th className="border-b border-dt-border px-3 py-2">
                      {t(lang, 'th_email')}
                    </th>
                    <th className="border-b border-dt-border px-3 py-2">
                      {t(lang, 'th_client_hash')}
                    </th>
                    <th className="border-b border-dt-border px-3 py-2">
                      {t(lang, 'th_status')}
                    </th>
                    <th className="border-b border-dt-border px-3 py-2">
                      {t(lang, 'th_plan')}
                    </th>
                    <th className="border-b border-dt-border px-3 py-2">
                      {t(lang, 'th_activated')}
                    </th>
                    <th className="border-b border-dt-border px-3 py-2">
                      {t(lang, 'th_expires')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {clients?.map((it) => {
                    const token = it.revoked
                      ? 'revoked'
                      : it.expires_at && new Date(it.expires_at).getTime() <= Date.now()
                      ? 'expired'
                      : 'active';
                    return (
                      <tr
                        key={it.user_email_hmac}
                        className="border-b border-dt-border/80 last:border-b-0 hover:bg-black/5"
                      >
                        <td className="px-3 py-2 align-top break-all">
                          {it.google_email?.trim() ? it.google_email : '—'}
                        </td>
                        <td className="px-3 py-2 align-top font-mono text-xs text-dt-text-secondary">
                          {`${it.user_email_hmac.slice(0, 12)}…`}
                        </td>
                        <td className="px-3 py-2 align-top">
                          <StatusBadge
                            token={token}
                            label={statusLabel(lang, token)}
                          />
                        </td>
                        <td className="px-3 py-2 align-top">
                          {it.plan || '—'}
                        </td>
                        <td className="px-3 py-2 align-top">
                          {it.activated_at
                            ? new Date(it.activated_at).toLocaleString()
                            : '—'}
                        </td>
                        <td className="px-3 py-2 align-top">
                          {it.expires_at
                            ? new Date(it.expires_at).toLocaleString()
                            : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </Panel>
      </main>
    </div>
  );
};

export default App;

