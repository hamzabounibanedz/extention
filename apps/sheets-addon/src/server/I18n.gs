/**
 * @fileoverview Simple in-memory i18n for the add-on (AR/FR/EN).
 * Strings are keyed and looked up at runtime. The active language is
 * stored per Google account in UserProperties via DeliveryToolStorage.
 */

// Language keys
var LANG_AR = "ar";
var LANG_FR = "fr";
var LANG_EN = "en";
var DEFAULT_LANG = LANG_AR;

/**
 * Returns active language for current user from UserProperties.
 * Fallback: DEFAULT_LANG when unset or invalid.
 * @return {string}
 */
function i18n_getLang() {
  var lang = DeliveryToolStorage.getUserLang();
  if (lang === LANG_AR || lang === LANG_FR || lang === LANG_EN) {
    return lang;
  }
  return DEFAULT_LANG;
}

/**
 * Low-level translation lookup for a key in the active language.
 * Falls back to default language, then English, then key itself.
 * @param {string} key
 * @return {string}
 */
function i18n_t(key) {
  var lang = i18n_getLang();
  var dict = I18N_DICT_[lang] || I18N_DICT_[DEFAULT_LANG];
  if (dict && Object.prototype.hasOwnProperty.call(dict, key)) {
    return String(dict[key]);
  }
  var en = I18N_DICT_[LANG_EN];
  if (en && Object.prototype.hasOwnProperty.call(en, key)) {
    return String(en[key]);
  }
  return String(key);
}

/**
 * Formats a translated string with numbered placeholders {0}, {1}, …
 * @param {string} key
 * @param {...*} var_args
 * @return {string}
 */
function i18n_format(key) {
  var args = Array.prototype.slice.call(arguments, 1);
  var str = i18n_t(key);
  return str.replace(/\{(\d+)\}/g, function (_, i) {
    return args[i] !== undefined && args[i] !== null ? String(args[i]) : "";
  });
}

/**
 * Expose current language + dictionary to the Sidebar / dialogs.
 * @return {{ lang: string, dict: Object<string,string> }}
 */
function i18n_getClientStrings() {
  var lang = i18n_getLang();
  return { lang: lang, dict: I18N_DICT_[lang] || {} };
}

/**
 * Updates current user's language preference.
 * @param {string} lang
 * @return {{ ok: boolean, lang: string }}
 */
function i18n_setLang(lang) {
  if (lang !== LANG_AR && lang !== LANG_FR && lang !== LANG_EN) {
    throw new Error(i18n_t("error.invalid_lang"));
  }
  DeliveryToolStorage.setUserLang(lang);
  return { ok: true, lang: lang };
}

