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


