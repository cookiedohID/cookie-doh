# Cookie Doh — Print Agent

A tiny program that runs on the **counter PC** (the one with the 3 USB thermal
printers). It polls the cloud every few seconds for **paid cafe orders that
haven't printed yet** and prints the three docs to their printers, then marks the
order printed:

- **Receipt** → receipt printer
- **Item stickers** (one per unit) → label/sticker printer
- **Drink recipes** (one per drink variety) → recipe printer

Because the agent reacts to *payment confirmed* (not to a button in a browser),
it prints whether the customer paid at the counter **or on their own phone**.

---

## 1. Cloud side (once)
Set a shared secret on the web app (Vercel env), then run the SQL:

- Env var **`PRINT_AGENT_TOKEN`** = a long random string (e.g. `openssl rand -hex 24`).
- Run **`web/sql/print_queue.sql`** in Supabase (adds `orders.printed_at`).

## 2. Install on the counter PC
1. Install **Node.js 18+** (https://nodejs.org).
2. Copy this `print-agent/` folder onto the PC.
3. In a terminal in that folder:
   ```
   npm install
   cp config.example.json config.json
   ```
4. Edit **`config.json`**:
   - `serverUrl` → your live site, e.g. `https://cookiedoh.id`
   - `token` → the **same** value as `PRINT_AGENT_TOKEN`
   - `printers.*` → how to reach each printer (see below)

### Printer interface strings
Set each of `receipt` / `stickers` / `recipe` to one of:
| Connection | Value | Notes |
|---|---|---|
| **Network / Wi-Fi** | `tcp://192.168.1.50` | Easiest & most reliable. No drivers. Find the printer's IP in its self-test. |
| **OS printer (USB)** | `printer:EXACT OS PRINTER NAME` | Uses the installed Windows/Mac printer. Needs the extra package below. |
| **Linux raw USB** | `/dev/usb/lp0` | If the PC is Linux. |

> **USB note:** to use `printer:NAME` you must also install the OS-printer bridge:
> `npm install @thiagoelg/node-printer`. If a printer fights the raw USB driver on
> Windows, the simplest fix is to use a **network-capable** thermal printer and the
> `tcp://` form instead — no driver wrangling.

If your printers aren't all EPSON-compatible ESC/POS, change `printerType`
(`EPSON` or `STAR`). The **Clabel** label printer: if it speaks ESC/POS it works as
`EPSON`; if it uses a label language (TSPL/ZPL), tell me and I'll add a driver for it.

## 3. Test the wiring (no payment)
```
node index.js --test
```
Sends a sample order (2 cookies incl. 1 free + 1 drink) to all three printers so
you can confirm each prints and calibrate paper/label size. Re-run as needed.

## 4. Run it for real
```
npm start
```
Leave it running. Place a test cafe order, pay it, and within a few seconds all
three docs should print. To auto-start on boot, use **Task Scheduler** (Windows),
a **launchd** plist (Mac), or **pm2** (`npm i -g pm2 && pm2 start index.js --name print-agent && pm2 save`).

## Troubleshooting
- **Nothing prints:** check `npm start` logs. "poll failed" = wrong `serverUrl`/`token`
  or no internet. "print failed" = printer unreachable (wrong interface string).
- **Only some printers work:** each is independent — fix that one's interface string.
- **Duplicate prints:** the agent only acks after all 3 succeed; if one printer
  errored, the order retries next poll. Fix the failing printer.
- **Wrong sizing on labels:** that's printer calibration — adjust label size /
  density in the printer's own utility, then `node index.js --test` again.
