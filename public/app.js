/* BALL x PIT Run Planner
 *
 *   goal-first: a click marks what you're chasing. Goals sit as ghosts in
 *   your slots. Shift+click (or Have mode, H) says "I got this" - and getting
 *   a ball you could build consumes its parts, exactly like the reactor.
 *   X pairs two balls into a fusion. Drag a slot out of the rack to drop it.
 *
 * This plans one run, so fusing spends its ingredients. If two branches of a
 * plan both want Brood Mother, that is two separate pickups.
 */

const SETS = {
  balls:    { file: "data/balls.json",    cols: ["Base Balls", "Evolved", "Second Evolution"] },
  passives: { file: "data/passives.json", cols: ["Base Passives", "Evolved", "Second Evolution"] },
};

const S = {
  set: "balls",
  rack: [],              // ordered slots: {id} for a ball, {id, parts:[a,b]} for a fusion
  targets: new Set(),
  slots: 5,
  focus: null,           // id of a tree item shown in the panel
  focusFuse: null,       // or a fused entry shown in the panel
  hover: null,
  q: "",
  mode: "goal",          // goal | have | fuse - what a click does
  dim: true,             // fade tiles a goal has no use for
  fusePick: null,        // first half of a fusion, waiting for the second
  fuseNote: "",          // why the last attempt was refused
};

let items = [];
let byId = {};
const cache = {};

const $ = (s) => document.querySelector(s);
const el = (tag, cls, txt) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt != null) n.textContent = txt;
  return n;
};

/* --------------------------------------------------------------- entries -- */
const isFused = (e) => !!(e && e.parts);
const entryName = (e) =>
  isFused(e) ? byId[e.parts[0]].name + " X " + byId[e.parts[1]].name : byId[e.id].name;

/** Plain (unfused) ball ids in the rack - the only things a recipe can use. */
const carriedIds = () => S.rack.filter((e) => !isFused(e)).map((e) => e.id);
const carrying = (id) => S.rack.some((e) => !isFused(e) && e.id === id);
const rackIndex = (id) => S.rack.findIndex((e) => !isFused(e) && e.id === id);

/** Both halves of a fusion, drawn overlapping. */
function iconOf(e) {
  if (!isFused(e)) {
    const im = el("img"); im.src = byId[e.id].icon; im.alt = ""; return im;
  }
  const wrap = el("span", "fused-icon");
  e.parts.forEach((p) => {
    const im = el("img"); im.src = byId[p].icon; im.alt = "";
    wrap.appendChild(im);
  });
  return wrap;
}

/* ------------------------------------------------------------- storage -- */
const saveKey = () => "bxp3:" + S.set;
function save() {
  localStorage.setItem(saveKey(), JSON.stringify({ rack: S.rack, targets: [...S.targets] }));
  localStorage.setItem("bxp3:slots", S.slots);
  localStorage.setItem("bxp3:dim", S.dim ? "1" : "0");
}
function load() {
  S.rack = []; S.targets = new Set(); S.fusePick = null;
  try {
    const raw = JSON.parse(localStorage.getItem(saveKey()) || "{}");
    (raw.rack || []).forEach((e) => {
      if (e && e.parts) {
        if (e.parts.length === 2 && e.parts.every((p) => byId[p])) S.rack.push({ id: e.id, parts: e.parts });
      } else if (e && byId[e.id]) S.rack.push({ id: e.id });
    });
    (raw.targets || []).forEach((i) => byId[i] && S.targets.add(i));
    S.slots = Math.max(2, Math.min(12, +localStorage.getItem("bxp3:slots") || 5));
    S.dim = localStorage.getItem("bxp3:dim") !== "0";
  } catch (_) { /* corrupt or absent - start clean */ }
}

/* --------------------------------------------------------------- fusion -- */

/**
 * An evolution that eats exactly this pair. The wiki's rule: if two balls can
 * evolve, the reactor makes you evolve them - fusing is not offered. Recipes
 * needing three or more balls (Elemental, Nosferatu) do not block a fusion.
 */
function evolutionFor(a, b) {
  return items.find((it) =>
    it.recipe.length === 2 &&
    ((it.recipe[0].includes(a) && it.recipe[1].includes(b)) ||
     (it.recipe[0].includes(b) && it.recipe[1].includes(a))));
}

