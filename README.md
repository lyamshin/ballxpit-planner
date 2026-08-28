# BALL x PIT Run Planner

A planner for a single [BALL x PIT](https://ballxpit.wiki.gg/) run. Your slots
sit across the top like the loadout in game, and the tech tree below recolours
to show what those slots can still become.

The planner is goal-first: clicking a tile marks what you're chasing, and it
appears as a **ghost** in your slots until you build it. Saying what you *have*
is the exception — shift-click, or the Have mode.

| Mode | Key | A click on a tile |
| --- | --- | --- |
| **Goals** (default) | <kbd>Esc</kbd> returns here | Marks it as a goal — a ghost lands in your slots |
| **Have** | <kbd>H</kbd> (or shift-click anywhere) | "I got this" — see below |
| **Fuse** | <kbd>X</kbd> | Picks two balls to fuse into one |

**Acquiring consumes.** Telling the planner you got a ball you could build —
carrying Poison and Freeze and clicking Venom — assumes you evolved it: the
parts leave your slots and the result takes one. Same for clicking a ghost,
which glows green with a `ready` badge the moment every part is in hand. A ball
you couldn't build is treated as rolled. Dragging any slot out of the rack
drops it (a ghost dragged out abandons the goal).

| Colour | Meaning |
| --- | --- |
| Blue | In your slots |
| Green | Every ingredient is in hand — fuse it now |
| Dark green | Reachable with more fusions, no new pickups |
| Amber | You still have to pick this up |
| Orange | An intermediate fusion on the way to a goal |
| Pink | A fused ball |
| Purple ring | A goal you marked |

Tiles a goal has no use for fade back, which only kicks in once you've actually
set a goal — dimming the board while you're still browsing just makes it harder
to click around. **Dim unrelated** turns it off entirely.

Your run is saved in the browser, separately for Balls and Passives.

## This plans a run, not a collection

Fusing **spends both ingredients** and frees a slot, so the planner counts every
pickup separately. Three consequences worth knowing, because they're what makes
the numbers differ from a plain tech tree:

- **A ball used by two branches has to be picked up twice.** Nosferatu wants
  Brood Mother for both Spider Queen and Mosquito King; fusing it into one
  spends it, so the board shows `Brood Mother ×2`.
- **Carrying one isn't the same as having enough.** If a plan spends Vampire
  twice and you have one slotted, that tile stays blue but gains an amber `+1`.
- **Goals don't feed each other.** Ask for Sun *and* Black Hole and you're told
  to build two Suns, because the first is consumed making the second.

The summary bar totals the run: pickups, Fusion Reactors (one drop per fusion),
and the peak number of slots you need filled at once. Set **Ball slots** to match
your save — the base game gives you a fixed number, the Bag Maker building adds
one, and The Ballbearer doubles them. If a plan needs more slots than you have,
the bar says so and tells you whether dropping dead weight would be enough.

> The wiki doesn't document the starting slot count, so the field defaults to 5.
> Change it to whatever your runs actually give you.

## Fusions

The 89 named recipes in the tree are **evolutions**. Fusion is the other thing
the reactor does: take any two unfused level-3 balls and get one ball with both
their abilities, named `A X B`. There are ~7,900 of these, so they aren't data —
the planner builds one on the spot and drops it in a slot.

<kbd>X</kbd> enters Fuse mode, then click two balls. The mode stays on after a
pair completes so you can chain several fusions; <kbd>X</kbd> again or
<kbd>Esc</kbd> returns you to Slots.

Three rules from the wiki are enforced, and the planner tells you which one it
hit rather than silently refusing:

- **A ball can't fuse with itself.**
- **Fused balls are terminal** — they can't be fused or evolved again, so they
  sit in a slot contributing their combined abilities and nothing else.
- **If a pair evolves, it can't fuse.** The reactor offers the evolution
  instead. 88 of the 4,005 possible pairs are blocked this way, and you get told
  which evolution is blocking — *"Burn + Iron evolve into Bomb"*. Recipes needing
  three or more balls don't block anything, which is why Vampire + Spider Queen
  fuses fine despite both feeding Nosferatu.

Passives evolve but never fuse, so the Fuse button is hidden on that tab and
switching to it drops you out of Fuse mode.

## Deploying

`public/` is the whole site — static files, no build step. Two hosts that fit,
both free, both fine with a donation link:

- **Cloudflare Pages** — no bandwidth cap. Point it at this repo, set the output
  directory to `public` and leave the build command empty.
- **GitHub Pages** — 1 GB site, 100 GB/month soft bandwidth. Serve from `/public`
  on your default branch.

Neither needs a paid plan for this. Note that **Vercel's free Hobby tier bans
advertising but explicitly permits donations** — if you ever add ads, that
option closes and GitHub Pages becomes questionable too.

### Before the first deploy

Open [public/index.html](public/index.html) and replace the placeholder domain
in `og:url`, `og:image` and `<link rel="canonical">`. Link previews need
absolute URLs, so those three are the only things that must know the real host.

Then check the card renders:

```bash
./scripts/make-og.sh
```

That regenerates `public/og.png` from `scripts/og-card.html` — the 1200×630
image Discord and X show when the link is pasted. Re-run it if you change the
title or the sample balls. Note it composites game sprites, so it needs
regenerating too if the icon set is ever swapped.

## Running it

```bash
python3 scripts/serve.py
```

Then open <http://localhost:8123>. (A plain `open public/index.html` won't work —
browsers block the data files over `file://`.)

