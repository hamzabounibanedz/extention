import './style.css';

const STORAGE_SECRET = 'dt_admin_secret';
const STORAGE_LANG = 'dt_admin_lang';

type AdminLang = 'ar' | 'fr' | 'en';

const ADMIN_I18N: Record<AdminLang, Record<string, string>> = {
  ar: {
    app_title: 'Delivery Tool Admin',
    app_subtitle: 'إصدار الأكواد، إدارة العملاء، ومتابعة إحصائيات الاشتراك لإضافة Google Sheets.',
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
    app_title: 'Delivery Tool Admin',
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
    app_subtitle: 'Issue licenses, manage clients, and view subscription stats for the Sheets add-on.',
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

function detectLang(): AdminLang {
  const raw = (navigator.language || 'en').toLowerCase();
  if (raw.startsWith('ar')) return 'ar';
  if (raw.startsWith('fr')) return 'fr';
  return 'en';
}

function getLang(): AdminLang {
  const saved = localStorage.getItem(STORAGE_LANG);
  if (saved === 'ar' || saved === 'fr' || saved === 'en') {
    return saved;
  }
  return detectLang();
}

function setLang(lang: AdminLang): void {
  localStorage.setItem(STORAGE_LANG, lang);
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

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Record<string, string | boolean>,
  children?: (Node | string)[],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (k === 'className' && typeof v === 'string') {
        node.className = v;
      } else if (k === 'textContent' && typeof v === 'string') {
        node.textContent = v;
      } else if (typeof v === 'boolean') {
        if (v) {
          node.setAttribute(k, '');
        }
      } else if (typeof v === 'string') {
        node.setAttribute(k, v);
      }
    }
  }
  if (children) {
    for (const c of children) {
      node.append(typeof c === 'string' ? document.createTextNode(c) : c);
    }
  }
  return node;
}

function getSecret(): string {
  return sessionStorage.getItem(STORAGE_SECRET)?.trim() ?? '';
}

