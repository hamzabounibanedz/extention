/**

 * @fileoverview Algeria wilayas (58) — codes + French labels for validation and fees.

 * Source: official numbering (post-2019 splits).

 */



/**

 * @typedef {Object} WilayaEntry

 * @property {number} code

 * @property {string} fr

 */



/**

 * @return {Array<WilayaEntry>}

 */

function wilaya_getAll_() {

  return [

    { code: 1, fr: 'Adrar' },

    { code: 2, fr: 'Chlef' },

    { code: 3, fr: 'Laghouat' },

    { code: 4, fr: 'Oum El Bouaghi' },

    { code: 5, fr: 'Batna' },

    { code: 6, fr: 'Béjaïa' },

    { code: 7, fr: 'Biskra' },

    { code: 8, fr: 'Béchar' },

    { code: 9, fr: 'Blida' },

    { code: 10, fr: 'Bouira' },

    { code: 11, fr: 'Tamanrasset' },

    { code: 12, fr: 'Tébessa' },

    { code: 13, fr: 'Tlemcen' },

    { code: 14, fr: 'Tiaret' },

    { code: 15, fr: 'Tizi Ouzou' },

    { code: 16, fr: 'Alger' },

    { code: 17, fr: 'Djelfa' },

    { code: 18, fr: 'Jijel' },

    { code: 19, fr: 'Sétif' },

    { code: 20, fr: 'Saïda' },

    { code: 21, fr: 'Skikda' },

    { code: 22, fr: 'Sidi Bel Abbès' },

    { code: 23, fr: 'Annaba' },

    { code: 24, fr: 'Guelma' },

    { code: 25, fr: 'Constantine' },

    { code: 26, fr: 'Médéa' },

    { code: 27, fr: 'Mostaganem' },

    { code: 28, fr: "M'Sila" },

    { code: 29, fr: 'Mascara' },

    { code: 30, fr: 'Ouargla' },

    { code: 31, fr: 'Oran' },

    { code: 32, fr: 'El Bayadh' },

    { code: 33, fr: 'Illizi' },

    { code: 34, fr: 'Bordj Bou Arreridj' },

    { code: 35, fr: 'Boumerdès' },

    { code: 36, fr: 'El Tarf' },

    { code: 37, fr: 'Tindouf' },

    { code: 38, fr: 'Tissemsilt' },

    { code: 39, fr: 'El Oued' },

    { code: 40, fr: 'Khenchela' },

    { code: 41, fr: 'Souk Ahras' },

    { code: 42, fr: 'Tipaza' },

    { code: 43, fr: 'Mila' },

    { code: 44, fr: 'Aïn Defla' },

    { code: 45, fr: 'Naâma' },

    { code: 46, fr: 'Aïn Témouchent' },

    { code: 47, fr: 'Ghardaïa' },

    { code: 48, fr: 'Relizane' },

    { code: 49, fr: 'Timimoun' },

    { code: 50, fr: 'Bordj Badji Mokhtar' },

    { code: 51, fr: 'Ouled Djellal' },

    { code: 52, fr: 'Béni Abbès' },

    { code: 53, fr: 'In Salah' },

    { code: 54, fr: 'In Guezzam' },

    { code: 55, fr: 'Touggourt' },

    { code: 56, fr: 'Djanet' },

    { code: 57, fr: "El M'Ghair" },

    { code: 58, fr: 'El Meniaa' },

  ];

}

/**
 * Arabic (and short Latin) aliases for every official wilaya code 1–58.
 * Used with {@link wilaya_getAll_} French labels + {@link wilaya_resolveCodeFromText_} so any cell
 * like «الشلف», «Oran», «17 — …» resolves to the correct code — not only one wilaya.
 * Keys must be exactly "1".."58" with a non-empty names array each.
 * @return {Object<string, Array<string>>}
 */