/** Why this pair cannot be fused, or "" if it can. */
function fuseBlocked(first, second) {
  if (isFused(first) || isFused(second))
    return "Fused balls can't be fused again — the reactor only takes unfused balls.";
  if (first.id === second.id)
    return "A ball can't be fused with itself.";
  const evo = evolutionFor(first.id, second.id);
  if (evo)
    return byId[first.id].name + " + " + byId[second.id].name + " evolve into " +
           evo.name + ", so the reactor won't fuse them — take the evolution instead.";
  return "";
}

function makeFusion(first, second) {
  const parts = [first.id, second.id];
  return { id: "fuse:" + parts.join("+"), parts };
}

/** Complete a fusion: both halves leave the rack, the result takes one slot. */
function commitFusion(second) {
  const first = S.fusePick;
  const why = fuseBlocked(first, second);
  if (why) { S.fuseNote = why; S.fusePick = null; return; }

  const fused = makeFusion(first, second);
  // drop the two ingredients wherever they sit, then park the result
  const drop = (e) => {
    const i = S.rack.findIndex((r) => r === e || (!isFused(r) && !isFused(e) && r.id === e.id));
    if (i >= 0) S.rack.splice(i, 1);
  };
  drop(first); drop(second);
  S.rack.push(fused);
  S.fusePick = null;
  S.fuseNote = "";
  S.focusFuse = fused;
  S.focus = null;
}

/** A click while x is held: pick the first half, or close the pair. */
function fusePickup(entry) {
  S.fuseNote = "";
  if (!S.fusePick) {
    if (isFused(entry)) { S.fuseNote = "Fused balls can't be fused again."; return; }
    S.fusePick = entry;
    if (!isFused(entry) && !carrying(entry.id)) S.rack.push({ id: entry.id });
    return;
  }
  if (!isFused(entry) && !isFused(S.fusePick) && entry.id === S.fusePick.id) {
    S.fusePick = null;                      // clicking the same ball again cancels
    return;
  }
  if (!isFused(entry) && !carrying(entry.id)) S.rack.push({ id: entry.id });
  commitFusion(entry);
}

/** The "I got this" gesture. If the rack can pay for it, it was built the
 * honest way: the components leave, the result arrives - clicking Venom while
 * holding Poison and Freeze means you evolved them, not that you skipped
 * steps. If the rack can't pay, you rolled it. A fulfilled goal stops being
 * a goal either way. */
function acquire(id) {
  const it = byId[id];
  if (it && it.recipe.length) {
    const pay = [];
    const ok = it.recipe.every((slot) => {
      const n = S.rack.findIndex((e, i) => !isFused(e) && slot.includes(e.id) && !pay.includes(i));
      if (n < 0) return false;
      pay.push(n);
      return true;
    });
    if (ok) pay.sort((a, b) => b - a).forEach((n) => S.rack.splice(n, 1));
  }
  S.rack.push({ id });
  S.targets.delete(id);
  S.focus = id; S.focusFuse = null;
}

/* --------------------------------------------------------------- logic -- */

/**
 * Work out how to build `id` from an inventory, spending what it uses.
 *
 * `inv` is a Map of id -> how many you hold. Nothing is reused: taking a ball
 * out of the inventory for one slot means it is gone for every other slot,
 * which is what makes this a run plan rather than a collection checklist.
 */
function build(id, inv, seen = new Set()) {
  const have = inv.get(id) || 0;
  if (have > 0) {
    const next = new Map(inv);
    next.set(id, have - 1);
    return { inv: next, acquire: [], steps: [], used: [id], peak: 1 };
  }

  const it = byId[id];
  if (!it || !it.recipe.length || seen.has(id))
    return { inv, acquire: [id], steps: [], used: [], peak: 1 };

  const deeper = new Set(seen).add(id);
  let cur = inv, acquire = [], steps = [], used = [], peak = 0;
  const ins = [];

  it.recipe.forEach((slot, i) => {
    let best = null;
    for (const alt of slot) {
      const r = build(alt, cur, deeper);
      const cost = r.acquire.length * 10 + r.steps.length;   // pickups hurt more than fusions
      if (!best || cost < best.cost) best = Object.assign(r, { cost, alt });
    }
    ins.push(best.alt);
    cur = best.inv;
    acquire = acquire.concat(best.acquire);
    steps = steps.concat(best.steps);
    used = used.concat(best.used);
    // the i ingredients already finished are sitting in slots while this one is built
    peak = Math.max(peak, i + best.peak);
  });

  peak = Math.max(peak, it.recipe.length);   // every ingredient is held at the moment you fuse
  steps.push({ out: id, ins });
  return { inv: cur, acquire, steps, used, peak };
}