function setSecret(value: string): void {
  const v = value.trim();
  if (v) {
    sessionStorage.setItem(STORAGE_SECRET, v);
  } else {
    sessionStorage.removeItem(STORAGE_SECRET);
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const secret = getSecret();
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

function render(): void {
  const root = document.getElementById('app');
  if (!root) {
    return;
  }
  const lang = getLang();
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.title = t(lang, 'app_title');
  root.replaceChildren();

  const header = el('header', { className: 'app-header' });
  const headerInner = el('div', { className: 'app-header-inner' });
  const languageWrap = el('div', { className: 'header-lang' });
  const languageSelect = el('select', { id: 'admin-lang' }) as HTMLSelectElement;
  languageSelect.append(
    el('option', { value: 'ar', textContent: t(lang, 'lang_ar') }),
    el('option', { value: 'fr', textContent: t(lang, 'lang_fr') }),
    el('option', { value: 'en', textContent: t(lang, 'lang_en') }),
  );
  languageSelect.value = lang;
  languageWrap.append(
    el('label', { for: 'admin-lang', textContent: t(lang, 'lang_label') }),
    languageSelect,
  );
  headerInner.append(
    el('h1', { textContent: t(lang, 'app_title') }),
    el('p', {
      className: 'sub',
      textContent: t(lang, 'app_subtitle'),
    }),
    languageWrap,
  );
  header.append(headerInner);

  const layout = el('div', { className: 'layout' });

  const authPanel = el('div', { className: 'panel' });
  authPanel.append(el('div', { className: 'panel-title', textContent: t(lang, 'access_title') }));
  const secretInput = el('input', {
    type: 'password',
    id: 'admin-secret',
    placeholder: t(lang, 'admin_secret_placeholder'),
    autocomplete: 'off',
  }) as HTMLInputElement;
  secretInput.value = getSecret();
  authPanel.append(
    el('label', { for: 'admin-secret', textContent: t(lang, 'admin_secret_label') }),
    secretInput,
    el(
      'p',
      { className: 'sub', textContent: t(lang, 'admin_secret_hint') },
    ),
  );

  const issuePanel = el('div', { className: 'panel' });
  issuePanel.append(el('div', { className: 'panel-title', textContent: t(lang, 'issue_title') }));
  const emailInput = el('input', {
    type: 'email',
    id: 'google-email',
    placeholder: t(lang, 'email_placeholder'),
    autocomplete: 'email',
  }) as HTMLInputElement;
  const issueMsg = el('p', { className: 'err' });
  issueMsg.style.display = 'none';
  const issueOk = el('p', { className: 'ok' });
  issueOk.style.display = 'none';
  const issueBtn = el('button', {
    type: 'button',
    className: 'primary',
    textContent: t(lang, 'issue_button'),
  }) as HTMLButtonElement;

  issuePanel.append(
    el('label', { for: 'google-email', textContent: t(lang, 'email_label') }),
    emailInput,
    issueBtn,
    issueMsg,
    issueOk,
  );

  const listPanel = el('div', { className: 'panel panel-wide' });
  const listTitle = el('div', { className: 'panel-title', textContent: t(lang, 'list_title') });
  listPanel.append(listTitle);
  const listErr = el('p', { className: 'err' });
  listErr.style.display = 'none';
  const tableHost = el('div');
  const refreshBtn = el('button', {
    type: 'button',
    className: 'secondary',
    textContent: t(lang, 'list_refresh'),
  });

  const toolbar = el('div', { className: 'toolbar' });
  toolbar.append(refreshBtn);
  listPanel.append(toolbar, listErr, tableHost);

  const clientsPanel = el('div', { className: 'panel panel-wide' });
  const clientsTitle = el('div', { className: 'panel-title', textContent: t(lang, 'clients_title') });
  clientsPanel.append(clientsTitle);
  const clientsErr = el('p', { className: 'err' });
  clientsErr.style.display = 'none';
  const clientsToolbar = el('div', { className: 'toolbar' });
  const clientsSearchInput = el('input', {
    type: 'search',
    id: 'clients-search',
    placeholder: t(lang, 'clients_search_placeholder'),
    'aria-label': t(lang, 'clients_search_label'),
  }) as HTMLInputElement;
  const clientsSearchLabel = el('label', {
    for: 'clients-search',
    className: 'sr-only',
    textContent: t(lang, 'clients_search_label'),
  });
  const clientsReloadBtn = el('button', {
    type: 'button',
    className: 'secondary',
    textContent: t(lang, 'clients_reload'),
  }) as HTMLButtonElement;
  const clientsHost = el('div');
  const extendEmailInput = el('input', {
    type: 'email',
    id: 'extend-email',
    placeholder: t(lang, 'email_placeholder'),
  }) as HTMLInputElement;
  const extendDaysInput = el('input', {
    type: 'number',
    id: 'extend-days',
    min: '1',
    max: '3650',
    value: '365',
  }) as HTMLInputElement;
  const extendBtn = el('button', {
    type: 'button',
    className: 'primary',
    textContent: t(lang, 'extend_button'),
  }) as HTMLButtonElement;
  const revokeEmailInput = el('input', {
    type: 'email',
    id: 'revoke-email',
    placeholder: t(lang, 'email_placeholder'),
  }) as HTMLInputElement;
  const revokeBtn = el('button', {
    type: 'button',
    className: 'secondary danger',
    textContent: t(lang, 'revoke_button'),
  }) as HTMLButtonElement;
  const clientsMsg = el('p', { className: 'sub' });
  clientsMsg.style.display = 'none';

  clientsToolbar.append(clientsSearchLabel, clientsSearchInput, clientsReloadBtn);
  const clientsActions = el('div', { className: 'clients-actions-grid' });
  const extendCard = el('div', { className: 'action-card' });
  extendCard.append(
    el('div', { className: 'action-label', textContent: t(lang, 'actions_extend_title') }),
    el('label', { for: 'extend-email', textContent: t(lang, 'target_email_label') }),
    extendEmailInput,
    el('label', { for: 'extend-days', textContent: t(lang, 'extend_days_label') }),
    extendDaysInput,
    extendBtn,
  );
  const revokeCard = el('div', { className: 'action-card action-card-danger' });
  revokeCard.append(
    el('div', { className: 'action-label', textContent: t(lang, 'actions_revoke_title') }),
    el('label', { for: 'revoke-email', textContent: t(lang, 'target_email_label') }),
    revokeEmailInput,
    revokeBtn,
  );
  clientsActions.append(extendCard, revokeCard);
  clientsPanel.append(clientsToolbar, clientsErr, clientsActions, clientsMsg, clientsHost);

  const statsPanel = el('div', { className: 'panel' });
  statsPanel.append(el('div', { className: 'panel-title', textContent: t(lang, 'stats_title') }));
  const statsErr = el('p', { className: 'err' });
  statsErr.style.display = 'none';
  const statsHost = el('div');
  const statsToolbar = el('div', { className: 'toolbar' });
  const statsReload = el('button', {
    type: 'button',
    className: 'secondary',
    textContent: t(lang, 'stats_reload'),
  }) as HTMLButtonElement;
  statsToolbar.append(statsReload);
  statsPanel.append(statsToolbar, statsErr, statsHost);

  layout.append(authPanel, issuePanel, statsPanel, listPanel, clientsPanel);
  root.append(header, layout);

  async function loadList(): Promise<void> {
    listErr.style.display = 'none';
    tableHost.replaceChildren(el('p', { className: 'sub', textContent: t(lang, 'loading') }));
    listTitle.textContent = t(lang, 'list_title');
    if (!getSecret()) {
      tableHost.replaceChildren(
        el('p', { className: 'sub', textContent: t(lang, 'enter_secret_codes') }),
      );
      return;
    }
    try {
      const data = await api<{ items: LicenseItem[] }>('/admin/v1/license-codes?limit=50');
      const items = data.items ?? [];
      listTitle.textContent = `${t(lang, 'list_title')} (${items.length})`;
      if (items.length === 0) {
        tableHost.replaceChildren(el('p', { className: 'sub', textContent: t(lang, 'no_codes') }));
        return;
      }
      const table = el('table');
      const thead = el('thead');
      thead.append(
        el('tr', {}, [
          el('th', { textContent: t(lang, 'th_code') }),
          el('th', { textContent: t(lang, 'th_status') }),
          el('th', { textContent: t(lang, 'extend_days_label') }),
          el('th', { textContent: t(lang, 'th_created') }),
          el('th', { textContent: t(lang, 'th_activated') }),
        ]),
      );
      const tbody = el('tbody');
      for (const it of items) {
        const token = statusToken(it.status);
        const statusBadge = el('span', {
          className: `badge badge--${token}`,
          textContent: statusLabel(lang, token),
        });
        tbody.append(
          el('tr', {}, [
            el('td', {}, [el('code', { textContent: it.code })]),
            el('td', {}, [statusBadge]),
            el('td', { textContent: String(it.durationDays) }),
            el('td', { textContent: new Date(it.createdAt).toLocaleString() }),
            el('td', {
              textContent: it.activatedAt ? new Date(it.activatedAt).toLocaleString() : '—',
            }),
          ]),
        );
      }
      table.append(thead, tbody);
      const wrapper = el('div', { className: 'table-scroll' });
      wrapper.append(table);
      tableHost.replaceChildren(wrapper);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      listErr.textContent = m;
      listErr.style.display = 'block';
      tableHost.replaceChildren();
    }
  }

  secretInput.addEventListener('change', () => {
    setSecret(secretInput.value);
    void loadList();
    void loadClients();
    void loadStats();
  });
  secretInput.addEventListener('input', () => {
    setSecret(secretInput.value);
  });

  issueBtn.addEventListener('click', async () => {
    issueMsg.style.display = 'none';
    issueOk.style.display = 'none';
    setSecret(secretInput.value);
    if (!getSecret()) {
      issueMsg.textContent = t(lang, 'admin_secret_required');
      issueMsg.style.display = 'block';
      return;
    }
    const googleEmail = emailInput.value.trim();
    if (!googleEmail) {
      issueMsg.textContent = t(lang, 'email_required');
      issueMsg.style.display = 'block';
      return;
    }
    issueBtn.disabled = true;
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
        body: JSON.stringify({ durationDays: 365, googleEmail }),
      });
      issueOk.textContent = t(lang, 'issue_success', created.code, statusLabel(lang, created.status || 'pending'));
      issueOk.style.display = 'block';
      emailInput.value = '';
      await loadList();
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      issueMsg.textContent = m;
      issueMsg.style.display = 'block';
    } finally {
      issueBtn.disabled = false;
    }
  });

  refreshBtn.addEventListener('click', () => {
    void loadList();
  });

  async function loadClients(): Promise<void> {
    clientsErr.style.display = 'none';
    clientsMsg.style.display = 'none';
    clientsHost.replaceChildren(el('p', { className: 'sub', textContent: t(lang, 'loading') }));
    clientsTitle.textContent = t(lang, 'clients_title');
    if (!getSecret()) {
      clientsHost.replaceChildren(
        el('p', { className: 'sub', textContent: t(lang, 'enter_secret_clients') }),
      );
      return;
    }
    try {
      const search = clientsSearchInput.value.trim();
      const qs = search ? `?search=${encodeURIComponent(search)}` : '';
      const data = await api<{ clients: ClientRow[] }>(`/admin/v1/clients${qs}`);
      const items = data.clients ?? [];
      clientsTitle.textContent = `${t(lang, 'clients_title')} (${items.length})`;
      if (items.length === 0) {
        clientsHost.replaceChildren(el('p', { className: 'sub', textContent: t(lang, 'no_clients') }));
        return;
      }
      const table = el('table');
      const thead = el('thead');
      thead.append(
        el('tr', {}, [
          el('th', { textContent: t(lang, 'th_client_hash') }),
          el('th', { textContent: t(lang, 'th_status') }),
          el('th', { textContent: t(lang, 'th_plan') }),
          el('th', { textContent: t(lang, 'th_activated') }),
          el('th', { textContent: t(lang, 'th_expires') }),
        ]),
      );
      const tbody = el('tbody');
      for (const it of items) {
        const token = it.revoked
          ? 'revoked'
          : it.expires_at && new Date(it.expires_at).getTime() <= Date.now()
            ? 'expired'
            : 'active';
        const statusBadge = el('span', {
          className: `badge badge--${token}`,
          textContent: statusLabel(lang, token),
        });
        const row = el('tr');
        const emailCell = el('td', {
          className: 'mono',
          textContent: `${it.user_email_hmac.slice(0, 12)}…`,
        });
        const statusCell = el('td');
        statusCell.append(statusBadge);
        const planCell = el('td', { textContent: it.plan || '—' });
        const activatedCell = el('td', {
          textContent: it.activated_at ? new Date(it.activated_at).toLocaleString() : '—',
        });
        const expiresCell = el('td', {
          textContent: it.expires_at ? new Date(it.expires_at).toLocaleString() : '—',
        });

        row.append(emailCell, statusCell, planCell, activatedCell, expiresCell);
        tbody.append(row);
      }
      table.append(thead, tbody);
      const wrapper = el('div', { className: 'table-scroll' });
      wrapper.append(table);
      clientsHost.replaceChildren(wrapper);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      clientsErr.textContent = m;
      clientsErr.style.display = 'block';
      clientsHost.replaceChildren();
    }
  }

  async function applyExtend(): Promise<void> {
    clientsErr.style.display = 'none';
    clientsMsg.style.display = 'none';
    setSecret(secretInput.value);
    if (!getSecret()) {
      clientsErr.textContent = t(lang, 'admin_secret_required');
      clientsErr.style.display = 'block';
      return;
    }
    const email = extendEmailInput.value.trim();
    const days = Number(extendDaysInput.value || '0');
    if (!email) {
      clientsErr.textContent = t(lang, 'email_required_extend');
      clientsErr.style.display = 'block';
      return;
    }
    if (!Number.isFinite(days) || days <= 0) {
      clientsErr.textContent = t(lang, 'days_positive');
      clientsErr.style.display = 'block';
      return;
    }
    extendBtn.disabled = true;
    try {
      await api('/admin/v1/licenses/extend', {
        method: 'POST',
        body: JSON.stringify({ email, days }),
      });
      clientsMsg.textContent = t(lang, 'extended_success', email, days);
      clientsMsg.style.display = 'block';
      await loadClients();
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      clientsErr.textContent = m;
      clientsErr.style.display = 'block';
    } finally {
      extendBtn.disabled = false;
    }
  }

  async function applyRevoke(): Promise<void> {
    clientsErr.style.display = 'none';
    clientsMsg.style.display = 'none';
    setSecret(secretInput.value);
    if (!getSecret()) {
      clientsErr.textContent = t(lang, 'admin_secret_required');
      clientsErr.style.display = 'block';
      return;
    }
    const email = revokeEmailInput.value.trim();
    if (!email) {
      clientsErr.textContent = t(lang, 'email_required_revoke');
      clientsErr.style.display = 'block';
      return;
    }
    const confirmed = window.confirm(t(lang, 'revoke_confirm', email));
    if (!confirmed) {
      return;
    }
    revokeBtn.disabled = true;
    try {
      await api('/admin/v1/licenses/revoke', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      clientsMsg.textContent = t(lang, 'revoked_success', email);
      clientsMsg.style.display = 'block';
      await loadClients();
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      clientsErr.textContent = m;
      clientsErr.style.display = 'block';
    } finally {
      revokeBtn.disabled = false;
    }
  }

  async function loadStats(): Promise<void> {
    statsErr.style.display = 'none';
    statsHost.replaceChildren(el('p', { className: 'sub', textContent: t(lang, 'loading') }));
    if (!getSecret()) {
      statsHost.replaceChildren(
        el('p', { className: 'sub', textContent: t(lang, 'enter_secret_stats') }),
      );
      return;
    }
    try {
      const data = await api<AdminStats>('/admin/v1/stats');
      const totalLicenses = Number.isFinite(data.total)
        ? data.total
        : data.active + data.expired + data.revoked;
      const grid = el('div', { className: 'stats-grid' });
      const mkCard = (label: string, value: number, accent?: boolean) => {
        const card = el('div', { className: accent ? 'stat-card stat-accent' : 'stat-card' });
        card.append(
          el('div', { className: 'stat-value', textContent: String(value) }),
          el('div', { className: 'stat-label', textContent: label }),
        );
        return card;
      };
      grid.append(
        mkCard(t(lang, 'stats_active'), data.active, true),
        mkCard(t(lang, 'stats_trial'), data.trial),
        mkCard(t(lang, 'stats_expired'), data.expired),
        mkCard(t(lang, 'stats_revoked'), data.revoked),
        mkCard(t(lang, 'stats_total'), totalLicenses),
      );
      statsHost.replaceChildren(grid);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      statsErr.textContent = m;
      statsErr.style.display = 'block';
      statsHost.replaceChildren();
    }
  }

  clientsReloadBtn.addEventListener('click', () => {
    void loadClients();
  });

  // Debounced live search for clients to feel more responsive than change-on-blur.
  let clientsSearchTimer: number | undefined;
  clientsSearchInput.addEventListener('input', () => {
    if (clientsSearchTimer !== undefined) {
      window.clearTimeout(clientsSearchTimer);
    }
    clientsSearchTimer = window.setTimeout(() => {
      void loadClients();
    }, 250);
  });
  clientsSearchInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') {
      return;
    }
    event.preventDefault();
    if (clientsSearchTimer !== undefined) {
      window.clearTimeout(clientsSearchTimer);
    }
    void loadClients();
  });
  secretInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') {
      return;
    }
    event.preventDefault();
    setSecret(secretInput.value);
    void loadList();
    void loadClients();
    void loadStats();
  });
  emailInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') {
      return;
    }
    event.preventDefault();
    issueBtn.click();
  });
  extendEmailInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') {
      return;
    }
    event.preventDefault();
    void applyExtend();
  });
  extendDaysInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') {
      return;
    }
    event.preventDefault();
    void applyExtend();
  });
  revokeEmailInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') {
      return;
    }
    event.preventDefault();
    void applyRevoke();
  });
  extendBtn.addEventListener('click', () => {
    void applyExtend();
  });
  revokeBtn.addEventListener('click', () => {
    void applyRevoke();
  });
  statsReload.addEventListener('click', () => {
    void loadStats();
  });
  languageSelect.addEventListener('change', () => {
    const next = languageSelect.value;
    if (next === 'ar' || next === 'fr' || next === 'en') {
      setLang(next);
      render();
    }
  });

  void loadList();
  void loadClients();
  void loadStats();
}

render();
