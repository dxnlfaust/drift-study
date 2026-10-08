# DRIFT engine (Webflow)

`drift-engine.js` makes the DRIFT site's generative type: fitted posters and lines from Ryan Ausden's DRIFT Type
Motion, and bumper stickers from his DRIFT Sticker (Studio BRIKD, reused with his OK). One random seed per page view
drives every roll. Text stays real HTML; stickers are SVG drawn beside their text.

Files: `drift-engine.js`, `driftsans-metrics.json` (Ryan's side-bearing table; must sit beside the script).

## Install (Webflow site settings › Custom code)

**Head**

```html
<script>
(function(h){h.classList.add('drift-js');try{var c=localStorage.getItem('drift-city');if(c)h.setAttribute('data-drift-city',c)}catch(e){}setTimeout(function(){h.classList.add('drift-failsafe')},3000)})(document.documentElement);
</script>
<style>
html.drift-js:not(.drift-failsafe) [data-drift]:not(.drift-ready){visibility:hidden}
html[data-drift-city="brisbane"] [data-city="perth" i],html[data-drift-city="perth"] [data-city="brisbane" i]{display:none!important}
</style>
```

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
| `data-drift-pics` | a hidden Div or Collection List | Every `img` inside is the sticker picture pool |
| `data-drift="stack"` | a Div of stickers | Each child nudged sideways by a seeded share of the room |
| `data-drift="marquee"` | a Div whose first child holds the items | Scrolls forever with no gap. `data-drift-speed` px/s (default 60) |
| `data-drift-wght`, `data-drift-wdth` | fit, mix, sticker, poster line | Ranges to roll in, e.g. `500-900` |
| `data-drift-key` | any hook | A fixed name for its roll, so editing its text doesn't change its look |
| `data-drift="menu-toggle"`, `data-drift-menu` | button, menu panel | Opens and closes the menu (Escape closes; the panel is a fixed overlay only on the live site) |
| `data-drift-city-set="brisbane"` | a button or link | Picks a city (`""` for both); remembered across the site |
| `data-city="Brisbane"` | anything | Hidden when the other city is picked (bind it to a CMS option field) |

Each hooked element gets `drift-ready` when drawn and `data-drift-cut` with its weight/width, for checking.

## Console

- `DRIFT.seed` is this view's seed. Reload with `?seed=<that number>` to replay it.
- `DRIFT.reroll()` rolls a new look in place; `DRIFT.reroll(42)` jumps to seed 42.
- `DRIFT.refit()` redraws (it already does on every resize).