/** Build every goal in turn, keeping each finished one in a slot. */
function planRun(targetIds, carried = carriedIds()) {
  const inv0 = new Map();
  carried.forEach((id) => inv0.set(id, (inv0.get(id) || 0) + 1));
  let inv = inv0;
  let acquire = [], steps = [], used = [], peak = 0;

  targetIds.forEach((t, k) => {
    const r = build(t, inv);
    // A finished goal is kept, not banked: it stays out of `inv` so a later
    // goal cannot quietly spend it. Ask for both Sun and Black Hole and you
    // are told to build two Suns, because that is what the run demands.
    inv = r.inv;
    acquire = acquire.concat(r.acquire);
    steps = steps.concat(r.steps);
    used = used.concat(r.used);
    peak = Math.max(peak, k + r.peak);      // k goals already finished and held
  });

  // anything in the rack the plan never spends sits in slots the whole time
  const spent = new Map();
  used.forEach((u) => spent.set(u, (spent.get(u) || 0) - 0 + 1));
  const keeping = [];
  const left = new Map(spent);
  carried.forEach((id) => {
    const n = left.get(id) || 0;
    if (n > 0) left.set(id, n - 1); else keeping.push(id);
  });
  const fusedHeld = S.rack.filter(isFused).length;

  const need = new Map();
  acquire.forEach((a) => need.set(a, (need.get(a) || 0) + 1));

  return {
    need, steps, keeping, fusedHeld,
    rolls: acquire.length,
    reactors: steps.length,
    slotsNeeded: peak + keeping.length + fusedHeld,
  };
}

/** One pass over the board: what colour is every tile right now? */
function compute() {
  const carried = carriedIds();
  const inv = new Map();
  carried.forEach((id) => inv.set(id, (inv.get(id) || 0) + 1));
  const now = new Set(), soon = new Set();

  for (const it of items) {
    if (carrying(it.id) || !it.recipe.length) continue;
    const r = build(it.id, inv);
    if (r.acquire.length) continue;                     // needs something you do not have
    (r.steps.length === 1 ? now : soon).add(it.id);     // one fusion away, or several
  }

  const run = planRun([...S.targets], carried);
  const path = new Set();
  run.steps.forEach((s) => { if (!S.targets.has(s.out)) path.add(s.out); });

  return { now, soon, need: run.need, path, run };
}

/* ------------------------------------------------------------- rendering */
function tileClass(it, c) {
  const cls = ["tile"];
  if (carrying(it.id)) cls.push("have");
  else if (c.now.has(it.id)) cls.push("now");
  else if (c.need.has(it.id)) cls.push("need");
  else if (c.path.has(it.id)) cls.push("path");
  else if (c.soon.has(it.id)) cls.push("soon");

  if (S.targets.has(it.id)) cls.push("want");
  if (S.fusePick && !isFused(S.fusePick) && S.fusePick.id === it.id) cls.push("fusing");

  const hit = S.q && it.name.toLowerCase().includes(S.q);
  if (hit) cls.push("hit");

  // Only fade things once a goal makes "irrelevant" mean something. Fading
  // as soon as one ball is slotted just greys the board while you browse.
  const lit = cls.length > 1 && cls[1] !== "hit";
  if (!lit && !hit && S.dim && S.targets.size) cls.push("mute");
  return cls.join(" ");
}

function draw() {
  const c = compute();
  for (const it of items) {
    const node = it._node;
    node.className = tileClass(it, c);
    // How many more times this run has to hand you this ball. Carrying one
    // already does not settle it - a plan that spends Vampire twice still
    // needs a second Vampire, so carried tiles show "+1" rather than nothing.
    const n = c.need.get(it.id) || 0;
    const held = carrying(it.id);
    const label = held ? (n >= 1 ? "+" + n : null) : (n > 1 ? "×" + n : null);
    let pip = node.querySelector(".pip");
    if (label) {
      if (!pip) { pip = el("span", "pip"); node.appendChild(pip); }
      pip.textContent = label;
      pip.classList.toggle("extra", held);
      node.classList.add("owes");
    } else if (pip) pip.remove();
  }
  modeChrome();
  rack(c);
  summary(c);
  wires(c);
  panel(c);
  save();
}