// Full translation dictionary — every user-facing string (subset; extend as needed).
// NOTE: Keep keys stable; values may be adjusted over time.
var I18N_DICT_ = {
  ar: {
    // Menu
    "menu.open_sidebar": "فتح لوحة التحكم",
    "menu.setup": "إعداد وربط الأعمدة",
    "menu.sync": "مزامنة حالة الشحنات",
    "menu.help": "مساعدة",
    // Help
    "help.intro":
      "هذا الدليل السريع يساعدك على ربط الأعمدة بشكل صحيح وحل المشاكل الشائعة.",
    "help.steps_title": "الخطوات الأساسية",
    "help.step_open": "افتح لوحة التحكم من قائمة Delivery Tool.",
    "help.step_map":
      "احفظ ربط الأعمدة (على الأقل: الحالة، التتبع، رسوم الشحن عند الحاجة).",
    "help.step_send": "حلّل التحديد أولاً ثم أرسل الصفوف الصالحة.",
    "help.step_sync": "استخدم مزامنة التتبع يدوياً أو فعّل المزامنة التلقائية.",
    "help.troubleshoot_title": "استكشاف الأخطاء",
    "help.trouble_license":
      "عند فشل الإرسال أو المزامنة، تحقق من حالة الترخيص في بطاقة الترخيص.",
    "help.trouble_backend":
      "تأكد أن عنوان الخادم صحيح ويمكن الوصول إليه من الإنترنت.",
    "help.trouble_labels":
      "زر «طباعة الكل» يعتمد على ربط عمود رابط البوليصة في قسم «ربط أعمدة الورقة».",
    "help.support":
      "إذا استمرت المشكلة، التقط لقطة للشاشة من الحالة الظاهرة وأرسلها لفريق الدعم.",
    // Trial
    "trial.welcome_title": "مرحباً بك في Delivery Tool",
    "trial.days_remaining": "متبقي {0} أيام من فترة التجربة",
    "trial.start_setup": "بدء ربط الأعمدة",
    "trial.expired_title": "انتهت فترة التجربة",
    "trial.expired_body": "لتفعيل اشتراكك، تواصل معنا عبر واتساب",
    "trial.contact_whatsapp": "تواصل عبر واتساب",
    "trial.badge_label": "تجريبي",
    // License
    "license.active": "الاشتراك نشط",
    "license.expired_title": "انتهى الاشتراك",
    "license.expired_body": "لتجديد اشتراكك، تواصل معنا عبر واتساب",
    "license.have_code": "لديّ كود تفعيل",
    "license.enter_code": "أدخل كود التفعيل",
    "license.activate": "تفعيل",
    "license.activate_success": "تم التفعيل بنجاح",
    "license.activate_error": "كود التفعيل غير صحيح أو منتهي الصلاحية",
    "license.expires_on": "ينتهي بتاريخ {0}",
    "license.renew_whatsapp": "تجديد الاشتراك عبر واتساب",
    "license.badge_active": "نشط",
    "license.badge_expired": "منتهي",
    "license.badge_unknown": "غير معروف",
    "error.mapping_invalid":
      "بيانات ربط أعمدة الورقة غير صالحة. أعد الحفظ من الشريط الجانبي.",
    "error.mapping_setup_required":
      "أكمل ربط أعمدة الورقة لهذه الورقة أولاً (الشريط الجانبي).",
    "error.select_rows": "حدد نطاقاً من الصفوف.",
    "error.select_rows_tracking": "حدد نطاقاً يحتوي على أرقام تتبع.",
    "error.choose_carrier":
      "اختر شركة توصيل (القيمة الافتراضية أو عمود الناقل في قسم ربط أعمدة الورقة).",
    "error.zr_tenant_secret_required":
      "يتطلب ZR إدخال tenantId و secretKey معاً.",
    "error.sheet_not_found": "تعذر العثور على الورقة.",
    "error.label_column_required":
      "اربط عمود رابط البوليصة أولاً من قسم «ربط أعمدة الورقة» في الشريط الجانبي.",
    "error.label_column_invalid": "عمود رابط البوليصة غير صالح.",
    "error.url_must_be_http": "يجب أن يبدأ الرابط بـ http:// أو https://",
    "error.backend_config_locked":
      "إعدادات الخادم مقفلة في هذا الإصدار المنشور.",
    "error.backend_url_missing": "عنوان الخادم غير مهيأ.",
    "error.api_http": "خطأ API ({0})",
    "error.api_invalid_json": "استجابة API غير صالحة (JSON مطلوب).",
    "error.api_invalid_json_html":
      "استجابة الخادم ليست JSON (تم استلام HTML). تحقق من رابط الخادم/‏ngrok وأنه يشير إلى API الصحيح.",
    "error.business_payload_required": "بيانات إعدادات النشاط مطلوبة.",
    "error.business_settings_too_large": "إعدادات النشاط كبيرة جداً.",
    "error.no_recent_failed_send": "لا يوجد إرسال حديث يحتوي على صفوف فاشلة.",
    "error.no_recent_failed_sync": "لا توجد مزامنة حديثة تحتوي على صفوف فاشلة.",
    "error.switch_to_sheet_retry": "انتقل إلى الورقة «{0}» ثم أعد المحاولة.",
    "error.no_failed_rows_recorded": "لا توجد صفوف فاشلة مسجلة.",
    "error.invalid_rows_in_journal": "صفوف غير صالحة في السجل.",
    "error.stats_require_status_or_tracking":
      "اربط عمود «الحالة» أو «رقم التتبع» على الأقل في قسم ربط أعمدة الورقة لعرض إحصائيات الطلبات.",
    "error.wilaya_column_required":
      "اربط عمود الولاية من قسم «ربط أعمدة الورقة» في الشريط الجانبي.",
    "error.wilaya_column_invalid": "عمود الولاية غير صالح.",
    "error.backend_url_required_for_communes":
      "عنوان الخادم مطلوب لتحميل البلديات.",
    "error.wilaya_invalid_range": "الولاية غير صالحة (1 إلى 58).",
    "error.no_communes_for_wilaya": "لا توجد بلديات لهذه الولاية.",
    "error.commune_column_required":
      "اربط عمود البلدية من قسم «ربط أعمدة الورقة» في الشريط الجانبي.",
    "error.commune_column_invalid": "عمود البلدية غير صالح.",
    "error.blacklist_column_required": "اربط عمود القائمة السوداء أولاً.",
    "error.blacklist_column_invalid": "عمود القائمة السوداء غير صالح.",
    "error.invalid_data": "البيانات غير صالحة.",
    "error.row_selection_invalid":
      "صيغة الصفوف غير صالحة. مثال: 40,42,50-55",
    "error.default_fee_invalid": "رسوم افتراضية غير صالحة (رقم مطلوب).",
    "error.fee_rules_too_large": "قواعد الرسوم كبيرة جداً. قلل عدد السطور.",
    "error.shipping_fee_column_required":
      "اربط عمود رسوم الشحن من قسم «ربط أعمدة الورقة» في الشريط الجانبي.",
    "error.tracking_column_required":
      "اربط عمود رقم التتبع من قسم «ربط أعمدة الورقة» في الشريط الجانبي.",
    "error.dup_tracking_row": "رقم تتبع مكرر (الصف {0}).",
    "error.dup_order_id_row": "رقم طلب مكرر (الصف {0}).",
    "error.dup_phone_product_row":
      "نفس الهاتف + نفس المنتج موجودان في الصف {0}.",
    "error.backend_carriers_load_with_reason":
      "تعذر تحميل شركات التوصيل من الخادم: {0}",
    "error.backend_carriers_load": "تعذر تحميل شركات التوصيل من الخادم.",
    "warn.backend_carriers_fallback":
      "تعذر تحميل شركات التوصيل من الخادم. تم استخدام القائمة المحلية مؤقتاً.",
    "warn.backend_carriers_fallback_with_reason":
      "تعذر تحميل شركات التوصيل من الخادم. تم استخدام القائمة المحلية مؤقتاً. السبب: {0}",
    "error.wrong_spreadsheet": "الملف الحالي غير مطابق للسياق المحفوظ.",
    "error.columns_format_invalid": "تنسيق الأعمدة غير صالح.",
    "error.mapping_too_large":
      "بيانات ربط أعمدة الورقة كبيرة جداً (الحد ~9 كيلوبايت).",
    "error.invalid_lang": "لغة غير صالحة.",
    "error.no_valid_rows_for_send":
      "لا توجد صفوف صالحة للإرسال. تحقق من ربط الأعمدة المطلوبة (الهاتف، العنوان، الولاية، اسم المستلم، شركة التوصيل).",
    "error.send_in_progress":
      "هناك عملية إرسال قيد التنفيذ بالفعل. أعد المحاولة بعد ثوانٍ قليلة.",
    "error.sync_in_progress":
      "هناك عملية مزامنة قيد التنفيذ بالفعل. أعد المحاولة بعد ثوانٍ قليلة.",
    // Send
    "send.button": "إرسال الطلبات",
    "send.sending": "⏳ إرسال...",
    "send.success": "تم إرسال {0} طلب بنجاح",
    "send.partial": "تم إرسال {0} من {1}. اضغط مجدداً للمتابعة.",
    "send.already_sent": "تم الإرسال مسبقاً",
    "send.sent_status": "تم الإرسال",
    "send.confirm": "تأكيد الإرسال",
    "send.preview": "معاينة الطلبات",
    "send.print_labels": "طباعة البوليصات",
    "send.print_all": "طباعة الكل",
    "send.error_generic":
      "تعذر إرسال الطلب. حاول مرة أخرى أو تأكد من إعدادات شركة التوصيل.",
    // Validation
    "val.phone_required": "رقم الهاتف مطلوب",
    "val.phone_invalid": "رقم الهاتف غير صحيح (يجب أن يبدأ بـ 05/06/07)",
    "val.address_required": "العنوان مطلوب",
    "val.wilaya_required": "الولاية مطلوبة",
    "val.wilaya_invalid": "رمز الولاية غير صحيح",
    "val.carrier_required": "يجب اختيار شركة التوصيل",
    "val.cod_invalid": "مبلغ الدفع عند الاستلام غير صحيح",
    "val.name_required": "اسم العميل مطلوب",
    "val.stopdesk_required":
      "عند اختيار التوصيل إلى المكتب أو نقطة الاستلام، يجب إدخال معرّف المكتب (Stopdesk) في العمود المربوط أو في بيانات النشاط.",
    "val.stopdesk_required_zr":
      "لشركة ZR: عند التوصيل إلى المكتب/نقطة الاستلام يجب تعبئة «معرّف المكتب / نقطة الاستلام» المربوط في الورقة.",
    "val.commune_required_zr_home":
      "لشركة ZR (توصيل منزلي): البلدية مطلوبة في العمود المربوط قبل الإرسال.",
    // Sync
    "sync.button": "مزامنة الآن",
    "sync.auto_enable": "تفعيل المزامنة التلقائية",
    "sync.auto_disable": "إيقاف المزامنة التلقائية",
    "sync.last_sync": "آخر مزامنة: {0}",
    "sync.not_found": "لم يتم العثور على الشحنة",
    "sync.error": "خطأ في المزامنة: {0}",
    "sync.updated": "تم تحديث {0} شحنة",
    // Blacklist
    "blacklist.add": "إضافة للقائمة السوداء",
    "blacklist.remove": "إزالة من القائمة السوداء",
    "blacklist.warning": "تحذير: عميل في القائمة السوداء",
    "blacklist.reason": "سبب الإضافة",
    "blacklist.notes": "ملاحظات",
    // Stats
    "stats.title": "إحصائيات الطلبات",
    "stats.confirmation_rate": "معدل التأكيد",
    "stats.delivery_rate": "معدل التوصيل",
    "stats.return_rate": "معدل الإرجاع",
    "stats.no_status_column":
      "لم يُربَط عمود «الحالة». اربطه من قسم «ربط أعمدة الورقة» في الشريط الجانبي.",
    "stats.note":
      "يُستخرج التصنيف من نص «الحالة» و«رقم التتبع» المربوطين. لتصفية حسب الفترة اربط عمود «تاريخ الطلب».",
    "stats.bucket.delivered": "تم التسليم",
    "stats.bucket.in_transit": "قيد النقل",
    "stats.bucket.returned": "مرتجع",
    "stats.bucket.failed": "فشل",
    "stats.bucket.confirmed": "مؤكد",
    "stats.bucket.pending": "معلق",
    "stats.bucket.cancelled": "ملغي",
    "stats.bucket.unknown": "غير معروف",
    // Setup
    "setup.title": "إعداد وربط الأعمدة",
    "setup.step": "الخطوة {0} من {1}",
    "setup.next": "التالي",
    "setup.back": "السابق",
    "setup.save": "حفظ وإنهاء",
    "setup.saved": "تم الحفظ بنجاح",
    "setup.intro_short":
      "اضبط الأعمدة في الورقة ثم افتح لوحة التحكم من القائمة لربطها بالتفصيل.",
    "setup.mapping_section_title": "ربط الأعمدة",
    "setup.mapping_section_body":
      "من القائمة «Delivery Tool → فتح لوحة التحكم» افتح الشريط الجانبي واربط أعمدة الورقة (الحالة، التتبع، الرسوم…).",
    "setup.license_section_title": "الترخيص والتجربة",
    "setup.license_section_body":
      "من الشريط الجانبي فعّل التجربة أو أدخل كود التفعيل.",
    "setup.footer_hint":
      "يمكنك إعادة فتح هذه النافذة من القائمة: Delivery Tool → إعداد وربط الأعمدة.",
    "setup.checklist_title": "خطوات التهيئة السريعة",
    "setup.check.backend": "حفظ عنوان الخادم / الترخيص",
    "setup.check.mapping": "ربط الأعمدة المطلوبة في الشريط الجانبي",
    "setup.check.test_send": "تحليل التحديد وإرسال طلب تجريبي",
    // Business settings
    "biz.sender_wilaya": "ولاية المرسل",
    "biz.sender_address": "عنوان المرسل",
    "biz.business_name": "اسم النشاط التجاري",
    "biz.parcel_weight": "وزن الطرد الافتراضي (كغ)",
    "biz.parcel_length": "طول الطرد (سم)",
    "biz.parcel_width": "عرض الطرد (سم)",
    "biz.parcel_height": "ارتفاع الطرد (سم)",
    // Carrier creds
    "creds.yalidine_api_id": "معرف API Yalidine",
    "creds.yalidine_api_token": "رمز API Yalidine",
    "creds.zr_id": "معرف ZR",
    "creds.zr_token": "رمز ZR",
    // General
    "general.error": "حدث خطأ: {0}",
    "general.loading": "جاري التحميل...",
    "general.save": "حفظ",
    "general.cancel": "إلغاء",
    "general.close": "إغلاق",
    "general.yes": "نعم",
    "general.no": "لا",
    "general.license_required": "يتطلب ترخيصاً نشطاً",
    "general.reload": "إعادة التحميل",
    "sidebar.label.lang": "اللغة",
    "sidebar.lang.ar": "العربية",
    "sidebar.lang.fr": "Français",
    "sidebar.lang.en": "English",
    "sidebar.btn.apply_lang": "تطبيق اللغة",
    "sidebar.brand": "Delivery Tool",
    "sidebar.section.license": "الترخيص",
    "sidebar.section.collapse": "إخفاء",
    "sidebar.section.expand": "إظهار",
    "sidebar.label.backend_url": "عنوان الخادم (URL)",
    "sidebar.ph.backend_url": "https://your-api.example.com",
    "sidebar.btn.save_url": "حفظ العنوان",
    "sidebar.hint.backend_url":
      "",
    "sidebar.label.api_key_optional": "مفتاح API (اختياري)",
    "sidebar.ph.api_key": "إذا وُجدت API_KEY على الخادم",
    "sidebar.ph.api_key_replace": "مفتاح محفوظ (أدخل للاستبدال)",
    "sidebar.btn.save_key": "حفظ المفتاح",
    "sidebar.hint.api_key":
      "يُخزَّن لكل حساب Google. اتركه فارغاً إن لم يطلب الخادم مفتاحاً.",
    "sidebar.label.activation_code_optional": "كود التفعيل (اختياري)",
    "sidebar.btn.verify_activate": "تحقق / تفعيل",
    "sidebar.btn.forget_cache": "مسح الذاكرة المؤقتة",
    "sidebar.hint.license_send":
      "مع عنوان خادم صحيح، الإرسال والمزامنة يتطلبان ترخيصاً سارياً. فحص الصفوف المحددة يبقى متاحاً.",
    "sidebar.hint.license_jwt":
      "بعد كل نشر، تحقق من الترخيص إذا كان الخادم يستخدم LICENSE_SIGNING_SECRET حتى يتم تحديث صلاحية التوكن.",
    "sidebar.hint.advanced_title": "إعدادات متقدمة وتشخيص",
    "sidebar.section.carrier_keys": "اعتمادات شركات التوصيل",
    "sidebar.hint.carrier_keys":
      "اختر شركة التوصيل ثم احصل على رمز API من موقعهم الخاص",
    "sidebar.label.carrier": "شركة التوصيل",
    "sidebar.label.api_token": "مفتاح / رمز API",
    "sidebar.label.zr_tenant_id": "ZR tenantId",
    "sidebar.label.zr_secret_key": "ZR secretKey",
    "sidebar.btn.test_connection": "اختبار الاتصال",
    "sidebar.ph.carrier_token": "اتركه فارغاً واحفظ للمسح",
    "sidebar.ph.carrier_token_edit": "أدخل لتعيين أو استبدال",
    "sidebar.ph.zr_tenant_id": "أدخل tenantId",
    "sidebar.ph.zr_secret_key": "أدخل secretKey",
    "sidebar.ph.zr_tenant_saved": "tenantId محفوظ (أدخل للاستبدال)",
    "sidebar.ph.zr_secret_key_saved": "secretKey محفوظ (أدخل للاستبدال)",
    "sidebar.section.business": "بيانات المرسل الافتراضية",
    "sidebar.hint.business":
      "تُملأ تلقائياً في الطلب عند غياب القيمة في الورقة (الاسم، الهاتف، العنوان، الولاية، إلخ).",
    "sidebar.label.biz_name": "الاسم",
    "sidebar.label.biz_phone": "الهاتف",
    "sidebar.label.biz_address": "العنوان",
    "sidebar.label.biz_wilaya": "الولاية",
    "sidebar.label.biz_wilaya_code": "رمز الولاية",
    "sidebar.label.biz_commune": "البلدية",
    "sidebar.label.biz_default_carrier": "الناقل الافتراضي",
    "sidebar.label.biz_stopdesk":
      "معرّف المكتب / نقطة الاستلام (للتوصيل إلى المكتب عند ZR)",
    "sidebar.section.mapping": "ربط أعمدة الورقة",
    "sidebar.label.sheet": "الورقة",
    "sidebar.label.carrier_default": "شركة التوصيل",
    "sidebar.label.header_row_optional": "صف العناوين (اختياري)",
    "sidebar.section.row_selection": "تحديد الصفوف",
    "sidebar.label.row_selection_optional": "الصفوف (اختياري)",
    "sidebar.hint.row_selection":
      "بديل موثوق عندما لا يلتقط Google Sheets التحديد المتعدد من الشريط الجانبي. اكتب أرقام الصفوف أو النطاقات مثل 40,42,50-55. عند تعبئته يُستخدم في الفحص والإرسال والمزامنة وحساب الرسوم.",
    "sidebar.ph.row_selection": "مثال: 40,42,50-55",
    "sidebar.section.fees": "حساب رسوم التوصيل",
    "sidebar.hint.fees":
      "تعريف مبلغ الشحن بالدينار حسب شركة التوصيل وعمود الولاية المربوط. زر «تطبيق على التحديد» يكتب الرسوم في عمود «رسوم الشحن» المربوط — لا علاقة له بالقائمة السوداء.",
    "sidebar.label.fee_default_da": "الرسوم الافتراضية (دج)",
    "sidebar.label.fee_wilaya_optional": "حسب الولاية (اختياري)",
    "sidebar.ph.fee_wilaya": "16=600\nalger=550",
    "sidebar.hint.fee_wilaya_line":
      "سطر واحد لكل قاعدة: كود أو اسم = مبلغ (# تعليق)",
    "sidebar.hint.fee_wilaya_compat":
      "يتوافق مع قائمة الولايات (كود أو اسم) حتى لو كانت الخلية تعرض «16 — الجزائر».",
    "sidebar.btn.save_fee_rules": "حفظ القواعد",
    "sidebar.label.fee_overwrite": "استبدال الرسوم المملوءة مسبقاً",
    "sidebar.btn.apply_fees_selection": "تطبيق على التحديد",
    "sidebar.section.lists": "التحقق من البيانات والقائمة السوداء",
    "sidebar.hint.wilaya_list":
      "مقارنة عمود الولاية مع قائمة الولايات المعتمدة (٥٨ ولاية) وتلوين القيم غير المطابقة.",
    "sidebar.label.allow_invalid_wilaya": "السماح بقيم خارج القائمة (ترحيل)",
    "sidebar.btn.validate_wilaya": "التحقق من عمود الولاية",
    "sidebar.hint.commune_list":
      "البلديات: تُحمَّل من الخادم حسب الولاية. اختر الولاية ثم طبّق على عمود البلدية.",
    "sidebar.label.commune_wilaya": "الولاية لقائمة البلديات",
    "sidebar.btn.validate_commune": "التحقق من عمود البلدية",
    "sidebar.hint.blacklist_list":
      "تمييز بصري للصفوف المعلَّمة كقائمة سوداء (ليس حظر إرسال تلقائياً). اربط عمود «القائمة السوداء» و«سبب القائمة السوداء» ليظهر التحذير في «تحليل التحديد».",
    "sidebar.btn.blacklist_highlight": "تلوين القائمة السوداء",
    "sidebar.section.orders": "إرسال الطلبات ومتابعة التتبع",
    "sidebar.hint.select_rows":
      "١) اربط الأعمدة واحفظ. ٢) إذا كان تحديد عدة صفوف منفصلة في Google Sheets يحلل آخر صف فقط، اكتب أرقام الصفوف في الحقل أدناه مثل 40,42,50-55. ٣) «فحص الصفوف المحددة» للتحقق. ٤) «إنشاء الشحنات من التحديد». ٥) «مزامنة التتبع» لتحديث الحالة ورقم التتبع في الورقة.",
    "sidebar.btn.analyze_selection": "فحص الصفوف المحددة",
    "sidebar.btn.send_selection": "إنشاء الشحنات من التحديد",
    "sidebar.btn.sync_tracking": "مزامنة التتبع",
    "sidebar.btn.print_labels": "طباعة البوليصات",
    "sidebar.btn.print_all": "طباعة الكل",
    "sidebar.btn.print_all_again": "إعادة فتح البوليصات",
    "sidebar.section.journal": "سجل العمليات",
    "sidebar.hint.journal":
      "سجل مؤقت على هذا الجهاز لآخر عمليات الإرسال والمزامنة (حوالي ٢٢ عملية). بعد فشل جزء من الصفوف يمكنك «تحديد الفاشل — إرسال» ثم إعادة المحاولة من قسم الطلبات.",
    "sidebar.btn.journal_refresh": "تحديث",
    "sidebar.btn.journal_clear": "مسح السجل",
    "sidebar.btn.journal_retry_send": "تحديد الفاشل — إرسال",
    "sidebar.btn.journal_retry_sync": "تحديد الفاشل — مزامنة",
    "sidebar.section.stats": "إحصائيات الطلبات",
    "sidebar.hint.stats":
      "تلخيص أعداد الطلبات حسب عمود «الحالة» المربوط (ويمكن دمج «رقم التتبع»). اربط «تاريخ الطلب» لتقييد النتائج بفترة زمنية.",
    "sidebar.label.date_from_optional": "من (اختياري)",
    "sidebar.label.date_to_optional": "إلى (اختياري)",
    "sidebar.btn.compute_stats": "احسب",
    "sidebar.btn.stats_dashboard": "لوحة الإحصائيات",
    "sidebar.stats.modal_title": "لوحة إحصائيات الطلبات",
    "sidebar.stats.empty": "لا توجد بيانات إحصائية لعرضها.",
    "sidebar.stats.analyzed_rows": "الصفوف المحللة",
    "sidebar.stats.filter_range": "فترة التصفية",
    "sidebar.stats.total_rows": "إجمالي الصفوف",
    "sidebar.stats.distribution": "توزيع الحالات",
    "sidebar.stats.by_carrier": "حسب شركة التوصيل",
    "sidebar.stats.top_products": "أعلى المنتجات",
    "sidebar.stats.col_item": "العنصر",
    "sidebar.stats.col_total": "الإجمالي",
    "sidebar.map.orderId": "رقم الطلب",
    "sidebar.map.firstName": "الاسم",
    "sidebar.map.lastName": "اسم العائلة",
    "sidebar.map.fullName": "الاسم الكامل للمستلم",
    "sidebar.map.phone": "الهاتف",
    "sidebar.map.address": "العنوان",
    "sidebar.map.wilaya": "الولاية",
    "sidebar.map.wilayaCode": "رمز الولاية (اختياري)",
    "sidebar.map.commune": "البلدية / المدينة",
    "sidebar.map.product": "المنتج",
    "sidebar.map.qty": "الكمية",
    "sidebar.map.cod": "مبلغ الدفع عند الاستلام",
    "sidebar.map.shippingFee": "رسوم الشحن",
    "sidebar.map.deliveryType": "نوع التوصيل (منزل/مكتب)",
    "sidebar.map.stopDeskId": "معرّف المكتب / نقطة الاستلام (Stopdesk)",
    "sidebar.map.status": "الحالة",
    "sidebar.map.carrierCol": "الناقل (عمود)",
    "sidebar.map.tracking": "رقم التتبع",
    "sidebar.map.externalId": "معرّف الشحنة الخارجي (اختياري)",
    "sidebar.map.labelUrl": "رابط البوليصة (اختياري)",
    "sidebar.map.notes": "ملاحظات",
    "sidebar.map.blacklist": "القائمة السوداء",
    "sidebar.map.blacklistReason": "سبب القائمة السوداء (اختياري)",
    "sidebar.map.orderDate": "تاريخ الطلب (تصفية الإحصائيات)",
    "sidebar.map.group_required": "الأعمدة المطلوبة",
    "sidebar.map.group_required_hint":
      "مطلوب للإرسال: رقم الطلب، الهاتف، العنوان، الولاية، مبلغ التحصيل، واسم المستلم — اربط «الاسم الكامل» أو «الاسم» أو «اسم العائلة» (عمود واحد على الأقل يحتوي الاسم).",
    "sidebar.map.group_recommended": "أعمدة مُستحسَنة",
    "sidebar.map.group_recommended_hint":
      "",
    "sidebar.map.group_optional": "أعمدة اختيارية",
    "sidebar.map.group_optional_hint":
      "متقدمة: تتبع خارجي، روابط البوليصات، ملاحظات، وقوائم سوداء.",
    "sidebar.opt.none": "—",
    "sidebar.opt.empty_header": "(فارغ)",
    "sidebar.msg.no_columns_row1":
      "لا توجد أعمدة في صف العناوين المحدد. عدّل صف العناوين أو أضف عناوين.",
    "sidebar.msg.loading": "جاري التحميل…",
    "sidebar.msg.ready": "جاهز.",
    "sidebar.msg.no_sheets": "لا توجد أوراق.",
    "sidebar.msg.saving": "جاري الحفظ…",
    "sidebar.msg.lang_switching": "جاري تطبيق اللغة…",
    "sidebar.msg.lang_already_selected": "اللغة المحددة مفعّلة بالفعل.",
    "sidebar.msg.mapping_saved": "تم حفظ الربط.",
    "sidebar.msg.missing_context": "سياق مفقود.",
    "sidebar.msg.analyzing": "جاري فحص الصفوف المحددة…",
    "sidebar.msg.sending": "جاري الإرسال…",
    "sidebar.msg.syncing": "جاري المزامنة…",
    "sidebar.msg.validating_wilaya": "جاري التحقق من عمود الولاية…",
    "sidebar.msg.validating_communes": "جاري التحقق من البلديات…",
    "sidebar.msg.styling_blacklist": "جاري تلوين القائمة السوداء…",
    "sidebar.msg.computing_stats": "جاري حساب الإحصائيات…",
    "sidebar.msg.technical_details": "تفاصيل تقنية (JSON)",
    "sidebar.msg.auto_sync_enabled": "المزامنة التلقائية مفعلة (كل ساعة).",
    "sidebar.msg.auto_sync_disabled": "المزامنة التلقائية متوقفة.",
    "sidebar.msg.loading_labels": "جاري تحميل روابط البوليصات…",
    "sidebar.msg.labels_found": "تم العثور على {0} رابط بوليصة في الورقة.",
    "sidebar.msg.labels_cached": "تم حفظ {0} رابط بوليصة من آخر إرسال.",
    "sidebar.msg.labels_confirm_many":
      "سيتم فتح {0} رابط بوليصة في عدة نوافذ. هل تريد المتابعة؟",
    "sidebar.msg.labels_cancelled": "تم إلغاء فتح البوليصات.",
    "sidebar.msg.saving_key": "جاري حفظ المفتاح…",
    "sidebar.msg.key_saved": "تم حفظ المفتاح.",
    "sidebar.msg.key_cleared": "تم مسح المفتاح.",
    "sidebar.msg.key_carriers_fail":
      "المفتاح صحيح — تعذر تحميل شركات التوصيل: {0}",
    "sidebar.msg.backend_configured": "الخادم مهيأ.",
    "sidebar.msg.backend_need_url": "حدد عنوان الخادم.",
    "sidebar.msg.license_loading_title": "جاري التحقق من الترخيص…",
    "sidebar.msg.license_loading_body": "يرجى الانتظار قليلاً.",
    "sidebar.msg.url_saved": "تم حفظ العنوان.",
    "sidebar.msg.url_carriers_fail":
      "العنوان صحيح — تعذر تحميل شركات التوصيل (شبكة أو مفتاح): {0}",
    "sidebar.msg.verifying": "جاري التحقق…",
    "sidebar.msg.license_current": "الترخيص محدّث.",
    "sidebar.msg.cache_cleared": "تم مسح الذاكرة المؤقتة.",
    "sidebar.msg.saving_fee": "جاري حفظ القواعد…",
    "sidebar.msg.fee_saved": "تم حفظ القواعد لهذه الشركة.",
    "sidebar.msg.applying_fees": "جاري التطبيق…",
    "sidebar.msg.fee_result":
      "مُطبَّق: {0} صف. فارغ: {1}, بلا قاعدة: {2}, محفوظ: {3}, بلا ناقل: {4}",
    "sidebar.msg.choose_carrier": "اختر شركة توصيل.",
    "sidebar.msg.saving_carrier_cred": "جاري الحفظ…",
    "sidebar.msg.testing_carrier_cred": "جاري اختبار الاتصال…",
    "carrier.test.zr_direct_ok_legacy":
      "تم اختبار اتصال ZR مباشرة بنجاح (وضع توافق). يُفضَّل تحديث الخادم.",
    "carrier.test.zr_direct_fail": "فشل اختبار اتصال ZR المباشر ({0})",
    "sidebar.msg.carrier_saved": "تم حفظ المفتاح لهذه الشركة.",
    "sidebar.msg.carrier_cleared": "تم مسح المفتاح لهذه الشركة.",
    "sidebar.msg.biz_loading": "جاري التحميل…",
    "sidebar.msg.biz_ready": "جاهز.",
    "sidebar.msg.biz_load_error": "تعذر تحميل إعدادات النشاط.",
    "sidebar.msg.biz_wilaya_invalid": "رمز ولاية غير صالح.",
    "sidebar.msg.biz_saving": "جاري الحفظ…",
    "sidebar.msg.biz_saved": "تم الحفظ.",
    "sidebar.msg.wilaya_col_result": "العمود {0}: {1} صف(وف).",
    "sidebar.msg.commune_col_result":
      "البلديات (ولاية {0}) — العمود {1}: {2} صف(وف).",
    "sidebar.msg.blacklist_styled": "{0} صف(وف) حتى العمود {1}.",
    "sidebar.msg.rows_analyzed": "{0} صف محلل على «{1}».",
    "sidebar.msg.sync_meta": "آخر محاولة مزامنة: {0} · آخر نجاح: {1}",
    "sidebar.msg.sync_meta_na": "—",
    "sidebar.license.summary_license": "الترخيص",
    "sidebar.license.summary_state": "الحالة",
    "sidebar.license.no_cache": "لا توجد بيانات مؤقتة.",
    "sidebar.license.lbl_status": "الحالة: ",
    "sidebar.license.lbl_plan": "الباقة: ",
    "sidebar.license.lbl_trial_end": "نهاية التجربة: ",
    "sidebar.license.lbl_sub_end": "نهاية الاشتراك: ",
    "sidebar.license.lbl_key": "المفتاح: ",
    "sidebar.msg.journal_empty": "(فارغ)",
    "sidebar.msg.journal_line1": "— {0} · {1} · «{2}»",
    "sidebar.msg.journal_line2": "  {0} محاولة — {1} نجاح — {2} فشل",
    "sidebar.msg.journal_failed_rows": "  صفوف فاشلة: ",
    "sidebar.msg.journal_detail": "  التفاصيل:",
    "sidebar.msg.journal_row": "    س{0} — {1} — {2}",
    "sidebar.msg.ok_short": "نجاح",
    "sidebar.msg.ko_short": "فشل",
    "sidebar.msg.journal_entries": "{0} إدخال(ات) — ~{1} بايت.",
    "sidebar.msg.journal_clearing": "جاري المسح…",
    "sidebar.msg.journal_cleared": "تم مسح السجل.",
    "sidebar.msg.selecting": "جاري التحديد…",
    "sidebar.msg.journal_retry_send_ok":
      "تم تحديد {0} صف(وف) — أعد الإرسال من الطلبات.",
    "sidebar.msg.journal_retry_sync_ok":
      "تم تحديد {0} صف(وف) — أعد مزامنة التتبع.",
    "sidebar.msg.no_labels": "لا توجد بوليصات لآخر إرسال.",
    "sidebar.msg.labels_opened": "تم فتح {0} بوليصة في نوافذ جديدة.",
    "sidebar.msg.preview_footer_dup": " — تكرارات: تحليل الصفوف 2–{0}.",
    "sidebar.msg.preview_footer_warn": " — {0} صف(وف) مع تحذيرات.",
    "sidebar.msg.preview_summary":
      "{0} صف(وف) — {1} صالح(ة) (باستثناء الفارغ/العنوان).",
    "sidebar.msg.preview_invalid_rows": "صفوف غير صالحة: {0}.",
    "sidebar.msg.preview_warning_rows": "صفوف تحتوي تحذيرات: {0}.",
    "sidebar.msg.preview_only_header":
      "تنبيه: التحديد يبدو أنه صف العناوين فقط. حدد صفوف بيانات الطلبات ثم أعد «فحص الصفوف المحددة».",
    "sidebar.msg.preview_only_empty":
      "تنبيه: الصفوف المحددة فارغة أو بلا بيانات إرسال.",
    "sidebar.msg.send_summary": "إرسال: {0} صف(وف) — {1} نجاح، {2} فشل.",
    "sidebar.msg.sync_summary": "تتبع: {0} صف(وف) — {1} نجاح، {2} فشل.",
    "sidebar.msg.sync_last_ok": " — آخر مزامنة ناجحة: {0}",
    "sidebar.msg.stats_bucket_line":
      "تم التسليم: {0} · قيد النقل: {1} · مرتجع: {2} · فشل: {3}",
    "sidebar.msg.stats_filtered": "تم تطبيق فلتر التاريخ على النتائج.",
    "sidebar.msg.stats_filter_excluded":
      "خارج الفترة: قبل البداية {0} · بعد النهاية {1} · بلا تاريخ صالح {2}",
    "sidebar.msg.stats_detected_date_range":
      "نطاق التواريخ المكتشف في عمود التاريخ المستخدم: من {0} إلى {1}",
    "sidebar.msg.stats_zero_after_filter":
      "لا توجد صفوف مطابقة لفلتر التاريخ الحالي. تحقق من ربط «تاريخ الطلب» أو امسح حقلي «من/إلى».",
    "sidebar.msg.stats_order_date_unusable":
      "طُلب فلتر التاريخ، لكن لم يتم العثور على عمود «تاريخ الطلب» صالح. الإحصائيات المعروضة أدناه بدون فلتر؛ راجع ربط هذا العمود من الإعدادات.",
    "sidebar.msg.stats_order_date_auto_detected":
      "تم استخدام عمود تاريخ مكتشف تلقائياً: {0}",
    "sidebar.msg.stats_order_date_current_mapping":
      "الربط الحالي لعمود التاريخ: {0}",
    "sidebar.carrier_configured": " ✓",
  },
  fr: {
    "menu.open_sidebar": "Ouvrir le tableau de bord",
    "menu.setup": "Configuration des colonnes",
    "menu.sync": "Synchroniser les statuts",
    "menu.help": "Aide",
    "help.intro":
      "Ce guide rapide vous aide à configurer l’outil et résoudre les problèmes courants.",
    "help.steps_title": "Étapes essentielles",
    "help.step_open": "Ouvrez le tableau de bord depuis le menu Delivery Tool.",
    "help.step_map":
      "Enregistrez le mapping (statut, suivi, frais de livraison).",
    "help.step_send":
      "Analysez la sélection puis envoyez uniquement les lignes valides.",
    "help.step_sync":
      "Synchronisez le suivi manuellement ou activez la synchronisation automatique.",
    "help.troubleshoot_title": "Dépannage",
    "help.trouble_license":
      "Si envoi/sync échoue, vérifiez d’abord l’état de licence dans la carte Licence.",
    "help.trouble_backend":
      "Vérifiez que l’URL backend est correcte et accessible publiquement.",
    "help.trouble_labels":
      "Le bouton « Imprimer tout » nécessite la colonne URL étiquette (section Cartographie des colonnes).",
    "help.support":
      "Si le problème persiste, partagez une capture d’écran du message d’erreur avec le support.",
    "trial.welcome_title": "Bienvenue sur Delivery Tool",
    "trial.days_remaining": "{0} jours restants dans votre période d'essai",
    "trial.start_setup": "Commencer la cartographie des colonnes",
    "trial.expired_title": "Période d'essai terminée",
    "trial.expired_body":
      "Pour activer votre abonnement, contactez-nous sur WhatsApp",
    "trial.contact_whatsapp": "Contacter sur WhatsApp",
    "trial.badge_label": "Essai",
    "license.active": "Abonnement actif",
    "license.expired_title": "Abonnement expiré",
    "license.expired_body": "Pour renouveler, contactez-nous sur WhatsApp",
    "license.have_code": "J'ai un code d'activation",
    "license.enter_code": "Entrer le code d'activation",
    "license.activate": "Activer",
    "license.activate_success": "Activation réussie",
    "license.activate_error": "Code invalide ou expiré",
    "license.expires_on": "Expire le {0}",
    "license.renew_whatsapp": "Renouveler sur WhatsApp",
    "license.badge_active": "Actif",
    "license.badge_expired": "Expiré",
    "license.badge_unknown": "Inconnu",
    "error.mapping_invalid":
      "Cartographie des colonnes invalide. Enregistrez-la à nouveau depuis la barre latérale.",
    "error.mapping_setup_required":
      "Terminez d’abord la cartographie des colonnes pour cette feuille (barre latérale).",
    "error.select_rows": "Sélectionnez une plage de lignes.",
    "error.select_rows_tracking":
      "Sélectionnez une plage contenant des numéros de suivi.",
    "error.choose_carrier":
      "Choisissez un transporteur (valeur par défaut ou colonne transporteur dans la cartographie).",
    "error.zr_tenant_secret_required":
      "ZR exige de renseigner tenantId et secretKey ensemble.",
    "error.sheet_not_found": "Feuille introuvable.",
    "error.label_column_required":
      "Mappez d’abord la colonne URL étiquette (section Cartographie des colonnes).",
    "error.label_column_invalid": "Colonne URL étiquette invalide.",
    "error.url_must_be_http": "L'URL doit commencer par http:// ou https://",
    "error.backend_config_locked":
      "La configuration backend est verrouillée dans ce déploiement.",
    "error.backend_url_missing": "URL backend non configurée.",
    "error.api_http": "Erreur API ({0})",
    "error.api_invalid_json": "Réponse API invalide (JSON attendu).",
    "error.api_invalid_json_html":
      "La réponse serveur n'est pas du JSON (HTML reçu). Vérifiez l'URL backend/ngrok et la route API.",
    "error.business_payload_required":
      "Le payload des paramètres entreprise est requis.",
    "error.business_settings_too_large":
      "Paramètres entreprise trop volumineux.",
    "error.no_recent_failed_send": "Aucun envoi récent avec lignes en échec.",
    "error.no_recent_failed_sync":
      "Aucune synchronisation récente avec lignes en échec.",
    "error.switch_to_sheet_retry":
      "Passez à la feuille « {0} » puis réessayez.",
    "error.no_failed_rows_recorded": "Aucune ligne en échec enregistrée.",
    "error.invalid_rows_in_journal": "Lignes invalides dans le journal.",
    "error.stats_require_status_or_tracking":
      "Mappez au moins Statut ou N° suivi (cartographie des colonnes) pour les statistiques commandes.",
    "error.wilaya_column_required":
      "Mappez la colonne Wilaya (section Cartographie des colonnes).",
    "error.wilaya_column_invalid": "Colonne wilaya invalide.",
    "error.backend_url_required_for_communes":
      "URL backend requise pour charger les communes.",
    "error.wilaya_invalid_range": "Wilaya invalide (1–58).",
    "error.no_communes_for_wilaya": "Aucune commune pour cette wilaya.",
    "error.commune_column_required":
      "Mappez la colonne Commune (section Cartographie des colonnes).",
    "error.commune_column_invalid": "Colonne commune invalide.",
    "error.blacklist_column_required":
      "Mappez la colonne Liste noire avant surlignage.",
    "error.blacklist_column_invalid": "Colonne liste noire invalide.",
    "error.invalid_data": "Données invalides.",
    "error.row_selection_invalid":
      "Format de lignes invalide. Exemple : 40,42,50-55",
    "error.default_fee_invalid": "Frais par défaut invalide (nombre attendu).",
    "error.fee_rules_too_large": "Règles de frais trop volumineuses.",
    "error.shipping_fee_column_required":
      "Mappez la colonne Frais de livraison (section Cartographie des colonnes).",
    "error.tracking_column_required":
      "Mappez la colonne N° suivi (section Cartographie des colonnes).",
    "error.dup_tracking_row": "N° de suivi en double (ligne {0}).",
    "error.dup_order_id_row": "ID commande en double (ligne {0}).",
    "error.dup_phone_product_row":
      "Même téléphone + même produit que la ligne {0}.",
    "error.backend_carriers_load_with_reason":
      "Impossible de charger les transporteurs depuis le backend : {0}",
    "error.backend_carriers_load":
      "Impossible de charger les transporteurs depuis le backend.",
    "warn.backend_carriers_fallback":
      "Impossible de charger les transporteurs depuis le backend. La liste locale est utilisée temporairement.",
    "warn.backend_carriers_fallback_with_reason":
      "Impossible de charger les transporteurs depuis le backend. La liste locale est utilisée temporairement. Raison : {0}",
    "error.wrong_spreadsheet": "Classeur incorrect.",
    "error.columns_format_invalid": "Format des colonnes invalide.",
    "error.mapping_too_large":
      "Cartographie des colonnes trop volumineuse (max ~9 Ko).",
    "error.invalid_lang": "Langue invalide.",
    "error.no_valid_rows_for_send":
      "Aucune ligne valide à envoyer. Vérifiez le mapping (téléphone, adresse, wilaya, nom du destinataire, transporteur).",
    "error.send_in_progress":
      "Un envoi est déjà en cours. Réessayez dans quelques secondes.",
    "error.sync_in_progress":
      "Une synchronisation est déjà en cours. Réessayez dans quelques secondes.",
    "send.button": "Envoyer les commandes",
    "send.sending": "⏳ Envoi...",
    "send.success": "{0} commande(s) envoyée(s)",
    "send.partial": "{0} sur {1} envoyées. Cliquez à nouveau pour continuer.",
    "send.already_sent": "Déjà envoyé",
    "send.sent_status": "Envoyé",
    "send.confirm": "Confirmer l'envoi",
    "send.preview": "Aperçu des commandes",
    "send.print_labels": "Imprimer les étiquettes",
    "send.print_all": "Tout imprimer",
    "send.error_generic":
      "Échec de l’envoi de la commande. Réessayez ou vérifiez la configuration du transporteur.",
    "val.phone_required": "Téléphone requis",
    "val.phone_invalid": "Téléphone invalide (doit commencer par 05/06/07)",
    "val.address_required": "Adresse requise",
    "val.wilaya_required": "Wilaya requise",
    "val.wilaya_invalid": "Code wilaya invalide",
    "val.carrier_required": "Transporteur requis",
    "val.cod_invalid": "Montant COD invalide",
    "val.name_required": "Nom du client requis",
    "val.stopdesk_required":
      "Pour une livraison bureau/point relais, renseignez l’ID bureau (stop-desk) dans la colonne mappée ou les paramètres expéditeur.",
    "val.stopdesk_required_zr":
      "ZR : pour une livraison bureau/point relais, renseignez l’ID bureau (stop-desk) dans la colonne mappée.",
    "val.commune_required_zr_home":
      "ZR (livraison à domicile) : la commune est requise dans la colonne mappée avant l’envoi.",
    "sync.button": "Synchroniser maintenant",
    "sync.auto_enable": "Activer la sync auto",
    "sync.auto_disable": "Désactiver la sync auto",
    "sync.last_sync": "Dernière sync: {0}",
    "sync.not_found": "Expédition introuvable",
    "sync.error": "Erreur de synchronisation: {0}",
    "sync.updated": "{0} expédition(s) mise(s) à jour",
    "blacklist.add": "Ajouter à la liste noire",
    "blacklist.remove": "Retirer de la liste noire",
    "blacklist.warning": "Attention: client en liste noire",
    "blacklist.reason": "Motif",
    "blacklist.notes": "Notes",
    "stats.title": "Statistiques commandes",
    "stats.confirmation_rate": "Taux de confirmation",
    "stats.delivery_rate": "Taux de livraison",
    "stats.return_rate": "Taux de retour",
    "stats.no_status_column":
      "Colonne Statut non mappée. Mappez-la dans la section Cartographie des colonnes.",
    "stats.note":
      "La classification utilise Statut + N° suivi. Pour filtrer par période, mappez Date commande.",
    "stats.bucket.delivered": "Livrée",
    "stats.bucket.in_transit": "En transit",
    "stats.bucket.returned": "Retour",
    "stats.bucket.failed": "Échec",
    "stats.bucket.confirmed": "Confirmée",
    "stats.bucket.pending": "En attente",
    "stats.bucket.cancelled": "Annulée",
    "stats.bucket.unknown": "Inconnue",
    "setup.title": "Configuration des colonnes",
    "setup.step": "Étape {0} sur {1}",
    "setup.next": "Suivant",
    "setup.back": "Précédent",
    "setup.save": "Enregistrer",
    "setup.saved": "Enregistré avec succès",
    "setup.intro_short":
      "Utilisez ce document pour une vue d’ensemble. Pour configurer les colonnes, ouvrez le tableau de bord latéral.",
    "setup.mapping_section_title": "Cartographie des colonnes",
    "setup.mapping_section_body":
      "Dans la barre latérale Delivery Tool, choisissez la feuille et associez vos colonnes (statut, suivi, frais…).",
    "setup.license_section_title": "Licence et essai",
    "setup.license_section_body":
      "Depuis la barre latérale, activez votre licence ou démarrez l’essai.",
    "setup.footer_hint":
      "Astuce : rouvrez cette fenêtre via Delivery Tool → Configuration des colonnes.",
    "setup.checklist_title": "Checklist de mise en route",
    "setup.check.backend": "Enregistrer l’URL backend / licence",
    "setup.check.mapping":
      "Mapper les colonnes requises dans la barre latérale",
    "setup.check.test_send": "Analyser la sélection et envoyer un test",
    "biz.sender_wilaya": "Wilaya de l'expéditeur",
    "biz.sender_address": "Adresse de l'expéditeur",
    "biz.business_name": "Nom de l'entreprise",
    "biz.parcel_weight": "Poids du colis par défaut (kg)",
    "biz.parcel_length": "Longueur (cm)",
    "biz.parcel_width": "Largeur (cm)",
    "biz.parcel_height": "Hauteur (cm)",
    "creds.yalidine_api_id": "ID API Yalidine",
    "creds.yalidine_api_token": "Token API Yalidine",
    "creds.zr_id": "ID ZR",
    "creds.zr_token": "Token ZR",
    "general.error": "Erreur: {0}",
    "general.loading": "Chargement...",
    "general.save": "Enregistrer",
    "general.cancel": "Annuler",
    "general.close": "Fermer",
    "general.yes": "Oui",
    "general.no": "Non",
    "general.license_required": "Licence active requise",
    "general.reload": "Recharger",
    "sidebar.label.lang": "Langue",
    "sidebar.lang.ar": "العربية",
    "sidebar.lang.fr": "Français",
    "sidebar.lang.en": "English",
    "sidebar.btn.apply_lang": "Appliquer la langue",
    "sidebar.brand": "Delivery Tool",
    "sidebar.section.license": "Licence",
    "sidebar.section.collapse": "Réduire",
    "sidebar.section.expand": "Afficher",
    "sidebar.label.backend_url": "URL du backend",
    "sidebar.ph.backend_url": "https://votre-api.example.com",
    "sidebar.btn.save_url": "Enregistrer l'URL",
    "sidebar.hint.backend_url":
      "L'URL doit être accessible sur Internet (pas localhost). Enregistrée par compte Google. Valeur par défaut possible via la propriété script dt.api.baseUrl.",
    "sidebar.label.api_key_optional": "Clé API backend (optionnel)",
    "sidebar.ph.api_key": "Si API_KEY est défini sur le serveur",
    "sidebar.ph.api_key_replace": "Clé enregistrée (saisir pour remplacer)",
    "sidebar.btn.save_key": "Enregistrer la clé",
    "sidebar.hint.api_key":
      "Stockée par compte Google (UserProperties). Laissez vide si le serveur n'exige pas de clé.",
    "sidebar.label.activation_code_optional": "Code d'activation (optionnel)",
    "sidebar.btn.verify_activate": "Vérifier / activer",
    "sidebar.btn.forget_cache": "Oublier le cache",
    "sidebar.hint.license_send":
      "Avec une URL backend configurée, l'envoi et la synchronisation exigent une licence à jour. L'analyse de la sélection reste disponible.",
    "sidebar.hint.license_jwt":
      "Si le serveur définit LICENSE_SIGNING_SECRET, rafraîchissez la licence après chaque déploiement pour mettre à jour la validité du jeton.",
    "sidebar.hint.advanced_title": "Diagnostic avancé",
    "sidebar.section.carrier_keys": "Identifiants transporteurs",
    "sidebar.hint.carrier_keys":
      "Stockés par compte Google, pas dans les cellules. Utilisés seulement pour « Envoyer la sélection » et « Sync suivi ». ZR : tenantId + secretKey, puis Enregistrer et Tester la connexion.",
    "sidebar.label.carrier": "Transporteur",
    "sidebar.label.api_token": "Clé / token API",
    "sidebar.label.zr_tenant_id": "ZR tenantId",
    "sidebar.label.zr_secret_key": "ZR secretKey",
    "sidebar.btn.test_connection": "Tester la connexion",
    "sidebar.ph.carrier_token": "Laisser vide et enregistrer pour effacer",
    "sidebar.ph.carrier_token_edit": "Saisir pour définir ou remplacer",
    "sidebar.ph.zr_tenant_id": "Saisir le tenantId",
    "sidebar.ph.zr_secret_key": "Saisir le secretKey",
    "sidebar.ph.zr_tenant_saved": "tenantId enregistré (saisir pour remplacer)",
    "sidebar.ph.zr_secret_key_saved":
      "secretKey enregistré (saisir pour remplacer)",
    "sidebar.section.business": "Expéditeur par défaut",
    "sidebar.hint.business":
      "Remplissent la commande quand la feuille n’a pas la valeur (nom, téléphone, adresse, wilaya, etc.).",
    "sidebar.label.biz_name": "Nom",
    "sidebar.label.biz_phone": "Téléphone",
    "sidebar.label.biz_address": "Adresse",
    "sidebar.label.biz_wilaya": "Wilaya",
    "sidebar.label.biz_wilaya_code": "Code wilaya",
    "sidebar.label.biz_commune": "Commune",
    "sidebar.label.biz_default_carrier": "Transporteur par défaut",
    "sidebar.label.biz_stopdesk":
      "ID bureau / stop-desk (livraison bureau, ex. ZR)",
    "sidebar.section.mapping": "Cartographie des colonnes",
    "sidebar.label.sheet": "Feuille",
    "sidebar.label.carrier_default": "Transporteur",
    "sidebar.label.header_row_optional": "Ligne d’en-tête (optionnel)",
    "sidebar.section.row_selection": "Sélection des lignes",
    "sidebar.label.row_selection_optional": "Lignes (optionnel)",
    "sidebar.hint.row_selection":
      "Solution fiable quand Google Sheets ne transmet pas la multi-sélection depuis la barre latérale. Saisissez des numéros de lignes ou plages comme 40,42,50-55. Si ce champ est rempli, il sera utilisé pour l’analyse, l’envoi, la synchro et l’application des frais.",
    "sidebar.ph.row_selection": "Ex. : 40,42,50-55",
    "sidebar.section.fees": "Calcul des frais de livraison",
    "sidebar.hint.fees":
      "Montants en DA par transporteur et wilaya (colonne mappée). « Appliquer à la sélection » écrit dans la colonne « Frais de livraison » mappée — indépendant de la liste noire.",
    "sidebar.label.fee_default_da": "Frais par défaut (DA)",
    "sidebar.label.fee_wilaya_optional": "Par wilaya (optionnel)",
    "sidebar.ph.fee_wilaya": "16=600\nalger=550",
    "sidebar.hint.fee_wilaya_line":
      "Une règle par ligne : code ou nom = montant (# = commentaire)",
    "sidebar.hint.fee_wilaya_compat":
      "Compatible code ou nom de wilaya même si la cellule affiche « 16 — Alger ».",
    "sidebar.btn.save_fee_rules": "Enregistrer les règles",
    "sidebar.label.fee_overwrite": "Écraser les frais déjà remplis",
    "sidebar.btn.apply_fees_selection": "Appliquer à la sélection",
    "sidebar.section.lists": "Contrôle des données & liste noire",
    "sidebar.hint.wilaya_list":
      "Compare la colonne wilaya à la liste des 58 wilayas et colore les valeurs invalides.",
    "sidebar.label.allow_invalid_wilaya":
      "Autoriser les valeurs hors liste (migration)",
    "sidebar.btn.validate_wilaya": "Valider colonne wilaya",
    "sidebar.hint.commune_list":
      "Communes : chargées depuis le backend par wilaya. Choisissez la wilaya puis appliquez.",
    "sidebar.label.commune_wilaya": "Wilaya pour la liste des communes",
    "sidebar.btn.validate_commune": "Valider colonne commune",
    "sidebar.hint.blacklist_list":
      "Mise en forme des lignes marquées liste noire (pas un blocage d’envoi automatique). Mappez motif + indicateur pour l’avertissement dans « Analyser la sélection ».",
    "sidebar.btn.blacklist_highlight": "Surligner liste noire",
    "sidebar.section.orders": "Envoi & suivi des commandes",
    "sidebar.hint.select_rows":
      "1) Cartographiez et enregistrez. 2) Si la multi-sélection de lignes séparées dans Google Sheets n’analyse que la dernière ligne, saisissez les numéros dans le champ ci-dessous, par ex. 40,42,50-55. 3) Analyser. 4) Envoyer la sélection. 5) Sync suivi pour mettre à jour statut / tracking.",
    "sidebar.btn.analyze_selection": "Analyser la sélection",
    "sidebar.btn.send_selection": "Envoyer la sélection",
    "sidebar.btn.sync_tracking": "Sync suivi",
    "sidebar.btn.print_labels": "Imprimer les étiquettes",
    "sidebar.btn.print_all": "Imprimer tout",
    "sidebar.btn.print_all_again": "Rouvrir les étiquettes",
    "sidebar.section.journal": "Journal des opérations",
    "sidebar.hint.journal":
      "Historique local (~22 opérations) pour envoi et sync. Après échec : « Sélectionner échecs — envoi » puis réessayez depuis Commandes.",
    "sidebar.btn.journal_refresh": "Actualiser",
    "sidebar.btn.journal_clear": "Effacer le journal",
    "sidebar.btn.journal_retry_send": "Sélectionner échecs — envoi",
    "sidebar.btn.journal_retry_sync": "Sélectionner échecs — sync",
    "sidebar.section.stats": "Statistiques commandes",
    "sidebar.hint.stats":
      "Compte les commandes par colonne Statut mappée (et peut combiner le n° de suivi). Mappez la date pour limiter à une période.",
    "sidebar.label.date_from_optional": "Du (optionnel)",
    "sidebar.label.date_to_optional": "Au (optionnel)",
    "sidebar.btn.compute_stats": "Calculer",
    "sidebar.btn.stats_dashboard": "Tableau stats",
    "sidebar.stats.modal_title": "Tableau de statistiques",
    "sidebar.stats.empty": "Aucune statistique à afficher.",
    "sidebar.stats.analyzed_rows": "Lignes analysées",
    "sidebar.stats.filter_range": "Période filtrée",
    "sidebar.stats.total_rows": "Total lignes",
    "sidebar.stats.distribution": "Répartition des statuts",
    "sidebar.stats.by_carrier": "Par transporteur",
    "sidebar.stats.top_products": "Top produits",
    "sidebar.stats.col_item": "Élément",
    "sidebar.stats.col_total": "Total",
    "sidebar.map.orderId": "N° commande",
    "sidebar.map.firstName": "Prénom",
    "sidebar.map.lastName": "Nom",
    "sidebar.map.fullName": "Nom complet du destinataire",
    "sidebar.map.phone": "Téléphone",
    "sidebar.map.address": "Adresse",
    "sidebar.map.wilaya": "Wilaya",
    "sidebar.map.wilayaCode": "Code wilaya (optionnel)",
    "sidebar.map.commune": "Commune / ville",
    "sidebar.map.product": "Produit",
    "sidebar.map.qty": "Quantité",
    "sidebar.map.cod": "Montant COD",
    "sidebar.map.shippingFee": "Frais de livraison",
    "sidebar.map.deliveryType": "Type livraison (domicile/point relais)",
    "sidebar.map.stopDeskId": "ID bureau / stop-desk",
    "sidebar.map.status": "Statut",
    "sidebar.map.carrierCol": "Transporteur (colonne)",
    "sidebar.map.tracking": "N° suivi",
    "sidebar.map.externalId": "ID expédition externe (optionnel)",
    "sidebar.map.labelUrl": "URL étiquette (optionnel)",
    "sidebar.map.notes": "Notes",
    "sidebar.map.blacklist": "Liste noire",
    "sidebar.map.blacklistReason": "Motif liste noire (optionnel)",
    "sidebar.map.orderDate": "Date commande (stats)",
    "sidebar.map.group_required": "Colonnes obligatoires",
    "sidebar.map.group_required_hint":
      "Obligatoire : ID commande, téléphone, adresse, wilaya, montant COD, et nom du destinataire — mappez le nom complet et/ou prénom et/ou nom (au moins une colonne avec le nom).",
    "sidebar.map.group_recommended": "Colonnes recommandées",
    "sidebar.map.group_recommended_hint":
      "Commune, type de livraison, ID bureau pour stop-desk, colonnes statut et suivi pour la synchronisation.",
    "sidebar.map.group_optional": "Colonnes optionnelles",
    "sidebar.map.group_optional_hint":
      "Avancé : suivi externe, URLs étiquettes, notes, liste noire.",
    "sidebar.opt.none": "—",
    "sidebar.opt.empty_header": "(vide)",
    "sidebar.msg.no_columns_row1":
      "Aucune colonne dans la ligne d’en-tête sélectionnée.",
    "sidebar.msg.loading": "Chargement…",
    "sidebar.msg.ready": "Prêt.",
    "sidebar.msg.no_sheets": "Aucune feuille.",
    "sidebar.msg.saving": "Enregistrement…",
    "sidebar.msg.lang_switching": "Application de la langue…",
    "sidebar.msg.lang_already_selected":
      "La langue sélectionnée est déjà active.",
    "sidebar.msg.mapping_saved": "Cartographie enregistrée.",
    "sidebar.msg.missing_context": "Contexte manquant.",
    "sidebar.msg.analyzing": "Analyse…",
    "sidebar.msg.sending": "Envoi…",
    "sidebar.msg.syncing": "Synchronisation…",
    "sidebar.msg.validating_wilaya": "Validation wilaya…",
    "sidebar.msg.validating_communes": "Validation communes…",
    "sidebar.msg.styling_blacklist": "Mise en forme liste noire…",
    "sidebar.msg.computing_stats": "Calcul statistiques…",
    "sidebar.msg.technical_details": "Détails techniques (JSON)",
    "sidebar.msg.auto_sync_enabled":
      "Synchronisation automatique activée (toutes les heures).",
    "sidebar.msg.auto_sync_disabled": "Synchronisation automatique désactivée.",
    "sidebar.msg.loading_labels": "Chargement des liens d’étiquettes…",
    "sidebar.msg.labels_found":
      "{0} lien(s) d’étiquette trouvé(s) dans la feuille.",
    "sidebar.msg.labels_cached":
      "{0} lien(s) d’étiquette mis en cache depuis le dernier envoi.",
    "sidebar.msg.labels_confirm_many":
      "{0} liens d’étiquette vont s’ouvrir dans plusieurs onglets. Continuer ?",
    "sidebar.msg.labels_cancelled": "Ouverture des étiquettes annulée.",
    "sidebar.msg.saving_key": "Enregistrement de la clé…",
    "sidebar.msg.key_saved": "Clé enregistrée pour ce compte.",
    "sidebar.msg.key_cleared": "Clé effacée.",
    "sidebar.msg.key_carriers_fail":
      "Clé OK — impossible de charger les transporteurs : {0}",
    "sidebar.msg.backend_configured": "Backend configuré.",
    "sidebar.msg.backend_need_url": "Définissez l'URL du backend.",
    "sidebar.msg.license_loading_title": "Vérification de la licence…",
    "sidebar.msg.license_loading_body": "Veuillez patienter.",
    "sidebar.msg.url_saved": "URL enregistrée.",
    "sidebar.msg.url_carriers_fail":
      "URL OK — impossible de charger les transporteurs (réseau ou clé API) : {0}",
    "sidebar.msg.verifying": "Vérification…",
    "sidebar.msg.license_current": "Licence à jour.",
    "sidebar.msg.cache_cleared": "Cache effacé.",
    "sidebar.msg.saving_fee": "Enregistrement…",
    "sidebar.msg.fee_saved": "Règles enregistrées pour ce transporteur.",
    "sidebar.msg.applying_fees": "Application…",
    "sidebar.msg.fee_result":
      "Appliqué : {0} ligne(s). Vide : {1}, sans règle : {2}, conservés : {3}, sans transporteur : {4}",
    "sidebar.msg.choose_carrier": "Choisissez un transporteur.",
    "sidebar.msg.saving_carrier_cred": "Enregistrement…",
    "sidebar.msg.testing_carrier_cred": "Test de connexion…",
    "carrier.test.zr_direct_ok_legacy":
      "Connexion ZR vérifiée directement (mode compatibilité). Mettez le backend à jour de préférence.",
    "carrier.test.zr_direct_fail": "Échec du test direct ZR ({0})",
    "sidebar.msg.carrier_saved": "Clé enregistrée pour ce transporteur.",
    "sidebar.msg.carrier_cleared": "Clé effacée pour ce transporteur.",
    "sidebar.msg.biz_loading": "Chargement…",
    "sidebar.msg.biz_ready": "Prêt.",
    "sidebar.msg.biz_load_error":
      "Impossible de charger les paramètres entreprise.",
    "sidebar.msg.biz_wilaya_invalid": "Code wilaya invalide.",
    "sidebar.msg.biz_saving": "Enregistrement…",
    "sidebar.msg.biz_saved": "Enregistré.",
    "sidebar.msg.wilaya_col_result": "Colonne {0} : {1} ligne(s).",
    "sidebar.msg.commune_col_result":
      "Communes (wilaya {0}) — colonne {1} : {2} ligne(s).",
    "sidebar.msg.blacklist_styled": "{0} ligne(s) jusqu'à la colonne {1}.",
    "sidebar.msg.rows_analyzed": "{0} ligne(s) analysée(s) sur «{1}».",
    "sidebar.msg.sync_meta":
      "Dernière tentative de sync : {0} · Dernière sync réussie : {1}",
    "sidebar.msg.sync_meta_na": "—",
    "sidebar.license.summary_license": "Licence",
    "sidebar.license.summary_state": "État",
    "sidebar.license.no_cache": "Aucune donnée en cache.",
    "sidebar.license.lbl_status": "Statut : ",
    "sidebar.license.lbl_plan": "Offre : ",
    "sidebar.license.lbl_trial_end": "Fin d'essai : ",
    "sidebar.license.lbl_sub_end": "Fin d'abonnement : ",
    "sidebar.license.lbl_key": "Clé : ",
    "sidebar.msg.journal_empty": "(vide)",
    "sidebar.msg.journal_line1": "— {0} · {1} · «{2}»",
    "sidebar.msg.journal_line2": "  {0} tentative(s) — {1} OK — {2} échec(s)",
    "sidebar.msg.journal_failed_rows": "  Lignes en échec : ",
    "sidebar.msg.journal_detail": "  Détail :",
    "sidebar.msg.journal_row": "    L{0} — {1} — {2}",
    "sidebar.msg.ok_short": "OK",
    "sidebar.msg.ko_short": "KO",
    "sidebar.msg.journal_entries": "{0} entrée(s) — ~{1} octets.",
    "sidebar.msg.journal_clearing": "Effacement…",
    "sidebar.msg.journal_cleared": "Journal effacé.",
    "sidebar.msg.selecting": "Sélection…",
    "sidebar.msg.journal_retry_send_ok":
      "{0} ligne(s) sélectionnée(s) — renvoyez depuis Commandes.",
    "sidebar.msg.journal_retry_sync_ok":
      "{0} ligne(s) sélectionnée(s) — relancez Sync suivi.",
    "sidebar.msg.no_labels": "Aucune étiquette pour le dernier envoi.",
    "sidebar.msg.labels_opened":
      "{0} étiquette(s) ouverte(s) dans de nouveaux onglets.",
    "sidebar.msg.preview_footer_dup": " — Doublons : analyse lignes 2–{0}.",
    "sidebar.msg.preview_footer_warn": " — {0} ligne(s) avec avertissement(s).",
    "sidebar.msg.preview_summary":
      "{0} ligne(s) — {1} valide(s) (hors vides / en-tête).",
    "sidebar.msg.preview_invalid_rows": "Lignes invalides : {0}.",
    "sidebar.msg.preview_warning_rows": "Lignes avec avertissements : {0}.",
    "sidebar.msg.preview_only_header":
      "Attention : la sélection semble être la ligne d’en-tête seulement. Sélectionnez les lignes de commandes puis relancez « Analyser la sélection ».",
    "sidebar.msg.preview_only_empty":
      "Attention : les lignes sélectionnées sont vides ou sans données d’envoi.",
    "sidebar.msg.send_summary": "Envoi : {0} ligne(s) — {1} OK, {2} échec(s).",
    "sidebar.msg.sync_summary": "Suivi : {0} ligne(s) — {1} OK, {2} échec(s).",
    "sidebar.msg.sync_last_ok": " — Dernière sync réussie : {0}",
    "sidebar.msg.stats_bucket_line":
      "Livrées : {0} · En transit : {1} · Retours : {2} · Échecs : {3}",
    "sidebar.msg.stats_filtered": "Le filtre de date est appliqué.",
    "sidebar.msg.stats_filter_excluded":
      "Hors période : avant début {0} · après fin {1} · sans date valide {2}",
    "sidebar.msg.stats_detected_date_range":
      "Plage de dates détectée dans la colonne date utilisée : du {0} au {1}",
    "sidebar.msg.stats_zero_after_filter":
      "Aucune ligne ne correspond au filtre de date actuel. Vérifiez le mapping « Date commande » ou videz les champs « Du/Au ».",
    "sidebar.msg.stats_order_date_unusable":
      "Le filtre de date a été demandé, mais aucune colonne « Date commande » valide n’a été trouvée. Les statistiques ci-dessous sont donc non filtrées ; vérifiez ce mapping.",
    "sidebar.msg.stats_order_date_auto_detected":
      "Colonne date détectée automatiquement : {0}",
    "sidebar.msg.stats_order_date_current_mapping":
      "Mapping actuel de la date : {0}",
    "sidebar.carrier_configured": " ✓",
  },
  en: {
    "menu.open_sidebar": "Open Dashboard",
    "menu.setup": "Column Setup",
    "menu.sync": "Sync Shipment Status",
    "menu.help": "Help",
    "help.intro":
      "This quick guide helps you configure the add-on and troubleshoot common issues.",
    "help.steps_title": "Essential steps",
    "help.step_open": "Open the dashboard from the Delivery Tool menu.",
    "help.step_map":
      "Save mapping for required columns (status, tracking, shipping fee).",
    "help.step_send": "Analyze selection first, then send only valid rows.",
    "help.step_sync": "Run tracking sync manually or enable hourly auto-sync.",
    "help.troubleshoot_title": "Troubleshooting",
    "help.trouble_license":
      "If send/sync fails, verify license state in the License card first.",
    "help.trouble_backend":
      "Make sure backend URL is correct and publicly reachable.",
    "help.trouble_labels":
      "“Print all” requires the mapped Label URL column (Column mapping section).",
    "help.support":
      "If the issue persists, share a screenshot of the exact status/error with support.",
    "trial.welcome_title": "Welcome to Delivery Tool",
    "trial.days_remaining": "{0} days remaining in your trial",
    "trial.start_setup": "Start column mapping",
    "trial.expired_title": "Trial Period Ended",
    "trial.expired_body":
      "To activate your subscription, contact us on WhatsApp",
    "trial.contact_whatsapp": "Contact on WhatsApp",
    "trial.badge_label": "Trial",
    "license.active": "Subscription active",
    "license.expired_title": "Subscription expired",
    "license.expired_body": "To renew, contact us on WhatsApp",
    "license.have_code": "I have an activation code",
    "license.enter_code": "Enter activation code",
    "license.activate": "Activate",
    "license.activate_success": "Activated successfully",
    "license.activate_error": "Invalid or expired code",
    "license.expires_on": "Expires on {0}",
    "license.renew_whatsapp": "Renew on WhatsApp",
    "license.badge_active": "Active",
    "license.badge_expired": "Expired",
    "license.badge_unknown": "Unknown",
    "error.mapping_invalid":
      "Saved column mapping is invalid. Save it again from the sidebar.",
    "error.mapping_setup_required":
      "Finish column mapping for this sheet first (sidebar).",
    "error.select_rows": "Select a range of rows.",
    "error.select_rows_tracking": "Select a range containing tracking numbers.",
    "error.choose_carrier":
      "Choose a carrier (default carrier or carrier column in Column mapping).",
    "error.zr_tenant_secret_required":
      "ZR requires both tenantId and secretKey.",
    "error.sheet_not_found": "Sheet not found.",
    "error.label_column_required":
      "Map the Label URL column first (Column mapping section).",
    "error.label_column_invalid": "Invalid Label URL column.",
    "error.url_must_be_http": "URL must start with http:// or https://",
    "error.backend_config_locked":
      "Backend configuration is locked in this deployment.",
    "error.backend_url_missing": "Backend URL is not configured.",
    "error.api_http": "API error ({0})",
    "error.api_invalid_json": "Invalid API response (expected JSON).",
    "error.api_invalid_json_html":
      "Server response is not JSON (received HTML). Check backend/ngrok URL and API path.",
    "error.business_payload_required": "Business settings payload is required.",
    "error.business_settings_too_large":
      "Business settings payload is too large.",
    "error.no_recent_failed_send": "No recent send with failed rows.",
    "error.no_recent_failed_sync": "No recent sync with failed rows.",
    "error.switch_to_sheet_retry": 'Switch to sheet "{0}" and try again.',
    "error.no_failed_rows_recorded": "No failed rows were recorded.",
    "error.invalid_rows_in_journal": "Invalid row references in journal.",
    "error.stats_require_status_or_tracking":
      "Map at least Status or Tracking (Column mapping) for order statistics.",
    "error.wilaya_column_required":
      "Map the Wilaya column (Column mapping section).",
    "error.wilaya_column_invalid": "Invalid Wilaya column.",
    "error.backend_url_required_for_communes":
      "Backend URL is required to load communes.",
    "error.wilaya_invalid_range": "Invalid wilaya (must be 1 to 58).",
    "error.no_communes_for_wilaya": "No communes found for this wilaya.",
    "error.commune_column_required":
      "Map the Commune column (Column mapping section).",
    "error.commune_column_invalid": "Invalid Commune column.",
    "error.blacklist_column_required":
      "Map the Blacklist column before highlighting.",
    "error.blacklist_column_invalid": "Invalid Blacklist column.",
    "error.invalid_data": "Invalid data payload.",
    "error.row_selection_invalid":
      "Invalid row selector. Example: 40,42,50-55",
    "error.default_fee_invalid": "Invalid default fee (number expected).",
    "error.fee_rules_too_large":
      "Fee rules are too large (reduce wilaya lines).",
    "error.shipping_fee_column_required":
      "Map the Shipping Fee column (Column mapping section).",
    "error.tracking_column_required":
      "Map the Tracking Number column (Column mapping section).",
    "error.dup_tracking_row": "Duplicate tracking number (row {0}).",
    "error.dup_order_id_row": "Duplicate order ID (row {0}).",
    "error.dup_phone_product_row": "Same phone + same product as row {0}.",
    "error.backend_carriers_load_with_reason":
      "Could not load carriers from backend: {0}",
    "error.backend_carriers_load": "Could not load carriers from backend.",
    "warn.backend_carriers_fallback":
      "Could not load carriers from backend. Using local carrier list temporarily.",
    "warn.backend_carriers_fallback_with_reason":
      "Could not load carriers from backend. Using local carrier list temporarily. Reason: {0}",
    "error.wrong_spreadsheet": "Wrong spreadsheet context.",
    "error.columns_format_invalid": "Invalid columns format.",
    "error.mapping_too_large":
      "Column mapping payload is too large (max ~9KB).",
    "error.invalid_lang": "Invalid language.",
    "error.no_valid_rows_for_send":
      "No valid rows to send. Check required mapping (phone, address, wilaya, recipient name, carrier).",
    "error.send_in_progress":
      "Another send operation is already running. Please retry in a few seconds.",
    "error.sync_in_progress":
      "Another sync operation is already running. Please retry in a few seconds.",
    "send.button": "Send Orders",
    "send.sending": "⏳ Sending...",
    "send.success": "{0} order(s) sent successfully",
    "send.partial": "{0} of {1} sent. Click again to continue.",
    "send.already_sent": "Already sent",
    "send.sent_status": "Sent",
    "send.confirm": "Confirm Send",
    "send.preview": "Preview Orders",
    "send.print_labels": "Print Labels",
    "send.print_all": "Print All",
    "send.error_generic":
      "Failed to send order. Please try again or check carrier configuration.",
    "val.phone_required": "Phone number required",
    "val.phone_invalid": "Invalid phone (must start with 05/06/07)",
    "val.address_required": "Address required",
    "val.wilaya_required": "Wilaya required",
    "val.wilaya_invalid": "Invalid wilaya code",
    "val.carrier_required": "Carrier required",
    "val.cod_invalid": "Invalid COD amount",
    "val.name_required": "Customer name required",
    "val.stopdesk_required":
      "For desk/pickup-point delivery, fill the mapped Office / stop-desk ID (or sender defaults).",
    "val.stopdesk_required_zr":
      "ZR: for desk/pickup-point delivery, fill the mapped Office / stop-desk ID column.",
    "val.commune_required_zr_home":
      "ZR (home delivery): commune is required in the mapped column before send.",
    "sync.button": "Sync Now",
    "sync.auto_enable": "Enable Auto-Sync",
    "sync.auto_disable": "Disable Auto-Sync",
    "sync.last_sync": "Last sync: {0}",
    "sync.not_found": "Shipment not found",
    "sync.error": "Sync error: {0}",
    "sync.updated": "{0} shipment(s) updated",
    "blacklist.add": "Add to Blacklist",
    "blacklist.remove": "Remove from Blacklist",
    "blacklist.warning": "Warning: customer is blacklisted",
    "blacklist.reason": "Reason",
    "blacklist.notes": "Notes",
    "stats.title": "Order statistics",
    "stats.confirmation_rate": "Confirmation rate",
    "stats.delivery_rate": "Delivery rate",
    "stats.return_rate": "Return rate",
    "stats.no_status_column":
      "Status column not mapped. Map it in Column mapping.",
    "stats.note":
      "Classification uses Status + tracking. To filter by date range, map Order Date.",
    "stats.bucket.delivered": "Delivered",
    "stats.bucket.in_transit": "In transit",
    "stats.bucket.returned": "Returned",
    "stats.bucket.failed": "Failed",
    "stats.bucket.confirmed": "Confirmed",
    "stats.bucket.pending": "Pending",
    "stats.bucket.cancelled": "Cancelled",
    "stats.bucket.unknown": "Unknown",
    "setup.title": "Column Setup",
    "setup.step": "Step {0} of {1}",
    "setup.next": "Next",
    "setup.back": "Back",
    "setup.save": "Save & Finish",
    "setup.saved": "Saved successfully",
    "setup.intro_short":
      "Use this sheet as a companion. Open the Delivery Tool sidebar to configure actual column mapping.",
    "setup.mapping_section_title": "Column mapping",
    "setup.mapping_section_body":
      "From the sidebar, pick your sheet and map columns such as status, tracking, fees, and blacklist.",
    "setup.license_section_title": "License and trial",
    "setup.license_section_body":
      "In the sidebar, start your trial or activate your paid license.",
    "setup.footer_hint":
      "Tip: reopen this panel from Delivery Tool → Column Setup.",
    "setup.checklist_title": "Quick setup checklist",
    "setup.check.backend": "Save backend URL / license",
    "setup.check.mapping": "Map required columns in the sidebar",
    "setup.check.test_send": "Analyze selection and send a test batch",
    "biz.sender_wilaya": "Sender wilaya",
    "biz.sender_address": "Sender address",
    "biz.business_name": "Business name",
    "biz.parcel_weight": "Default parcel weight (kg)",
    "biz.parcel_length": "Length (cm)",
    "biz.parcel_width": "Width (cm)",
    "biz.parcel_height": "Height (cm)",
    "creds.yalidine_api_id": "Yalidine API ID",
    "creds.yalidine_api_token": "Yalidine API Token",
    "creds.zr_id": "ZR ID",
    "creds.zr_token": "ZR Token",
    "general.error": "Error: {0}",
    "general.loading": "Loading...",
    "general.save": "Save",
    "general.cancel": "Cancel",
    "general.close": "Close",
    "general.yes": "Yes",
    "general.no": "No",
    "general.license_required": "Active license required",
    "general.reload": "Reload",
    "sidebar.label.lang": "Language",
    "sidebar.lang.ar": "العربية",
    "sidebar.lang.fr": "Français",
    "sidebar.lang.en": "English",
    "sidebar.btn.apply_lang": "Apply language",
    "sidebar.brand": "Delivery Tool",
    "sidebar.section.license": "License",
    "sidebar.section.collapse": "Collapse",
    "sidebar.section.expand": "Expand",
    "sidebar.label.backend_url": "Backend URL",
    "sidebar.ph.backend_url": "https://your-api.example.com",
    "sidebar.btn.save_url": "Save URL",
    "sidebar.hint.backend_url":
      "Must be reachable on the internet (not localhost). Saved per Google account. Default can be set via script property dt.api.baseUrl.",
    "sidebar.label.api_key_optional": "Backend API key (optional)",
    "sidebar.ph.api_key": "If the server uses API_KEY",
    "sidebar.ph.api_key_replace": "Key on file (enter to replace)",
    "sidebar.btn.save_key": "Save key",
    "sidebar.hint.api_key":
      "Stored per Google account. Leave empty if the server does not require a key.",
    "sidebar.label.activation_code_optional": "Activation code (optional)",
    "sidebar.btn.verify_activate": "Verify / activate",
    "sidebar.btn.forget_cache": "Clear cache",
    "sidebar.hint.license_send":
      "With a configured backend URL, send and sync require a current license. Selection analysis stays available.",
    "sidebar.hint.license_jwt":
      "If the server sets LICENSE_SIGNING_SECRET, refresh the license after each deploy so the access token expiry stays in sync.",
    "sidebar.hint.advanced_title": "Advanced diagnostics",
    "sidebar.section.carrier_keys": "Carrier credentials",
    "sidebar.hint.carrier_keys":
      "Stored per Google account, not in cells. Used only for “Send selection” and “Sync tracking”. ZR: tenantId + secretKey, then Save and Test connection.",
    "sidebar.label.carrier": "Carrier",
    "sidebar.label.api_token": "API key / token",
    "sidebar.label.zr_tenant_id": "ZR tenantId",
    "sidebar.label.zr_secret_key": "ZR secretKey",
    "sidebar.btn.test_connection": "Test connection",
    "sidebar.ph.carrier_token": "Leave blank and save to clear",
    "sidebar.ph.carrier_token_edit": "Enter to set or replace",
    "sidebar.ph.zr_tenant_id": "Enter tenantId",
    "sidebar.ph.zr_secret_key": "Enter secretKey",
    "sidebar.ph.zr_tenant_saved": "tenantId saved (enter to replace)",
    "sidebar.ph.zr_secret_key_saved": "secretKey saved (enter to replace)",
    "sidebar.section.business": "Default sender details",
    "sidebar.hint.business":
      "Fill gaps when the sheet row is missing a value (name, phone, address, wilaya, etc.).",
    "sidebar.label.biz_name": "Name",
    "sidebar.label.biz_phone": "Phone",
    "sidebar.label.biz_address": "Address",
    "sidebar.label.biz_wilaya": "Wilaya",
    "sidebar.label.biz_wilaya_code": "Wilaya code",
    "sidebar.label.biz_commune": "Commune",
    "sidebar.label.biz_default_carrier": "Default carrier",
    "sidebar.label.biz_stopdesk":
      "Office / stop-desk ID (desk delivery, e.g. ZR)",
    "sidebar.section.mapping": "Column mapping",
    "sidebar.label.sheet": "Sheet",
    "sidebar.label.carrier_default": "Carrier",
    "sidebar.label.header_row_optional": "Header row (optional)",
    "sidebar.section.row_selection": "Row selection",
    "sidebar.label.row_selection_optional": "Rows (optional)",
    "sidebar.hint.row_selection":
      "Reliable fallback when Google Sheets does not preserve multi-select from the sidebar. Enter row numbers or ranges like 40,42,50-55. When filled, this is used for analyze, send, sync, and fee apply.",
    "sidebar.ph.row_selection": "Example: 40,42,50-55",
    "sidebar.section.fees": "Delivery fee calculation",
    "sidebar.hint.fees":
      "DZD amounts per carrier and mapped wilaya. “Apply to selection” writes into the mapped “Shipping fee” column — unrelated to the blacklist.",
    "sidebar.label.fee_default_da": "Default fee (DZD)",
    "sidebar.label.fee_wilaya_optional": "Per wilaya (optional)",
    "sidebar.ph.fee_wilaya": "16=600\nalger=550",
    "sidebar.hint.fee_wilaya_line":
      "One rule per line: code or name = amount (# comment)",
    "sidebar.hint.fee_wilaya_compat":
      "Works with wilaya code or name even if the cell shows “16 — Algiers”.",
    "sidebar.btn.save_fee_rules": "Save rules",
    "sidebar.label.fee_overwrite": "Overwrite existing fee cells",
    "sidebar.btn.apply_fees_selection": "Apply to selection",
    "sidebar.section.lists": "Data checks & blacklist",
    "sidebar.hint.wilaya_list":
      "Compare the wilaya column to the 58 wilayas and highlight invalid values.",
    "sidebar.label.allow_invalid_wilaya":
      "Allow values outside the list (migration)",
    "sidebar.btn.validate_wilaya": "Validate wilaya column",
    "sidebar.hint.commune_list":
      "Communes: loaded from the backend by wilaya. Pick wilaya then apply to the commune column.",
    "sidebar.label.commune_wilaya": "Wilaya for commune list",
    "sidebar.btn.validate_commune": "Validate commune column",
    "sidebar.hint.blacklist_list":
      "Visual highlight for rows marked blacklist (does not block send by itself). Map flag + reason so “Analyze selection” can show a warning.",
    "sidebar.btn.blacklist_highlight": "Highlight blacklist",
    "sidebar.section.orders": "Send orders & tracking",
    "sidebar.hint.select_rows":
      "1) Map columns and save. 2) If selecting separate rows in Google Sheets only analyzes the last row, enter the row numbers in the field below, for example 40,42,50-55. 3) Analyze selection. 4) Send selection. 5) Sync tracking to refresh status / tracking in the sheet.",
    "sidebar.btn.analyze_selection": "Analyze selection",
    "sidebar.btn.send_selection": "Send selection",
    "sidebar.btn.sync_tracking": "Sync tracking",
    "sidebar.btn.print_labels": "Print labels",
    "sidebar.btn.print_all": "Print all",
    "sidebar.btn.print_all_again": "Re-open labels",
    "sidebar.section.journal": "Activity log",
    "sidebar.hint.journal":
      "Local log (~22 operations) for send and sync. After failures: “Select failures — send”, then retry from Orders.",
    "sidebar.btn.journal_refresh": "Refresh",
    "sidebar.btn.journal_clear": "Clear journal",
    "sidebar.btn.journal_retry_send": "Select failures — send",
    "sidebar.btn.journal_retry_sync": "Select failures — sync",
    "sidebar.section.stats": "Order statistics",
    "sidebar.hint.stats":
      "Counts rows by mapped Status (optionally with tracking). Map “Order date” to limit results to a date range.",
    "sidebar.label.date_from_optional": "From (optional)",
    "sidebar.label.date_to_optional": "To (optional)",
    "sidebar.btn.compute_stats": "Compute",
    "sidebar.btn.stats_dashboard": "Stats dashboard",
    "sidebar.stats.modal_title": "Order statistics dashboard",
    "sidebar.stats.empty": "No statistics available yet.",
    "sidebar.stats.analyzed_rows": "Analyzed rows",
    "sidebar.stats.filter_range": "Filtered range",
    "sidebar.stats.total_rows": "Total rows",
    "sidebar.stats.distribution": "Status distribution",
    "sidebar.stats.by_carrier": "By carrier",
    "sidebar.stats.top_products": "Top products",
    "sidebar.stats.col_item": "Item",
    "sidebar.stats.col_total": "Total",
    "sidebar.map.orderId": "Order ID",
    "sidebar.map.firstName": "First name",
    "sidebar.map.lastName": "Last name",
    "sidebar.map.fullName": "Recipient full name",
    "sidebar.map.phone": "Phone",
    "sidebar.map.address": "Address",
    "sidebar.map.wilaya": "Wilaya",
    "sidebar.map.wilayaCode": "Wilaya code (optional)",
    "sidebar.map.commune": "Commune / city",
    "sidebar.map.product": "Product",
    "sidebar.map.qty": "Quantity",
    "sidebar.map.cod": "COD amount",
    "sidebar.map.shippingFee": "Shipping fee",
    "sidebar.map.deliveryType": "Delivery type (home/pickup-point)",
    "sidebar.map.stopDeskId": "Office / stop-desk ID",
    "sidebar.map.status": "Status",
    "sidebar.map.carrierCol": "Carrier (column)",
    "sidebar.map.tracking": "Tracking number",
    "sidebar.map.externalId": "External shipment ID (optional)",
    "sidebar.map.labelUrl": "Label URL (optional)",
    "sidebar.map.notes": "Notes",
    "sidebar.map.blacklist": "Blacklist",
    "sidebar.map.blacklistReason": "Blacklist reason (optional)",
    "sidebar.map.orderDate": "Order date (stats filter)",
    "sidebar.map.group_required": "Required fields",
    "sidebar.map.group_required_hint":
      "Required: order ID, phone, address, wilaya, COD amount, and recipient name — map full name and/or first and/or last (at least one name column).",
    "sidebar.map.group_recommended": "Recommended fields",
    "sidebar.map.group_recommended_hint":
      "Commune, delivery type, office ID for stop-desk, status and tracking columns for sync back from the carrier.",
    "sidebar.map.group_optional": "Optional fields",
    "sidebar.map.group_optional_hint":
      "Advanced: external tracking, label URLs, notes, and blacklist columns.",
    "sidebar.opt.none": "—",
    "sidebar.opt.empty_header": "(empty)",
    "sidebar.msg.no_columns_row1":
      "No columns found in the selected header row.",
    "sidebar.msg.loading": "Loading…",
    "sidebar.msg.ready": "Ready.",
    "sidebar.msg.no_sheets": "No sheets.",
    "sidebar.msg.saving": "Saving…",
    "sidebar.msg.lang_switching": "Applying language…",
    "sidebar.msg.lang_already_selected":
      "Selected language is already active.",
    "sidebar.msg.mapping_saved": "Mapping saved.",
    "sidebar.msg.missing_context": "Missing context.",
    "sidebar.msg.analyzing": "Analyzing…",
    "sidebar.msg.sending": "Sending…",
    "sidebar.msg.syncing": "Syncing…",
    "sidebar.msg.validating_wilaya": "Validating wilaya column…",
    "sidebar.msg.validating_communes": "Validating communes…",
    "sidebar.msg.styling_blacklist": "Styling blacklist rows…",
    "sidebar.msg.computing_stats": "Computing statistics…",
    "sidebar.msg.technical_details": "Technical details (JSON)",
    "sidebar.msg.auto_sync_enabled": "Auto-sync is enabled (hourly).",
    "sidebar.msg.auto_sync_disabled": "Auto-sync is disabled.",
    "sidebar.msg.loading_labels": "Loading label URLs…",
    "sidebar.msg.labels_found": "Found {0} label URL(s) in the sheet.",
    "sidebar.msg.labels_cached": "Cached {0} label URL(s) from the last send.",
    "sidebar.msg.labels_confirm_many":
      "About to open {0} label URL(s) in multiple tabs. Continue?",
    "sidebar.msg.labels_cancelled": "Opening labels was cancelled.",
    "sidebar.msg.saving_key": "Saving key…",
    "sidebar.msg.key_saved": "Key saved for this account.",
    "sidebar.msg.key_cleared": "Key cleared.",
    "sidebar.msg.key_carriers_fail": "Key OK — could not load carriers: {0}",
    "sidebar.msg.backend_configured": "Backend configured.",
    "sidebar.msg.backend_need_url": "Set the backend URL.",
    "sidebar.msg.license_loading_title": "Checking license…",
    "sidebar.msg.license_loading_body": "Please wait.",
    "sidebar.msg.url_saved": "URL saved.",
    "sidebar.msg.url_carriers_fail":
      "URL OK — could not load carriers (network or API key): {0}",
    "sidebar.msg.verifying": "Verifying…",
    "sidebar.msg.license_current": "License is up to date.",
    "sidebar.msg.cache_cleared": "Cache cleared.",
    "sidebar.msg.saving_fee": "Saving…",
    "sidebar.msg.fee_saved": "Rules saved for this carrier.",
    "sidebar.msg.applying_fees": "Applying…",
    "sidebar.msg.fee_result":
      "Applied: {0} row(s). Empty: {1}, no rule: {2}, kept: {3}, no carrier: {4}",
    "sidebar.msg.choose_carrier": "Choose a carrier.",
    "sidebar.msg.saving_carrier_cred": "Saving…",
    "sidebar.msg.testing_carrier_cred": "Testing connection…",
    "carrier.test.zr_direct_ok_legacy":
      "ZR connection verified directly (compat mode). Backend update is recommended.",
    "carrier.test.zr_direct_fail": "ZR direct connection test failed ({0})",
    "sidebar.msg.carrier_saved": "Key saved for this carrier.",
    "sidebar.msg.carrier_cleared": "Key cleared for this carrier.",
    "sidebar.msg.biz_loading": "Loading…",
    "sidebar.msg.biz_ready": "Ready.",
    "sidebar.msg.biz_load_error": "Could not load business settings.",
    "sidebar.msg.biz_wilaya_invalid": "Invalid wilaya code.",
    "sidebar.msg.biz_saving": "Saving…",
    "sidebar.msg.biz_saved": "Saved.",
    "sidebar.msg.wilaya_col_result": "Column {0}: {1} row(s).",
    "sidebar.msg.commune_col_result":
      "Communes (wilaya {0}) — column {1}: {2} row(s).",
    "sidebar.msg.blacklist_styled": "{0} row(s) up to column {1}.",
    "sidebar.msg.rows_analyzed": "{0} row(s) analyzed on “{1}”.",
    "sidebar.msg.sync_meta":
      "Last sync attempt: {0} · Last successful sync: {1}",
    "sidebar.msg.sync_meta_na": "—",
    "sidebar.license.summary_license": "License",
    "sidebar.license.summary_state": "Status",
    "sidebar.license.no_cache": "Nothing cached.",
    "sidebar.license.lbl_status": "Status: ",
    "sidebar.license.lbl_plan": "Plan: ",
    "sidebar.license.lbl_trial_end": "Trial ends: ",
    "sidebar.license.lbl_sub_end": "Subscription ends: ",
    "sidebar.license.lbl_key": "Key: ",
    "sidebar.msg.journal_empty": "(empty)",
    "sidebar.msg.journal_line1": "— {0} · {1} · “{2}”",
    "sidebar.msg.journal_line2": "  {0} attempt(s) — {1} OK — {2} failed",
    "sidebar.msg.journal_failed_rows": "  Failed rows: ",
    "sidebar.msg.journal_detail": "  Detail:",
    "sidebar.msg.journal_row": "    R{0} — {1} — {2}",
    "sidebar.msg.ok_short": "OK",
    "sidebar.msg.ko_short": "Fail",
    "sidebar.msg.journal_entries": "{0} entr(y/ies) — ~{1} bytes.",
    "sidebar.msg.journal_clearing": "Clearing…",
    "sidebar.msg.journal_cleared": "Journal cleared.",
    "sidebar.msg.selecting": "Selecting…",
    "sidebar.msg.journal_retry_send_ok":
      "{0} row(s) selected — resend from Orders.",
    "sidebar.msg.journal_retry_sync_ok":
      "{0} row(s) selected — run sync tracking again.",
    "sidebar.msg.no_labels": "No labels for the last send.",
    "sidebar.msg.labels_opened": "Opened {0} label(s) in new tabs.",
    "sidebar.msg.preview_footer_dup": " — Duplicates: sheet rows 2–{0}.",
    "sidebar.msg.preview_footer_warn": " — {0} row(s) with warnings.",
    "sidebar.msg.preview_summary":
      "{0} row(s) — {1} valid (excluding blanks / header).",
    "sidebar.msg.preview_invalid_rows": "Invalid rows: {0}.",
    "sidebar.msg.preview_warning_rows": "Rows with warnings: {0}.",
    "sidebar.msg.preview_only_header":
      "Note: the selection looks like the header row only. Select data rows, then run “Analyze selection” again.",
    "sidebar.msg.preview_only_empty":
      "Note: selected rows are empty or have no sendable data.",
    "sidebar.msg.send_summary": "Send: {0} row(s) — {1} OK, {2} failed.",
    "sidebar.msg.sync_summary": "Tracking: {0} row(s) — {1} OK, {2} failed.",
    "sidebar.msg.sync_last_ok": " — Last successful sync: {0}",
    "sidebar.msg.stats_bucket_line":
      "Delivered: {0} · In transit: {1} · Returned: {2} · Failed: {3}",
    "sidebar.msg.stats_filtered": "Date filter is applied.",
    "sidebar.msg.stats_filter_excluded":
      "Excluded by date filter: before start {0} · after end {1} · no valid order date {2}",
    "sidebar.msg.stats_detected_date_range":
      "Detected date range in the date column being used: {0} to {1}",
    "sidebar.msg.stats_zero_after_filter":
      "No rows matched the current date filter. Check the mapped Order date column or clear the From/To fields.",
    "sidebar.msg.stats_order_date_unusable":
      "A date filter was requested, but no valid Order date column could be found. The stats below are unfiltered; review that mapping.",
    "sidebar.msg.stats_order_date_auto_detected":
      "Using auto-detected date column: {0}",
    "sidebar.msg.stats_order_date_current_mapping":
      "Current date mapping: {0}",
    "sidebar.carrier_configured": " ✓",
  },
};
