#!/usr/bin/env python3
"""Fetch everything the tech tree needs from the BALL x PIT wiki.

  1. page wikitext  -> data/raw/*.wikitext
  2. ball sprites   -> public/icons/*.png
  3. passive sprites-> public/icons/passives/*.png

Run this, then scripts/parse.py. Already-downloaded icons are skipped, so
re-running is cheap. Content is CC BY-SA from ballxpit.wiki.gg.
"""
import json, re, urllib.parse, urllib.request, pathlib, time

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
API = "https://ballxpit.wiki.gg/api.php"
UA = "BallxPitTechTree/0.1 (personal fan tool)"
PAGES = ["Balls", "Passives"]

def api(**params):
    params.setdefault("format", "json")
    req = urllib.request.Request(API + "?" + urllib.parse.urlencode(params),
                                 headers={"User-Agent": UA})
    with urllib.request.urlopen(req) as r:
        return json.load(r)

def key(name):
    """Normalise a name so 'Stone_(Ball).png' and 'Stone' match."""
    n = re.sub(r"\.(png|jpg|jpeg|gif|webp)$", "", name, flags=re.I).replace("_", " ")
    n = re.sub(r"\s*\((ball|passive)\)\s*$", "", n, flags=re.I)
    return re.sub(r"[^a-z0-9]+", "", n.lower())

def paged(**params):
    cont = {}
    while True:
        r = api(**params, **cont)
        yield r
        if "continue" not in r:
            return
        cont = r["continue"]

def sprite_map(category):
    """Normalised name -> url, for files in one category."""
    out = {}
    for r in paged(action="query", generator="categorymembers", gcmtitle="Category:" + category,
                   gcmlimit=500, gcmtype="file", prop="imageinfo", iiprop="url"):
        for p in r.get("query", {}).get("pages", {}).values():
            if "imageinfo" in p:
                out[key(p["title"].removeprefix("File:"))] = p["imageinfo"][0]["url"]
    return out

def all_files():
    """Normalised name -> url, every file on the wiki (fallback)."""
    out = {}
    for r in paged(action="query", list="allimages", ailimit=500, aiprop="url"):
        for i in r["query"]["allimages"]:
            out.setdefault(key(i["name"]), i["url"])
    return out

def download(url, dest):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req) as r:
        dest.write_bytes(r.read())
    time.sleep(0.15)   # be polite to the wiki

def fetch_pages():
    RAW.mkdir(parents=True, exist_ok=True)
    for page in PAGES:
        r = api(action="parse", page=page, prop="wikitext")
        (RAW / (page + ".wikitext")).write_text(r["parse"]["wikitext"]["*"])
        print("page %-10s %6d chars" % (page, len((RAW / (page + ".wikitext")).read_text())))

def fetch_icons(json_name, category, dest_dir, extra=()):
    src = ROOT / "public" / "data" / json_name
    if not src.exists():
        print("skipping %s icons - run scripts/parse.py first" % category)
        return
    want = {i["name"]: i["id"] for i in json.load(open(src))["items"]}
    want.update(extra)

    files = sprite_map(category)
    fallback = all_files()
    dest_dir.mkdir(parents=True, exist_ok=True)

    got, missing = 0, []
    for name, iid in sorted(want.items()):
        url = files.get(key(name)) or fallback.get(key(name))
        if not url:
            missing.append(name)
            continue
        got += 1
        dest = dest_dir / (iid + ".png")
        if not dest.exists():
            download(url, dest)
    print("%-16s %d of %d icons" % (category, got, len(want)))
    if missing:
        print("  NO SPRITE FOUND (%d): %s" % (len(missing), ", ".join(missing)))

fetch_pages()
fetch_icons("balls.json", "Ball sprites", ROOT / "public/icons", {"Baby Ball": "baby-ball"})
fetch_icons("passives.json", "Passive sprites", ROOT / "public/icons/passives")