/* ----------------------------------------------------------------- rack -- */
function removeAt(i) {
  const gone = S.rack[i];
  S.rack.splice(i, 1);
  if (S.fusePick === gone) S.fusePick = null;
  if (S.focusFuse === gone) S.focusFuse = null;
  draw();
}

/**
 * Pull a slot out of the rack to drop it.
 *
 * Pointer events rather than HTML5 drag-and-drop: the chip follows the cursor,
 * the rack says whether letting go will keep or drop it, and it works the same
 * under touch. Releasing anywhere outside the rack removes the slot.
 */
function startDrag(ev, chip, onDrop, markDragged) {
  if (ev.button !== 0) return;
  const bar = $("#rack");
  const x0 = ev.clientX, y0 = ev.clientY;
  let ghost = null;

  const outside = (x, y) => {
    const r = bar.getBoundingClientRect();
    return x < r.left || x > r.right || y < r.top || y > r.bottom;
  };

  const move = (m) => {
    if (!ghost) {
      if (Math.hypot(m.clientX - x0, m.clientY - y0) < 5) return;   // still a click
      markDragged();
      ghost = chip.cloneNode(true);
      ghost.className = "slot filled drag-ghost";
      document.body.appendChild(ghost);
      chip.classList.add("dragging");
      bar.classList.add("dragging-any");
    }
    const out = outside(m.clientX, m.clientY);
    ghost.style.left = m.clientX + "px";
    ghost.style.top = m.clientY + "px";
    ghost.classList.toggle("will-drop", out);
    bar.classList.toggle("drop-armed", out);
  };

  const up = (u) => {
    removeEventListener("pointermove", move);
    removeEventListener("pointerup", up);
    removeEventListener("pointercancel", up);
    if (ghost) ghost.remove();
    chip.classList.remove("dragging");
    bar.classList.remove("dragging-any", "drop-armed");
    if (ghost && outside(u.clientX, u.clientY)) onDrop();
  };

  addEventListener("pointermove", move);
  addEventListener("pointerup", up);
  addEventListener("pointercancel", up);
}

function rack(c) {
  const bar = $("#rack");
  bar.innerHTML = "";
  bar.classList.toggle("armed", S.mode === "fuse");

  const label = el("div", "rack-label");
  label.appendChild(el("b", null, S.rack.length + "/" + S.slots));
  label.appendChild(el("span", null, "slots"));
  bar.appendChild(label);

  const boxes = el("div", "rack-boxes");
  // goals you don't hold yet sit in the empty slots as ghosts
  const ghosts = [...S.targets].filter((g) => !carrying(g));
  const count = Math.max(S.slots, S.rack.length + ghosts.length);

  for (let i = 0; i < count; i++) {
    const e = S.rack[i];
    if (!e) {
      const g = ghosts[i - S.rack.length];
      if (!g) { boxes.appendChild(el("div", "slot empty")); continue; }
      const it = byId[g];
      const ready = c.now.has(g);
      const chip = el("div", "slot ghost" + (ready ? " ready" : ""));
      chip.title = it.name + (ready ? " — buildable now. Click when you've made it."
                                    : " — goal. Click when you've got it; drag out to abandon.");
      const im = el("img"); im.src = it.icon; im.alt = "";
      chip.appendChild(im);
      chip.appendChild(el("span", "slot-name", it.name));
      let dragged = false;
      chip.onclick = () => {
        if (dragged) { dragged = false; return; }
        acquire(g); draw();
      };
      chip.onpointerdown = (ev) => startDrag(ev, chip, () => { S.targets.delete(g); draw(); }, () => { dragged = true; });
      boxes.appendChild(chip);
      continue;
    }

    const chip = el("div", "slot filled" + (i >= S.slots ? " over" : "") +
                            (S.fusePick === e ? " fusing" : "") +
                            (isFused(e) ? " is-fused" : ""));
    chip.title = entryName(e) + " — drag out of the rack to drop it";
    chip.appendChild(iconOf(e));
    chip.appendChild(el("span", "slot-name", entryName(e)));

    const x = el("button", "slot-x", "✕");
    x.title = "Drop " + entryName(e);
    x.onclick = (ev) => { ev.stopPropagation(); removeAt(i); };
    chip.appendChild(x);

    let dragged = false;
    chip.onclick = () => {
      if (dragged) { dragged = false; return; }       // that was a drag, not a click
      if (S.mode === "fuse") { fusePickup(e); draw(); return; }
      if (isFused(e)) { S.focusFuse = e; S.focus = null; }
      else { S.focus = e.id; S.focusFuse = null; }
      draw();
    };
    chip.onpointerdown = (ev) => startDrag(ev, chip, () => removeAt(i), () => { dragged = true; });

    boxes.appendChild(chip);
  }
  bar.appendChild(boxes);

  const hint = el("div", "rack-hint");
  if (S.fusePick) {
    hint.className = "rack-hint live";
    hint.append(document.createTextNode("Fusing " + entryName(S.fusePick) + " + "));
    hint.appendChild(el("b", null, "pick the second ball"));
    const cancel = el("button", "linkish", "cancel");
    cancel.onclick = () => { S.fusePick = null; draw(); };
    hint.appendChild(cancel);
  } else if (S.fuseNote) {
    hint.className = "rack-hint warn";
    hint.textContent = S.fuseNote;
  } else if (S.mode === "fuse") {
    hint.className = "rack-hint live";
    hint.textContent = "Fuse: click two balls.";
  } else if (S.rack.length > S.slots) {
    hint.className = "rack-hint warn";
    hint.textContent = (S.rack.length - S.slots) + " over capacity";
  } else {
    hint.textContent = "drag a slot out to drop it";
  }
  bar.appendChild(hint);
}

