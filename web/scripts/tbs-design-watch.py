#!/usr/bin/env python3
"""web/scripts/tbs-design-watch.py — notice when ChatGPT changes the preview site's DESIGN.

The hourly sync (tbs-sync.sh) already carries content (sheet) and photos (Drive). What it
cannot carry is a layout/design change ChatGPT makes on its preview site, because that lives
in the site's CSS/JS and page templates, not in the sheet. This script fingerprints exactly
those, so a change raises an alarm instead of going unnoticed:

  • every local stylesheet + script the preview pages load  → sha256 of the file
  • the page TEMPLATES (catalog, home, one product page, one family page) → the set of CSS
    class names they use. Content edits don't change that set; a new section/element does.

State in --state (default ~/.tbs-sync):
  design-fingerprint.json   last fingerprint (first run = baseline, no alarm)
  design-current/           copies of the current asset files
  design-snapshots/<ts>/    the files as they were BEFORE each detected change → diffable

Prints ONE last line for the caller:
  "DESIGN OK" | "DESIGN BASELINE saved (…)" | "DESIGN CHANGED: …" | "DESIGN CHECK SKIPPED: …"
"""
import argparse, hashlib, importlib.util, json, os, re, shutil, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))


def load_loader():
    spec = importlib.util.spec_from_file_location("tbsload", os.path.join(HERE, "tbs-content-load.py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def get(url):
    r = subprocess.run(["curl", "-s", "-L", "-A", "Mozilla/5.0", "--max-time", "40", "-w", "\n%{http_code}", url],
                       capture_output=True)
    body, _, code = r.stdout.rpartition(b"\n")
    return (body if code.strip() == b"200" else None)


def classes(html):
    out = set()
    for m in re.finditer(r'class="([^"]+)"', html):
        out.update(t for t in m.group(1).split() if t and not t.isdigit())
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--xlsx", required=True, help="the product master (its 'Webpage URL' column names the newest preview host)")
    ap.add_argument("--state", default=os.path.expanduser("~/.tbs-sync"))
    a = ap.parse_args()

    ld = load_loader()
    try:
        data = ld.read_xlsx(a.xlsx)
    except Exception as e:
        print(f"DESIGN CHECK SKIPPED: cannot read the sheet ({e})"); return
    hosts = ld.catalog_hosts(data.get("products", []))
    if not hosts:
        print("DESIGN CHECK SKIPPED: no preview host in the sheet"); return
    host = hosts[0]

    # sample pages: catalog + home + one product page + one family page (from the catalog model)
    cat_html = get(host + "/catalog")
    if not cat_html:
        print(f"DESIGN CHECK SKIPPED: {host}/catalog not reachable"); return
    cat_html = cat_html.decode("utf-8", "replace")
    pages = {"catalog": cat_html}
    model = None
    m = re.search(r'<script[^>]*id="catalog-data"[^>]*>(.*?)</script>', cat_html, re.S) or \
        re.search(r'<script[^>]*type="application/json"[^>]*>(.*?)</script>', cat_html, re.S)
    try:
        model = json.loads(m.group(1)) if m else None
    except Exception:
        model = None
    prods = (model or {}).get("products", [])
    fam = next((p for p in prods if str(p.get("page", "")).startswith("keluarga-")), None)
    one = next((p for p in prods if str(p.get("page", "")).startswith("produk-") and p.get("image")), None)
    for key, p in (("home", {"page": "index.html"}), ("product", one), ("family", fam)):
        if not p:
            continue
        h = get(host + "/" + re.sub(r"\.html$", "", p["page"]))
        if h:
            pages[key] = h.decode("utf-8", "replace")

    # assets referenced by those pages (local css/js only)
    refs = set()
    for h in pages.values():
        for r in re.findall(r'(?:href|src)="([^"#]+\.(?:css|js))(?:\?[^"]*)?"', h):
            if not r.startswith(("http:", "https:", "//", "data:")):
                refs.add(r.lstrip("./"))
    assets, blobs = {}, {}
    for r in sorted(refs):
        b = get(f"{host}/{r}")
        if b is None:
            continue
        assets[r] = hashlib.sha256(b).hexdigest()
        blobs[r] = b
    if not assets:
        print("DESIGN CHECK SKIPPED: no design files fetched"); return

    fp = {"host": host, "checked": time.strftime("%Y-%m-%d %H:%M"), "assets": assets,
          "templates": {k: sorted(classes(v)) for k, v in pages.items()}}

    os.makedirs(a.state, exist_ok=True)
    fpath = os.path.join(a.state, "design-fingerprint.json")
    cur_dir = os.path.join(a.state, "design-current")

    def save():
        json.dump(fp, open(fpath, "w"), indent=1)
        if os.path.isdir(cur_dir):
            shutil.rmtree(cur_dir)
        for r, b in blobs.items():
            p = os.path.join(cur_dir, r)
            os.makedirs(os.path.dirname(p), exist_ok=True)
            open(p, "wb").write(b)

    try:
        old = json.load(open(fpath))
    except Exception:
        old = None
    if not old:
        save()
        print(f"DESIGN BASELINE saved ({len(assets)} design files, {len(pages)} page templates)"); return

    changed = sorted(r for r in assets if r in old["assets"] and old["assets"][r] != assets[r])
    added = sorted(r for r in assets if r not in old["assets"])
    removed = sorted(r for r in old["assets"] if r not in assets)
    new_bits = []
    for k, cl in fp["templates"].items():
        if k in old.get("templates", {}):
            plus = sorted(set(cl) - set(old["templates"][k]))
            minus = sorted(set(old["templates"][k]) - set(cl))
            if plus or minus:
                new_bits.append(f"{k} page" + (f" +{len(plus)} element types ({', '.join(plus[:4])}{'…' if len(plus) > 4 else ''})" if plus else "")
                                + (f" -{len(minus)}" if minus else ""))
    if not (changed or added or removed or new_bits):
        if old.get("host") != host:          # ChatGPT re-hosted without changing the design
            fp_keep = dict(old, host=host, checked=fp["checked"]); json.dump(fp_keep, open(fpath, "w"), indent=1)
        print("DESIGN OK"); return

    # keep the BEFORE copies so the change can be diffed and ported
    snap = os.path.join(a.state, "design-snapshots", time.strftime("%Y%m%d-%H%M"))
    if os.path.isdir(cur_dir):
        shutil.copytree(cur_dir, snap, dirs_exist_ok=True)
    os.makedirs(snap, exist_ok=True)
    json.dump(old, open(os.path.join(snap, "_fingerprint-before.json"), "w"), indent=1)
    save()
    parts = []
    if changed: parts.append("changed " + ", ".join(changed))
    if added: parts.append("new " + ", ".join(added))
    if removed: parts.append("removed " + ", ".join(removed))
    parts += new_bits
    print("DESIGN CHANGED: " + "; ".join(parts) + f" (before-copies: {snap})")


if __name__ == "__main__":
    main()
