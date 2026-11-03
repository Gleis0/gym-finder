/* Gym Finder Luzern – App */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const DAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
  const DSHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  const BRASS = '#C4A46C';
  const PIN = ['#3A4A4F', '#5B5A4D', '#7D6E50', '#9E8659', '#B59A64', '#C4A46C'];
  const AMEN = { h24: '24/7', sauna: 'Sauna', pool: 'Pool', kurse: 'Kurse', kids: 'Kinderbetreuung', day: 'Tageseintritt', trial: 'Gratis-Probetraining', pt: 'Personal Training', parking: 'Parkplätze' };
  const chf = (n) => 'CHF ' + n.toLocaleString('de-CH').replace(/,/g, '’');

  const store = {
    get(k, d) { try { const v = localStorage.getItem('gf:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('gf:' + k, JSON.stringify(v)); } catch { /* egal */ } },
  };

  const params = new URLSearchParams(location.search);
  const state = {
    type: TYPES.some((t) => t.k === params.get('ziel')) ? params.get('ziel') : store.get('type', 'kraft'),
    budget: 0, time: 'any', where: 'any',
    q: '', flags: new Set(), sort: 'match',
    me: null, hot: null,
    cmp: new Set(store.get('cmp', []).filter((id) => GYMS.some((g) => g.id === id))),
  };

  /* ---------- Geometrie & Zeit ---------- */
  const rad = (d) => (d * Math.PI) / 180;
  function km(a, b) {
    const R = 6371, dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  const fmtKm = (d) => (d < 1 ? Math.round(d * 1000 / 50) * 50 + ' m' : d.toFixed(1).replace('.', ',') + ' km');
  GYMS.forEach((g) => { g.dist = km(BAHNHOF, g); });

  function nowZ() {
    const f = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Zurich', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const p = Object.fromEntries(f.formatToParts(new Date()).map((x) => [x.type, x.value]));
    return { d: { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }[p.weekday], m: (+p.hour) * 60 + (+p.minute) };
  }
  const toM = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };

  function status(g) {
    if (!g.hours) return { k: 'unk', t: 'Zeiten auf Website' };
    if (g.hours.every((d) => d === 'x')) return { k: 'open', t: 'Rund um die Uhr offen' };
    const n = nowZ();
    const today = g.hours[n.d];
    if (today === 'x') return { k: 'open', t: 'Heute 24 h offen' };
    if (today) for (const [a, b] of today) if (n.m >= toM(a) && n.m < toM(b)) return { k: 'open', t: `Offen bis ${b}` };
    for (let i = 0; i < 8; i++) {
      const d = (n.d + i) % 7, dd = g.hours[d];
      if (!dd) continue;
      if (dd === 'x') return { k: 'closed', t: i === 1 ? 'Zu, öffnet morgen' : `Zu, öffnet ${DSHORT[d]}` };
      for (const [a] of dd) {
        if (i === 0 && toM(a) <= n.m) continue;
        const when = i === 0 ? '' : i === 1 ? 'morgen ' : DSHORT[d] + ' ';
        return { k: 'closed', t: `Zu, öffnet ${when}${a}` };
      }
    }
    return { k: 'closed', t: 'Geschlossen' };
  }
  const isOpen = (g) => status(g).k === 'open';

  function timeOk(g, t) {
    if (t === 'any') return true;
    if (!g.hours) return false;
    const wd = g.hours.slice(0, 5);
    if (t === 'night') return g.hours.every((d) => d === 'x');
    if (t === 'weekend') return !!(g.hours[5] || g.hours[6]);
    if (t === 'early') return wd.some((d) => d === 'x' || (d && d.some(([a]) => toM(a) <= 390)));
    if (t === 'late') return wd.some((d) => d === 'x' || (d && d.some(([, b]) => toM(b) >= 1350)));
    return true;
  }
  const WHERE = [
    ['any', 'irgendwo in der Region'], ['near', 'nahe am Bahnhof'],
    ['q:bahnhof', 'in der Neustadt'], ['q:altstadt', 'in der Altstadt oder am See'], ['q:reuss', 'an der Reuss'],
    ['q:tribschen', 'in Tribschen oder auf der Allmend'], ['q:kriens', 'in Kriens'], ['q:littau', 'in Littau oder Emmen'],
    ['q:ebikon', 'in Ebikon oder Root'], ['me', 'nahe bei mir'],
  ];
  $('#selWhere').innerHTML = WHERE.map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
  function whereOk(g, w) {
    if (w.startsWith('q:')) return g.region === w.slice(2);
    if (w === 'near') return g.dist <= 1.2;
    if (w === 'me') return state.me ? km(state.me, g) <= 4 : true;
    return true;
  }
  const budgetOk = (g, b) => !b || g.price.year == null || g.price.year <= b;
  const prefsOk = (g) => budgetOk(g, state.budget) && timeOk(g, state.time) && whereOk(g, state.where);
  const distOf = (g) => (state.me ? km(state.me, g) : g.dist);

  function rankCmp(a, b) {
    const t = state.type;
    return (b.sc[t] - a.sc[t])
      || ((a.price.year ?? 1e6) - (b.price.year ?? 1e6))
      || (distOf(a) - distOf(b));
  }

  /* ---------- Hantel ---------- */
  function barbell(n, label = true) {
    let bars = '';
    for (let i = 0; i < 5; i++) bars += `<i class="${i < n ? 'on' : ''}"></i>`;
    return `<span class="meter" role="img" aria-label="Eignung ${n} von 5">${bars}</span>`
      + (label ? `<span class="bar-label">${n ? n + ' von 5' : 'passt nicht'}</span>` : '');
  }
  const typeObj = () => TYPES.find((t) => t.k === state.type);
  

  /* ---------- Hero ---------- */
  const selType = $('#selType');
  selType.innerHTML = TYPES.map((t) => `<option value="${t.k}">${esc(t.l)}</option>`).join('');

  function sizeSelect(sel) {
    const t = document.querySelector(`.pick-txt[data-for="${sel.id}"]`);
    if (t) t.textContent = sel.options[sel.selectedIndex].text;
  }
  const sizeAll = () => $$('.pick select').forEach(sizeSelect);

  function renderPodium() {
    const t = typeObj();
    const pool = GYMS.filter((g) => g.sc[t.k] > 0 && prefsOk(g)).sort(rankCmp).slice(0, 3);
    $('#podSub').textContent = `Am besten für ${t.s}${state.where !== 'any' ? ', ' + WHERE.find((w) => w[0] === state.where)[1] : ''}`;
    if (!pool.length) {
      $('#podium').innerHTML = `<div class="pod-empty">Mit diesen Wünschen passt kein Gym. Erhöhe das Budget oder wähle einen anderen Ort.<br><button class="btn" id="podReset">Wünsche zurücksetzen</button></div>`;
      $('#podReset').onclick = resetPrefs;
      return;
    }
    $('#podium').innerHTML = pool.map((g, i) => `
      <button class="pod-item" data-open="${g.id}">
        <span class="pod-rank">${i + 1}</span>
        <span>
          <span class="pod-name">${esc(g.name)}</span>
          <span class="pod-meta">${esc(g.kind)}, ${esc(REGIONS[g.region])}</span>
          <span class="pod-why">${esc(g.verdict)}</span>
        </span>
        <span class="pod-right">${barbell(g.sc[t.k], false)}<span class="pod-price">${g.price.year ? chf(g.price.year) + ' / Jahr' : g.price.day ? chf(g.price.day) + ' Eintritt' : 'Preis auf Anfrage'}</span></span>
      </button>`).join('');
  }

  function resetPrefs() {
    state.budget = 0; state.time = 'any'; state.where = 'any';
    $('#selBudget').value = '0'; $('#selTime').value = 'any'; $('#selWhere').value = 'any';
    sizeAll(); renderAll();
  }

  /* ---------- Liste ---------- */
  function filtered() {
    const q = state.q.trim().toLowerCase();
    return GYMS.filter((g) => {
      if (!prefsOk(g)) return false;
      for (const f of state.flags) {
        if (f === 'open') { if (!isOpen(g)) return false; } else if (!g.am[f]) return false;
      }
      if (q) {
        const hay = [g.name, g.kind, g.chain, g.address, REGIONS[g.region], g.verdict, ...g.highlights].join(' ').toLowerCase();
        if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
      }
      return true;
    });
  }
  function sorted(arr) {
    const a = [...arr];
    if (state.sort === 'price') a.sort((x, y) => (x.price.year ?? 1e6) - (y.price.year ?? 1e6) || rankCmp(x, y));
    else if (state.sort === 'dist') a.sort((x, y) => distOf(x) - distOf(y));
    else if (state.sort === 'name') a.sort((x, y) => x.name.localeCompare(y.name, 'de'));
    else a.sort(rankCmp);
    return a;
  }

  function renderList() {
    const t = state.type;
    const rows = sorted(filtered());
    const prefTxt = [];
    if (state.budget) prefTxt.push(`bis ${chf(state.budget)}`);
    if (state.time !== 'any') prefTxt.push($('#selTime').selectedOptions[0].text);
    if (state.where !== 'any') prefTxt.push($('#selWhere').selectedOptions[0].text);
    $('#count').innerHTML = `${rows.length} von ${GYMS.length}` + (prefTxt.length ? `, gefiltert: ${esc(prefTxt.join(', '))} <button class="btn" style="padding:4px 10px;font-size:13px;margin-left:6px" id="clrPrefs">Alle zeigen</button>` : '');
    const clr = $('#clrPrefs'); if (clr) clr.onclick = resetPrefs;

    if (!rows.length) {
      $('#list').innerHTML = `<div class="empty">Kein Gym erfüllt alle Filter. Entferne einen Filter oder setze die Wünsche oben zurück.</div>`;
    } else {
      $('#list').innerHTML = rows.map((g) => {
        const st = status(g);
        const am = Object.keys(AMEN).filter((k) => g.am[k] && k !== 'pt').map((k) => `<span class="tag">${AMEN[k]}</span>`).join('');
        const inCmp = state.cmp.has(g.id);
        return `<article class="row${state.hot === g.id ? ' is-hot' : ''}" data-id="${g.id}">
          <div>
            <h3><button data-open="${g.id}">${esc(g.name)}</button></h3>
            <div class="meta">${esc(g.kind)}, ${esc(REGIONS[g.region])}, ${fmtKm(distOf(g))} ${state.me ? 'von dir' : 'vom Bahnhof'}</div>
            <p class="verdict">${esc(g.verdict)}</p>
            <div class="amen">${am}</div>
            <div class="row-actions">
              <button class="btn" data-open="${g.id}">Details</button>
              <button class="btn" data-cmp="${g.id}" aria-pressed="${inCmp}">${inCmp ? 'Im Vergleich' : 'Vergleichen'}</button>
            </div>
          </div>
          <div class="side">
            ${barbell(g.sc[t])}
            <div class="price">${g.price.year ? chf(g.price.year) : g.price.day ? chf(g.price.day) : 'auf Anfrage'}<small>${g.price.year ? 'pro Jahr' : g.price.day ? 'Eintritt' : 'Preis'}</small></div>
            <span class="status ${st.k}"><i></i>${esc(st.t)}</span>
          </div>
        </article>`;
      }).join('');
    }
    updateMarkers(rows);
  }

  /* ---------- Karte ---------- */
  let map = null; const markers = {};
  function initMap() {
    if (!window.L) { $('#map').innerHTML = '<div class="map-fallback">Die Karte konnte nicht geladen werden. Adressen findest du in den Details.</div>'; return; }
    map = L.map('map', { zoomControl: true, scrollWheelZoom: false, attributionControl: true }).setView([47.052, 8.31], 13);
    map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19, subdomains: 'abcd',
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, © <a href="https://carto.com/attributions">CARTO</a>',
    }).addTo(map);
    GYMS.forEach((g) => {
      const m = L.marker([g.lat, g.lng], { icon: L.divIcon({ className: '', html: '<div class="pin"></div>', iconSize: [30, 30], iconAnchor: [15, 15] }), title: g.name, keyboard: true });
      m.bindPopup(`<b>${esc(g.name)}</b><br>${esc(g.kind)}<br><span style="color:#93A6AA">${esc(g.address)}</span><br><button class="btn" style="margin-top:8px;padding:5px 12px" data-open="${g.id}">Details</button>`);
      m.on('mouseover', () => setHot(g.id, false));
      m.on('mouseout', () => setHot(null, false));
      m.addTo(map);
      markers[g.id] = m;
    });
    map.on('click', () => map.scrollWheelZoom.enable());
    map.getContainer().addEventListener('mouseleave', () => map.scrollWheelZoom.disable());
    fitTo(GYMS.filter((g) => g.region !== 'root'));
  }
  function fitTo(arr) {
    if (!map || !arr.length) return;
    map.fitBounds(L.latLngBounds(arr.map((g) => [g.lat, g.lng])), { padding: [30, 30], maxZoom: 15 });
  }
  function updateMarkers(rows) {
    if (!map) return;
    const shown = new Map(rows.map((g, i) => [g.id, i + 1]));
    GYMS.forEach((g) => {
      const el = markers[g.id].getElement()?.querySelector('.pin');
      if (!el) return;
      const s = g.sc[state.type], rank = shown.get(g.id);
      el.style.background = PIN[s];
      el.style.color = s >= 3 ? '#0A161D' : '#ECE6D8';
      el.textContent = rank && state.sort === 'match' ? rank : '';
      el.classList.toggle('dim', !rank);
      el.classList.toggle('hot', state.hot === g.id);
      markers[g.id].setZIndexOffset(state.hot === g.id ? 1000 : rank ? 500 - rank : 0);
    });
  }
  function setHot(id, scroll) {
    state.hot = id;
    $$('.row').forEach((r) => r.classList.toggle('is-hot', r.dataset.id === id));
    if (map) GYMS.forEach((g) => { const el = markers[g.id].getElement()?.querySelector('.pin'); if (el) el.classList.toggle('hot', g.id === id); });
    if (id && scroll) { const r = $(`.row[data-id="${id}"]`); if (r) r.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  }

  /* ---------- Matrix ---------- */
  function renderMatrix() {
    const t = state.type;
    const rows = [...GYMS].sort((a, b) => b.sc[t] - a.sc[t] || a.name.localeCompare(b.name, 'de'));
    const cell = (n) => n ? barbell(n, false) : '<span class="cell zero" aria-label="passt nicht">–</span>';
    $('#mx').innerHTML = `<thead><tr><th scope="col">Gym</th>${TYPES.map((x) => `<th scope="col" class="${x.k === t ? 'on' : ''}"><button data-type="${x.k}" aria-pressed="${x.k === t}">${esc(x.s)}</button></th>`).join('')}</tr></thead>`
      + `<tbody>${rows.map((g) => `<tr><th scope="row"><button data-open="${g.id}">${esc(g.name)}</button></th>${TYPES.map((x) => `<td class="${x.k === t ? 'on' : ''}">${cell(g.sc[x.k])}</td>`).join('')}</tr>`).join('')}</tbody>`;
    $('#legend').innerHTML = [1, 2, 3, 4, 5].map((n) => `<span>${cell(n)} ${['passt kaum', 'möglich', 'gut', 'sehr gut', 'erste Wahl'][n - 1]}</span>`).join('');
  }

  /* ---------- Preise ---------- */
  function renderPrices() {
    const top = new Set(GYMS.filter((g) => g.sc[state.type] > 0 && prefsOk(g)).sort(rankCmp).slice(0, 3).map((g) => g.id));
    const priced = GYMS.filter((g) => g.price.year).sort((a, b) => a.price.year - b.price.year);
    const max = Math.max(...priced.map((g) => g.price.year));
    $('#prices').innerHTML = priced.map((g) => `
      <div class="pr${top.has(g.id) ? ' hl' : ''}">
        <button data-open="${g.id}">${esc(g.name)}</button>
        <div class="track" aria-hidden="true"><div class="fill" style="width:${(g.price.year / max * 100).toFixed(1)}%"></div></div>
        <div class="val">${chf(g.price.year)}<small>${chf(Math.round(g.price.year / 12))} / Mt.</small></div>
      </div>`).join('');
    const un = GYMS.filter((g) => !g.price.year);
    $('#unpriced').innerHTML = 'Ohne öffentlichen Jahrespreis: ' + un.map((g) => `${esc(g.name)}${g.price.day ? ` (Eintritt ${chf(g.price.day)})` : ''}`).join(', ') + '.';
  }

  /* ---------- Drawer ---------- */
  let lastFocus = null;
  function openDrawer(html, wide = false) {
    lastFocus = document.activeElement;
    $('#dBody').innerHTML = html;
    const d = $('#drawer');
    d.classList.toggle('wide', wide);
    d.classList.add('on'); $('#scrim').classList.add('on');
    document.body.style.overflow = 'hidden';
    d.scrollTop = 0;
    setTimeout(() => $('#dClose').focus(), 30);
  }
  function closeDrawer() {
    $('#drawer').classList.remove('on'); $('#scrim').classList.remove('on');
    document.body.style.overflow = '';
    if (location.hash.startsWith('#gym=')) history.replaceState(null, '', location.pathname + location.search);
    if (lastFocus) lastFocus.focus();
  }

  function hoursTable(g) {
    if (!g.hours) return `<p>${esc(g.hoursNote)}</p>`;
    const today = nowZ().d;
    const fmt = (d) => d === 'x' ? '24 Stunden' : d ? d.map(([a, b]) => `${a}–${b}`).join(', ') : 'geschlossen';
    return `<table class="hours">${g.hours.map((d, i) => `<tr class="${i === today ? 'today' : ''}"><td>${DAYS[i]}${i === today ? ' (heute)' : ''}</td><td>${fmt(d)}</td></tr>`).join('')}</table>${g.hoursNote ? `<p style="margin-top:10px;color:var(--steel);font-size:14px">${esc(g.hoursNote)}</p>` : ''}`;
  }

  function showGym(id) {
    const g = GYMS.find((x) => x.id === id);
    if (!g) return;
    history.replaceState(null, '', location.pathname + location.search + '#gym=' + id);
    const st = status(g);
    const inCmp = state.cmp.has(g.id);
    const maps = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(g.name + ', ' + g.address);
    const fit = [...TYPES].sort((a, b) => g.sc[b.k] - g.sc[a.k]).map((x) => `<div class="${x.k === state.type ? 'on' : ''}"><span>${esc(x.s)}</span>${barbell(g.sc[x.k], false)}</div>`).join('');
    openDrawer(`
      <h2 id="dTitle">${esc(g.name)}</h2>
      <div class="meta">${esc(g.kind)}, ${esc(g.chain)}</div>
      <p style="margin-top:6px"><span class="status ${st.k}"><i></i>${esc(st.t)}</span></p>
      <p class="d-lead">${esc(g.verdict)}</p>
      <div class="d-actions">
        <a class="btn primary" href="${g.url}" target="_blank" rel="noopener">Website öffnen</a>
        <a class="btn" href="${maps}" target="_blank" rel="noopener">Route planen</a>
        <button class="btn" data-cmp="${g.id}" aria-pressed="${inCmp}">${inCmp ? 'Im Vergleich' : 'Vergleichen'}</button>
      </div>
      <h3>Adresse</h3>
      <p>${esc(g.address)}<br><span style="color:var(--steel)">${fmtKm(g.dist)} vom Bahnhof Luzern${state.me ? `, ${fmtKm(km(state.me, g))} von dir` : ''}</span></p>
      <h3>Was es gibt</h3>
      <p style="color:var(--steel)">${esc(g.size)}</p>
      <ul>${g.highlights.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>
      <h3>Worauf achten</h3>
      <ul>${g.watch.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>
      <h3>Preise</h3>
      <p>${esc(g.price.label)}</p>
      <h3>Öffnungszeiten</h3>
      ${hoursTable(g)}
      <h3>Eignung nach Training</h3>
      <div class="fit">${fit}</div>
      <h3>Quellen</h3>
      <div class="src">${g.src.map((s) => `<div><a href="${s}" target="_blank" rel="noopener">${esc(s.replace(/^https?:\/\/(www\.)?/, ''))}</a></div>`).join('')}</div>
    `);
    setHot(id, false);
    if (map && window.matchMedia('(min-width:1061px)').matches) map.panTo([g.lat, g.lng]);
  }

  /* ---------- Vergleich ---------- */
  function toggleCmp(id) {
    if (state.cmp.has(id)) state.cmp.delete(id);
    else {
      if (state.cmp.size >= 3) { flashTray('Maximal drei Gyms – entferne zuerst eines.'); return; }
      state.cmp.add(id);
    }
    store.set('cmp', [...state.cmp]);
    $$(`[data-cmp="${id}"]`).forEach((b) => { const on = state.cmp.has(id); b.setAttribute('aria-pressed', on); b.textContent = on ? 'Im Vergleich' : 'Vergleichen'; });
    renderTray();
  }
  let flashT;
  function flashTray(msg) { $('#trayTxt').textContent = msg; clearTimeout(flashT); flashT = setTimeout(renderTray, 2200); }
  function renderTray() {
    const n = state.cmp.size;
    $('#navCmpN').textContent = n;
    $('#tray').classList.toggle('on', n > 0);
    const names = [...state.cmp].map((id) => GYMS.find((g) => g.id === id).name);
    $('#trayTxt').textContent = n === 1 ? `${names[0]} – wähle ein zweites Gym` : names.join(' vs. ');
    $('#trayGo').disabled = n < 2;
    $('#trayGo').style.opacity = n < 2 ? .5 : 1;
  }
  function showCompare() {
    const gs = [...state.cmp].map((id) => GYMS.find((g) => g.id === id));
    if (gs.length < 2) { flashTray('Wähle mindestens zwei Gyms.'); return; }
    const today = nowZ().d;
    const best = (vals, low) => { const v = vals.filter((x) => x != null); if (!v.length) return null; return low ? Math.min(...v) : Math.max(...v); };
    const row = (label, cells, bestVal, getVal) => `<tr><th scope="row">${label}</th>${cells.map((c, i) => `<td class="${bestVal != null && getVal(gs[i]) === bestVal && gs.length > 1 ? 'best' : ''}">${c}</td>`).join('')}</tr>`;
    const yes = (b) => (b ? 'Ja' : '–');
    const hrs = (g) => { if (!g.hours) return 'siehe Website'; const d = g.hours[today]; return d === 'x' ? '24 Stunden' : d ? d.map(([a, b]) => `${a}–${b}`).join(', ') : 'geschlossen'; };
    const yb = best(gs.map((g) => g.price.year), true);
    const db = best(gs.map((g) => g.dist), true);
    let html = `<h2 id="dTitle">Vergleich</h2><p class="meta">Fett: jeweils der beste Wert.</p><div class="cmp-grid"><table class="cmp-table"><thead><tr><th></th>${gs.map((g) => `<th scope="col">${esc(g.name)}<div style="font-size:13px;font-weight:400;color:var(--steel);font-stretch:100%">${esc(g.kind)}</div></th>`).join('')}</tr></thead><tbody>`;
    html += row('Ort', gs.map((g) => esc(REGIONS[g.region])), null);
    html += row('Vom Bahnhof', gs.map((g) => fmtKm(g.dist)), db, (g) => g.dist);
    html += row('Jahrespreis', gs.map((g) => (g.price.year ? chf(g.price.year) : 'auf Anfrage')), yb, (g) => g.price.year);
    html += row('Eintritt', gs.map((g) => (g.price.day ? chf(g.price.day) : '–')), null);
    html += row(`Heute (${DSHORT[today]})`, gs.map(hrs), null);
    Object.keys(AMEN).forEach((k) => { html += row(AMEN[k], gs.map((g) => yes(g.am[k])), null); });
    TYPES.forEach((x) => {
      const b = best(gs.map((g) => g.sc[x.k]));
      html += row(esc(x.s), gs.map((g) => barbell(g.sc[x.k], false)), b || null, (g) => g.sc[x.k]);
    });
    html += `</tbody></table></div><div class="d-actions">${gs.map((g) => `<button class="btn" data-open="${g.id}">${esc(g.name)} im Detail</button>`).join('')}</div>`;
    openDrawer(html, true);
  }

  /* ---------- Render ---------- */
  /* ---------- Quartiere & Ausblicke ---------- */
  function setWhere(v) {
    state.where = v; $('#selWhere').value = v; sizeSelect($('#selWhere'));
    renderAll();
  }
  function renderQuarters() {
    const t = typeObj();
    const tiles = Object.keys(REGIONS).map((k) => {
      const gs = GYMS.filter((g) => g.region === k);
      const best = [...gs].filter((g) => g.sc[t.k] > 0).sort(rankCmp)[0];
      return `<button class="q" data-where="q:${k}" aria-pressed="${state.where === 'q:' + k}">
        <span class="n">${gs.length}<small>${gs.length === 1 ? 'Adresse' : 'Adressen'}</small></span>
        <span class="t">${esc(REGIONS[k])}</span>
        <span class="d">${best ? `Für ${esc(t.s)}: ${esc(best.name)}` : esc(REGION_NOTE[k])}</span>
      </button>`;
    });
    tiles.push(`<button class="q all" data-where="any" aria-pressed="${state.where === 'any'}">
      <span class="n">${GYMS.length}<small>Adressen</small></span>
      <span class="t">Ganz Luzern</span>
      <span class="d">Alle Quartiere und die Agglomeration</span>
    </button>`);
    $('#quarters').innerHTML = tiles.join('');
  }
  const VIEWS = [
    { id: 'fp-national', t: 'Schwimmen über den Dächern', d: 'Der Aussenpool des Fitnessparks National liegt auf dem Dach, 28 bis 32 Grad warm, mit Panoramablick – auch im Winter.', icon: 'pool' },
    { id: 'hallenbad', t: 'Bahnen mit Pilatusblick', d: 'Acht 25-Meter-Bahnen im Hallenbad Allmend, durch die Fensterfront der Pilatus. Mit dem Swiss-Fit-Abo gratis.', icon: 'peak' },
    { id: 'activ-ebikon', t: 'Sauna am Teich', d: 'In Ebikon liegen die Aussensaunen über einem Teich, erreichbar über einen kleinen Holzsteg – inklusive Berghütten-Sauna.', icon: 'steam' },
    { id: 'jimgym', t: 'Klimmzüge am See', d: 'Der Calisthenics Club von JIM GYM trainiert von April bis September jeden Montag um 18 Uhr draussen, im Winter gratis in der Halle.', icon: 'bar' },
    { id: 'boxing', t: 'Boxen in der Altstadt', d: 'Der Boxing Club Luzern trainiert im Gymnastiksaal Mariahilf, fünf Minuten vom Bahnhof, mit Fitnessboxen für alle.', icon: 'glove' },
    { id: 'pilatus-indoor', t: 'Vom Seil an den Fels', d: 'Pilatus Indoor in Root hat eine grosse Aussenanlage als Übergang vom Hallen- zum Felsklettern, jährlich rund 500 neue Routen.', icon: 'rope' },
  ];
  function renderViews() {
    $('#views').innerHTML = VIEWS.map((v) => {
      const g = GYMS.find((x) => x.id === v.id);
      return `<article class="view">
        <h3>${esc(v.t)}</h3>
        <p>${esc(v.d)}</p>
        <button data-open="${g.id}">${esc(g.name)} ansehen</button>
      </article>`;
    }).join('');
  }

  function renderAll() {
    renderPodium(); renderQuarters(); renderList(); renderMatrix(); renderPrices();
  }

  /* ---------- Events ---------- */
  selType.value = state.type;
  selType.addEventListener('change', () => {
    state.type = selType.value; store.set('type', state.type);
    const u = new URL(location.href); u.searchParams.set('ziel', state.type); history.replaceState(null, '', u);
    sizeSelect(selType); renderAll();
  });
  $('#selBudget').addEventListener('change', (e) => { state.budget = +e.target.value; sizeSelect(e.target); renderAll(); });
  $('#selTime').addEventListener('change', (e) => { state.time = e.target.value; sizeSelect(e.target); renderAll(); });
  $('#selWhere').addEventListener('change', (e) => {
    const v = e.target.value; sizeSelect(e.target);
    if (v === 'me') {
      if (!navigator.geolocation) { $('#heroNote').textContent = 'Dein Browser gibt keinen Standort frei. Wähle einen Ort aus der Liste.'; e.target.value = 'any'; sizeSelect(e.target); return; }
      $('#heroNote').textContent = 'Standort wird ermittelt …';
      navigator.geolocation.getCurrentPosition((p) => {
        state.me = { lat: p.coords.latitude, lng: p.coords.longitude }; state.where = 'me';
        $('#heroNote').textContent = 'Gyms im Umkreis von 4 km um deinen Standort. Der Standort bleibt in deinem Browser.';
        $('#sort').value = 'dist'; state.sort = 'dist';
        renderAll();
      }, () => {
        $('#heroNote').textContent = 'Standort nicht freigegeben. Erlaube den Zugriff im Browser oder wähle einen Ort aus der Liste.';
        e.target.value = 'any'; state.where = 'any'; sizeSelect(e.target); renderAll();
      }, { timeout: 10000, maximumAge: 300000 });
      return;
    }
    state.where = v; renderAll();
  });
  $('#q').addEventListener('input', (e) => { state.q = e.target.value; renderList(); });
  $$('.chip[data-f]').forEach((b) => b.addEventListener('click', () => {
    const f = b.dataset.f;
    state.flags.has(f) ? state.flags.delete(f) : state.flags.add(f);
    b.setAttribute('aria-pressed', state.flags.has(f));
    renderList();
  }));
  $('#sort').addEventListener('change', (e) => { state.sort = e.target.value; renderList(); });

  document.addEventListener('click', (e) => {
    const o = e.target.closest('[data-open]');
    if (o) { e.preventDefault(); showGym(o.dataset.open); return; }
    const c = e.target.closest('[data-cmp]');
    if (c) { toggleCmp(c.dataset.cmp); return; }
    const wq = e.target.closest('[data-where]');
    if (wq) { setWhere(wq.dataset.where); document.getElementById('alle').scrollIntoView({ behavior: 'smooth' }); return; }
    const t = e.target.closest('[data-type]');
    if (t) { state.type = t.dataset.type; selType.value = state.type; store.set('type', state.type); sizeSelect(selType); renderAll(); }
  });
  $('#list').addEventListener('mouseover', (e) => { const r = e.target.closest('.row'); if (r && r.dataset.id !== state.hot) setHot(r.dataset.id, false); });
  $('#list').addEventListener('mouseleave', () => setHot(null, false));
  $('#dClose').addEventListener('click', closeDrawer);
  $('#scrim').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('#drawer').classList.contains('on')) closeDrawer();
    if (e.key === 'Tab' && $('#drawer').classList.contains('on')) {
      const f = $$('#drawer a, #drawer button').filter((x) => x.offsetParent);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  });
  $('#trayGo').addEventListener('click', showCompare);
  $('#navCmp').addEventListener('click', (e) => { e.preventDefault(); state.cmp.size ? showCompare() : document.getElementById('alle').scrollIntoView(); });
  $('#trayClear').addEventListener('click', () => { [...state.cmp].forEach(toggleCmp); });

  /* ---------- Start ---------- */
  $('#stand').textContent = STAND;
  $('#barDemo').innerHTML = barbell(5, false);
  renderViews();
  sizeAll();
  initMap();
  renderAll();
  renderTray();
  setInterval(() => { renderList(); }, 60000);
  const h = location.hash.match(/^#gym=([\w-]+)/);
  if (h) showGym(h[1]);
})();