function summary(c) {
  const bar = $("#summary");
  bar.innerHTML = "";
  if (!S.targets.size) {
    bar.className = "summary off";
    bar.appendChild(el("span", null,
      "Click what you want — it lands here as a ghost until you build it."));
    return;
  }
  const r = c.run;
  const tight = r.slotsNeeded > S.slots;
  bar.className = "summary" + (tight ? " tight" : "");

  const add = (label, value, cls) => {
    const s = el("span", "stat " + (cls || ""));
    s.appendChild(el("b", null, value));
    s.appendChild(document.createTextNode(" " + label));
    bar.appendChild(s);
  };
  add(S.targets.size === 1 ? "goal" : "goals", S.targets.size);
  add(r.rolls === 1 ? "pickup" : "pickups", r.rolls, "s-need");
  add(r.reactors === 1 ? "reactor" : "reactors", r.reactors, "s-path");
  add("slots at peak", r.slotsNeeded, tight ? "s-bad" : "s-ok");

  const spare = r.keeping.length + r.fusedHeld;
  if (tight && r.slotsNeeded - spare <= S.slots && spare) {
    bar.appendChild(el("span", "warn",
      "⚠ Fits in " + S.slots + " only if you drop " + (r.slotsNeeded - S.slots) +
      " unused ball" + (r.slotsNeeded - S.slots === 1 ? "" : "s") + "."));
  } else if (tight) {
    bar.appendChild(el("span", "warn",
      "⚠ Over your " + S.slots + " slots — split across runs."));
  } else if (spare) {
    bar.appendChild(el("span", "muted", spare + " carried, unused by this plan"));
  }
}

function buildBoard() {
  const cols = $("#cols");
  cols.innerHTML = "";
  const names = SETS[S.set].cols;

  // Tiers hold wildly different counts (balls 21/56/13, passives 54/16/1), so
  // give each column a share of the width - square-rooted, or one big tier
  // would squeeze the others down to a single tile per row.
  const sizes = [0, 1, 2].map((d) => items.filter((i) => i.depth === d).length);
  cols.style.setProperty("--cols", sizes
    .map((n) => `minmax(165px, ${Math.max(1, Math.sqrt(n)).toFixed(2)}fr)`)
    .join(" "));

  [0, 1, 2].forEach((d) => {
    const group = items.filter((i) => i.depth === d);
    if (!group.length) return;
    const col = el("div", "col col-" + d);
    const h = el("h2", null, names[d] + " ");
    h.appendChild(el("b", null, group.length));
    col.appendChild(h);

    const grid = el("div", "grid");
    for (const it of group) {
      const t = el("button", "tile");
      t.title = it.name;
      t.setAttribute("aria-label", it.name);
      const img = el("img");
      img.src = it.icon; img.alt = "";
      img.onerror = () => { img.replaceWith(el("span", "noicon", it.name[0])); };
      t.appendChild(img);

      t.onclick = (e) => {
        if (S.mode === "fuse" && !e.shiftKey) {
          const held = rackIndex(it.id);
          fusePickup(held >= 0 ? S.rack[held] : { id: it.id });
          draw();
          return;
        }
        if (e.shiftKey || S.mode === "have") {
          const at = rackIndex(it.id);
          if (at >= 0) S.rack.splice(at, 1); else acquire(it.id);
        } else {
          S.targets.has(it.id) ? S.targets.delete(it.id) : S.targets.add(it.id);
        }
        S.focus = it.id; S.focusFuse = null;
        draw();
      };
      t.onmouseenter = () => { S.hover = it.id; S.focus = it.id; S.focusFuse = null; draw(); };
      t.onmouseleave = () => { S.hover = null; wires(compute()); };

      it._node = t;
      grid.appendChild(t);
    }
    col.appendChild(grid);
    cols.appendChild(col);
  });
}

