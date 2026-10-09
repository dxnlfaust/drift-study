/* DRIFT engine for the Webflow site, v0.4.1 (Faust Earth for Untitled Group, Oct 2026).

   A port of Studio BRIKD's DRIFT tools by Ryan Ausden, reused with his OK:
   - DRIFT TYPE MOTION (lab.js): the master table, cut-aware tracking, the height deal, the sacred margin, wdthFor.
     Only the rest view (the still poster) is ported; the animation is not.
   - DRIFT STICKER (engine.js): the brand rules, the per-word roll, colour and picture choice, layout and SVG.
     Math.random is swapped for one seeded generator per page view, so ?seed=123 replays a look.

   Everything is driven by data-drift attributes on Webflow elements. The text stays real HTML: lines and words are
   styled with Drift Sans axes; stickers are drawn as SVG beside their text, which is kept for screen readers.

   Hooks (all optional; see README.md in this folder):
     data-drift="poster"   a frame whose children with data-drift-role (city|name|date|month|venue|logo) share its
                           height, every line's ink filling the width
     data-drift="fit"      one line whose ink fills its width at the CSS font-size (the width axis does the work)
     data-drift="mix"      one line, every word its own weight and width (the sticker roll), sized to fit
     data-drift="sticker"  a bumper sticker drawn from the element's text, on a picture from [data-drift-pics]
     data-drift="stack"    direct children nudged sideways by a seeded amount (a sticker staircase)
     data-drift="marquee"  its first child scrolls forever, cloned so the loop never shows a gap
     data-drift="logo"     the DRIFT® wordmark drawn inline in the element's text colour (its text stays for screen readers)
     data-drift="menu-toggle" / data-drift-menu, data-drift-city-set / data-city: menu and Brisbane/Perth selector

   Webflow runs no custom code in the Designer canvas: test on the published (staging) site. */
