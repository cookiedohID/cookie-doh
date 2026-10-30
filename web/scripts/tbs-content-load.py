#!/usr/bin/env python3
"""
web/scripts/tbs-content-load.py — load the owner's Total-Buah-Product-Master.xlsx
(edited via ChatGPT) into the CD Supabase content tables (web/sql/tbs_content.sql).

RE-RUNNABLE. Every row is upserted on the sheet's "Product ID (keep unchanged)";
a product that disappears from the sheet is NOT deleted (set listed=false by hand
or pass --prune). Price + stock are NOT loaded for the shop — they stay live from
the ERP; sheet_price is only the fallback the page shows when the ERP has no row.

Usage:
  python3 -I scripts/tbs-content-load.py \
      --xlsx "/path/Total-Buah-Product-Master.xlsx" \
      [--catalog-url https://totalbuah-….chatgpt.site/catalog]   # category codes / subcategory / listing
      [--photos-dir /path/to/downloaded/drive/photos]            # files named by Drive file id
      [--public-dir web/public/tbs/products]                      # where l/<id>.jpg + s/<id>.jpg are written
      [--dry-run]

Needs: DATABASE_URL in web/.env.local (psql), `sips` (macOS) for photo resizing,
curl for Drive downloads (folder must be shared "anyone with the link").
Zero third-party Python deps on purpose (no openpyxl): the xlsx is unzipped and
its sheet XML read directly.
"""
import argparse, collections, hashlib, json, os, re, shutil, subprocess, sys, tempfile, urllib.request, zipfile
import xml.etree.ElementTree as ET

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
SHEETS = {"Products": "products", "General": "general", "Categories": "categories", "Subcategories": "subcategories",
          "Recipes": "recipes", "Benefits": "benefits", "Nutrition": "nutrition", "Stores": "stores",
          "Variants": "variants", "Availability": "availability", "Recipe shopping": "recipe_shopping",
          "POS source": "pos_source", "Barcode mapping": "barcode_mapping"}


def read_xlsx(path):
    """Return {sheet_key: [row dicts]} — header row = first row whose cells look like headers (row 4 in this workbook)."""
    z = zipfile.ZipFile(path)
    ss = []
    if "xl/sharedStrings.xml" in z.namelist():
        root = ET.fromstring(z.read("xl/sharedStrings.xml"))
        for si in root.findall("m:si", NS):
            ss.append("".join(t.text or "" for t in si.iter("{%s}t" % NS["m"])))
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
    rid2target = {r.get("Id"): r.get("Target") for r in rels}
    out = {}
    for sh in wb.iter("{%s}sheet" % NS["m"]):
        name = sh.get("name")
        rid = [v for k, v in sh.attrib.items() if k.endswith("}id")][0]
        target = rid2target[rid]
        target = target.lstrip("/")
        target = target if target.startswith("xl/") else "xl/" + target
        root = ET.fromstring(z.read(target))
        rows = []
        for r in root.iter("{%s}row" % NS["m"]):
            vals = {}
            for c in r.findall("m:c", NS):
                v = c.find("m:v", NS)
                if v is None:
                    continue
                col = "".join(ch for ch in c.get("r") if ch.isalpha())
                vals[col] = ss[int(v.text)] if c.get("t") == "s" else v.text
            rows.append(vals)
        # header rows = rows with >= 3 non-empty cells whose first cell is a known header; a sheet may
        # stack several tables (Recipe shopping has two) — each header starts a new table
        his = [i for i, r in enumerate(rows) if len([x for x in r.values() if x]) >= 3 and
               any((r.get("A", "")).startswith(k) for k in ("Product ID", "Product name", "Section", "Category code", "Recipe ID", "Store ID", "Photo label", "Parent Class"))]
        key = SHEETS.get(name, name)
        if not his:
            out[key] = []
            continue
        for ti, hi in enumerate(his):
            end = his[ti + 1] if ti + 1 < len(his) else len(rows)
            hdr = rows[hi]
            cols = sorted(hdr, key=lambda c: (len(c), c))
            out[key if ti == 0 else f"{key}#{ti + 1}"] = [{hdr[c]: r.get(c, "") for c in cols} for r in rows[hi + 1:end] if any(r.values())]
    return out


def sql_str(v):
    if v is None:
        return "null"
    return "'" + str(v).replace("\\", "\\\\").replace("'", "''") + "'"


def sql_arr(items):
    return "array[" + ",".join(sql_str(x) for x in items) + "]::text[]" if items else "'{}'::text[]"