/* Curved connectors, in content coordinates so scrolling needs no redraw. */
function wires(c) {
  const svg = $("#wires"), board = $("#board"), cols = $("#cols");
  svg.innerHTML = "";
  svg.style.width = cols.scrollWidth + "px";
  svg.style.height = cols.scrollHeight + "px";
  const base = board.getBoundingClientRect();

  const at = (id) => {
    const n = byId[id] && byId[id]._node;
    if (!n) return null;
    const r = n.getBoundingClientRect();
    return {
      l: r.left - base.left + board.scrollLeft,
      r: r.right - base.left + board.scrollLeft,
      y: r.top - base.top + board.scrollTop + r.height / 2,
    };
  };

  const edges = new Map();
  const add = (from, to, colour) => edges.set(from + ">" + to, colour);

  for (const s of c.run.steps)
    for (const i of s.ins) add(i, s.out, S.targets.has(s.out) ? "var(--want)" : "var(--path)");

  if (S.hover) {
    const it = byId[S.hover];
    it.recipe.forEach((slot) => slot.forEach((a) => add(a, it.id, "var(--have)")));
    (it.usedIn || []).forEach((o) => add(it.id, o, "var(--now)"));
  }

  const ns = "http://www.w3.org/2000/svg";
  for (const [pair, colour] of edges) {
    const [a, b] = pair.split(">");
    const p = at(a), q = at(b);
    if (!p || !q) continue;
    const [x1, x2] = p.r <= q.l ? [p.r, q.l] : [p.l, q.r];
    const dx = Math.max(28, Math.abs(x2 - x1) * 0.5);
    const dir = x2 >= x1 ? 1 : -1;
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", `M${x1},${p.y} C${x1 + dx * dir},${p.y} ${x2 - dx * dir},${q.y} ${x2},${q.y}`);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", colour);
    path.setAttribute("stroke-width", "1.6");
    path.setAttribute("opacity", ".75");
    svg.appendChild(path);
  }
}

/* ---------------------------------------------------------------- panel -- */
function chip(id, cls, count) {
  const it = byId[id];
  const b = el("button", "chip " + (cls || ""));
  if (!it) { b.textContent = id; return b; }
  const img = el("img"); img.src = it.icon; img.alt = "";
  b.append(img, document.createTextNode(it.name));
  if (count > 1) b.appendChild(el("i", "x", "×" + count));
  b.onclick = () => { S.focus = id; S.focusFuse = null; draw(); };
  return b;
}

function section(title, node) {
  const s = el("div", "p-sec");
  s.appendChild(el("h4", null, title));
  s.appendChild(node);
  return s;
}

function tagRow(list) {
  const d = el("div", "tags");
  list.forEach((t) => d.appendChild(el("span", "tag", t)));
  return d;
}

function stepList(steps) {
  const ol = el("ol", "steps");
  for (const s of steps) {
    const li = el("li");
    const ins = el("div", "step-in");
    s.ins.forEach((i, n) => {
      if (n) ins.appendChild(el("span", "arrow", "+"));
      const im = el("img"); im.src = byId[i].icon; im.alt = "";
      ins.append(im, document.createTextNode(byId[i].name));
    });
    const out = el("div", "step-out");
    const im = el("img"); im.src = byId[s.out].icon; im.alt = "";
    out.append(el("span", "arrow", "→"), im, el("b", null, byId[s.out].name));
    li.append(ins, out);
    ol.appendChild(li);
  }
  return ol;
}

