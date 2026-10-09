# DRIFT engine (Webflow)

`drift-engine.js` makes the DRIFT site's generative type: fitted posters and lines from Ryan Ausden's DRIFT Type
Motion, and bumper stickers from his DRIFT Sticker (Studio BRIKD, reused with his OK). One random seed per page view
drives every roll. Text stays real HTML; stickers are SVG drawn beside their text.

Files: `drift-engine.js`, `driftsans-metrics.json` (Ryan's side-bearing table) and `assets/` (the wordmark), all beside each other.

## Install (Webflow site settings › Custom code)

**Head**

```html
<script>
(function(h){h.classList.add('drift-js');try{var c=localStorage.getItem('drift-city');if(c)h.setAttribute('data-drift-city',c);if(sessionStorage.getItem('drift-bookend'))h.classList.add('drift-bookend-seen')}catch(e){}setTimeout(function(){h.classList.add('drift-failsafe')},3000)})(document.documentElement);
</script>
<style>
html.drift-js:not(.drift-failsafe) [data-drift]:not(.drift-ready){visibility:hidden}
html[data-drift-city="brisbane"] [data-city="perth" i],html[data-drift-city="perth"] [data-city="brisbane" i]{display:none!important}
html.drift-js [data-drift-bookend]{position:fixed;inset:0;z-index:1000}
html.drift-bookend-seen [data-drift-bookend],html.drift-failsafe [data-drift-bookend],html:not(.drift-js) [data-drift-city-gate]{display:none}
html.drift-js[data-drift-city] [data-drift-city-gate]{display:none}
html.drift-js:not([data-drift-city]) [data-drift-city-gate]{position:fixed;inset:0;z-index:950;overflow:auto}
@media (prefers-reduced-motion:reduce){[data-drift-bookend]{display:none}}
</style>
```

The bookend and gate lines are here, not only in the engine, so they apply before the first paint (no flash of the page).

**Footer** (pin a commit or tag, never a branch)

```html
<script src="https://cdn.jsdelivr.net/gh/dxnlfaust/drift-study@COMMIT/engine/drift-engine.js" defer></script>
```

The font must be uploaded to the site as **Drift Sans** (the variable WOFF2). A different family name goes on the
script tag: `data-family="…"`. Webflow runs no custom code in the Designer: check on the published site.

## Hooks (custom attributes in the Designer)

| Attribute | On | Does |
| --- | --- | --- |
| `data-drift="poster"` | a Div with a height (CSS height, aspect ratio, or `data-drift-aspect="0.8"`) | Its children with `data-drift-role` share the height; each line's ink fills the width exactly. Padding is the margin no ink enters |
| `data-drift-role` | a poster line | `city`, `name` (tall), `date`, `month` (wide, short), `venue`, or `logo` (keeps its own proportions) |
| `data-drift-gap` | poster | Space between lines, px or `%` of width (default 1.85%) |
| `data-drift-spare` | poster | Where left-over height goes: `center` (default), `top`, `bottom`, `gaps` |
| `data-drift="fit"` | a heading | One line whose ink fills its parent's width. The CSS font-size is the height it aims for; the width axis does the rest |
| `data-drift="mix"` | a heading | One line, each word its own weight and width (the sticker roll). `data-drift-fit`: `shrink` (default, never bigger than the CSS size), `fill`, `none` |
| `data-drift="sticker"` | a heading or text | A bumper sticker drawn from the text. Type size = the CSS font-size (220 px is Ryan's 1×). Pictures come from any `[data-drift-pics]` list on the page |
| `data-drift-ground="flat"` | sticker | A flat colour ground instead of a picture |
| `data-drift-pics` | a hidden Div or Collection List | Every `img` inside is the sticker picture pool. Only the pictures the stickers pick are downloaded, at the `srcset` copy nearest 1080 px |
| `data-drift="stack"` | a Div of stickers | Each child nudged sideways by a seeded share of the room |
| `data-drift="marquee"` | a Div whose first child holds the items | Scrolls forever with no gap. `data-drift-speed` px/s (default 60) |
| `data-drift="logo"` | a Div with the text DRIFT® | The wordmark, drawn inline in the element's text colour and at its width (`assets/drift-logo-ink.svg`) |
| `data-drift-wght`, `data-drift-wdth` | fit, mix, sticker, poster line | Ranges to roll in, e.g. `500-900` |
| `data-drift-key` | any hook | A fixed name for its roll, so editing its text doesn't change its look |
| `data-drift="menu-toggle"`, `data-drift-menu` | button, menu panel | Opens and closes the menu (Escape closes; the panel is a fixed overlay only on the live site) |
| `data-drift-city-set="brisbane"` | a button or link | Picks a city (`""` for both); remembered across the site |
| `data-city="Brisbane"` | anything | Hidden when the other city is picked (bind it to a CMS field; on a Collection Item, not inside it) |
| `data-drift-city-gate` | a Div (on every page, e.g. in the footer component) | The first-visit city picker: a full-screen overlay until a city is chosen (its `data-drift-city-set` buttons). While a gate exists, the header buttons never clear the city |
| `data-drift-bookend` | a Div holding a `data-drift="logo"` | The intro: a full-screen panel, the mark unfolds, then the page fades in. Once a browser session; never with reduced motion. Click or any key skips it |
| `data-drift-motion` | poster, logo, sticker | `loop` (poster): Type Motion's spotlight, one line a beat swelling and going bold (lab.js, 140 bpm), after the lines unfold in. `unfold`: in from the left edge when it first comes on screen (stickers do this unless set to `none`) |
| `data-drift-intensity` | poster | How far the loop moves, 0–1.5 (default 1, Ryan's) |
| `data-drift-cycle="2"` | sticker | A new roll every N beats (the artist tiles). Only re-uses pictures already downloaded |
| `data-drift="mosaic"` | a Div holding an `img` (and optionally a second, hidden `img`) | The photo resolves out of big pixels tile by tile, then blocks of tiles glitch to the second picture on the beat |

Each hooked element gets `drift-ready` when drawn and `data-drift-cut` with its weight/width, for checking.

Nothing moves when the visitor asks for reduced motion; every hook is drawn at rest.

## Console

- `DRIFT.seed` is this view's seed. Reload with `?seed=<that number>` to replay it.
- `DRIFT.reroll()` rolls a new look in place; `DRIFT.reroll(42)` jumps to seed 42.
- `DRIFT.refit()` redraws (it already does on every resize).