def sql_json(obj):
    return sql_str(json.dumps(obj, ensure_ascii=False)) + "::jsonb"


def to_int(v):
    try:
        f = float(str(v).replace(",", ""))
        return int(round(f))
    except Exception:
        return None


def to_num(v):
    try:
        return float(str(v).replace(",", ""))
    except Exception:
        return None


def lines_of(v):
    return [x.strip() for x in str(v or "").replace("\r", "").split("\n") if x.strip()]


def slugify(s):
    s = re.sub(r"[^a-z0-9]+", "-", str(s or "").lower()).strip("-")
    return s[:80]


def drive_id(url):
    m = re.search(r"/d/([A-Za-z0-9_-]{10,})", str(url or "")) or re.search(r"[?&]id=([A-Za-z0-9_-]{10,})", str(url or ""))
    return m.group(1) if m else None


def fetch_catalog(url):
    """The preview site embeds its catalog model as <script type=application/json>; use it for
    category codes, subcategory and listing (the sheet's Products tab carries only the label)."""
    try:
        html = subprocess.run(["curl", "-s", "-L", "-A", "Mozilla/5.0", "--max-time", "40", url],
                              capture_output=True).stdout.decode("utf-8", "replace")
        m = (re.search(r'<script[^>]*id="catalog-data"[^>]*>(.*?)</script>', html, re.S)
             or re.search(r'<script[^>]*type="application/json"[^>]*>(.*?)</script>', html, re.S))
        model = json.loads(m.group(1)) if m else None
        return model if isinstance(model, dict) and model.get("products") else None
    except Exception as e:
        print("catalog fetch failed:", e, file=sys.stderr)
        return None


def catalog_hosts(prods):
    """ChatGPT re-hosts the preview on every rebuild and only the rows it touched carry the new
    host in 'Webpage URL' — so the host with the FEWEST rows is the newest. Try them in that order."""
    c = collections.Counter()
    for p in prods:
        m = re.match(r"(https://[^/]+)", (p.get("Webpage URL") or "").strip())
        if m:
            c[m.group(1)] += 1
    return [h for h, _ in sorted(c.items(), key=lambda kv: kv[1])]


