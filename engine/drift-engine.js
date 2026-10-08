/* DRIFT engine for the Webflow site, v0.3.0 (Faust Earth for Untitled Group, Oct 2026).

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
  const VERSION = '0.3.0';
  const NS = 'http://www.w3.org/2000/svg';
  const AX = { wght: [400, 900], wdth: [23, 252] };
  const CAP = 1467 / 2048, DESC = 434 / 2048, XH = 1062 / 2048, SPACE = 200 / 2048;
  const MG = [400, 700, 900], MD = [23, 50, 100, 160, 252];   // the font's masters: exactly bilinear between them
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const seg = (arr, v) => { let i = 0; while (i < arr.length - 2 && v > arr[i + 1]) i++; return [i, clamp((v - arr[i]) / (arr[i + 1] - arr[i]), 0, 1)]; };
  const wordsOf = (text) => String(text || '').trim().split(/\s+/).filter(Boolean);
  const textOf = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim();
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
    city:  { pref: 1.00, wght: 400, track: -0.06, roll: [400, 650] },
    name:  { pref: 0.95, wght: 400, track: -0.06, roll: [400, 650] },
    date:  { pref: 0.42, wght: 900, track: 0,     roll: [750, 900] },
    month: { pref: 0.42, wght: 600, track: -0.16, roll: [500, 800] },
    venue: { pref: 0.40, wght: 400, track: -0.06, roll: [400, 600] },
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
      return { el: c, role, text, row: { text, track: num(c.getAttribute('data-drift-track'), R.track) }, pref: num(c.getAttribute('data-drift-pref'), R.pref), wght: clamp(lerp(wr[0], wr[1], r()), AX.wght[0], AX.wght[1]) };
    });
  }
  function posterRender(el, st) {
    const p = padOf(el), cw = el.clientWidth, W = cw - p.l - p.r;
    if (W < 20) return false;
    let ch = el.clientHeight;
    const asp = num(el.getAttribute('data-drift-aspect'), 0);
    if (asp > 0) { ch = cw / asp; el.style.height = ch.toFixed(1) + 'px'; }
    const A0 = ch - p.t - p.b;
    if (A0 < 20) { warn('a poster needs a height (CSS height, aspect-ratio or data-drift-aspect)', el); return false; }
    const gapAttr = el.getAttribute('data-drift-gap'), gap = gapAttr == null ? W * 0.0185 : /%$/.test(gapAttr) ? W * num(gapAttr, 1.85) / 100 : num(gapAttr, 0);
    const items = st.lines.filter((l) => l.logo || l.text).map((l) => {
      if (l.logo) {
        const sv = l.el.querySelector('svg'), vb = sv && sv.viewBox && sv.viewBox.baseVal;
        const aspL = num(l.el.getAttribute('data-drift-aspect'), vb && vb.width ? vb.width / vb.height : 999.969 / 95.1139);
        return { l, fixed: true, h: W / aspL };
      }
      const bk = boxK(l.row), hmax = Math.min(A0, bk * 100 * W / ink100(l.row, l.wght, AX.wdth[0]));
      const hmin = Math.min(hmax, bk * 100 * W / ink100(l.row, l.wght, AX.wdth[1]));
      return { l, bk, hmax, hmin, want: l.pref };
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
    const over = (it, key) => (it && !it.fixed ? vInk(it.l.row, it.l.wght)[key] * it.h / it.bk / 100 : 0);
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
      } else {
        const size = it.h / it.bk, row = it.l.row, g = it.l.wght, d = wdthFor(row, g, 100 * W / size);
        const inkW = ink100(row, g, d) * size / 100, lsb = sb(row.text[0], g, d)[1] * size / upm();
        // the line's box is its cap height (plus descender room): baseline at (bk − LHN)/2 + ASC, moved to CAP below the box top
        Object.assign(s, styleRow(row, g, d, size), { lineHeight: it.bk.toFixed(4), left: (p.l + (W - inkW) / 2 - lsb).toFixed(2) + 'px',
          top: (p.t + y + (CAP - ((it.bk - LHN) / 2 + ASC)) * size).toFixed(2) + 'px' });
        it.l.el.dataset.driftY = (p.t + y).toFixed(2); it.l.el.dataset.driftSize = size.toFixed(3);
        it.l.el.dataset.driftCut = `${g.toFixed(0)}/${d.toFixed(1)}`;
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
  const loadPic = (p) => {
    if (!pics.has(p.key)) pics.set(p.key, new Promise((res) => { const im = new Image(); im.onload = () => res(im.naturalWidth && im.naturalHeight ? { ...p, w: im.naturalWidth, h: im.naturalHeight } : null); im.onerror = () => res(null); im.src = p.url; }));
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
    st.sticker = makeSticker(st.text, R, pool, placed, r, { ground: el.getAttribute('data-drift-ground'), flatColour: el.getAttribute('data-drift-flat-colour') });
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
    return true;
  }

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
    toggles.forEach((t) => { t.setAttribute('aria-expanded', 'false'); asButton(t);
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
      const go = (e) => { e.preventDefault(); const v = (b.getAttribute('data-drift-city-set') || '').toLowerCase(); setCity(document.documentElement.getAttribute('data-drift-city') === v && b.hasAttribute('data-drift-city-toggle') ? '' : v); };
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
  }

  /* ---- orchestration: init once (the rolls), render on every resize (no re-roll) ---- */
  const KINDS = {
    logo: { init: logoInit, render: () => true, order: 0 },
    poster: { init: posterInit, render: posterRender, order: 1 },
    fit: { init: fitInit, render: fitRender, order: 2 },
    mix: { init: mixInit, render: mixRender, order: 3 },
    sticker: { init: stickerInit, render: stickerRender, order: 4 },
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
    }
    document.dispatchEvent(new CustomEvent('drift:rendered'));
  }
  function refit() { if (!queued) { queued = true; requestAnimationFrame(renderAll); } }
  async function initAll(root) {
    const els = [...root.querySelectorAll('[data-drift]')].filter((el) => KINDS[el.getAttribute('data-drift')] && !STATE.has(el));
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
    wireMenu(); wireCity();
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
  }

  const api = window.DRIFT = { version: VERSION, seed: SEED, reroll, refit, setCity, init: initAll,
    _m: { ink100, wdthFor, sb, advance, table, ROLE, RULES, stickerLayout, wordRun, rollWords, trackAt, get ASC() { return ASC; }, get MET() { return MET; } } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