/** Panel for a fused ball, which is a made-up item with no wiki page. */
function fusedPanel(p, e) {
  const [a, b] = e.parts.map((id) => byId[id]);
  const head = el("div", "p-head");
  head.appendChild(iconOf(e));
  const box = el("div");
  box.appendChild(el("h3", null, entryName(e)));
  box.appendChild(el("div", "p-tier", "Fused · in your slots"));
  head.appendChild(box);
  p.appendChild(head);

  p.appendChild(el("p", "p-desc",
    "A fused ball carries both abilities. It takes one slot, and it can't be fused or evolved again."));

  const acts = el("div", "p-acts");
  const drop = el("button", "", "Drop from slots");
  drop.onclick = () => { const i = S.rack.indexOf(e); if (i >= 0) removeAt(i); else draw(); };
  acts.appendChild(drop);
  p.appendChild(acts);

  [a, b].forEach((part) => {
    const d = el("div");
    d.appendChild(el("p", null, part.description || ""));
    p.appendChild(section(part.name, d));
  });

  const tags = [...new Set([...(a.statusEffects || []), ...(b.statusEffects || []),
                            ...(a.onHit || []), ...(b.onHit || [])])];
  if (tags.length) p.appendChild(section("Combined effects", tagRow(tags)));
}

function panel(c) {
  const p = $("#panel");
  p.innerHTML = "";

  if (S.focusFuse) return fusedPanel(p, S.focusFuse);

  const it = byId[S.focus];
  if (!it) {
    p.appendChild(el("p", "empty",
      "Hover a tile for its recipe. Click = set a goal · shift-click = I have it · X = fuse."));
    return;
  }

  const head = el("div", "p-head");
  const img = el("img"); img.src = it.icon; img.alt = "";
  const box = el("div");
  box.appendChild(el("h3", null, it.name));
  box.appendChild(el("div", "p-tier", (it.tier === "base" ? "Base" : "Evolved") + " · tier " + (it.depth + 1)));
  head.append(img, box);
  p.appendChild(head);
  p.appendChild(el("p", "p-desc", it.description || ""));

  const acts = el("div", "p-acts");
  const held = carrying(it.id);
  const have = el("button", held ? "on-have" : "", held ? "✓ In slots" : "I got this");
  have.onclick = () => {
    const at = rackIndex(it.id);
    if (at >= 0) S.rack.splice(at, 1); else acquire(it.id);
    draw();
  };
  const wanted = S.targets.has(it.id);
  const want = el("button", wanted ? "on-want" : "", wanted ? "✓ Goal" : "Set as goal");
  want.onclick = () => { wanted ? S.targets.delete(it.id) : S.targets.add(it.id); draw(); };
  acts.append(have, want);
  p.appendChild(acts);

  if (it.recipe.length) {
    const d = el("div");
    d.appendChild(el("p", null, it.recipeText));
    const chips = el("div", "chips");
    chips.style.marginTop = "8px";
    it.recipe.forEach((slot) => slot.forEach((a) =>
      chips.appendChild(chip(a, carrying(a) ? "have" : ""))));
    d.appendChild(chips);
    p.appendChild(section("Fuses from", d));
  } else if (it.unlock) {
    p.appendChild(section("Unlocked by", el("p", null, it.unlock)));
  }

  if (!held && it.recipe.length) {
    const solo = planRun([it.id]);
    const cost = el("p", "cost");
    cost.append(
      el("b", null, solo.rolls), document.createTextNode(solo.rolls === 1 ? " pickup · " : " pickups · "),
      el("b", null, solo.reactors), document.createTextNode(solo.reactors === 1 ? " reactor · " : " reactors · "),
      el("b", null, solo.slotsNeeded), document.createTextNode(" slots at peak"));
    p.appendChild(section("Cost from here", cost));

    if (solo.need.size) {
      const chips = el("div", "chips");
      let total = 0;
      [...solo.need].sort((a, b) => b[1] - a[1]).forEach(([id, n]) => {
        total += n;
        chips.appendChild(chip(id, "need", n));
      });
      const wrap = el("div");
      wrap.appendChild(chips);
      if ([...solo.need.values()].some((n) => n > 1)) wrap.appendChild(el("p", "note",
        "×2 = needed twice: fusing one copy spends it."));
      p.appendChild(section("Still to pick up (" + total + ")", wrap));
    }
    if (solo.steps.length) p.appendChild(section("Fusion order", stepList(solo.steps)));
  }

  if (it.usedIn && it.usedIn.length) {
    const chips = el("div", "chips");
    it.usedIn.forEach((o) => chips.appendChild(chip(o, c.now.has(o) ? "have" : "")));
    p.appendChild(section("Evolves into (" + it.usedIn.length + ")", chips));
  }

  const tags = [...(it.statusEffects || []), ...(it.onHit || [])];
  if (tags.length) p.appendChild(section("Effects", tagRow(tags)));
  if (it.characters && it.characters.length) p.appendChild(section("Starting character", tagRow(it.characters)));
  if (it.requirement) p.appendChild(section("Appears when", el("p", null, it.requirement)));
}

