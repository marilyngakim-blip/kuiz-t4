/**
 * IMPORT GAMBAR FORM – skrip kecil BERASINGAN (bukan Code.gs).
 *
 * Gunakan jika "Import dari Google Form" menyalin soalan tetapi TIDAK menyalin gambar
 * (mesej: "Google Forms API has not been used in project …").
 *
 * Skrip ini membaca gambar setiap soalan dalam Google Form melalui Google Forms API,
 * menyimpannya dalam folder Drive "Kuiz T4 – Gambar", dan menulis pautannya ke lajur H
 * tab "Input Kuiz" dalam Sheet kuiz anda. Selepas itu, terbitkan kuiz seperti biasa.
 *
 * Langkah (lihat README bahagian "Skrip Import Gambar Form"):
 *  1. script.google.com → New project → tampal fail ini.
 *  2. Isi FORM_URL dan SHEET_URL di bawah.
 *  3. Project Settings → Google Cloud Platform (GCP) Project → Change project → nombor projek anda
 *     (projek yang Google Forms API-nya sudah di-Enable).
 *  4. Pilih fungsi importGambar → Run → benarkan akses.
 *  5. Jika log menyatakan "BELUM SELESAI", Run sekali lagi.
 *
 * Sebelum itu, soalan mesti sudah ada di tab Input Kuiz (KUIZ T4 → Import dari Google Form).
 */

// ▼▼▼ ISI DUA PAUTAN INI ▼▼▼
const FORM_URL = 'TAMPAL_PAUTAN_EDIT_GOOGLE_FORM_DI_SINI';   // …/forms/d/…/edit
const SHEET_URL = 'TAMPAL_PAUTAN_GOOGLE_SHEET_KUIZ_DI_SINI'; // …/spreadsheets/d/…/edit
// ▲▲▲

const IG_TAB_INPUT = 'Input Kuiz';
const IG_BARIS_PERTAMA = 7;
const IG_HAD_MS = 4.5 * 60 * 1000; // Google menghentikan skrip selepas 6 minit