## Refreshing the game data

The wiki is the source of truth. Two steps, in this order:

```bash
python3 scripts/fetch.py && python3 scripts/parse.py
```

- `fetch.py` downloads the wiki pages into `data/raw/` and any missing sprites
  into `public/icons/`. Icons already on disk are skipped, so re-running is cheap.
- `parse.py` turns the wikitext tables into `public/data/balls.json` and
  `public/data/passives.json`. It prints a count and exits non-zero if it finds a
  recipe pointing at something that doesn't exist — that's the signal the wiki
  changed shape and the parser needs a look.

Current data: **90 balls** (21 base, 69 evolved) and **71 passives**
(54 base, 17 evolved).

## Layout

```
public/            the site - this whole folder is the deployable thing
  index.html
  app.js           modes, rack, board, colouring, and the run planner
  style.css
  data/*.json      generated - do not hand-edit, re-run parse.py
  icons/           ball sprites
  icons/passives/  passive sprites
  og.png           link-preview card, generated
  favicon.svg      original mark, not game art
scripts/
  fetch.py         wiki -> data/raw + icons
  parse.py         data/raw -> public/data/*.json
  serve.py         local web server
  make-og.sh       regenerate public/og.png
  og-card.html     the template it renders
data/raw/          downloaded wikitext, kept so parse.py can re-run offline
LICENSE            the three layers, separated - read this before publishing
```

### How the data is shaped

Every entry looks like this, and balls and passives use the same shape so the
board code doesn't care which it's drawing:

```json
{
 "id": "black-hole",
 "name": "Black Hole",
 "tier": "evolved",
 "depth": 2,
 "recipe": [["sun"], ["dark", "time"]],
 "usedIn": [],
 "icon": "icons/black-hole.png"
}
```

`recipe` is a list of **slots**. You must fill every slot, and the ids inside one
slot are interchangeable — so the example above reads *Sun + (Dark or Time)*.
`depth` is how many fusions deep the entry sits, which is what puts it in one of
the three columns. `usedIn` is the reverse lookup, filled in by `parse.py`.

Your rack is a list of those same ids, except a fusion, which is synthesised at
runtime and never appears in the data files:

```js
{ id: "fuse:bleed+freeze", parts: ["bleed", "freeze"] }
```

### How planning works

`build(id, inv)` in [app.js](public/app.js) is the whole engine. It walks a
recipe against an inventory `Map` of id → count and **spends what it takes**, so
nothing is ever counted twice. It returns the leftover inventory, the pickups it
needed, the fusions in order, and the peak slot usage. `planRun()` runs it once
per goal, holding each finished goal aside so later goals can't spend it. Fused
entries are filtered out before any of this — they can't be ingredients, they
just occupy a slot.

For OR-slots it tries each alternative and keeps the cheaper one, scoring a
pickup as ten times the cost of a fusion — the assumption being that finding a
specific ball is much harder than finding a Fusion Reactor. That weight is one
number at the top of `build()` if you want to tune it.

## Credits and licensing

Three layers, three different terms — [LICENSE](LICENSE) spells them out:

- **The code** is MIT.
- **The ball and passive text** comes from the
  [BALL x PIT Wiki](https://ballxpit.wiki.gg/wiki/Balls) under CC BY-SA 4.0.
  Share-alike travels with it: that text stays BY-SA no matter how the site is
  funded. The recipes and names themselves are just facts about the game.
- **The sprites are not CC-licensed.** The wiki tags them
  *"owned by Kenny Sun and/or its licensors"* — they're game assets the wiki
  hosts, not wiki content. No licence to them is claimed here.

The planner reads icon paths straight from the JSON, so the sprite set can be
swapped for an openly licensed one (e.g. [game-icons.net](https://game-icons.net/),
CC BY 3.0) without touching the planning logic.

BALL x PIT is © Kenny Sun / Devolver Digital. This is an unofficial, free,
unaffiliated fan tool.