def ensure_photo(fid, photos_dir, public_dir, dry):
    """Download (if needed) + resize one Drive file into public_dir/l and /s. Returns (url_l, url_s, w, h) or None."""
    if not fid:
        return None
    src = os.path.join(photos_dir, fid)
    if not os.path.exists(src) or os.path.getsize(src) == 0:
        if dry:
            return None
        os.makedirs(photos_dir, exist_ok=True)
        subprocess.run(["curl", "-s", "-L", "-o", src,
                        f"https://drive.usercontent.google.com/download?id={fid}&export=download"], check=False)
        if not os.path.exists(src) or os.path.getsize(src) == 0:
            return None
    kind = subprocess.run(["file", "-b", src], capture_output=True, text=True).stdout
    if "image" not in kind.lower():
        return None
    out_l = os.path.join(public_dir, "l", fid + ".jpg")
    out_s = os.path.join(public_dir, "s", fid + ".jpg")
    os.makedirs(os.path.dirname(out_l), exist_ok=True)
    os.makedirs(os.path.dirname(out_s), exist_ok=True)
    if not dry:
        if not os.path.exists(out_l):
            subprocess.run(["sips", "-Z", "900", "-s", "format", "jpeg", "-s", "formatOptions", "70", src, "--out", out_l],
                           capture_output=True)
        if not os.path.exists(out_s):
            subprocess.run(["sips", "-Z", "520", "-s", "format", "jpeg", "-s", "formatOptions", "80", src, "--out", out_s],
                           capture_output=True)
    w = h = None
    try:
        g = subprocess.run(["sips", "-g", "pixelWidth", "-g", "pixelHeight", out_l if os.path.exists(out_l) else src],
                           capture_output=True, text=True).stdout
        w = int(re.search(r"pixelWidth: (\d+)", g).group(1)); h = int(re.search(r"pixelHeight: (\d+)", g).group(1))
    except Exception:
        pass
    return (f"/tbs/products/l/{fid}.jpg", f"/tbs/products/s/{fid}.jpg", w, h)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--xlsx", required=True)
    ap.add_argument("--catalog-url", default="auto", help="preview site's /catalog (default: newest host named in the sheet's 'Webpage URL' column)")
    ap.add_argument("--catalog-json", default=None, help="local copy of the preview's catalog model (skips the fetch)")
    ap.add_argument("--photos-dir", default=os.path.expanduser("~/cookie-doh/image-originals-hires/tbs-drive"))
    ap.add_argument("--public-dir", default=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public", "tbs", "products"))
    ap.add_argument("--recipes-dir", default=None, help="folder of recipe illustration files (<slug>.webp) to copy into public/tbs/recipes")
    ap.add_argument("--env", default=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env.local"))
    ap.add_argument("--database-url", default=None, help="target database (default: DATABASE_URL from --env). Cloud SQL: run cloud-sql-proxy and pass postgresql://cookiedoh_app:<pw>@127.0.0.1:<port>/cookiedoh")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--prune", action="store_true", help="set listed=false for products no longer in the sheet")
    a = ap.parse_args()

    data = read_xlsx(a.xlsx)
    counts = {k: len(v) for k, v in data.items()}
    print("sheet:", counts)

    cat_model = None
    if a.catalog_json:
        cat_model = json.load(open(a.catalog_json))
    elif a.catalog_url == "auto":
        for host in catalog_hosts(data.get("products", [])):
            cat_model = fetch_catalog(host + "/catalog")
            if cat_model:
                print("catalog model from", host)
                break
    elif a.catalog_url:
        cat_model = fetch_catalog(a.catalog_url)
    model_by_id = {p["id"]: p for p in (cat_model or {}).get("products", [])}
    # a FAMILY card stands for its members in the model; give every member the card's
    # category/subcategory/visibility and its own sku/barcodes
    for card in list(model_by_id.values()):
        for mem in card.get("familyMembers") or []:
            if mem.get("id") and mem["id"] not in model_by_id:
                model_by_id[mem["id"]] = {**card, "id": mem["id"], "sku": mem.get("sku"), "itemNumber": mem.get("itemNumber"),
                                          "barcodes": mem.get("barcodes") or [], "name": mem.get("name") or card.get("name")}
    model_cats = (cat_model or {}).get("categories", [])

    # ---- categories (sheet is the master for names/order; model supplies iconId + subcategories) ----
    sub_by_cat = collections.defaultdict(list)
    for s in data.get("subcategories", []):
        if s.get("Subcategory code"):
            sub_by_cat[s["Category code"]].append({"code": s["Subcategory code"], "name": s["Subcategory name"], "order": to_int(s.get("Display order")) or 999})
    icon_id = {c["code"]: c.get("iconId") for c in model_cats}
    cat_rows = []
    label2code = {}
    for c in data.get("categories", []):
        code = c.get("Category code")
        if not code:
            continue
        label2code[c["Category name"].strip().lower()] = code
        cat_rows.append((code, c["Category name"], c.get("Icon") or "", icon_id.get(code) or "sparkles",
                         to_int(c.get("Display order")) or 999, sorted(sub_by_cat[code], key=lambda x: x["order"])))

    # ---- products ----
    prods = data.get("products", [])
    variants = collections.defaultdict(list)
    for v in data.get("variants", []):
        if v.get("Product ID (keep unchanged)"):
            variants[v["Product ID (keep unchanged)"]].append(v)
    recipes_by = collections.defaultdict(list)
    for r in data.get("recipes", []):
        if r.get("Product ID (keep unchanged)") and r.get("Recipe title"):
            recipes_by[r["Product ID (keep unchanged)"]].append(r)
    # recipe shopping tab = two tables stacked: (Recipe ID, Product ID, Recipe title, Image path, Image description)
    # then (Recipe ID, Ingredient label, Barcode, Product ID, Quantity, …) — detect by header presence
    rs_rows = data.get("recipe_shopping", [])
    recipe_img = {}
    recipe_shop = collections.defaultdict(list)
    for r in rs_rows:
        rid = r.get("Recipe ID") or ""
        if rid and r.get("Recipe title"):
            recipe_img[rid] = (r.get("Image path"), r.get("Image description"))
    for r in data.get("recipe_shopping#2", []):
        rid = r.get("Recipe ID") or ""
        if not rid or not r.get("Ingredient name"):
            continue
        recipe_shop[rid].append({
            "order": to_int(r.get("Ingredient order")) or len(recipe_shop[rid]) + 1,
            "label": r.get("Ingredient name"), "quantity": r.get("Recipe quantity") or "",
            "product_id": r.get("Product ID") or None, "barcode": r.get("Barcode") or None,
            "packs": to_int(r.get("Cart packs")) or 1, "status": r.get("Mapping status") or "",
            "product_name": r.get("Product name") or "", "note": r.get("Note") or "",
        })
    facts_by = collections.defaultdict(list)
    for kind, key in (("benefit", "benefits"), ("nutrition", "nutrition")):
        for f in data.get(key, []):
            pid = f.get("Product ID (keep unchanged)")
            title = f.get("Benefit title") or f.get("Website label")
            if pid and title:
                facts_by[pid].append((kind, to_int(f.get("Display order")) or 1, title, f.get("Description"),
                                      f.get("Source name"), f.get("Source URL"), f.get("Checked date"), f.get("Review status")))

    sql = ["begin;"]
    n_img = 0
    orphans = 0
    seen_ids = []
    img_cache = {}
    fam_members = collections.defaultdict(list)   # family id → [(price, name, product id)]
    for p in prods:
        pid = (p.get("Product ID (keep unchanged)") or "").strip()
        name = (p.get("Product name") or "").strip()
        if not pid or not name:
            continue
        seen_ids.append(pid)
        m = model_by_id.get(pid) or {}
        label = (p.get("Category label") or "").strip()
        code = m.get("category") or label2code.get(label.lower())
        rtype = m.get("type") or ("Dummy" if "dummy" in (p.get("Content status") or "").lower() else "Existing")
        listed = (m.get("visibility") == "Listed") if m else (rtype == "Existing" and bool(p.get("SKU")))
        if not model_by_id:
            listed = rtype == "Existing"
        sku = (p.get("SKU") or m.get("itemNumber") or "").strip() or None
        images = []
        for role, col in (("hero_portrait", "Portrait image URL"), ("landscape_banner", "Landscape image URL"), ("detail", "Detail image URL"), ("size_reference", "Additional main image URL")):
            fid = drive_id(p.get(col))
            if not fid:
                continue
            if fid not in img_cache:
                img_cache[fid] = ensure_photo(fid, a.photos_dir, a.public_dir, a.dry_run)
            r = img_cache[fid]
            if r:
                images.append({"role": role, "src_id": fid, "url": r[0], "url_small": r[1], "w": r[2], "h": r[3],
                               "alt": f"{name} — " + {"hero_portrait": "foto utama", "landscape_banner": "foto suasana", "detail": "detail produk", "size_reference": "referensi ukuran"}[role]})
                n_img += 1
        vs = variants.get(pid, [])
        base = next((v for v in vs if (v.get("Variant type") or "") == "base"), None)
        primary_unit = m.get("primaryUnit") or (base or {}).get("Variant name") or ""
        has_bundles = bool(m.get("hasBundles")) if m else any((v.get("Variant type") or "") == "bundle" for v in vs)
        sheet_price = to_int(p.get("Price (IDR)")) or to_int((base or {}).get("Price (IDR)"))
        barcodes = sorted({(v.get("Base barcode") or v.get("Barcode") or "").strip() for v in vs if (v.get("Variant type") or "") == "base"} - {""})
        if not barcodes and m.get("barcodes"):
            barcodes = [str(b) for b in m["barcodes"]]
        if not sku:
            orphans += 1
        fam_id = (p.get("Product family ID") or "").strip() or None
        if fam_id:
            fam_members[fam_id].append((sheet_price or 10**12, name, pid))
        cols = {
            "product_id": sql_str(pid), "sku": sql_str(sku), "name": sql_str(name), "slug": sql_str(slugify(name)),
            "category_code": sql_str(code), "category_label": sql_str(label or None), "subcategory_code": sql_str(m.get("subcategory") or None),
            "record_type": sql_str(rtype), "listed": "true" if listed else "false",
            "tagline": sql_str(p.get("Tagline") or None), "price_note": sql_str(p.get("Price note") or None),
            "origin": sql_str(p.get("Origin") or None), "weight_contents": sql_str(p.get("Weight / contents") or None),
            "storage": sql_str(p.get("Storage") or None), "notice": sql_str(p.get("Product notice information") or None),
            "story_heading": sql_str(p.get("Story heading") or None), "story_intro": sql_str(p.get("Story introduction") or None),
            "description": sql_str(p.get("Full description") or None), "detail_heading": sql_str(p.get("Detail heading") or None),
            "checkpoints": sql_arr(lines_of(p.get("Checkpoints"))),
            "tip": sql_str(p.get("TBS’ Tip") or p.get("TBS' Tip") or None), "note": sql_str(p.get("TBS Note") or None),
            "content_status": sql_str(p.get("Content status") or None), "copy_review": sql_str(p.get("Copy review") or None),
            "sheet_price": str(sheet_price) if sheet_price else "null", "primary_unit": sql_str(primary_unit or None),
            "has_bundles": "true" if has_bundles else "false", "images": sql_json(images),
            "drive_folder_url": sql_str(p.get("Drive folder URL") or None), "barcodes": sql_arr(barcodes),
            "family_id": sql_str(fam_id), "family_name": sql_str((p.get("Product family name") or "").strip() or None),
            "flavour": sql_str((p.get("Flavour") or "").strip() or None), "family_primary": "false",
            "updated_at": "now()",
        }
        sql.append(f"insert into public.tbs_content_product ({','.join(cols)}) values ({','.join(cols.values())}) "
                   f"on conflict (product_id) do update set " + ",".join(f"{k}=excluded.{k}" for k in cols if k != "product_id") + ";")
        # variants: replace the product's set
        sql.append(f"delete from public.tbs_content_variant where product_id={sql_str(pid)};")
        for v in vs:
            vid = (v.get("Variant ID (keep unchanged)") or "").strip()
            if not vid:
                continue
            sql.append("insert into public.tbs_content_variant (variant_id, product_id, variant_name, variant_type, price, discounted_price, pos_item_number, barcode, base_uom, base_qty, bundle_discount, base_barcode) values ("
                       + ",".join([sql_str(pid + "::" + vid), sql_str(pid), sql_str(v.get("Variant name") or None), sql_str(v.get("Variant type") or None),
                                   str(to_int(v.get("Price (IDR)")) or "null"), str(to_num(v.get("Discounted price (IDR)")) or "null"),
                                   sql_str(v.get("POS Item Number") or None), sql_str(v.get("Barcode") or None), sql_str(v.get("Base UofM") or None),
                                   str(to_int(v.get("Base quantity")) or "null"), str(to_num(v.get("Bundle discount")) or "null"), sql_str(v.get("Base barcode") or None)])
                       + ") on conflict (variant_id) do update set product_id=excluded.product_id, variant_name=excluded.variant_name, variant_type=excluded.variant_type, price=excluded.price, discounted_price=excluded.discounted_price, pos_item_number=excluded.pos_item_number, barcode=excluded.barcode, base_uom=excluded.base_uom, base_qty=excluded.base_qty, bundle_discount=excluded.bundle_discount, base_barcode=excluded.base_barcode, updated_at=now();")
        # recipes: replace the product's set
        sql.append(f"delete from public.tbs_content_recipe where product_id={sql_str(pid)};")
        for i, r in enumerate(sorted(recipes_by.get(pid, []), key=lambda x: to_int(x.get("Display order")) or 99)):
            title = r.get("Recipe title") or ""
            rid_guess = next((rid for rid, (path, desc) in recipe_img.items() if rid.startswith(slugify(title)[:24])), None)
            # the shopping tab keys recipes "<slug>-<hash>"; match by slug prefix + product
            rid = None
            for cand in rs_rows:
                if cand.get("Product ID (keep unchanged)") == pid and (cand.get("Recipe title") or "").strip().lower() == title.strip().lower():
                    rid = cand.get("Recipe ID"); break
            rid = rid or rid_guess or f"{pid}::{slugify(title)}"
            img = recipe_img.get(rid)
            img_url = None
            if img and img[0]:
                base_name = os.path.splitext(os.path.basename(img[0]))[0]
                img_url = f"/tbs/recipes/{slugify(base_name)}.webp"   # files are saved by slug (names carry spaces)
            sql.append("insert into public.tbs_content_recipe (recipe_id, product_id, display_order, title, serving_note, ingredients, steps, tbs_note, source_name, source_url, review_status, image_url, image_alt, shopping, web_visible) values ("
                       + ",".join([sql_str(pid + "::" + rid), sql_str(pid), str(to_int(r.get("Display order")) or i + 1), sql_str(title), sql_str(r.get("Serving note") or None),
                                   sql_arr(lines_of(r.get("Ingredients"))), sql_arr(lines_of(r.get("Steps"))), sql_str(r.get("TBS note") or None),
                                   sql_str(r.get("Source name") or None), sql_str(r.get("Source URL") or None), sql_str(r.get("Review status") or None),
                                   sql_str(img_url), sql_str(img[1] if img else None), sql_json(recipe_shop.get(rid, [])),
                                   "false" if (r.get("Web visibility") or "").strip().lower() == "hidden" else "true"])
                       + ") on conflict (recipe_id) do update set display_order=excluded.display_order, title=excluded.title, serving_note=excluded.serving_note, ingredients=excluded.ingredients, steps=excluded.steps, tbs_note=excluded.tbs_note, source_name=excluded.source_name, source_url=excluded.source_url, review_status=excluded.review_status, image_url=excluded.image_url, image_alt=excluded.image_alt, shopping=excluded.shopping, web_visible=excluded.web_visible, updated_at=now();")
        sql.append(f"delete from public.tbs_content_fact where product_id={sql_str(pid)};")
        for (kind, order, title, desc, sname, surl, chk, rev) in facts_by.get(pid, []):
            sql.append("insert into public.tbs_content_fact (product_id, kind, display_order, title, description, source_name, source_url, checked_date, review_status) values ("
                       + ",".join([sql_str(pid), sql_str(kind), str(order), sql_str(title), sql_str(desc or None), sql_str(sname or None), sql_str(surl or None), sql_str(chk or None), sql_str(rev or None)]) + ");")

    for fid, mem in fam_members.items():
        primary = sorted(mem)[0][2]
        sql.append(f"update public.tbs_content_product set family_primary=(product_id={sql_str(primary)}) where family_id={sql_str(fid)};")
    for (code, name, icon, iid, order, subs) in cat_rows:
        sql.append(f"insert into public.tbs_content_category (code, name, icon, icon_id, display_order, subcategories, updated_at) values ({sql_str(code)},{sql_str(name)},{sql_str(icon)},{sql_str(iid)},{order},{sql_json(subs)},now()) "
                   "on conflict (code) do update set name=excluded.name, icon=excluded.icon, icon_id=excluded.icon_id, display_order=excluded.display_order, subcategories=excluded.subcategories, updated_at=now();")
    for g in data.get("general", []):
        key = (g.get("Block key (keep unchanged)") or "").strip()
        if key:
            sql.append(f"insert into public.tbs_content_block (block_key, section, heading, body, review_status, updated_at) values ({sql_str(key)},{sql_str(g.get('Section'))},{sql_str(g.get('Heading'))},{sql_str(g.get('Text'))},{sql_str(g.get('Review status'))},now()) "
                       "on conflict (block_key) do update set section=excluded.section, heading=excluded.heading, body=excluded.body, review_status=excluded.review_status, updated_at=now();")
    if a.prune and seen_ids:
        sql.append(f"update public.tbs_content_product set listed=false, updated_at=now() where product_id <> all({sql_arr(seen_ids)});")
    n_rec = sum(len(v) for v in recipes_by.values())
    sql.append(f"insert into public.tbs_content_load (source, products, variants, recipes, images, orphans, notes) values ({sql_str(os.path.basename(a.xlsx))},{len(seen_ids)},{sum(len(v) for v in variants.values())},{n_rec},{n_img},{orphans},{sql_str('catalog model: ' + ('yes' if model_by_id else 'no'))});")
    sql.append("commit;")

    # recipe illustrations → public/tbs/recipes
    if a.recipes_dir and not a.dry_run:
        dst = os.path.join(os.path.dirname(a.public_dir), "recipes")
        os.makedirs(dst, exist_ok=True)
        n = 0
        for f in os.listdir(a.recipes_dir):
            src = os.path.join(a.recipes_dir, f)
            if os.path.getsize(src) > 0 and not os.path.exists(os.path.join(dst, f)):
                shutil.copy(src, os.path.join(dst, f)); n += 1
        print("recipe images copied:", n)

    print(f"products {len(seen_ids)}  variants {sum(len(v) for v in variants.values())}  recipes {n_rec}  images {n_img}  sku-less {orphans}  categories {len(cat_rows)}")
    if a.dry_run:
        out = os.path.join(tempfile.gettempdir(), "tbs-content-load.sql")
        open(out, "w").write("\n".join(sql))
        print("dry run — SQL written to", out)
        return
    dburl = a.database_url
    if not dburl:
        for line in open(a.env):
            if line.startswith("DATABASE_URL="):
                dburl = line.split("=", 1)[1].strip().strip('"')
    if not dburl:
        sys.exit("DATABASE_URL missing in " + a.env + " (or pass --database-url)")
    print("target:", re.sub(r"//[^@]*@", "//…@", dburl))
    r = subprocess.run(["psql", dburl, "-v", "ON_ERROR_STOP=1", "-q"], input="\n".join(sql), text=True, capture_output=True)
    if r.returncode != 0:
        print(r.stderr[-3000:], file=sys.stderr); sys.exit("psql failed")
    print("loaded ✔")


if __name__ == "__main__":
    main()