function wilaya_getArabicAliasesByCode_() {
  var map = {
    "1": ["أدرار"],
    "2": ["الشلف", "شلف"],
    "3": ["الأغواط", "أغواط", "الاغواط", "اغواط"],
    "4": ["أم البواقي", "ام البواقي"],
    "5": ["باتنة"],
    "6": ["بجاية"],
    "7": ["بسكرة"],
    "8": ["بشار"],
    "9": ["البليدة", "بليدة"],
    "10": ["البويرة", "بويرة"],
    "11": ["تمنراست"],
    "12": ["تبسة"],
    "13": ["تلمسان"],
    "14": ["تيارت"],
    "15": ["تيزي وزو", "تيزي-وزو"],
    "16": ["الجزائر", "جزائر", "الجزاير"],
    "17": ["الجلفة", "جلفة"],
    "18": ["جيجل"],
    "19": ["سطيف"],
    "20": ["سعيدة"],
    "21": ["سكيكدة", "سكيكده"],
    "22": ["سيدي بلعباس"],
    "23": ["عنابة"],
    "24": ["قالمة"],
    "25": ["قسنطينة", "كونستانتين"],
    "26": ["المدية", "مدية"],
    "27": ["مستغانم"],
    "28": ["المسيلة", "مسيلة", "مسيله"],
    "29": ["معسكر", "ماسكارا"],
    "30": ["ورقلة"],
    "31": ["وهران", "oran"],
    "32": ["البيض", "بيض"],
    "33": ["إليزي", "اليزي", "illizi"],
    "34": ["برج بوعريريج", "بورج بوعريريج"],
    "35": ["بومرداس"],
    "36": ["الطارف", "طارف"],
    "37": ["تندوف"],
    "38": ["تيسمسيلت"],
    "39": ["الوادي", "وادي سوف", "الوادى"],
    "40": ["خنشلة"],
    "41": ["سوق أهراس", "سوق اهراس"],
    "42": ["تيبازة", "تيپازة", "tipaza"],
    "43": ["ميلة"],
    "44": ["عين الدفلى", "عين الدفلا", "ain defla"],
    "45": ["النعامة", "نعامة"],
    "46": ["عين تموشنت"],
    "47": ["غرداية", "غردايه"],
    "48": ["غليزان", "relizane"],
    "49": ["تيميمون"],
    "50": ["برج باجي مختار"],
    "51": ["أولاد جلال", "اولاد جلال"],
    "52": ["بني عباس"],
    "53": ["إن صالح", "ان صالح", "عين صالح"],
    "54": ["إن قزام", "ان قزام", "ان ڨزام"],
    "55": ["تڨرت", "تقرت", "touggourt"],
    "56": ["جانت"],
    "57": ["المغير", "el mghair"],
    "58": ["المنيعة", "منيعة", "el meniaa"],
  };
  for (var c = 1; c <= 58; c++) {
    var key = String(c);
    if (!map[key] || !map[key].length) {
      throw new Error("wilaya_getArabicAliasesByCode_: missing aliases for wilaya " + key);
    }
  }
  return map;
}

/**
 * @param {string|null|undefined} s
 * @return {string}
 */
function wilaya_normalizeLatinForMatch_(s) {
  if (s == null) return "";
  return String(s)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[''`´]+/g, "")
    .replace(/[_./|-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @param {string|null|undefined} s
 * @return {string}
 */
function wilaya_normalizeArabic_(s) {
  if (s == null) return "";
  var t = String(s).trim();
  t = t.replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "");
  t = t.replace(/[\u0622\u0623\u0625\u0671]/g, "\u0627");
  t = t.replace(/\u0649/g, "\u064A");
  t = t.replace(/\u06CC/g, "\u064A");
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

/**
 * @param {string} norm
 * @return {string}
 */
function wilaya_stripArabicArticle_(norm) {
  if (!norm || norm.length < 3) return norm;
  if (norm.indexOf("\u0627\u0644") === 0) {
    return norm.substring(2).trim();
  }
  return norm;
}

/**
 * @param {string} a
 * @param {string} b
 * @return {boolean}
 */
function wilaya_arabicNamesMatch_(a, b) {
  var na = wilaya_normalizeArabic_(a);
  var nb = wilaya_normalizeArabic_(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  var sa = wilaya_stripArabicArticle_(na);
  var sb = wilaya_stripArabicArticle_(nb);
  if (sa === sb) return true;
  if (na === sb || nb === sa) return true;
  return false;
}

/**
 * Resolve official wilaya code (1–58) from a cell: leading digits, French label, or Arabic name.
 * @param {string|null|undefined} raw
 * @return {number|null}
 */
function wilaya_resolveCodeFromText_(raw) {
  if (raw == null) return null;
  var t = String(raw).trim();
  if (!t) return null;

  var m = t.match(/^(\d{1,2})\b/);
  if (m) {
    var w = parseInt(m[1], 10);
    if (!isNaN(w) && w >= 1 && w <= 58) {
      return w;
    }
  }

  var normL = wilaya_normalizeLatinForMatch_(t);
  if (normL.length >= 2) {
    var rows = wilaya_getAll_();
    for (var i = 0; i < rows.length; i++) {
      var frN = wilaya_normalizeLatinForMatch_(rows[i].fr);
      if (!frN) continue;
      if (normL === frN || normL === frN.replace(/\s+/g, "")) {
        return rows[i].code;
      }
      if (normL.length >= frN.length + 2 && normL.indexOf(frN + " ") === 0) {
        return rows[i].code;
      }
    }
  }

  var aliases = wilaya_getArabicAliasesByCode_();
  for (var codeStr in aliases) {
    if (!Object.prototype.hasOwnProperty.call(aliases, codeStr)) continue;
    var list = aliases[codeStr];
    if (!list || !list.length) continue;
    for (var k = 0; k < list.length; k++) {
      if (wilaya_arabicNamesMatch_(t, list[k])) {
        return parseInt(codeStr, 10);
      }
    }
  }

  return null;
}

/**

 * Labels for Sheets data validation (dropdown).

 * @return {Array<string>}

 */

function wilaya_getDropdownLabels_() {

  var out = [];

  var rows = wilaya_getAll_();

  for (var i = 0; i < rows.length; i++) {

    var w = rows[i];

    var pad = w.code < 10 ? '0' : '';

    out.push(pad + w.code + ' — ' + w.fr);

  }

  return out;

}