function importGambar() {
  const mula = Date.now();
  const formId = (String(FORM_URL).match(/\/forms\/d\/([\w-]+)/) || [])[1];
  if (!formId || /\/forms\/d\/e\//.test(FORM_URL)) {
    throw new Error('FORM_URL tidak sah. Tampal pautan EDIT Form (…/forms/d/…/edit), bukan pautan untuk murid.');
  }
  if (!/\/spreadsheets\/d\//.test(SHEET_URL)) throw new Error('SHEET_URL tidak sah. Tampal pautan Google Sheet kuiz anda.');
  const sheet = SpreadsheetApp.openByUrl(SHEET_URL).getSheetByName(IG_TAB_INPUT);
  if (!sheet) throw new Error('Tab "' + IG_TAB_INPUT + '" tiada dalam Sheet itu.');
  const last = sheet.getLastRow();
  if (last < IG_BARIS_PERTAMA) throw new Error('Tab Input Kuiz kosong. Jalankan KUIZ T4 → Import dari Google Form dahulu.');

  // Soalan di Sheet (lajur A) dan pautan gambar sedia ada (lajur H).
  const rows = sheet.getRange(IG_BARIS_PERTAMA, 1, last - IG_BARIS_PERTAMA + 1, 8).getValues();
  const kunci = s => String(s || '').replace(/^ (?==)/, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const baris = {};
  rows.forEach((r, i) => { if (String(r[0]).trim()) baris[kunci(r[0])] = i; });

  const form = igBacaForm_(formId);
  const tajukForm = form.info && (form.info.title || form.info.documentTitle) || 'Google Form';
  let siap = 0, sedia = 0, tiadaPadanan = [], gagal = [], tertangguh = 0, tanpaGambar = 0;
  let pending = null; // item gambar berasingan → soalan berikutnya
  (form.items || []).forEach(it => {
    if (it.imageItem && it.imageItem.image) { pending = it.imageItem.image; return; }
    const cq = it.questionItem && it.questionItem.question && it.questionItem.question.choiceQuestion;
    if (!cq) return;
    const img = it.questionItem.image || pending;
    pending = null;
    if (!img || !img.contentUri) { tanpaGambar++; return; }
    const tajuk = (it.title || '') + (it.description ? '\n' + it.description : '');
    const i = baris[kunci(tajuk)];
    if (i == null) { tiadaPadanan.push(igPendek_(tajuk)); return; }
    if (/^https?:\/\//.test(String(rows[i][7]).trim())) { sedia++; return; }
    if (Date.now() - mula > IG_HAD_MS) { tertangguh++; return; }
    try {
      const url = igSimpanDrive_(igMuatGambar_(img.contentUri), tajukForm + ' – S' + (i + 1));
      sheet.getRange(IG_BARIS_PERTAMA + i, 8).setValue(url);
      rows[i][7] = url;
      siap++;
    } catch (e) {
      gagal.push('S' + (i + 1) + ': ' + String(e.message).slice(0, 100));
    }
  });

  const log = [
    tertangguh ? '⏳ BELUM SELESAI – klik Run sekali lagi untuk ' + tertangguh + ' gambar yang tinggal.'
      : gagal.length ? '❌ ADA RALAT – ' + gagal.length + ' gambar gagal. Betulkan punca di bawah, kemudian Run sekali lagi.'
      : '✅ SELESAI.',
    siap + ' gambar baharu disalin ke lajur H, ' + sedia + ' sudah ada sebelum ini.',
    tanpaGambar ? tanpaGambar + ' soalan dalam Form tiada gambar.' : '',
    tiadaPadanan.length ? '⚠️ ' + tiadaPadanan.length + ' soalan bergambar tidak dijumpai di tab Input Kuiz (teks soalan berbeza?): ' + tiadaPadanan.slice(0, 5).join(' | ') : '',
    gagal.length ? '⚠️ Gagal: ' + gagal.slice(0, 5).join(' | ') : '',
    gagal.some(x => /enabling APIs: drive/i.test(x))
      ? '👉 Hidupkan Google Drive API: https://console.cloud.google.com/apis/library/drive.googleapis.com (projek yang sama), tunggu 2 minit, Run semula.' : '',
    tertangguh || gagal.length ? '' : 'Seterusnya: di Sheet, KUIZ T4 → Terbitkan kuiz ke GitHub.'
  ].filter(Boolean).join('\n');
  console.log(log);
  return log;
}

function igBacaForm_(formId) {
  const res = UrlFetchApp.fetch('https://forms.googleapis.com/v1/forms/' + encodeURIComponent(formId), {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) {
    let why = '';
    try { why = JSON.parse(res.getContentText()).error.message; } catch (e) { why = res.getContentText().slice(0, 300); }
    throw new Error('Google Forms API ' + res.getResponseCode() + ': ' + why);
  }
  return JSON.parse(res.getContentText());
}

function igMuatGambar_(uri) {
  const cubaan = [{}, { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } }, {}];
  let code = 0;
  for (let i = 0; i < cubaan.length; i++) {
    if (i === 2) Utilities.sleep(1500);
    const res = UrlFetchApp.fetch(uri, Object.assign({ muteHttpExceptions: true }, cubaan[i]));
    code = res.getResponseCode();
    const blob = res.getBlob();
    if (code === 200 && blob.getBytes().length > 0) return blob;
  }
  throw new Error('muat turun gambar gagal (' + code + ')');
}

function igSimpanDrive_(blob, nama) {
  const NAMA_FOLDER = 'Kuiz T4 – Gambar';
  const it = DriveApp.getFoldersByName(NAMA_FOLDER);
  const folder = it.hasNext() ? it.next() : DriveApp.createFolder(NAMA_FOLDER);
  return folder.createFile(blob.setName(nama)).getUrl();
}

function igPendek_(s) {
  s = String(s).split('\n')[0];
  return s.length > 40 ? s.slice(0, 40) + '…' : s;
}
