// Muka depan murid: log masuk (Kelas → Nama → PIN) dan senarai kuiz.
(function () {
  const { api, el, sesi, tarikh, masa, baki, topbar, maskot } = window.T4;
  const app = document.getElementById('app');
  const top = document.getElementById('top');

  function setTop(right) {
    top.innerHTML = '';
    top.append(topbar('Kuiz Matematik Tingkatan 4', null, right));
  }

  function show(...nodes) {
    app.innerHTML = '';
    nodes.forEach(n => n && app.append(n));
    window.scrollTo(0, 0);
  }

  function errorCard(msg, retry) {
    return el('div', { class: 'card' }, el('p', { class: 'error', text: msg }),
      retry ? el('button', { class: 'btn', type: 'button', text: 'Cuba lagi', onclick: retry }) : null);
  }

  function steps(n) {
    return el('div', { class: 'steps', 'aria-hidden': 'true' }, [1, 2, 3].map(i => el('span', { class: i <= n ? 'on' : '' })));
  }

  /* ---------------- Log masuk ---------------- */

  async function pilihKelas() {
    setTop(null);
    show(el('div', { class: 'loading', text: 'Memuatkan senarai kelas…' }));
    const r = await api('classes');
    if (!r || !r.ok) return show(errorCard((r && r.error) || 'Ralat.', pilihKelas));
    const box = el('div', { class: 'pick' }, r.kelas.map(k => el('button', { type: 'button', text: k, onclick: () => pilihNama(k) })));
    show(el('div', { class: 'card sambut' }, maskot('besar'),
      el('div', {}, el('h1', { text: 'Jom Kuiz Matematik!' }), el('p', { text: 'Tingkatan 4 · Jawab, semak, naik ranking! 🚀' }))),
      el('div', { class: 'card' }, steps(1), el('h1', { text: 'Log masuk' }),
      el('p', { class: 'muted', text: 'Langkah 1: pilih kelas anda.' }),
      r.kelas.length ? box : el('p', { class: 'empty', text: 'Tiada kelas. Guru belum memasukkan senarai murid.' })));
  }

  async function pilihNama(kelas) {
    show(el('div', { class: 'loading', text: 'Memuatkan nama…' }));
    const r = await api('students', { kelas: kelas });
    if (!r || !r.ok) return show(errorCard((r && r.error) || 'Ralat.', () => pilihNama(kelas)));
    const cari = el('input', { class: 'input', type: 'search', placeholder: 'Cari nama…', 'aria-label': 'Cari nama', autocomplete: 'off' });
    const list = el('div', { class: 'pick names' });
    const draw = () => {
      const q = cari.value.trim().toLowerCase();
      list.innerHTML = '';
      r.murid.filter(m => !q || m.nama.toLowerCase().includes(q))
        .forEach(m => list.append(el('button', { type: 'button', text: m.nama, onclick: () => (m.pin ? masukPin(kelas, m) : masukTanpaPin(kelas, m, list)) })));
      if (!list.children.length) list.append(el('p', { class: 'empty', text: 'Tiada nama sepadan.' }));
    };
    cari.addEventListener('input', draw);
    draw();
    show(el('div', { class: 'card' }, steps(2), el('h1', { text: kelas }),
      el('p', { class: 'muted', text: 'Langkah 2: pilih nama anda.' }),
      r.murid.length > 8 ? el('div', { class: 'field' }, cari) : null, list,
      el('div', { class: 'actions' }, el('button', { class: 'btn ghost', type: 'button', text: '← Tukar kelas', onclick: pilihKelas }))));
  }

  // Murid tanpa PIN (lajur PIN kosong di Sheet): terus log masuk.
  async function masukTanpaPin(kelas, m, list) {
    list.querySelectorAll('button').forEach(b => { b.disabled = true; });
    const r = await api('login', { id: m.id, pin: '' });
    if (!r || !r.ok) {
      list.querySelectorAll('button').forEach(b => { b.disabled = false; });
      alert((r && r.error) || 'Ralat. Cuba lagi.');
      return;
    }
    sesi.set({ token: r.token, id: m.id, nama: r.nama, kelas: r.kelas });
    muka();
  }

  function masukPin(kelas, m) {
    const pin = el('input', {
      class: 'input pin', type: 'password', inputmode: 'numeric', pattern: '[0-9]*', maxlength: '4',
      autocomplete: 'off', 'aria-label': 'PIN 4 digit', id: 'pin'
    });
    const msg = el('p', { class: 'error', role: 'alert' });
    const btn = el('button', { class: 'btn block', type: 'submit', text: 'Masuk' });
    const form = el('form', {}, el('label', { class: 'field' }, el('span', { text: 'PIN (4 digit)' }), pin), msg, btn);
    form.addEventListener('submit', async ev => {
      ev.preventDefault();
      msg.textContent = '';
      if (!/^\d{4}$/.test(pin.value)) { msg.textContent = 'PIN mesti 4 digit.'; return; }
      btn.disabled = true;
      btn.textContent = 'Menyemak…';
      const r = await api('login', { id: m.id, pin: pin.value });
      btn.disabled = false;
      btn.textContent = 'Masuk';
      if (!r || !r.ok) {
        msg.textContent = (r && r.error) || 'Ralat.';
        pin.value = '';
        pin.focus();
        return;
      }
      sesi.set({ token: r.token, id: m.id, nama: r.nama, kelas: r.kelas });
      muka();
    });
    show(el('div', { class: 'card' }, steps(3), el('h1', { text: m.nama }),
      el('p', { class: 'muted', text: kelas + ' · Langkah 3: masukkan PIN yang diberi oleh guru.' }), form,
      el('div', { class: 'actions' }, el('button', { class: 'btn ghost', type: 'button', text: '← Bukan saya', onclick: () => pilihNama(kelas) }))));
    pin.focus();
  }

  /* ---------------- Muka depan ---------------- */

  function keluar() {
    if (!confirm('Log keluar dari peranti ini?')) return;
    sesi.clear();
    pilihKelas();
  }

  function statusBadge(q) {
    if (q.sedang) return el('span', { class: 'badge warn', text: 'Sedang dijawab' });
    if (q.attempts.length) return el('span', { class: 'badge ok', text: 'Sudah dijawab' });
    return el('span', { class: 'badge no', text: 'Belum dijawab' });
  }

  function kadKuiz(q, now) {
    const used = q.attempts.length;
    const chips = el('div', { class: 'chips' },
      el('span', { class: 'chip', text: q.n + ' soalan' }),
      el('span', { class: 'chip', text: q.had ? '⏱ ' + q.had + ' minit' : 'Tiada had masa' }),
      el('span', { class: 'chip', text: 'Cubaan ' + used + (q.cubaan ? '/' + q.cubaan : '') }));
    const tutupTxt = q.open
      ? (q.tutup ? 'Tutup: ' + tarikh(q.tutup) + (q.tutup - now < 864e5 ? ' (' + baki(q.tutup - now) + ' lagi)' : '') : 'Tiada tarikh tutup')
      : 'Ditutup: ' + tarikh(q.tutup);
    const att = used ? el('ul', { class: 'att' }, q.attempts.map(a => el('li', {},
      el('span', { text: 'Cubaan ' + a.attempt }),
      el('span', { text: a.score + '/' + a.total + ' · ' + a.pct + '% · ' + masa(a.time) })))) : null;
    const actions = el('div', { class: 'actions' });
    if (q.open && q.bolehMula) {
      const label = q.sedang ? 'Sambung menjawab' : used ? 'Cuba lagi' : 'Mula';
      actions.append(el('button', { class: 'btn', type: 'button', text: label, onclick: () => {
        if (q.had && !q.sedang && !confirm('Kuiz ini ada had masa ' + q.had + ' minit. Pemasa bermula sebaik sahaja kuiz dibuka dan tidak boleh dihentikan. Mula sekarang?')) return;
        location.href = 'kuiz.html?id=' + encodeURIComponent(q.id);
      } }));
    } else if (q.open && used) {
      actions.append(el('span', { class: 'muted small', text: 'Semua cubaan sudah digunakan.' }));
    }
    if (q.bolehSemak) actions.append(el('a', { class: 'btn ghost', href: 'kuiz.html?semak=1&id=' + encodeURIComponent(q.id), text: 'Lihat jawapan' }));
    if (used || !q.open) actions.append(el('a', { class: 'btn ghost', href: 'ranking.html?id=' + encodeURIComponent(q.id), text: '🏆 Ranking' }));
    const rakan = q.open && q.rakanBelum ? rakanBelum(q) : null;
    return el('div', { class: 'card qcard', 'data-quiz': q.id },
      el('div', { class: 'row' }, el('div', {}, el('h3', { text: q.tajuk }), q.topik ? el('p', { class: 'muted small', text: q.topik }) : null), statusBadge(q)),
      chips, el('p', { class: 'small' + (q.open && q.tutup && q.tutup - now < 864e5 ? ' error' : ' muted'), text: tutupTxt }), att, actions, rakan);
  }

  // Senarai rakan sekelas yang belum menjawab + butang salin peringatan.
  function rakanBelum(q) {
    const s = sesi.get() || {};
    const names = q.rakanBelum;
    const belumSaya = !q.attempts.length;
    const bil = names.length + (belumSaya ? 1 : 0);
    const sudah = Math.max(0, (q.jumlahKelas || 0) - bil);
    if (!bil) return el('p', { class: 'badge ok rakan', text: '🎉 Semua murid kelas ini sudah menjawab' });
    const teks = '📢 Peringatan kuiz: ' + q.tajuk + '\n' +
      (q.tutup ? 'Tutup: ' + tarikh(q.tutup) + '\n' : '') +
      'Belum menjawab (' + s.kelas + '):\n' +
      names.map((n, i) => (i + 1) + '. ' + n).join('\n') +
      '\n\nJawab di: ' + location.href.replace(/[?#].*$/, '').replace(/index\.html$/, '');
    const btn = el('button', { class: 'btn sm ghost', type: 'button', text: '📋 Salin peringatan', onclick: async () => {
      try { await navigator.clipboard.writeText(teks); }
      catch (e) {
        const t = el('textarea', { style: 'position:fixed;opacity:0' }); t.value = teks; document.body.append(t); t.select();
        try { document.execCommand('copy'); } catch (x) { /* abaikan */ } t.remove();
      }
      btn.textContent = '✓ Disalin – tampal di WhatsApp kelas';
      setTimeout(() => { btn.textContent = '📋 Salin peringatan'; }, 2500);
    } });
    return el('details', { class: 'rakan' },
      el('summary', { text: '👥 Murid belum menjawab: ' + names.length + (sudah ? ' · ' + sudah + ' sudah menjawab' : '') }),
      names.length ? el('ol', { class: 'names small' }, names.map(n => el('li', { text: n }))) : el('p', { class: 'muted small', text: 'Hanya anda yang belum menjawab.' }),
      names.length ? el('div', { class: 'actions' }, btn) : null,
      el('p', { class: 'muted small', text: 'Dikemas kini setiap minit.' }));
  }

  async function muka() {
    const s = sesi.get();
    if (!s) return pilihKelas();
    setTop(el('div', { class: 'who' }, s.nama, el('br'), el('span', { text: s.kelas + ' · ' }),
      el('button', { class: 'link', type: 'button', text: 'Log keluar', onclick: keluar })));
    show(el('div', { class: 'loading', text: 'Memuatkan kuiz…' }));
    const r = await api('home', { token: s.token });
    if (!r || !r.ok) {
      if (r && r.auth) return pilihKelas();
      return show(errorCard((r && r.error) || 'Ralat.', muka));
    }
    const now = r.now || Date.now();
    const belum = r.buka.filter(q => !q.attempts.length).length;
    const namaPendek = String(r.nama).split(/\s+(BIN|BINTI|A\/L|A\/P|B\.|BT\.)\s+/i)[0].split(' ').slice(0, 2).join(' ')
      .toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase());
    show(
      el('div', { class: 'card sambut', id: 'sambut' }, maskot('besar'), el('div', {},
        el('h1', { text: 'Hai, ' + namaPendek + '! 👋' }),
        el('p', { text: belum ? belum + ' kuiz sedang menunggu anda. Jom cuba! 💪'
          : r.buka.length ? 'Hebat! Semua kuiz yang dibuka sudah dijawab. 🌟' : 'Tiada kuiz baharu buat masa ini. 😊' }))),
      el('h2', { class: 'section-title', text: 'Kuiz dibuka' }),
      r.buka.length ? el('div', {}, r.buka.map(q => kadKuiz(q, now))) : el('div', { class: 'card empty', text: 'Tiada kuiz dibuka untuk kelas anda sekarang.' }),
      el('div', { class: 'actions' }, el('a', { class: 'btn ghost', href: 'ranking.html?id=semua', text: '🏆 Ranking keseluruhan ' + r.kelas })),
      r.tutup.length ? el('h2', { class: 'section-title', text: 'Kuiz yang sudah ditutup' }) : null,
      r.tutup.length ? el('div', {}, r.tutup.map(q => kadKuiz(q, now))) : null
    );
  }

  if (!window.T4.CFG.APPS_SCRIPT_URL) {
    setTop(null);
    show(errorCard('Laman ini belum disambungkan ke Google Sheet. Guru: terbitkan kuiz pertama dari Sheet (lihat README).'));
  } else {
    muka();
  }
})();
