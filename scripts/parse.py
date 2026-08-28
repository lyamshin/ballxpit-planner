#!/usr/bin/env python3
"""Parse BALL x PIT wiki pages into the JSON the tech tree runs on.

Reads data/raw/*.wikitext (fetched by scripts/fetch.py) and writes
public/data/balls.json and public/data/passives.json.
"""
import json, re, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "public" / "data"

LINK_TPL = re.compile(r"\{\{(?:BallLink|PassiveLink|il|s)\|([^}]*)\}\}")

def slug(name):
    """'Deadeye's Cross' -> 'deadeyes-cross'"""
    n = name.lower().replace("&", "and").replace("'", "").replace("\u2019", "")
    return re.sub(r"[^a-z0-9]+", "-", n).strip("-")

def clean(target):
    """'Stone (Ball)|Stone' -> 'Stone'"""
    return target.split("|")[-1].strip()

def plain(text):
    """Wikitext cell -> plain text."""
    t = LINK_TPL.sub(lambda m: clean(m.group(1)), text)
    t = re.sub(r"\[\[([^\]|]*\|)?([^\]]*)\]\]", r"\2", t)
    t = re.sub(r"'''?|<[^>]+>", "", t)
    return t.strip()

def multi(text):
    """Cells holding several values on separate lines."""
    return [v for v in (plain(l) for l in text.split("\n")) if v and v != "N/A"]

def one(text):
    return " ".join(multi(text))

def parse_recipe(cell):
    """'{{il|Iron}} + ({{il|Ghost}} or {{il|Dark}})' -> [['iron'], ['ghost','dark']]

    Each element is a slot you must fill; the list inside it is the
    interchangeable options for that slot.
    """
    slots = []
    for part in cell.split("+"):
        alts = [slug(clean(m.group(1))) for m in LINK_TPL.finditer(part)]
        if alts:
            slots.append(alts)
    return slots

def split_rows(body):
    rows, cur = [], None
    for line in body.split("\n"):
        if line.startswith("|-"):
            if cur:
                rows.append(cur)
            cur = {"attrs": line[2:].strip(), "lines": []}
        elif line.strip() == "|}":
            break
        elif cur is not None:
            cur["lines"].append(line)
    if cur:
        rows.append(cur)
    return rows

def row_cells(row, tpl):
    """Row -> (name, [cell, cell, ...])."""
    body = "\n".join(row["lines"])
    m = re.search(r"\{\{%s\|([^}]*)\}\}" % tpl, body)
    if not m:
        return None, []
    cells, cur = [], []
    for line in body[m.end():].split("\n"):
        if line.startswith("|"):
            if cur:
                cells.append("\n".join(cur))
            cur = [line[1:]]
        elif cur:
            cur.append(line)
    if cur:
        cells.append("\n".join(cur))
    return clean(m.group(1)), cells + [""] * 8

def attr(row, key):
    m = re.search(key + r'="([^"]*)"', row["attrs"])
    return [slug(v) for v in m.group(1).split(",")] if m else []

def table(text, table_id):
    start = text.index('id="%s"' % table_id)
    return text[start:text.index("\n|}", start)]

def finish(items, problems, kind):
    """Shared post-processing: validate refs, compute depth and reverse links."""
    for it in items.values():
        for s in it["recipe"]:
            for a in s:
                if a not in items:
                    problems.append("%s: recipe references unknown %s %r" % (it["name"], kind, a))

    def depth(i, seen=()):
        it = items[i]
        if not it["recipe"] or i in seen:
            return 0
        return 1 + max(max(depth(a, seen + (i,)) for a in s if a in items) for s in it["recipe"])

    for it in items.values():
        it["depth"] = depth(it["id"])
        it["usedIn"] = sorted(o["id"] for o in items.values()
                              if any(it["id"] in s for s in o["recipe"]))

def write(path, source, items, problems, kind):
    finish(items, problems, kind)
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / path).write_text(json.dumps(
        {"source": source, "items": sorted(items.values(), key=lambda x: (x["depth"], x["name"]))},
        indent=1))
    base = sum(1 for i in items.values() if i["tier"] == "base")
    print("%-14s %3d total (%d base, %d evolved), max depth %d"
          % (path, len(items), base, len(items) - base, max(i["depth"] for i in items.values())))

# ---------------------------------------------------------------- balls ----
def parse_balls(problems):
    text = (RAW / "Balls.wikitext").read_text()
    balls = {}
    for row in split_rows(table(text, "base-balls")):
        name, c = row_cells(row, "BallTableRow")
        if not name:
            continue
        balls[slug(name)] = dict(
            id=slug(name), name=name, kind="ball", tier="base",
            icon="icons/%s.png" % slug(name), description=plain(c[0]),
            characters=multi(c[1]), unlock=one(c[2]) or "Unlocked by default",
            onHit=multi(c[3]), statusTriggers=multi(c[4]), statusEffects=multi(c[5]),
            recipe=[], recipeText="", basics=[], intermediates=[], evolvesFurther="")

    for row in split_rows(table(text, "evo-balls")):
        name, c = row_cells(row, "BallTableRow")
        if not name:
            continue
        recipe = parse_recipe(c[1])
        if not recipe:
            problems.append("no recipe parsed for ball %s: %r" % (name, c[1]))
        balls[slug(name)] = dict(
            id=slug(name), name=name, kind="ball", tier="evolved",
            icon="icons/%s.png" % slug(name), description=plain(c[0]),
            characters=[], unlock="",
            onHit=multi(c[2]), statusTriggers=multi(c[3]), statusEffects=multi(c[4]),
            recipe=recipe, recipeText=plain(c[1]),
            basics=attr(row, "data-basics"), intermediates=attr(row, "data-intermediates"),
            evolvesFurther=plain(c[5]))

    write("balls.json", "https://ballxpit.wiki.gg/wiki/Balls", balls, problems, "ball")

# ------------------------------------------------------------- passives ----
def parse_passives(problems):
    text = (RAW / "Passives.wikitext").read_text()
    ps = {}
    for row in split_rows(table(text, "basepass")):
        name, c = row_cells(row, "PassiveTableRow")
        if not name:
            continue
        ps[slug(name)] = dict(
            id=slug(name), name=name, kind="passive", tier="base",
            icon="icons/passives/%s.png" % slug(name), description=plain(c[0]),
            requirement=one(c[1]), unlock=one(c[2]) or "Unlocked by default",
            recipe=[], recipeText="")

    for row in split_rows(table(text, "evopass")):
        name, c = row_cells(row, "PassiveTableRow")
        if not name:
            continue
        recipe = parse_recipe(c[1])
        if not recipe:
            problems.append("no recipe parsed for passive %s: %r" % (name, c[1]))
        ps[slug(name)] = dict(
            id=slug(name), name=name, kind="passive", tier="evolved",
            icon="icons/passives/%s.png" % slug(name), description=plain(c[0]),
            requirement="", unlock="", recipe=recipe, recipeText=plain(c[1]))

    write("passives.json", "https://ballxpit.wiki.gg/wiki/Passives", ps, problems, "passive")

problems = []
parse_balls(problems)
parse_passives(problems)
if problems:
    print("\nPROBLEMS (%d):" % len(problems))
    for p in sorted(set(problems)):
        print("  -", p)
sys.exit(1 if problems else 0)