/* ----------------------------------------------------------------- boot -- */
async function show(name) {
  S.set = name;
  if (!cache[name]) cache[name] = await (await fetch(SETS[name].file)).json();
  document.body.dataset.set = name;
  items = cache[name].items;
  byId = Object.fromEntries(items.map((i) => [i.id, i]));
  S.focus = null; S.focusFuse = null; S.fuseNote = "";
  if (S.mode === "fuse" && name !== "balls") S.mode = "goal";
  load();
  $("#slots").value = S.slots;
  $("#dim").checked = S.dim;
  buildBoard();
  draw();
}

document.querySelectorAll(".tab").forEach((t) => {
  t.onclick = () => {
    document.querySelectorAll(".tab").forEach((o) => o.classList.toggle("is-on", o === t));
    show(t.dataset.set);
  };
});

const typing = (e) => /^(INPUT|TEXTAREA)$/.test(e.target.tagName);

/* Modes are toggles, not held keys: press the key (or the button) to enter,
 * press it again or Esc to get back to slotting. Fuse mode stays on after a
 * pair completes, so you can chain several fusions without re-arming. */
const MODE_HINT = {
  goal: "Click what you're chasing. Amber = still to find.",
  have: "Click what you get, as you get it — building a ball spends its parts.",
  fuse: "Click two balls to fuse them.",
};

function setMode(m) {
  if (m === "fuse" && S.set !== "balls") {
    // the wiki is explicit: passives can be evolved, but never fused
    S.fuseNote = "Passives can't fuse — only evolve.";
    m = "goal";
  } else if (m !== "fuse") S.fuseNote = "";
  S.mode = m;
  if (m !== "fuse") S.fusePick = null;
  draw();
}

function modeChrome() {
  document.querySelectorAll(".mode").forEach((b) =>
    b.classList.toggle("is-on", b.dataset.mode === S.mode));
  document.body.dataset.mode = S.mode;
  $("#modehint").textContent = MODE_HINT[S.mode];
}

document.querySelectorAll(".mode").forEach((b) => {
  b.onclick = () => setMode(S.mode === b.dataset.mode ? "goal" : b.dataset.mode);
});

$("#dim").onchange = (e) => { S.dim = e.target.checked; draw(); };

addEventListener("keydown", (e) => {
  if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
  if (!$("#intro").hidden) return;              // the explainer owns the keyboard
  const k = e.key.toLowerCase();
  if (k === "x") setMode(S.mode === "fuse" ? "goal" : "fuse");
  else if (k === "h") setMode(S.mode === "have" ? "goal" : "have");
  else if (k === "g" || e.key === "Escape") setMode("goal");
  else return;
  e.preventDefault();
});

/* The board is dense and means nothing cold, so first-time visitors get the
 * premise before they see it. Dismissed once, it stays dismissed - the ? in
 * the header brings it back. */
const introSeen = () => localStorage.getItem("bxp3:intro") === "1";
function showIntro(on) {
  $("#intro").hidden = !on;
  if (on) $("#intro-go").focus();
  else localStorage.setItem("bxp3:intro", "1");
}
$("#intro-go").onclick = () => showIntro(false);
$("#help").onclick = () => showIntro(true);
$("#intro").onclick = (e) => { if (e.target === $("#intro")) showIntro(false); };
addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("#intro").hidden) showIntro(false);
}, true);
if (!introSeen()) showIntro(true);

$("#search").oninput = (e) => { S.q = e.target.value.trim().toLowerCase(); draw(); };
$("#reset").onclick = () => {
  S.rack = []; S.targets.clear(); S.fusePick = null; S.fuseNote = "";
  S.focus = null; S.focusFuse = null;
  setMode("goal");
};
$("#slots").oninput = (e) => {
  S.slots = Math.max(2, Math.min(12, +e.target.value || 5));
  draw();
};
addEventListener("resize", () => wires(compute()));

show("balls");
