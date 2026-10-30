# TBS product pages — built 2026-10-28 (design + data + photos)

## What is live in the code now (local, committed on `main`, not yet deployed)

cookiedoh.co.id/tbs now **looks like the ChatGPT version** and runs on our own database.

| Piece | Where |
|---|---|
| Design (header, red nav, catalog, product page, footer) | `web/app/tbs/layout.tsx`, `web/app/tbs/design/Chrome.tsx`, `web/app/tbs/page.tsx`, `web/app/tbs/p/[sku]/page.tsx`; stylesheet vendored from the preview site as `web/app/tbs/tbs-design.css`, scoped so Cookie Doh pages are untouched |
| Product content DB (7 tables) | Supabase `tbs_content_*` — DDL in `web/sql/tbs_content.sql` (already applied) |
| Loader (re-runnable) | `web/scripts/tbs-content-load.py` — keyed on `Product ID (keep unchanged)`; upserts, never deletes |
| Photos | 357 Drive files → `web/public/tbs/products/{l,s}/<driveId>.jpg` (900px / 520px); originals kept outside git in `image-originals-hires/tbs-drive/` |
| Recipe illustrations | `web/public/tbs/recipes/<slug>.webp` (pulled from the preview site) |
| Live price + stock | still from the ERP partner API per store; sheet price only shows when the ERP has no row |
| Bundle rule | `web/lib/tbsBundle.ts`: 5 = 2,5 % off, 10 = 5 % off, rounded DOWN to …000/…500/…800, "Anda Hemat Rp …" |

Loaded 2026-10-28 from the 19:10 sheet: 855 listed products (135 with photos), 2 242 variants, 1 491 recipes, 33 categories, 18 service text blocks.

## 2026-10-30 — product families (one page, several flavours)

The sheet now carries `Product family ID`, `Product family name` and `Flavour`. The loader reads them; nothing to do on your side beyond filling those three columns for the flavours that belong together.

- Catalogue shows **one card per family** (family name, cheapest flavour's price, "2 rasa · Manis · Coklat").
- The product page shows the family name as the title and a **Pilih rasa** picker; each flavour keeps its own barcode, price, photos, story and checkpoints. Live price/stock per flavour from the ERP as usual.
- `Additional main image URL` is now the 4th gallery photo ("referensi ukuran"); recipes marked `Web visibility = Hidden` are no longer shown.
- The loader finds the preview site by itself (newest host in the sheet's `Webpage URL` column), so a ChatGPT re-host needs no flag.

Loaded 2026-10-30 from the 13:57 sheet: 858 listed products / 857 cards, 161 with photos (155 new photos pulled from Drive), 1 337 visible recipes.

## Automatic sync (since 2026-10-30)

Nothing to do: the Claude scheduled task **"TBS shop: sync ChatGPT product sheet"** runs every hour at about :25 and calls `web/scripts/tbs-sync.sh`. When ChatGPT has changed `Total-Buah-Product-Master.xlsx`, it loads the sheet into production (Cloud SQL) and pushes new product photos and recipe pictures to main, which Vercel deploys. Unchanged sheet = no work.

- Runs only while the Claude app is open and the Mac is awake; a missed hour catches up on the next run.
- Result of the last run: `~/.tbs-sync/status`. Full log: `~/.tbs-sync/sync.log`.
- First run 2026-10-30 16:29: 220 recipe pictures added (334 of 338 now live; the other 4 are not on the preview site yet).
- A plain macOS background job cannot do this: macOS blocks background shells from reading `~/Documents`.
- Every run reloads **every** product in the sheet, so edits to existing pages sync too, not only new ones.
- Photos ChatGPT replaces on Drive under the same link are caught by a re-check every 6 hours.
- If ChatGPT adds a sheet column the shop does not understand yet, the run's status says **WARN NEW SHEET COLUMNS** and you get a phone notification. Then ask Claude to map it. (2026-10-30: "Family image URL" was missed this way for about two hours.)
- Not synced: design changes ChatGPT makes only on its preview site, outside the sheet. Those need a code change here.

## When ChatGPT changes the sheet again (manual, only if the hourly sync is off)

Run this (nothing else to do; it downloads any new Drive photos itself):

Production runs on **Cloud SQL** (since 2026-10-28), so load there, through the proxy:

```bash
cloud-sql-proxy --port 5434 tbs-group-500303:asia-southeast2:cookiedoh-db
```

```bash
cd /Users/angeltan/cookie-doh/web && python3 -I scripts/tbs-content-load.py --xlsx "/Users/angeltan/Documents/ChatGPT/totalbuahstore.com/outputs/01a167a8-dad0-72f2-b731-70319217e8fc/Total-Buah-Product-Master.xlsx" --database-url "postgresql://cookiedoh_app:<password from Secret Manager cookiedoh-db-app-password>@127.0.0.1:5434/cookiedoh"
```

Then `git add web/public/tbs && git commit` so the new photos deploy.

## Two things only you can decide

1. **Bundle discount is built but OFF.** The ERP rejects any order whose total is not full catalogue price. The ERP fix is filed at `Kurly x TBS/docs/patches/web-order-bundle-discount-2026-10-28.patch` + `.sql` (adds `web_order.discount`). Once that is deployed, switch it on with one row: `app_settings` key `tbs_bundle_discount` = `true`. Until then bundles show at 5× / 10× the unit price with no saving.
2. **Only ~29 of the 855 products are sellable online.** The ERP's web catalogue (`web_catalog_item`) is the curated top-80 % list; every other product page shows "Belum dapat dipesan online". To sell the whole sheet, the ERP needs rows in `web_catalog_item` for those SKUs — that is an ERP prod write, your call.

## Not in this build
- /admin screen for TBS content (the sheet + loader is the editor for now).
- The "Hemat 10 % pesanan pertama — Ambil Voucher" strip from the design (no such promo exists yet).
- Cookie Doh footer still shows under the TBS footer.

## Integration check (unchanged from 2026-10-27)

CD and TBS are two systems joined by the partner API: two member tables synced one-way hourly, CD stamps and TBS points never convert, TBS till sales never reach CD, orders split only by JSON tags, `orders` create-table not in git, ERP down = TBS shop down. None of it blocked this build; it is the follow-up list.