(() => {
  if (window.DRIFT && window.DRIFT.version) return;
  const VERSION = '0.4.1';
  const NS = 'http://www.w3.org/2000/svg';
  const AX = { wght: [400, 900], wdth: [23, 252] };
  const CAP = 1467 / 2048, DESC = 434 / 2048, XH = 1062 / 2048, SPACE = 200 / 2048;
  const MG = [400, 700, 900], MD = [23, 50, 100, 160, 252];   // the font's masters: exactly bilinear between them
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const seg = (arr, v) => { let i = 0; while (i < arr.length - 2 && v > arr[i + 1]) i++; return [i, clamp((v - arr[i]) / (arr[i + 1] - arr[i]), 0, 1)]; };
  const wordsOf = (text) => String(text || '').trim().split(/\s+/).filter(Boolean);
  // the text of a hook; an element made only of child elements (two bound CMS fields, say) reads them with a space between
  const textOf = (el) => {
    const kids = [...el.children].filter((c) => !c.classList.contains('drift-sr') && c.tagName !== 'svg');
    const loose = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    const t = !loose && kids.length > 1 && !el.querySelector(':scope > .drift-sr') ? kids.map((c) => c.textContent).join(' ') : el.textContent;
    return (t || '').replace(/\s+/g, ' ').trim();
  };
  const num = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
  const range = (v, d) => { if (!v) return d; const m = String(v).split(/[-–,\s]+/).map(Number).filter(Number.isFinite); return m.length === 2 ? [Math.min(m[0], m[1]), Math.max(m[0], m[1])] : m.length === 1 ? [m[0], m[0]] : d; };
  const warn = (...a) => console.warn('[drift]', ...a);

  const SCRIPT = document.currentScript;
  const BASE = SCRIPT && SCRIPT.src ? SCRIPT.src.replace(/[^/]*$/, '') : '';
  const METRICS_URL = (SCRIPT && SCRIPT.dataset.metrics) || BASE + 'driftsans-metrics.json';
  const FAMILY = (SCRIPT && SCRIPT.dataset.family) || 'Drift Sans';
  const LOGO_URL = (SCRIPT && SCRIPT.dataset.logo) || BASE + 'assets/drift-logo-ink.svg';
  const STILL = matchMedia('(prefers-reduced-motion: reduce)');

  /* ---- one seed per page view; ?seed=123 replays it ---- */
  const qs = new URLSearchParams(location.search);
  const newSeed = () => (window.crypto && crypto.getRandomValues ? crypto.getRandomValues(new Uint32Array(1))[0] : Math.floor(Math.random() * 4294967296));
  let SEED = qs.has('seed') ? (parseInt(qs.get('seed'), 10) >>> 0) : newSeed();
  const hash32 = (s) => { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const mulberry = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const rngFor = (key) => mulberry((SEED ^ hash32(key)) >>> 0);

  /* ---- motion: one clock for everything that moves (lab.js: every motion a pure function of time since its start) ----
     A moving hook starts the first frame it is on screen after the reveal (the bookend's fade, or boot). Nothing moves
     with prefers-reduced-motion: every hook is drawn at rest. */
  const BEAT = 60 / num(SCRIPT && SCRIPT.dataset.bpm, 140);   // lab.js: 140 bpm
  const zOf = (I) => clamp(0.95 - 0.8 * 0.69 * (I == null ? 1 : I), 0.12, 0.95);   // Ryan's bounce 0.69
  // a damped spring's step response u seconds after its kick (lab.js spring)
  function spring(u, w, z) {
    if (u <= 0) return 0;
    if (z >= 0.999) return 1 - Math.exp(-w * u) * (1 + w * u);
    const wd = w * Math.sqrt(1 - z * z);
    return 1 - Math.exp(-z * w * u) * (Math.cos(wd * u) + (z * w / wd) * Math.sin(wd * u));
  }
  let REVEAL_AT = 0, raf = 0, startedThisFrame = 0, FRAMES = 0, STARVED = false;
  const MOV = new Map();   // element -> frame function (returns false when it has finished moving)
  const still = () => STILL.matches || STARVED;   // STARVED: the browser runs no animation frames (a hidden tab or webview)
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => es.forEach((e) => { e.target._driftInView = e.isIntersecting; if (e.isIntersecting) kick(); }), { rootMargin: '80px' }) : null;
  // seconds since this hook started moving; null at rest (reduced motion), −1 before it has started
  function clockOf(el, st, now) {
    if (still()) return null;
    now = now || performance.now();
    if (st.t0 == null) {
      if (now < REVEAL_AT || el._driftInView === false || (io && el._driftInView == null)) return -1;
      st.t0 = now + 90 * startedThisFrame++;   // hooks that come on screen together start a beat-let apart
    }
    return (now - st.t0) / 1000;
  }
  function moving(el, fn) { if (still() || MOV.has(el)) return; MOV.set(el, fn); if (io) io.observe(el); kick(); }
  function kick() { if (!raf && MOV.size) raf = requestAnimationFrame(tick); }
  function tick(now) {
    raf = 0; startedThisFrame = 0; FRAMES++;
    for (const [el, fn] of MOV) {
      if (!el.isConnected) { MOV.delete(el); continue; }
      if (el._driftInView === false) continue;
      let go = true; try { go = fn(now); } catch (e) { warn('motion failed', el, e); go = false; }
      if (go === false) MOV.delete(el);
    }
    if (MOV.size) kick();
  }

  /* ---- the engine's own CSS ---- */
  const CSS = `
.drift-sr{position:absolute!important;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
[data-drift],[data-drift] *{font-synthesis:none}
[data-drift="poster"]{position:relative}
[data-drift="poster"].drift-ready>[data-drift-role]{position:absolute;margin:0;padding:0;white-space:nowrap;font-weight:400;font-family:'${FAMILY}',Arial,sans-serif;max-width:none;display:block;clip-path:inset(-0.1em -0.4em -0.12em -0.4em)}
[data-drift="poster"].drift-ready>[data-drift-role="logo"]{line-height:0}
[data-drift="poster"].drift-ready>[data-drift-role="logo"]>svg,[data-drift="poster"].drift-ready>[data-drift-role="logo"]>img{display:block;width:100%;height:100%}
.drift-in{display:block;width:max-content;white-space:nowrap;font-weight:400;font-family:'${FAMILY}',Arial,sans-serif;position:relative;clip-path:inset(-0.2em -0.4em -0.12em -0.4em)}
.drift-in>span{font-weight:400}
[data-drift="fit"].drift-ready,[data-drift="mix"].drift-ready{white-space:nowrap;overflow:visible}
[data-drift="sticker"]>svg.drift-sticker{display:block;max-width:100%;height:auto}
[data-drift="stack"]>*{width:fit-content;max-width:100%}
[data-drift="marquee"]{overflow:hidden}
[data-drift="logo"]{line-height:0}
[data-drift="logo"]>svg.drift-logo{display:block;width:100%;height:auto}
[data-drift="marquee"]>.drift-track{display:flex;width:max-content;flex-wrap:nowrap}
[data-drift="marquee"].drift-run>.drift-track{animation:drift-marquee var(--drift-dur,30s) linear infinite}
@keyframes drift-marquee{to{transform:translateX(-50%)}}
@media (prefers-reduced-motion:reduce){[data-drift="marquee"].drift-run>.drift-track{animation:none}}
html.drift-js [data-drift-menu]:not(.is-open){display:none}
[data-drift="sticker"]>svg.drift-sticker{transform-origin:0 50%}
[data-drift="mosaic"]{position:relative}
[data-drift="mosaic"]>canvas.drift-mosaic{position:absolute;pointer-events:none}
html.drift-js [data-drift-bookend]{position:fixed;inset:0;z-index:1000;transition:opacity .7s ease}
html.drift-js [data-drift-bookend].is-leaving{opacity:0;pointer-events:none}
html.drift-bookend-seen [data-drift-bookend],html.drift-failsafe [data-drift-bookend],html:not(.drift-js) [data-drift-city-gate]{display:none}
html.drift-js[data-drift-city] [data-drift-city-gate]{display:none}
html.drift-js:not([data-drift-city]) [data-drift-city-gate]{position:fixed;inset:0;z-index:950;overflow:auto}
html.drift-js:not([data-drift-city]):has([data-drift-city-gate]){overflow:hidden}
@media (prefers-reduced-motion:reduce){[data-drift-bookend]{display:none}}
html.drift-js [data-drift-menu].is-open{position:fixed;inset:0;z-index:900;overflow:auto}
html.drift-menu-open{overflow:hidden}
html[data-drift-city="brisbane"] [data-city="perth" i],html[data-drift-city="perth"] [data-city="brisbane" i]{display:none!important}
`;
  const injectCSS = () => { const s = document.createElement('style'); s.id = 'drift-engine-css'; s.textContent = CSS; document.head.appendChild(s); };

  /* ---- the font's metrics: side-bearings and advances on a wght × wdth grid (Ryan's tools/sidebearings.py) ---- */
  let MET = null;
  const metricsReady = (window.DRIFT_METRICS ? Promise.resolve(window.DRIFT_METRICS) : fetch(METRICS_URL).then((r) => r.json()))
    .then((j) => { MET = j; }).catch((e) => warn('metrics not loaded, ink edges fall back to the advance box', e));
  // [advance, left side-bearing, right side-bearing] of a character at a cut, in font units
  function sb(ch, g, d) {
    const c = MET && MET.chars[ch]; if (!c) return [0, 0, 0];
    const [i, u] = seg(MET.wg, g), [j, v] = seg(MET.wd, d), n = MET.wd.length, at = (a, b) => c[a * n + b];
    return [0, 1, 2].map((k) => lerp(lerp(at(i, j)[k], at(i, j + 1)[k], v), lerp(at(i + 1, j)[k], at(i + 1, j + 1)[k], v), u));
  }
  const upm = () => (MET ? MET.upm : 2048);

  /* ---- the master table: a text measured once at the 15 masters, then known at every cut ---- */
  let meterT = null;
  function meter() {
    if (meterT) return meterT;
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('style', 'position:absolute;left:-99999px;top:0;width:10px;height:10px;overflow:hidden;visibility:hidden');
    meterT = document.createElementNS(NS, 'text');
    meterT.setAttribute('font-family', FAMILY); meterT.setAttribute('font-size', '2048'); meterT.setAttribute('font-weight', '400');
    svg.appendChild(meterT); document.body.appendChild(svg);
    return meterT;
  }
  const tables = new Map();   // text -> natural advance in em at MG × MD, no tracking, no word space
  function table(text) {
    let t = tables.get(text); if (t) return t;
    const m = meter(); t = new Float64Array(MG.length * MD.length);
    m.textContent = text;
    for (let i = 0; i < MG.length; i++) for (let j = 0; j < MD.length; j++) {
      m.setAttribute('style', `font-variation-settings:'wght' ${MG[i]},'wdth' ${MD[j]};letter-spacing:0px;word-spacing:0px;font-synthesis:none`);
      t[i * MD.length + j] = m.getComputedTextLength() / 2048;
    }
    tables.set(text, t); return t;
  }
  function advance(text, g, d) {
    const t = table(text), [i, u] = seg(MG, g), [j, v] = seg(MD, d), n = MD.length;
    return lerp(lerp(t[i * n + j], t[i * n + j + 1], v), lerp(t[(i + 1) * n + j], t[(i + 1) * n + j + 1], v), u);
  }

  /* ================= TYPE MOTION (lab.js), the rest view ================= */
  const ROLE = {   // lab.js ROLE, plus the weight range each line is rolled in per visit (Ryan's rest weight inside it)
    city:  { pref: 1.00, wght: 400, track: -0.06, hit: 820, roll: [400, 650] },
    name:  { pref: 0.95, wght: 400, track: -0.06, hit: 820, roll: [400, 650] },
    date:  { pref: 0.42, wght: 900, track: 0,     hit: 900, roll: [750, 900] },
    month: { pref: 0.42, wght: 600, track: -0.16, hit: 860, roll: [500, 800] },
    venue: { pref: 0.40, wght: 400, track: -0.06, hit: 820, roll: [400, 600] },
  };
  const TIGHTEN = 0.01;
  function fuseAt(g, d) {
    if (!MET) return -Infinity;
    const [adv, l, r] = sb('e', g, d), k = clamp((d - 35) / (70 - 35), 0, 1);
    return lerp(-0.5 * (l + r), -(l + r + 0.04 * adv), k) / MET.upm;
  }
  function trackAt(track, g, d) {
    const c = clamp((100 - d) / (100 - 40), 0, 1), light = clamp((700 - g) / 300, 0, 1);
    const want = lerp(track, -0.05 - 0.015 * light, c) - TIGHTEN;
    return MET ? Math.max(want, fuseAt(g, d)) : want;
  }
  const gapEm = (d) => 0.012 + 0.188 * clamp((d - 40) / (107 - 40), 0, 1) + 0.08 * clamp((d - 107) / (252 - 107), 0, 1);
  function spaceAt(row, g, d) {
    if (!MET || row.text.indexOf(' ') < 0) return 0;
    const ls = trackAt(row.track, g, d), s = sb(' ', g, d)[0] / MET.upm, txt = row.text;
    let sum = 0, n = 0;
    for (let i = 1; i < txt.length - 1; i++) {
      if (txt[i] !== ' ') continue;
      const sbs = (sb(txt[i - 1], g, d)[2] + sb(txt[i + 1], g, d)[1]) / MET.upm;
      sum += gapEm(d) - sbs - 2 * ls - s; n++;
    }
    return n ? sum / n : 0;
  }
  const lsRow = (row, g, d) => trackAt(row.track, g, d);
  // a line's ink width at 100 px: the run less the first letter's left side-bearing and the last one's right
  function ink100(row, g, d) {
    const s = row.text || ' ', spaces = s.split(' ').length - 1;
    return advance(s, g, d) * 100 + (s.length - 1) * lsRow(row, g, d) * 100 + (spaces ? spaces * spaceAt(row, g, d) * 100 : 0)
      - (sb(s[0], g, d)[1] + sb(s[s.length - 1], g, d)[2]) * 100 / upm();
  }
  function wdthFor(row, g, want100) {   // the width axis that makes the ink `want100` wide at 100 px
    if (ink100(row, g, AX.wdth[1]) <= want100) return AX.wdth[1];
    if (ink100(row, g, AX.wdth[0]) >= want100) return AX.wdth[0];
    let a = AX.wdth[0], b = AX.wdth[1];
    for (let n = 0; n < 26; n++) { const m = (a + b) / 2; if (ink100(row, g, m) < want100) a = m; else b = m; }
    return (a + b) / 2;
  }
  // the sacred margin: real ink above the cap line and below the box, per 100 px (canvas outlines, weight only)
  const vCache = new Map(); let vCtx = null;
  function vInk(row, g) {
    const w = clamp(Math.round(g / 50) * 50, AX.wght[0], AX.wght[1]), key = row.text + '|' + w;
    let v = vCache.get(key);
    if (!v) {
      vCtx = vCtx || document.createElement('canvas').getContext('2d');
      vCtx.font = `400 100px "${FAMILY}"`;
      const m = vCtx.measureText(row.text || ' ');
      v = { up: Math.max(0, (m.actualBoundingBoxAscent || 0) - CAP * 100), down: Math.max(0, (m.actualBoundingBoxDescent || 0) - (boxK(row) - CAP) * 100) };
      vCache.set(key, v);
    }
    return v;
  }
  const boxK = (row) => CAP + (/[gjpqy,;]/.test(row.text) ? 0.78 * DESC : 0);
  const styleRow = (row, g, d, size) => ({
    fontSize: size.toFixed(3) + 'px',
    fontVariationSettings: `'wght' ${g.toFixed(1)},'wdth' ${d.toFixed(2)}`,
    letterSpacing: (lsRow(row, g, d) * size).toFixed(3) + 'px',
    wordSpacing: (spaceAt(row, g, d) * size).toFixed(3) + 'px',
  });

  // the baseline of a line box at line-height: normal, per px of font-size (read off the font once)
  let ASC = 0.9, LHN = 1.15;
  function measureBaseline() {
    const box = document.createElement('div');
    box.setAttribute('aria-hidden', 'true');
    box.style.cssText = `position:absolute;left:-99999px;top:0;font:400 1000px/normal '${FAMILY}';white-space:nowrap;visibility:hidden`;
    box.innerHTML = '<span style="display:inline-block;width:1px;height:0;vertical-align:baseline"></span>H';
    document.body.appendChild(box);
    const mark = box.firstChild, top = box.getBoundingClientRect().top;
    ASC = (mark.getBoundingClientRect().top - top) / 1000; LHN = box.getBoundingClientRect().height / 1000;
    box.remove();
    if (!(ASC > 0.3 && ASC < 2)) ASC = 0.9;
  }

  /* ---- the poster: the frame's height dealt to its lines, every line's ink spanning the column ---- */
  const padOf = (el) => { const cs = getComputedStyle(el); return { l: num(cs.paddingLeft, 0), r: num(cs.paddingRight, 0), t: num(cs.paddingTop, 0), b: num(cs.paddingBottom, 0) }; };
  function posterInit(el, st) {
    st.lines = [...el.children].filter((c) => c.hasAttribute('data-drift-role')).map((c, k) => {
      const role = (c.getAttribute('data-drift-role') || 'city').toLowerCase();
      if (role === 'logo') return { el: c, logo: true };
      const R = ROLE[role] || ROLE.city, text = textOf(c), r = rngFor('poster|' + st.key + '|' + k + '|' + text);
      const wr = range(c.getAttribute('data-drift-wght'), R.roll);
      const wght = clamp(lerp(wr[0], wr[1], r()), AX.wght[0], AX.wght[1]);
      return { el: c, role, text, row: { text, track: num(c.getAttribute('data-drift-track'), R.track) }, pref: num(c.getAttribute('data-drift-pref'), R.pref), wght, hit: Math.max(wght, R.hit) };
    });
    const mo = el.getAttribute('data-drift-motion') || '';
    st.loop = /\bloop\b/.test(mo); st.unfold = st.loop || /\bunfold\b/.test(mo);
    st.I = clamp(num(el.getAttribute('data-drift-intensity'), 1), 0, 1.5);
    if (st.unfold) st.lines.forEach((l) => { l.el.style.transformOrigin = '0 0'; });
  }
  // Type Motion's loop (lab.js stateOf, L.loop): the spotlight passes down the lines a beat at a time; the lit line's share
  // swells (grow) and it goes bold (hit), on a spring. In: each line unfolds from its left ink edge, in reading order.
  const GROW = 2, BOLD = 1, HIT_W = 13, UNFOLD_W = 30, LINE_GAP = 0.12;
  function posterMotion(st, t) {
    const n = st.lines.filter((l) => !l.logo && l.text).length, z = zOf(st.I), tHits = 0.08 + n * LINE_GAP + 0.3;
    let i = 0;
    return st.lines.map((l) => {
      if (l.logo || !l.text) return { e: 0, k: 1 };
      const tin = 0.08 + i * LINE_GAP, k = t == null ? 1 : t < tin ? 0 : Math.min(1, spring(t - tin, UNFOLD_W, z));
      let e = 0;
      if (st.loop && t != null && t > tHits) {
        const u = t - tHits, K = Math.floor(u / BEAT);
        for (let b = Math.max(0, K - 5); b <= K; b++) if (b % n === i) e += spring(u - b * BEAT, HIT_W, z) - spring(u - b * BEAT - BEAT, HIT_W, z);
      }
      i++;
      return { e: Math.max(-0.35, e), k };
    });
  }
  function posterRender(el, st, now) {
    const t = st.unfold ? clockOf(el, st, now) : null, mv = st.unfold ? posterMotion(st, t) : null;
    const p = padOf(el), cw = el.clientWidth, W = cw - p.l - p.r;
    if (W < 20) return false;
    let ch = el.clientHeight;
    const asp = num(el.getAttribute('data-drift-aspect'), 0);
    if (asp > 0) { ch = cw / asp; el.style.height = ch.toFixed(1) + 'px'; }
    const A0 = ch - p.t - p.b;
    if (A0 < 20) { warn('a poster needs a height (CSS height, aspect-ratio or data-drift-aspect)', el); return false; }
    const gapAttr = el.getAttribute('data-drift-gap'), gap = gapAttr == null ? W * 0.0185 : /%$/.test(gapAttr) ? W * num(gapAttr, 1.85) / 100 : num(gapAttr, 0);
    const items = st.lines.map((l, j) => [l, mv ? mv[j] : { e: 0, k: 1 }]).filter(([l]) => l.logo || l.text).map(([l, m]) => {
      if (l.logo) {
        const sv = l.el.querySelector('svg'), vb = sv && sv.viewBox && sv.viewBox.baseVal;
        const aspL = num(l.el.getAttribute('data-drift-aspect'), vb && vb.width ? vb.width / vb.height : 999.969 / 95.1139);
        return { l, fixed: true, h: W / aspL, k: m.k };
      }
      const e = clamp(m.e, 0, 1.4), g = clamp(lerp(l.wght, l.hit, clamp(BOLD * st.I * e, 0, 1)), AX.wght[0], AX.wght[1]);
      const bk = boxK(l.row), hmax = Math.min(A0, bk * 100 * W / ink100(l.row, g, AX.wdth[0]));
      const hmin = Math.min(hmax, bk * 100 * W / ink100(l.row, g, AX.wdth[1]));
      return { l, g, bk, hmax, hmin, k: m.k, want: l.pref * Math.max(0.05, 1 + GROW * (st.I || 1) * m.e) };
    });
    if (!items.length) return false;
    const gaps = gap * (items.length - 1), fixedH = items.filter((it) => it.fixed).reduce((s, it) => s + it.h, 0);
    const text = items.filter((it) => !it.fixed), room = A0 - gaps - fixedH;
    // λ such that Σ clamp(λ·want, floor, ceiling) = room; if even the floors cannot fit, they give way together
    const floors = text.reduce((s, it) => s + it.hmin, 0), give = floors > room && floors > 0 ? Math.max(0, room) / floors : 1;
    const hOf = (it, lam) => clamp(lam * it.want, it.hmin * give, Math.max(it.hmin * give, it.hmax));
    const sumAt = (lam) => text.reduce((s, it) => s + hOf(it, lam), 0);
    let lo = 0, hi = 1; while (sumAt(hi) < room && hi < 1e6) hi *= 2;
    for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (sumAt(mid) < room) lo = mid; else hi = mid; }
    text.forEach((it) => { it.h = Math.max(0, hOf(it, lo)); });
    // the sacred margin: the end lines keep their real ink (overshoots, descenders) inside the frame
    const over = (it, key) => (it && !it.fixed ? vInk(it.l.row, it.g)[key] * it.h / it.bk / 100 : 0);
    let inTop = over(items[0], 'up'), inBot = over(items[items.length - 1], 'down');
    const roomS = A0 - inTop - inBot - gaps - fixedH, sum = text.reduce((s, it) => s + it.h, 0);
    if (sum > roomS && sum > 0) { const k = Math.max(0, roomS) / sum; text.forEach((it) => { it.h *= k; }); inTop = over(items[0], 'up'); inBot = over(items[items.length - 1], 'down'); }
    const used = items.reduce((s, it) => s + it.h, 0) + gaps + inTop + inBot, spare = Math.max(0, A0 - used);
    const mode = el.getAttribute('data-drift-spare') || 'center';
    const extraGap = mode === 'gaps' && items.length > 1 ? spare / (items.length - 1) : 0;
    let y = inTop + (mode === 'top' || mode === 'gaps' ? 0 : mode === 'bottom' ? spare : spare / 2);
    items.forEach((it, k) => {
      if (k) y += gap + extraGap;
      const s = it.l.el.style;
      if (it.fixed) {
        Object.assign(s, { left: p.l + 'px', top: (p.t + y).toFixed(2) + 'px', width: W.toFixed(2) + 'px', height: it.h.toFixed(2) + 'px' });
        if (mv) s.transform = it.k < 0.9999 ? `scaleX(${it.k.toFixed(4)})` : '';
      } else {
        const size = it.h / it.bk, row = it.l.row, g = it.g, d = wdthFor(row, g, 100 * W / size);
        const inkW = ink100(row, g, d) * size / 100, lsb = sb(row.text[0], g, d)[1] * size / upm();
        // the line's box is its cap height (plus descender room): baseline at (bk − LHN)/2 + ASC, moved to CAP below the box top
        Object.assign(s, styleRow(row, g, d, size), { lineHeight: it.bk.toFixed(4), left: (p.l + (W - inkW) / 2 - lsb).toFixed(2) + 'px',
          top: (p.t + y + (CAP - ((it.bk - LHN) / 2 + ASC)) * size).toFixed(2) + 'px' });
        it.l.el.dataset.driftY = (p.t + y).toFixed(2); it.l.el.dataset.driftSize = size.toFixed(3);
        it.l.el.dataset.driftCut = `${g.toFixed(0)}/${d.toFixed(1)}`;
        if (mv) { s.transformOrigin = `${lsb.toFixed(2)}px 0`; s.transform = it.k < 0.9999 ? `scaleX(${it.k.toFixed(4)})` : ''; }
      }
      y += it.h;
    });
    return true;
  }

  /* ---- fit: one line whose ink fills its width; the CSS font-size is the height it would like ---- */
  // a span that holds a line at its cap height (plus descender room), the ink flush with both edges
  function capBox(inner, size, inL, inR, desc) {
    const lh = CAP + (desc ? DESC : 0);
    // with line-height lh the baseline sits at (lh − LHN)/2 + ASC; move it to CAP
    const shift = CAP - ((lh - LHN) / 2 + ASC);
    Object.assign(inner.style, { fontSize: size.toFixed(3) + 'px', lineHeight: lh.toFixed(4), top: shift.toFixed(4) + 'em', marginLeft: (-inL).toFixed(4) + 'em', marginRight: (-inR).toFixed(4) + 'em' });
  }
  // the room an element's content may take: its parent's content box, less the element's own padding, border and CSS
  // margins (a stack's sideways nudge is not counted), and never past its CSS max-width
  const availW = (el) => {
    const par = el.parentElement; if (!par) return 0;
    const cs = getComputedStyle(el), pp = padOf(par), inStack = par.getAttribute('data-drift') === 'stack';
    const own = num(cs.paddingLeft, 0) + num(cs.paddingRight, 0) + num(cs.borderLeftWidth, 0) + num(cs.borderRightWidth, 0);
    const m = (inStack ? 0 : num(cs.marginLeft, 0)) + num(cs.marginRight, 0);
    let w = par.clientWidth - pp.l - pp.r - m - own;
    const mx = num(cs.maxWidth, NaN); if (Number.isFinite(mx) && /px$/.test(cs.maxWidth)) w = Math.min(w, mx - (cs.boxSizing === 'border-box' ? own : 0));
    return Math.max(0, w);
  };
  const cssSize = (el) => num(getComputedStyle(el).fontSize, 16);
  function wrapInner(el, st) {
    if (st.inner && el.contains(st.inner)) return st.inner;
    const had = el.querySelector(':scope > .drift-in'); if (had) { st.inner = had; return had; }
    const inner = document.createElement('span'); inner.className = 'drift-in';
    while (el.firstChild) inner.appendChild(el.firstChild);
    el.appendChild(inner); st.inner = inner; return inner;
  }
  function fitInit(el, st) {
    const role = (el.getAttribute('data-drift-role') || 'name').toLowerCase(), R = ROLE[role] || ROLE.name;
    st.text = textOf(el); st.row = { text: st.text, track: num(el.getAttribute('data-drift-track'), R.track) };
    const wr = range(el.getAttribute('data-drift-wght'), R.roll), r = rngFor('fit|' + st.key);
    st.wght = clamp(lerp(wr[0], wr[1], r()), AX.wght[0], AX.wght[1]);
    const inner = wrapInner(el, st); inner.textContent = st.text;
  }
  function fitRender(el, st) {
    const W = availW(el); if (W < 4 || !st.text) return false;
    const s0 = cssSize(el), row = st.row, g = st.wght;
    let d = wdthFor(row, g, 100 * W / s0), size = s0;
    const ink = ink100(row, g, d);
    if (Math.abs(ink * s0 / 100 - W) > 0.5) size = 100 * W / ink;   // past the axis: the size gives way instead
    const mode = el.getAttribute('data-drift-fit') || 'fill';
    if (mode === 'shrink' && size > s0) size = s0;
    const inL = sb(row.text[0], g, d)[1] / upm(), inR = sb(row.text[row.text.length - 1], g, d)[2] / upm() + lsRow(row, g, d);
    const inner = st.inner, ss = styleRow(row, g, d, size);
    Object.assign(inner.style, { fontVariationSettings: ss.fontVariationSettings, letterSpacing: ss.letterSpacing, wordSpacing: ss.wordSpacing });
    capBox(inner, size, inL, inR, /[gjpqy,;()]/.test(row.text));
    el.dataset.driftCut = `${g.toFixed(0)}/${d.toFixed(1)}`;
    return true;
  }

  /* ================= STICKER (engine.js) ================= */
  const RULES = () => ({
    fills: ['#FD36CA', '#FF6BFF', '#FFE500', '#3BC7FF'],
    strokes: ['#002FFF', '#99FF50', '#FFE500', '#3BC7FF', '#F7F8F8'],
    grounds: ['#FF3BBC', '#D7D7D7', '#F7F8F8'],
    wght: [400, 900], wdth: [30, 230], contrast: 0.7, stroke: 0.05, zoom: [1, 1.8], flat: 0, size: 220, pad: 32, desc: 'room',
  });
  const DESCENDERS = /[gjpqy,;()[\]{}@_|]/, XONLY = /^[acemnorsuvwxzgpqy\s.,:;\-–—]+$/;
  const PLACEHOLDER = '#8c8c8c';
  const rgb = (h) => { const v = parseInt(String(h).slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
  const far = (a, b) => { const x = rgb(a), y = rgb(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) > 100; };
  function sides(n, contrast, r) { const s = [r() < 0.5]; for (let i = 1; i < n; i++) s.push(r() < 0.5 + 0.5 * contrast ? !s[i - 1] : s[i - 1]); return s; }
  function onSide(side, lo, hi, pivot, r) {
    if (hi - lo < 1e-6) return lo;
    const p = clamp(pivot, lo, hi); if (p <= lo || p >= hi) return lo + r() * (hi - lo);
    return side ? p + r() * (hi - p) : lo + r() * (p - lo);
  }
  const leanOf = (text) => { const w = wordsOf(text); return w.length === 1 ? clamp((5 - w[0].length) / 4, 0, 1) : 0; };
  const fatRnd = (lo, hi, lean, r) => lo + (hi - lo) * (1 - Math.pow(1 - r(), 1 + 2 * lean));
  function rollWords(text, R, r) {
    const n = wordsOf(text).length, sd = sides(n, R.contrast, r), sg = sides(n, R.contrast, r), lean = leanOf(text), out = [];
    for (let i = 0; i < n; i++) out.push(n > 1
      ? { g: onSide(sg[i], R.wght[0], R.wght[1], 650, r), d: onSide(sd[i], R.wdth[0], R.wdth[1], 100, r) }
      : { g: fatRnd(R.wght[0], R.wght[1], lean, r), d: fatRnd(R.wdth[0], R.wdth[1], lean, r) });
    return out;
  }
  function least(choices, used, r) {
    if (!choices.length) return null;
    const n = (c) => used.filter((u) => u === c).length, lo = Math.min(...choices.map(n)), pool = choices.filter((c) => n(c) === lo);
    return pool[Math.floor(r() * pool.length)];
  }
  // the run of a line of words in em (type size 1): where each word starts, and its ink (sticker engine run())
  function wordRun(text, words) {
    const ws = wordsOf(text), n = ws.length, out = []; let x = 0;
    ws.forEach((t, i) => { const w = words[i] || { g: 700, d: 100 }; out.push({ t, g: w.g, d: w.d, x }); x += advance(t, w.g, w.d) + (i < n - 1 ? SPACE : 0); });
    let inL = 0, inR = 0;
    if (n) { const f = out[0], l = out[n - 1]; inL = sb(f.t[0], f.g, f.d)[1] / upm(); inR = sb([...l.t].pop(), l.g, l.d)[2] / upm(); }
    return { words: out, inL, inR, ink: Math.max(0, x - inL - inR) };
  }
  // the colour, picture, words and crop of one sticker; `others` are the stickers already on the page
  function makeSticker(text, R, pool, others, r, opt) {
    const st = { text, words: rollWords(text, R, r), sw: R.stroke };
    st.ground = opt.ground || (pool.length && r() >= R.flat ? 'image' : 'flat');
    if (st.ground === 'flat') {
      st.flat = opt.flatColour || least(R.fills.filter((c) => c !== opt.avoid), others.map((o) => (o.ground === 'flat' ? o.flat : null)), r) || R.fills[0];
      st.fill = least(R.strokes.filter((c) => far(c, st.flat)), others.map((o) => o.fill), r) || '#F7F8F8';
      st.sw = 0;
    } else {
      st.fill = least(R.fills, others.map((o) => o.fill), r) || R.fills[0];
      const ok = R.strokes.filter((c) => far(c, st.fill));
      st.stroke = least(ok.length ? ok : R.strokes.filter((c) => c !== st.fill), others.map((o) => o.stroke), r) || '#002FFF';
      st.img = least(pool.map((p) => p.key), others.map((o) => o.img), r);
    }
    st.zoom = lerp(R.zoom[0], R.zoom[1], r()); st.fx = r(); st.fy = r();
    return st;
  }
  function stickerLayout(st, R) {
    const run = wordRun(st.text, st.words), pad = R.pad, fs = R.size;
    const top = XONLY.test(st.text) ? XH : CAP, desc = R.desc !== 'cut' && DESCENDERS.test(st.text) ? DESC : 0;
    const W = Math.max(2 * pad + 1, Math.round(2 * pad + run.ink * fs)), H = Math.round(2 * pad + (top + desc) * fs);
    return { W, H, fs, base: pad + top * fs, words: run.words.map((w) => ({ ...w, x: pad + (w.x - run.inL) * fs })), vis: st.sw * CAP * fs };
  }
  function crop(st, W, H, e) {
    const s = Math.max(W / e.w, H / e.h) * st.zoom, w = e.w * s, h = e.h * s;
    return { x: (W - w) * st.fx, y: (H - h) * st.fy, w, h };
  }
  function stickerSVG(st, L, pic) {
    const W = L.W, H = L.H;
    let ground = `<rect width="${W}" height="${H}" fill="${st.ground === 'flat' ? st.flat : PLACEHOLDER}"/>`;
    if (st.ground !== 'flat' && pic) { const c = crop(st, W, H, pic); ground += `<image href="${esc(pic.url)}" x="${c.x.toFixed(2)}" y="${c.y.toFixed(2)}" width="${c.w.toFixed(2)}" height="${c.h.toFixed(2)}" preserveAspectRatio="none"/>`; }
    const words = L.words.map((w) => `<text x="${w.x.toFixed(2)}" y="${L.base.toFixed(2)}" style="font-variation-settings:'wght' ${w.g.toFixed(0)},'wdth' ${w.d.toFixed(1)}">${esc(w.t)}</text>`).join('');
    const type = `<g font-family="${FAMILY}" font-size="${L.fs.toFixed(3)}" font-weight="400">`
      + (L.vis > 0.01 ? `<g fill="${st.stroke}" stroke="${st.stroke}" stroke-width="${(2 * L.vis).toFixed(2)}" stroke-linejoin="round">${words}</g>` : '')
      + `<g fill="${st.fill}">${words}</g></g>`;
    return `<svg class="drift-sticker" xmlns="${NS}" viewBox="0 0 ${W} ${H}" aria-hidden="true" focusable="false">${ground}${type}</svg>`;
  }

  /* ---- the picture pool: every img inside [data-drift-pics] (a hidden CMS list). Only the pictures a sticker picks
     are downloaded, at the srcset size nearest PIC_W (Webflow makes 500/800/1080/1600/2000 px copies of CMS images) ---- */
  const PIC_W = 1080;
  let POOL = null;
  const pics = new Map();
  function pickSrc(im) {
    const src = im.getAttribute('src'), set = im.getAttribute('srcset'); if (!set) return src;
    const c = set.split(',').map((s) => s.trim().split(/\s+/)).filter(([u, d]) => u && /^\d+(\.\d+)?w$/.test(d || '')).map(([u, d]) => ({ u, w: parseFloat(d) }));
    if (!c.length) return src;
    c.sort((a, b) => a.w - b.w);
    return (c.find((x) => x.w >= PIC_W) || c[c.length - 1]).u;
  }
  function poolList() {
    if (POOL) return POOL;
    const seen = new Set(); POOL = [];
    document.querySelectorAll('[data-drift-pics] img').forEach((im) => {
      const key = im.getAttribute('src'); if (!key || seen.has(key)) return; seen.add(key);
      POOL.push({ key, url: pickSrc(im) || key });
    });
    return POOL;
  }
  const READY = [];   // pictures already downloaded: a re-rolling sticker or a mosaic glitch only ever uses these
  const loadPic = (p) => {
    if (!pics.has(p.key)) pics.set(p.key, new Promise((res) => { const im = new Image(); im.onload = () => { const q = im.naturalWidth && im.naturalHeight ? { ...p, w: im.naturalWidth, h: im.naturalHeight, im } : null; if (q) READY.push(q); res(q); }; im.onerror = () => res(null); im.src = p.url; }));
    return pics.get(p.key);
  };
  const placed = [];   // the stickers drawn so far, for the least-used colour and picture
  async function stickerInit(el, st) {
    // everything before the first await runs at once, in page order, so the least-used choices replay with the seed
    const R = RULES();
    R.flat = num(el.getAttribute('data-drift-flat'), R.flat);
    R.wdth = range(el.getAttribute('data-drift-wdth'), R.wdth); R.wght = range(el.getAttribute('data-drift-wght'), R.wght);
    st.R = R; st.text = textOf(el);
    const pool = poolList();
    const r = rngFor('sticker|' + st.key);
    st.opt = { ground: el.getAttribute('data-drift-ground'), flatColour: el.getAttribute('data-drift-flat-colour') };
    st.sticker = makeSticker(st.text, R, pool, placed, r, st.opt);
    const mo = el.getAttribute('data-drift-motion') || 'unfold';
    st.unfold = /\bunfold\b/.test(mo); st.cycle = num(el.getAttribute('data-drift-cycle'), 0);
    placed.push(st.sticker);
    const entry = st.sticker.img ? pool.find((p) => p.key === st.sticker.img) : null;
    st.pic = entry ? await loadPic(entry) : null;
    st.sr = el.querySelector(':scope > .drift-sr');
    if (!st.sr) { const sr = document.createElement('span'); sr.className = 'drift-sr'; while (el.firstChild) sr.appendChild(el.firstChild); el.appendChild(sr); st.sr = sr; }
    st.L = stickerLayout(st.sticker, R);
    el.insertAdjacentHTML('afterbegin', stickerSVG(st.sticker, st.L, st.pic));
    st.svg = el.firstElementChild;
    el.dataset.driftCut = st.sticker.words.map((w) => `${w.g.toFixed(0)}/${w.d.toFixed(0)}`).join(' ');
  }
  function stickerRender(el, st) {
    if (!st.svg) return false;
    const scale = cssSize(el) / st.R.size, W = availW(el);
    const w = Math.min(st.L.W * scale, W || st.L.W * scale);
    st.svg.style.width = w.toFixed(1) + 'px';
    if (!still() && (st.unfold || st.cycle > 0)) { if (st.unfold && st.t0 == null) st.svg.style.transform = 'scaleX(0)'; moving(el, (now) => stickerFrame(el, st, now)); }
    return true;
  }
  // spawn: the sticker unfolds from its left edge (lab.js unfoldK); cycle: a new roll every N beats, as on the artist tiles
  function stickerFrame(el, st, now) {
    const t = clockOf(el, st, now); if (t == null) { if (st.svg) st.svg.style.transform = ''; return false; }
    if (t < 0) return true;
    let busy = false;
    if (st.unfold && !st.unfolded) {
      const k = Math.min(1, spring(t, UNFOLD_W, zOf(1)));
      st.svg.style.transform = k < 0.9995 ? `scaleX(${k.toFixed(4)})` : '';
      if (t > 1) { st.unfolded = true; st.svg.style.transform = ''; } else busy = true;
    }
    if (st.cycle > 0) {
      const tick = Math.floor((t - 0.8) / (st.cycle * BEAT));
      if (tick >= 1 && tick !== st.tick) { st.tick = tick; stickerReroll(el, st, tick); }
      return true;
    }
    return busy;
  }
  function stickerReroll(el, st, tick) {
    const others = placed.filter((q) => q !== st.sticker), ready = READY.slice();
    const opt = ready.length ? st.opt : { ...st.opt, ground: 'flat' };
    const s2 = makeSticker(st.text, st.R, ready, others, rngFor('sticker|' + st.key + '|' + tick), opt);
    const at = placed.indexOf(st.sticker); if (at >= 0) placed[at] = s2; else placed.push(s2);
    st.sticker = s2; st.pic = s2.img ? ready.find((q) => q.key === s2.img) : null;
    st.L = stickerLayout(s2, st.R);
    const box = document.createElement('div'); box.innerHTML = stickerSVG(s2, st.L, st.pic);
    const sv = box.firstElementChild; st.svg.replaceWith(sv); st.svg = sv;
    el.dataset.driftCut = s2.words.map((w) => `${w.g.toFixed(0)}/${w.d.toFixed(0)}`).join(' ');
    stickerRender(el, st);
    if (el.parentElement && STATE.has(el.parentElement)) { const ps = STATE.get(el.parentElement); if (ps.kind === 'stack') stackRender(el.parentElement, ps); }
  }

  /* ---- mosaic: a photo that resolves out of big pixels, tile by tile, then glitches on the beat (the artist tiles) ----
     The <img> stays for layout and alt text; a canvas is laid over it. A second <img> inside is the glitch picture,
     otherwise one the stickers have already downloaded. */
  async function mosaicInit(el, st) {
    st.img = el.querySelector('img'); st.alt = el.querySelectorAll('img')[1] || null;
    if (!st.img || still()) return;
    if (!st.img.complete) await new Promise((r) => { st.img.addEventListener('load', r, { once: true }); st.img.addEventListener('error', r, { once: true }); setTimeout(r, 6000); });
    if (!st.img.naturalWidth) return;
    st.cv = document.createElement('canvas'); st.cv.className = 'drift-mosaic'; st.cv.setAttribute('aria-hidden', 'true');
    el.appendChild(st.cv); st.r = rngFor('mosaic|' + st.key);
  }
  function coverRect(nw, nh, W, H) { const s = Math.max(W / nw, H / nh), sw = W / s, sh = H / s; return [(nw - sw) / 2, (nh - sh) / 2, sw, sh]; }
  function mosaicRender(el, st) {
    if (!st.cv) return true;
    const im = st.img, W = im.offsetWidth, H = im.offsetHeight; if (W < 8 || H < 8) return false;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    Object.assign(st.cv.style, { left: im.offsetLeft + 'px', top: im.offsetTop + 'px', width: W + 'px', height: H + 'px' });
    if (st.W !== W || st.H !== H) {
      st.W = W; st.H = H; st.cv.width = Math.round(W * dpr); st.cv.height = Math.round(H * dpr);
      const cols = Math.max(5, Math.round(W / clamp(W / 11, 26, 64))), rows = Math.max(3, Math.round(H / (W / cols)));
      st.cols = cols; st.rows = rows; st.sig = null;
      const r = rngFor('mosaic|' + st.key + '|grid'); st.rv = Array.from({ length: cols * rows }, () => 0.06 + 0.5 * r());
      const sm = document.createElement('canvas'); sm.width = cols; sm.height = rows;
      const sc = sm.getContext('2d'); sc.drawImage(im, ...coverRect(im.naturalWidth, im.naturalHeight, cols, rows), 0, 0, cols, rows); st.small = sm;
    }
    st.sig = null; mosaicDraw(st, clockOf(el, st));
    moving(el, (now) => mosaicFrame(el, st, now));
    return true;
  }
  // which tiles glitch on beat b: one to three blocks of tiles, seeded, on about two beats in three
  function glitchSet(st, b) {
    const r = rngFor('mosaic|' + st.key + '|' + b), set = new Map();
    if (r() > 0.66) return set;
    const blocks = 1 + Math.floor(r() * 3), useAlt = r() < 0.7;
    for (let q = 0; q < blocks; q++) {
      const w = 1 + Math.floor(r() * 4), h = 1 + Math.floor(r() * 3), x0 = Math.floor(r() * st.cols), y0 = Math.floor(r() * st.rows);
      for (let y = y0; y < Math.min(st.rows, y0 + h); y++) for (let x = x0; x < Math.min(st.cols, x0 + w); x++) set.set(y * st.cols + x, useAlt ? 'alt' : 'px');
    }
    return set;
  }
  function mosaicDraw(st, t) {
    const cv = st.cv, c = cv.getContext('2d'), W = cv.width, H = cv.height, im = st.img, tw = W / st.cols, th = H / st.rows;
    const n = st.cols * st.rows, pre = t == null ? false : t < 0;
    const revealed = t == null ? n : pre ? 0 : st.rv.filter((v) => v <= t).length;
    const b = t != null && t > 0.9 ? Math.floor((t - 0.9) / BEAT) : -1;
    const sig = revealed + '|' + b; if (sig === st.sig) return; st.sig = sig;
    c.imageSmoothingEnabled = true;
    c.drawImage(im, ...coverRect(im.naturalWidth, im.naturalHeight, W, H), 0, 0, W, H);
    const pixel = (i) => { const x = i % st.cols, y = Math.floor(i / st.cols); c.imageSmoothingEnabled = false; c.drawImage(st.small, x, y, 1, 1, Math.floor(x * tw), Math.floor(y * th), Math.ceil(tw) + 1, Math.ceil(th) + 1); };
    if (revealed < n) { for (let i = 0; i < n; i++) if (pre || st.rv[i] > t) pixel(i); return; }
    if (b < 0) return;
    const alt = st.alt && st.alt.naturalWidth ? st.alt : (READY.length ? READY[Math.floor(rngFor('mosaic-alt|' + st.key + '|' + b)() * READY.length)].im : null);
    for (const [i, how] of glitchSet(st, b)) {
      if (how === 'alt' && alt) {
        const x = i % st.cols, y = Math.floor(i / st.cols), [sx, sy, sw, sh] = coverRect(alt.naturalWidth, alt.naturalHeight, W, H), k = sw / W;
        c.imageSmoothingEnabled = true; c.drawImage(alt, sx + x * tw * k, sy + y * th * k, tw * k, th * k, Math.floor(x * tw), Math.floor(y * th), Math.ceil(tw) + 1, Math.ceil(th) + 1);
      } else pixel(i);
    }
  }
  function mosaicFrame(el, st, now) { const t = clockOf(el, st, now); if (t == null) { st.cv.remove(); st.cv = null; return false; } mosaicDraw(st, t); return true; }

  /* ---- mix: one line of words, each with its own cut (the sticker roll), as HTML ---- */
  function mixInit(el, st) {
    const R = RULES(); R.wdth = range(el.getAttribute('data-drift-wdth'), R.wdth); R.wght = range(el.getAttribute('data-drift-wght'), R.wght);
    R.contrast = num(el.getAttribute('data-drift-contrast'), R.contrast);
    st.text = textOf(el); st.words = rollWords(st.text, R, rngFor('mix|' + st.key));
    const inner = wrapInner(el, st); inner.textContent = '';
    wordsOf(st.text).forEach((t, i) => {
      if (i) inner.appendChild(document.createTextNode(' '));
      const w = st.words[i], s = document.createElement('span'); s.textContent = t;
      s.style.fontVariationSettings = `'wght' ${w.g.toFixed(0)},'wdth' ${w.d.toFixed(1)}`; inner.appendChild(s);
    });
    st.run = wordRun(st.text, st.words);
    el.dataset.driftCut = st.words.map((w) => `${w.g.toFixed(0)}/${w.d.toFixed(0)}`).join(' ');
  }
  function mixRender(el, st) {
    if (!st.text) return false;
    const W = availW(el), s0 = cssSize(el), par = el.parentElement;
    let mode = el.getAttribute('data-drift-fit') || 'shrink';
    if (mode !== 'none' && par && /^inline/.test(getComputedStyle(par).display)) mode = 'none';
    let size = s0;
    if (mode === 'fill' && W > 4) size = W / st.run.ink;
    else if (mode === 'shrink' && W > 4) size = Math.min(s0, W / st.run.ink);
    capBox(st.inner, size, st.run.inL, st.run.inR, DESCENDERS.test(st.text));
    st.inner.style.wordSpacing = '0px'; st.inner.style.letterSpacing = '0px';
    return true;
  }

  /* ---- stack: each child nudged sideways by its own seeded share of the room left over ---- */
  function stackInit(el, st) { const r = rngFor('stack|' + st.key); st.u = [...el.children].map(() => r()); }
  function stackRender(el, st) {
    const kids = [...el.children], p = padOf(el), W = el.clientWidth - p.l - p.r;
    kids.forEach((c, i) => {
      c.style.marginLeft = '0px';
      const w = c.getBoundingClientRect().width, free = Math.max(0, W - w);
      c.style.marginLeft = (free * (st.u[i] != null ? st.u[i] : 0.5)).toFixed(1) + 'px';
    });
    return true;
  }

  /* ---- marquee: the first child scrolls; its items are repeated until a half covers the frame twice over ---- */
  function marqueeInit(el, st) {
    let track = el.querySelector(':scope > .drift-track');
    if (!track) { track = el.firstElementChild; if (!track) return; track.classList.add('drift-track'); }
    st.track = track; st.base = [...track.children].map((c) => c.cloneNode(true));
  }
  function marqueeRender(el, st) {
    const track = st.track; if (!track || !st.base.length) return false;
    const W = el.clientWidth; if (W < 4) return false;
    track.textContent = '';
    const half = [];
    const add = () => st.base.forEach((c) => { const k = c.cloneNode(true); if (half.length >= st.base.length) k.setAttribute('aria-hidden', 'true'); track.appendChild(k); half.push(k); });
    add(); let guard = 0;
    while (track.scrollWidth < W * 1.05 && guard++ < 40) add();
    const halfW = track.scrollWidth;
    half.forEach((c) => { const k = c.cloneNode(true); k.setAttribute('aria-hidden', 'true'); track.appendChild(k); });
    const speed = num(el.getAttribute('data-drift-speed'), 60);
    el.style.setProperty('--drift-dur', (halfW / Math.max(5, speed)).toFixed(2) + 's');
    el.classList.add('drift-run');
    return true;
  }

  /* ---- the menu and the Brisbane/Perth selector ---- */
  // Webflow turns a <button> into a link with no href, which the keyboard cannot reach: give it a button's role and tab stop
  const asButton = (b) => { if (b.tagName === 'BUTTON' || (b.tagName === 'A' && b.hasAttribute('href'))) return; b.setAttribute('role', 'button'); if (!b.hasAttribute('tabindex')) b.tabIndex = 0; };
  function wireMenu() {
    const menu = document.querySelector('[data-drift-menu]'), toggles = [...document.querySelectorAll('[data-drift="menu-toggle"]')];
    if (!menu || !toggles.length) return;
    if (!menu.id) menu.id = 'drift-menu';
    let last = null;
    const set = (open) => {
      menu.classList.toggle('is-open', open); document.documentElement.classList.toggle('drift-menu-open', open);
      toggles.forEach((t) => { t.setAttribute('aria-expanded', open ? 'true' : 'false'); t.setAttribute('aria-controls', menu.id); });
      if (open) { last = document.activeElement; const f = menu.querySelector('a,button,[tabindex]'); if (f) f.focus({ preventScroll: true }); refit(); }
      else if (last && last.focus) last.focus({ preventScroll: true });
    };
    toggles.forEach((t) => { t.setAttribute('aria-expanded', 'false'); asButton(t); t.classList.add('drift-ready');
      t.addEventListener('click', (e) => { e.preventDefault(); set(!menu.classList.contains('is-open')); });
      t.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); set(!menu.classList.contains('is-open')); } }); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menu.classList.contains('is-open')) set(false); });
    menu.addEventListener('click', (e) => { if (e.target.closest('a[href]')) set(false); });
  }
  const CITY_KEY = 'drift-city';
  function setCity(c) {
    c = (c || '').toLowerCase(); if (!/^(brisbane|perth)?$/.test(c)) c = '';
    const h = document.documentElement; if (c) h.setAttribute('data-drift-city', c); else h.removeAttribute('data-drift-city');
    try { if (c) localStorage.setItem(CITY_KEY, c); else localStorage.removeItem(CITY_KEY); } catch (e) {}
    document.querySelectorAll('[data-drift-city-set]').forEach((b) => { const on = (b.getAttribute('data-drift-city-set') || '').toLowerCase() === c; b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    document.dispatchEvent(new CustomEvent('drift:city', { detail: { city: c } }));
    refit();
  }
  function wireCity() {
    let c = ''; try { c = localStorage.getItem(CITY_KEY) || ''; } catch (e) {}
    document.querySelectorAll('[data-drift-city-set]').forEach((b) => {
      asButton(b);
      const go = (e) => { e.preventDefault(); const v = (b.getAttribute('data-drift-city-set') || '').toLowerCase(); setCity(document.documentElement.getAttribute('data-drift-city') === v && b.hasAttribute('data-drift-city-toggle') && !document.querySelector('[data-drift-city-gate]') ? '' : v); };
      b.addEventListener('click', go); b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') go(e); });
    });
    setCity(c);
  }

  /* ---- the DRIFT® wordmark, inline, in currentColor (the Figma vector: D, Я, I, F, T, ®) ---- */
  let LOGO = null;
  const logoReady = () => LOGO || (LOGO = fetch(LOGO_URL).then((r) => r.text()).then((t) => ({
    vb: (t.match(/viewBox="([^"]+)"/) || [])[1] || '0 0 999.969 95.1139', paths: [...t.matchAll(/\sd="([^"]+)"/g)].map((m) => m[1]) }))
    .catch((e) => { warn('logo not loaded', e); return null; }));
  async function logoInit(el, st) {
    const L = await logoReady(); if (!L || !L.paths.length) return;
    st.sr = el.querySelector(':scope > .drift-sr');
    if (!st.sr) { const sr = document.createElement('span'); sr.className = 'drift-sr'; while (el.firstChild) sr.appendChild(el.firstChild); if (!sr.textContent.trim()) sr.textContent = 'DRIFT®'; el.appendChild(sr); st.sr = sr; }
    const old = el.querySelector(':scope > svg.drift-logo'); if (old) old.remove();
    el.insertAdjacentHTML('afterbegin', `<svg class="drift-logo" viewBox="${esc(L.vb)}" fill="currentColor" aria-hidden="true" focusable="false">${L.paths.map((d) => `<path d="${esc(d)}"/>`).join('')}</svg>`);
    st.unfold = /\bunfold\b/.test(el.getAttribute('data-drift-motion') || '');
    if (st.unfold && !still()) { el.querySelectorAll('svg.drift-logo path').forEach((q) => q.setAttribute('transform', 'scale(0 1)')); moving(el, (now) => logoFrame(el, st, now)); }
  }
  // the letters unfold D → ®, each from its own left edge, 80 ms apart (lab.js seriesLogo: logoGap 0.08, spring 30)
  function logoFrame(el, st, now) {
    const t = clockOf(el, st, now), ps = [...el.querySelectorAll('svg.drift-logo path')];
    if (t == null) { ps.forEach((q) => q.removeAttribute('transform')); return false; }
    if (t < 0) return true;
    if (!st.gx) { const vb = el.querySelector('svg.drift-logo').viewBox.baseVal; st.vbw = vb.width; st.gx = ps.map((q) => { try { const b = q.getBBox(); return [b.x, b.width]; } catch (e) { return [0, 1]; } }); }
    const z = zOf(1); let done = true;
    ps.forEach((q, j) => {
      const a = j * 0.08, [x, w] = st.gx[j], k = Math.min(spring(t - a, UNFOLD_W, z), (st.vbw - x) / Math.max(1, w));
      if (t - a < 1) done = false;
      q.setAttribute('transform', `translate(${x.toFixed(2)} 0) scale(${Math.max(0, k).toFixed(4)} 1) translate(${(-x).toFixed(2)} 0)`);
    });
    if (done) ps.forEach((q) => q.removeAttribute('transform'));
    return !done;
  }

  /* ---- the bookend: a pink screen, the mark unfolds, holds, and the page fades in under it — once a visit ---- */
  async function bookend() {
    const bk = document.querySelector('[data-drift-bookend]'); if (!bk) return;
    const h = document.documentElement;
    if (still() || h.classList.contains('drift-bookend-seen')) { bk.remove(); return; }
    try { sessionStorage.setItem('drift-bookend', '1'); } catch (e) {}
    REVEAL_AT = Infinity;
    let gone = false;
    const leave = () => { if (gone) return; gone = true; REVEAL_AT = performance.now(); bk.classList.add('is-leaving'); kick(); setTimeout(() => bk.remove(), 750); };
    bk.addEventListener('click', leave); addEventListener('keydown', leave, { once: true });
    setTimeout(leave, 2300);   // never longer than this, however slow the logo
    const lg = bk.querySelector('[data-drift="logo"]');
    if (lg) {
      const st = { kind: 'logo', key: 'bookend', n: -1, t0: performance.now() };
      await logoInit(lg, st); STATE.set(lg, st); lg.classList.add('drift-ready');
      st.t0 = performance.now(); kick();
    }
    setTimeout(leave, 1250);
  }

  /* ---- the city gate: the first visit picks Brisbane or Perth; the pages then show that city only ---- */
  function wireGate() {
    const g = document.querySelector('[data-drift-city-gate]'); if (!g) return;
    g.setAttribute('role', 'dialog'); g.setAttribute('aria-modal', 'true');
    if (!g.hasAttribute('aria-label')) g.setAttribute('aria-label', 'Choose your city');
    const focusIn = () => { if (!document.documentElement.hasAttribute('data-drift-city')) { const b = g.querySelector('[data-drift-city-set]'); if (b) b.focus({ preventScroll: true }); } };
    g.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const f = [...g.querySelectorAll('a[href],button,[tabindex]')].filter((x) => x.offsetParent); if (!f.length) return;
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    });
    setTimeout(focusIn, 50);
  }

  /* ---- orchestration: init once (the rolls), render on every resize (no re-roll) ---- */
  const KINDS = {
    logo: { init: logoInit, render: () => true, order: 0 },
    poster: { init: posterInit, render: posterRender, order: 1 },
    fit: { init: fitInit, render: fitRender, order: 2 },
    mix: { init: mixInit, render: mixRender, order: 3 },
    sticker: { init: stickerInit, render: stickerRender, order: 4 },
    mosaic: { init: mosaicInit, render: mosaicRender, order: 4 },
    stack: { init: stackInit, render: stackRender, order: 5 },
    marquee: { init: marqueeInit, render: marqueeRender, order: 6 },
  };
  const STATE = new Map();   // element -> { kind, key, ... }
  let ro = null, queued = false;
  const ordered = () => [...STATE.entries()].sort((a, b) => KINDS[a[1].kind].order - KINDS[b[1].kind].order || a[1].n - b[1].n);
  function renderAll() {
    queued = false;
    for (const [el, st] of ordered()) {
      if (!el.isConnected) { STATE.delete(el); continue; }
      let ok = false; try { ok = KINDS[st.kind].render(el, st); } catch (e) { warn('render failed', el, e); }
      if (ok !== false) el.classList.add('drift-ready');
      if (ok !== false && st.kind === 'poster' && st.unfold) moving(el, (now) => { const r = posterRender(el, st, now); return st.loop || r === false || st.t0 == null || (now - st.t0) / 1000 < 0.08 + st.lines.length * LINE_GAP + 1.2; });
    }
    document.dispatchEvent(new CustomEvent('drift:rendered'));
  }
  function refit() { if (!queued) { queued = true; requestAnimationFrame(renderAll); } }
  async function initAll(root) {
    // a data-drift value that draws nothing (menu-toggle, or a typo) is shown at once rather than held hidden
    root.querySelectorAll('[data-drift]').forEach((el) => { if (!KINDS[el.getAttribute('data-drift')]) el.classList.add('drift-ready'); });
    const els = [...root.querySelectorAll('[data-drift]')].filter((el) => KINDS[el.getAttribute('data-drift')] && !STATE.has(el) && !el.closest('[data-drift-bookend]'));
    const seen = new Map();
    els.sort((a, b) => KINDS[a.getAttribute('data-drift')].order - KINDS[b.getAttribute('data-drift')].order);
    let n = STATE.size;
    // kinds go in their order (a marquee clones what the others drew); within a kind every init starts in page order,
    // its rolls made before its first await, and the downloads (sticker pictures, the logo) run side by side
    const start = (el) => {
      const kind = el.getAttribute('data-drift'), base = el.getAttribute('data-drift-key') || kind + '|' + textOf(el).slice(0, 80);
      const k = seen.get(base) || 0; seen.set(base, k + 1);
      const st = { kind, key: base + '#' + k, n: n++ };
      let job; try { job = Promise.resolve(KINDS[kind].init(el, st)); } catch (e) { job = Promise.reject(e); }
      if (ro) { ro.observe(el); if (el.parentElement) ro.observe(el.parentElement); }
      return job.then(() => { STATE.set(el, st); }, (e) => { warn('init failed', el, e); el.classList.add('drift-ready'); });
    };
    const orders = [...new Set(els.map((el) => KINDS[el.getAttribute('data-drift')].order))];
    for (const o of orders) await Promise.all(els.filter((el) => KINDS[el.getAttribute('data-drift')].order === o).map(start));
    renderAll();
  }
  function reroll(seed) {
    SEED = seed != null ? (seed >>> 0) : newSeed(); api.seed = SEED;
    placed.length = 0;
    for (const [el, st] of STATE) {
      if (st.kind === 'sticker' && st.svg) { st.svg.remove(); st.svg = null; }
      if (st.kind === 'marquee' && st.track) { st.track.textContent = ''; st.base.forEach((c) => st.track.appendChild(c.cloneNode(true))); }
      if (st.kind === 'stack') el.querySelectorAll(':scope > *').forEach((c) => { c.style.marginLeft = ''; });
    }
    const keep = [...STATE.keys()]; STATE.clear();
    keep.forEach((el) => { el.classList.remove('drift-ready'); });
    return initAll(document);
  }

  const fontsReady = () => Promise.race([
    Promise.all([document.fonts ? document.fonts.load(`400 100px '${FAMILY}'`) : null, document.fonts ? document.fonts.ready : null]),
    new Promise((r) => setTimeout(r, 4000)),
  ]);
  async function boot() {
    injectCSS();
    REVEAL_AT = performance.now();
    wireMenu(); wireCity(); wireGate();
    bookend();
    if (STILL.addEventListener) STILL.addEventListener('change', () => { MOV.clear(); refit(); });
    await Promise.all([fontsReady(), metricsReady]);
    if (document.fonts && !document.fonts.check(`400 100px '${FAMILY}'`)) warn(`font '${FAMILY}' is not loaded; fitting may be off`);
    measureBaseline(); tables.clear();
    if ('ResizeObserver' in window) {
      const sizes = new WeakMap();
      ro = new ResizeObserver((entries) => {
        let changed = false;
        for (const e of entries) { const w = Math.round(e.contentRect.width), h = Math.round(e.contentRect.height), was = sizes.get(e.target); if (!was || was[0] !== w || was[1] !== h) { sizes.set(e.target, [w, h]); changed = true; } }
        if (changed) refit();
      });
    } else addEventListener('resize', refit);
    await initAll(document);
    document.documentElement.classList.add('drift-booted');
    // if no animation frame has run 2.5 s after boot, nothing would ever unfold: draw everything at rest instead
    setTimeout(() => { if (FRAMES || !MOV.size) return; STARVED = true; const now = performance.now(); for (const [el, fn] of [...MOV]) { try { fn(now); } catch (e) {} MOV.delete(el); } const bk = document.querySelector('[data-drift-bookend]'); if (bk) bk.remove(); }, 2500);
  }

  const api = window.DRIFT = { version: VERSION, seed: SEED, reroll, refit, setCity, init: initAll, beat: BEAT,
    _m: { ink100, wdthFor, sb, advance, table, ROLE, RULES, stickerLayout, wordRun, rollWords, trackAt, get ASC() { return ASC; }, get MET() { return MET; } } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
