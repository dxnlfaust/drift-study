/* DRIFT teaser: The Drift Study, Webflow build (v6, from study v5).
   All content lives in Webflow: screens, copy and styles in the Designer, dream types and pictures in the CMS.
   This script only reads that content through data-* hooks, runs the walk and fills in the result.
   Hooks are listed in the setup guide. Scripts don't run in the Designer canvas: test in preview/staging. */
(() => {
  const root = document.querySelector('[data-study]');
  if (!root) return;
  document.documentElement.classList.add('study-live');

  const $ = (s, el = root) => el.querySelector(s);
  const $$ = (s, el = root) => [...el.querySelectorAll(s)];
  const num = (v) => { const n = parseFloat(String(v ?? '').replace(/[^\d.\-]/g, '')); return Number.isFinite(n) ? n : 0; };
  const txt = (el, s) => { const x = el && $(s, el); return x ? x.textContent.trim() : ''; };
  const warn = (...a) => console.warn('[drift-study]', ...a);
  const AXIS = ['warm', 'moving', 'together', 'deep'];
  const traitsOf = (el) => AXIS.map((k) => num(el.dataset[k]));

  // ---------- settings (custom attributes on the [data-study] wrapper)
  const cfg = {
    stopGap: num(root.dataset.stopGap) || 2,      // lead needed to end the walk early
    lineMs: num(root.dataset.lineMs) || 900,      // narration line interval
    evalMs: num(root.dataset.evalMs) || 3000,     // length of the "Evaluating" screen
    barCells: num(root.dataset.barCells) || 24,
    key: root.dataset.storageKey || 'drift-study-v6',
  };
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- content from the CMS
  const TYPES = {}, ORDER = [];
  $$('[data-type-item]').forEach((el) => {
    const key = (el.dataset.key || '').trim().toUpperCase();
    if (!key || TYPES[key]) return;
    TYPES[key] = { key, n: (el.dataset.n || '').trim(), name: txt(el, '[data-type-name]'), blurb: $('[data-type-blurb]', el),
      at: traitsOf(el), yellow: /yellow/i.test(el.dataset.colour || '') };
    ORDER.push(key);
  });

  const IMG = {}; let WARM = null, COOL = null;
  const points = (s) => Object.fromEntries(String(s || '').split(/[\s,]+/).filter(Boolean)
    .map((p) => p.split(':')).filter(([k]) => TYPES[k.toUpperCase()]).map(([k, v]) => [k.toUpperCase(), num(v)]));
  $$('[data-pic]').forEach((el) => {
    const id = (el.dataset.pic || '').trim(), im = $('img', el);
    if (!id || IMG[id] || !im) return;
    const role = (el.dataset.role || '').toLowerCase().trim();
    if (!role || role === 'none' || el.dataset.inStudy === 'false') return; // library images not used by the study
    const o = { id, im, t: traitsOf(el), line: txt(el, '[data-pic-line]') };
    if (role.includes('warm')) { o.p = 'M'; o.points = points(el.dataset.points); WARM = id; }
    else if (role.includes('cool')) { o.p = 'M'; o.points = points(el.dataset.points); COOL = id; }
    else if (role.includes('wild')) o.p = 'W';
    else {
      o.p = (el.dataset.type || '').trim().toUpperCase();
      if (!TYPES[o.p]) { warn(`picture ${id} has no dream type; skipped`); return; }
    }
    IMG[id] = o;
  });

  const PLATES = $$('[data-plate]').map((el) => ({
    name: txt(el, '[data-plate-name]'), q: txt(el, '[data-plate-q]'),
    lines: $$('[data-plate-line]', el).map((p) => p.textContent.trim()).filter(Boolean),
  }));

  // ---------- check the content can run a full walk
  const pool = (p) => Object.keys(IMG).filter((k) => IMG[k].p === p);
  const problems = [];
  if (ORDER.length < 2) problems.push('fewer than two dream types');
  if (!WARM || !COOL) problems.push('the Plate I warm and cool pictures');
  if (PLATES.length < 5) problems.push(`five plate copy blocks (found ${PLATES.length})`);
  ORDER.forEach((p) => { if (pool(p).length < 4) problems.push(`${TYPES[p].name} needs at least 4 pictures (has ${pool(p).length})`); });
  if (pool('W').length < 2) problems.push('at least 2 wildcard pictures');
  if (problems.length) warn('content check:', problems.join('; '));

  // ---------- state (per viewer; storage may be blocked)
  const urlSeed = new URLSearchParams(location.search).get('seed');
  const newSeed = () => (urlSeed !== null ? num(urlSeed) : Math.floor(Math.random() * 1e9));
  const fresh = () => ({ pnum: String(100 + Math.floor(Math.random() * 900)).padStart(6, '0'), seed: newSeed(), plates: [], picks: [] });
  let S = fresh();
  try { const raw = localStorage.getItem(cfg.key); if (raw) S = Object.assign(fresh(), JSON.parse(raw)); } catch (e) {}
  // drop picks for pictures that have since been removed from the CMS
  if (S.picks.some((id) => !IMG[id]) || S.plates.some((pl) => pl && pl.some((id) => !IMG[id]))) { S.picks = []; S.plates = []; }
  if (urlSeed !== null && S.seed !== num(urlSeed)) { S.seed = num(urlSeed); S.picks = []; S.plates = []; }
  const save = () => { try { localStorage.setItem(cfg.key, JSON.stringify(S)); } catch (e) {} };
  const restart = () => { S.picks = []; S.plates = []; S.seed = newSeed(); seen.clear(); save(); };

  // ---------- scoring (unchanged from v5)
  const rng = (seed) => { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };
  const shuffle = (a, r) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const d2 = (a, b) => a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0);
  const near = (t) => ORDER.slice().sort((a, b) => d2(TYPES[a].at, t) - d2(TYPES[b].at, t))[0];
  function score(picks = S.picks) {
    const sc = Object.fromEntries(ORDER.map((p) => [p, 0]));
    picks.forEach((id) => {
      const o = IMG[id]; if (!o) return;
      if (o.p === 'M') Object.entries(o.points).forEach(([k, v]) => { sc[k] += v; });
      else if (o.p === 'W') sc[near(o.t)] += 1;
      else sc[o.p] += 2;
    });
    return sc;
  }
  const avgTraits = (picks = S.picks) => AXIS.map((_, a) => picks.reduce((s, id) => s + IMG[id].t[a], 0) / (picks.length || 1));
  function ranked(picks = S.picks) {
    const sc = score(picks), avg = avgTraits(picks);
    return ORDER.slice().sort((a, b) => sc[b] - sc[a] || d2(TYPES[a].at, avg) - d2(TYPES[b].at, avg)).map((p) => [p, sc[p]]);
  }
  function nextPlate(picks = S.picks) {
    const n = picks.length;
    if (n < 3) return n;
    if (n > 4) return null;
    const r = ranked(picks);
    return r[0][1] - r[1][1] >= cfg.stopGap ? null : n;
  }
  function build(i, picks, seed) {
    const r = rng(seed + i * 7919), used = new Set(picks);
    const take = (p, k) => shuffle(pool(p).filter((x) => !used.has(x)), r).slice(0, k);
    if (i === 0) return shuffle([WARM, COOL], r);
    if (i === 1 || i === 2) return shuffle([...ORDER.flatMap((p) => take(p, 1)), ...take('W', 1)], r);
    if (i === 3) return shuffle(ranked(picks).slice(0, 2).flatMap(([p]) => take(p, 2)), r);
    const kept = picks.slice(1).filter((x) => IMG[x].p !== 'W'); // plate V: keep one of your earlier pictures
    return kept.length >= 2 ? kept : picks.slice(1);
  }
  const plateIds = (i) => { if (!S.plates[i]) { S.plates[i] = build(i, S.picks.slice(0, i), S.seed); save(); } return S.plates[i]; };
  function result(picks = S.picks) {
    const r = ranked(picks), p = r[0][0], avg = avgTraits(picks);
    const pull = r[1][1] > 0 ? r[1][0] : ORDER.filter((x) => x !== p).sort((a, b) => d2(TYPES[a].at, avg) - d2(TYPES[b].at, avg))[0];
    return { p, pull, avg };
  }

  // ---------- templates: the first matching element is the pattern; samples are removed
  function template(sel) {
    const all = $$(sel); if (!all.length) return null;
    const first = all[0], parent = first.parentNode, anchor = all[all.length - 1].nextSibling;
    const pattern = first.cloneNode(true);
    pattern.classList.remove('is-picked', 'is-done', 'is-now');
    all.forEach((e) => e.remove());
    return { parent, anchor, make: () => pattern.cloneNode(true),
      fill(items, fn) { this.parent.querySelectorAll(':scope > ' + sel).forEach((e) => e.remove());
        items.forEach((it, k) => { const el = this.make(); fn(el, it, k); this.parent.insertBefore(el, this.anchor && this.anchor.parentNode === this.parent ? this.anchor : null); }); } };
  }
  const T = {
    pick: template('[data-study-pick]'), dot: template('[data-study-dot]'), line: template('[data-study-narr-line]'),
    cell: template('[data-study-bar-cell]'), strip: template('[data-study-strip-item]'), digit: template('[data-study-digit]'),
    reading: template('[data-study-reading]'),
  };
  const setImg = (target, id, alt) => {
    const im = target.tagName === 'IMG' ? target : $('img', target), src = IMG[id].im;
    if (!im) return;
    im.src = src.getAttribute('src');
    if (src.getAttribute('srcset')) { im.srcset = src.getAttribute('srcset'); im.sizes = '(max-width: 767px) 50vw, 300px'; } else im.removeAttribute('srcset');
    im.loading = 'eager'; im.alt = alt;
  };

  // ---------- screens and shared fields
  const screens = Object.fromEntries($$('[data-study-screen]').map((el) => [el.dataset.studyScreen, el]));
  const status = $('[data-study-status]');
  let timers = [];
  const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
  const seen = new Set();
  const set = (name, value, scope = root) => $$(`[data-study-field="${name}"]`, scope).forEach((el) => { el.textContent = value; });
  function show(name) {
    Object.entries(screens).forEach(([k, el]) => el.classList.toggle('is-current', k === name));
    if (status) status.textContent = (screens[name] && screens[name].dataset.status) || status.dataset.default || 'Document: Done';
    set('pnum', S.pnum);
    if (T.digit) T.digit.fill(S.pnum.split(''), (el, d) => { el.textContent = d; });
    return screens[name];
  }
  const go = (r) => { if (location.hash.slice(1) === r) render(); else location.hash = r; };
  const ROMAN = ['I', 'II', 'III', 'IV', 'V'];

  // ---------- plate
  function plate(i) {
    const el = show('plate'), P = PLATES[i] || { name: '', q: '', lines: [] }, ids = plateIds(i), cur = S.picks[i];
    set('plate-roman', ROMAN[i]); set('plate-name', P.name); set('plate-q', P.q);
    const grid = T.pick && T.pick.parent, n = ids.length;
    if (grid) { grid.style.setProperty('--c', n === 2 ? 2 : n === 4 ? 2 : 3); grid.style.setProperty('--cp', n === 3 ? 3 : 2); grid.dataset.count = n; }
    T.pick && T.pick.fill(ids, (b, id, k) => {
      const letter = String.fromCharCode(65 + k);
      b.dataset.studyPick = id; b.classList.toggle('is-picked', cur === id);
      if (b.tagName !== 'BUTTON' && b.tagName !== 'A') { b.setAttribute('role', 'button'); b.tabIndex = 0; }
      b.setAttribute('aria-pressed', cur === id ? 'true' : 'false');
      setImg(b, id, `Picture ${letter}`);
      const l = $('[data-study-pick-letter]', b); if (l) l.textContent = letter;
      const choose = (e) => { e.preventDefault(); pick(i, id, b); };
      b.addEventListener('click', choose);
      b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') choose(e); });
    });
    const total = Math.max(3, i + 1);
    T.dot && T.dot.fill(ROMAN.slice(0, total), (d, r, k) => { d.textContent = r; d.classList.toggle('is-done', k < i); d.classList.toggle('is-now', k === i); });
    const choice = $('[data-study-choice]', el), narr = $('[data-study-narr]', el);
    const lines = [];
    T.line && T.line.fill(P.lines, (p, l) => { p.textContent = l; p.hidden = true; lines.push(p); });
    const own = [];
    const finish = () => { own.forEach(clearTimeout); lines.forEach((p) => { p.hidden = false; });
      if (narr) narr.classList.add('is-done'); if (choice) choice.hidden = false; seen.add(i); };
    if (narr) narr.classList.remove('is-done');
    if (still || seen.has(i)) finish();
    else {
      if (choice) choice.hidden = true;
      lines.forEach((p, k) => own.push(later(() => { p.hidden = false; }, 300 + k * cfg.lineMs)));
      own.push(later(finish, 300 + lines.length * cfg.lineMs));
      if (narr) narr.onclick = finish;
    }
  }
  function pick(i, id, b) {
    $$('[data-study-pick]').forEach((x) => { x.classList.remove('is-picked'); x.setAttribute('aria-pressed', 'false'); });
    b.classList.add('is-picked'); b.setAttribute('aria-pressed', 'true');
    // any pick, even the same one again, drops the later plates, so a revisited plate never skips ahead
    const changed = S.picks[i] !== id;
    S.picks = S.picks.slice(0, i); S.picks[i] = id;
    if (changed) S.plates = S.plates.slice(0, i + 1);
    for (let k = i + 1; k < 5; k++) seen.delete(k);
    save();
    const nx = nextPlate();
    later(() => go(nx === null ? 'eval' : `p${nx + 1}`), 280);
    track('study_pick', { plate: i + 1 });
  }

  // ---------- evaluation
  function evaluating() {
    const el = show('eval');
    const evl = $$('[data-study-evline]', el); evl.forEach((l) => { l.hidden = true; });
    if (T.cell) T.cell.fill([], () => {});
    if (still) { evl.forEach((l) => { l.hidden = false; }); later(() => go('profile'), 900); return; }
    for (let k = 0; k < cfg.barCells; k++) later(() => { if (T.cell) T.cell.parent.appendChild(T.cell.make()); }, (cfg.evalMs - 360) / cfg.barCells * k);
    evl.forEach((l, k) => later(() => { l.hidden = false; }, 300 + k * ((cfg.evalMs - 450) / Math.max(1, evl.length))));
    later(() => go('profile'), cfg.evalMs);
  }

  // ---------- profile
  function profile() {
    const el = show('profile'), { p, pull, avg } = result(), Ty = TYPES[p], Q = TYPES[pull];
    const pct = (v) => Math.max(0, Math.min(100, Math.round(((v + 2) / 4) * 100)));
    const axes = $$('[data-study-axis]', el);
    const code = AXIS.map((k, a) => {
      const row = axes.find((x) => x.dataset.studyAxis === k) || axes[a];
      const lo = (row && row.dataset.lo) || '-', hi = (row && row.dataset.hi) || '+';
      if (row) {
        const m = $('[data-study-axis-mark]', row); if (m) m.style.left = pct(avg[a]) + '%';
        const tr = $('[data-study-axis-track]', row) || m && m.parentNode;
        if (tr) { tr.setAttribute('role', 'img'); tr.setAttribute('aria-label', `${row.dataset.loLabel || lo} to ${row.dataset.hiLabel || hi}: ${pct(avg[a])} of 100`); }
      }
      return (avg[a] > 0 || (avg[a] === 0 && Ty.at[a] > 0)) ? hi : lo;
    }).join('');
    set('typeno', Ty.n); set('typename', Ty.name); set('code', code); set('pull', Q.name);
    set('date', new Date().toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' }));
    $$('[data-study-field="typename"]', el).forEach((n) => n.classList.toggle('is-yellow', Ty.yellow));
    $$('[data-study-field="blurb"]', el).forEach((n) => { n.innerHTML = Ty.blurb ? Ty.blurb.innerHTML : ''; });
    const path = S.picks.length === 5 ? S.picks.slice(0, 4) : S.picks; // plate V repeats an earlier pick
    T.strip && T.strip.fill(path, (s, id) => setImg(s, id, ''));
    T.reading && T.reading.fill(path.filter((id) => IMG[id].line), (r, id) => { r.textContent = IMG[id].line; });
    if (T.strip) T.strip.parent.style.setProperty('--n', path.length);
    root.dataset.resultType = Ty.name; root.dataset.resultCode = code;
    track('study_result', { type: Ty.name, code });
  }

  // ---------- controls
  const begin = (e) => { if (e) e.preventDefault(); restart(); go('p1'); };
  $$('[data-study-begin]').forEach((b) => b.addEventListener('click', begin));
  $$('[data-study-retake]').forEach((b) => b.addEventListener('click', begin));
  $$('[data-study-reset]').forEach((b) => {
    const label = b.textContent; let armed = false;
    b.addEventListener('click', (e) => {
      e.preventDefault();
      if (!armed) { armed = true; b.textContent = b.dataset.confirm || 'Start again? Click to confirm'; setTimeout(() => { armed = false; b.textContent = label; }, 3000); return; }
      armed = false; b.textContent = label; S = fresh(); save(); seen.clear(); go('');
    });
  });
  $$('[data-study-share]').forEach((b) => b.addEventListener('click', async (e) => {
    e.preventDefault();
    const line = (b.dataset.shareText || 'I’m {code} · {type}. What are you?').replace('{code}', root.dataset.resultCode || '').replace('{type}', root.dataset.resultType || '');
    const url = location.origin + location.pathname;
    try { if (navigator.share) await navigator.share({ text: line, url }); else { await navigator.clipboard.writeText(`${line} ${url}`); b.textContent = b.dataset.copied || 'Copied'; } } catch (err) {}
  }));
  function track(name, data) { try { (window.dataLayer = window.dataLayer || []).push({ event: name, ...data }); } catch (e) {} }

  // ---------- router
  function render() {
    timers.forEach(clearTimeout); timers = [];
    if (problems.length && !ORDER.length) { show('landing'); return; }
    const r = location.hash.slice(1), m = /^p([1-5])$/.exec(r), nx = nextPlate();
    if (m) {
      const i = Number(m[1]) - 1, reach = nx === null ? S.picks.length - 1 : nx;
      if (i > reach) return go(nx === null ? 'profile' : `p${nx + 1}`);
      plate(i);
    } else if ((r === 'eval' || r === 'profile') && nx !== null) return go(`p${nx + 1}`);
    else if (r === 'eval') evaluating();
    else if (r === 'profile') profile();
    else show('landing');
    document.dispatchEvent(new CustomEvent('drift:render', { detail: { screen: r || 'landing' } })); // lets the fitted-type engine refit
  }
  window.addEventListener('hashchange', () => {
    render();
    const top = root.getBoundingClientRect().top + scrollY;
    if (scrollY > top) scrollTo({ top, behavior: 'instant' });
    root.focus({ preventScroll: true });
  });
  if (!root.hasAttribute('tabindex')) root.tabIndex = -1;
  save();
  render();
  window.DriftStudy = { score: () => score(), ranked: () => ranked(), problems, types: TYPES, pictures: IMG }; // for QA in the console
})();
