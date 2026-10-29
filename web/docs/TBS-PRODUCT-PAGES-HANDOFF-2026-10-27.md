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

## When ChatGPT changes the sheet again

Run this (nothing else to do; it downloads any new Drive photos itself):

```bash
cd /Users/angeltan/cookie-doh/web && python3 -I scripts/tbs-content-load.py --xlsx "/Users/angeltan/Documents/ChatGPT/totalbuahstore.com/outputs/01a167a8-dad0-72f2-b731-70319217e8fc/Total-Buah-Product-Master.xlsx"
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
