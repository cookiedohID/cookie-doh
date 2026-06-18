// Cookie Doh — local print agent
//
// Runs on the counter PC that has the 3 USB thermal printers attached. Every few
// seconds it asks the cloud for PAID cafe orders that haven't printed yet, prints
// the 3 docs to their printers, then marks each order printed. Print-on-payment
// works no matter where the customer paid (counter device or their own phone).
//
// Setup: see README.md.  Run: npm start

const fs = require("fs");
const path = require("path");
const { ThermalPrinter, PrinterTypes } = require("node-thermal-printer");

// ---- config -------------------------------------------------------------
const CONFIG_PATH = process.env.PRINT_AGENT_CONFIG || path.join(__dirname, "config.json");
if (!fs.existsSync(CONFIG_PATH)) {
  console.error(`✗ Missing config file: ${CONFIG_PATH}`);
  console.error("  Copy config.example.json → config.json and fill it in.");
  process.exit(1);
}
const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));

const SERVER = String(cfg.serverUrl || "").replace(/\/+$/, "");
const TOKEN = String(cfg.token || "");
const POLL_MS = Math.max(2, Number(cfg.pollSeconds) || 4) * 1000;
const TYPE = PrinterTypes[cfg.printerType] || PrinterTypes.EPSON;
const PRINTERS = cfg.printers || {};

if (!SERVER || !TOKEN) {
  console.error("✗ config.serverUrl and config.token are required.");
  process.exit(1);
}

// ---- helpers ------------------------------------------------------------
const formatIDR = (n) => `Rp ${Number(n || 0).toLocaleString("id-ID")}`;

function newPrinter(iface) {
  if (!iface) return null;
  return new ThermalPrinter({ type: TYPE, interface: iface, options: { timeout: 5000 } });
}

// ---- the three documents -----------------------------------------------
async function printReceipt(order) {
  const p = newPrinter(PRINTERS.receipt);
  if (!p) return;
  p.alignCenter();
  p.bold(true); p.setTextSize(1, 1); p.println("COOKIE DOH"); p.setTextNormal(); p.bold(false);
  p.println("where the cookie magic happens");
  p.drawLine();
  p.alignLeft();
  p.println(`Order: ${order.orderNo}`);
  p.println(new Date(order.paidAt || Date.now()).toLocaleString("id-ID"));
  p.drawLine();
  for (const l of order.lines) {
    p.leftRight(`${l.qty}x ${l.name}`, l.free ? "FREE" : formatIDR(l.price * l.qty));
  }
  p.drawLine();
  p.bold(true); p.leftRight("TOTAL", formatIDR(order.total)); p.bold(false);
  p.newLine();
  p.alignCenter(); p.println("Thank you :)");
  p.cut();
  await p.execute();
}

// One sticker per UNIT (so each cookie/drink gets its own label).
async function printStickers(order) {
  const p = newPrinter(PRINTERS.stickers);
  if (!p) return;
  let printed = 0;
  for (const l of order.lines) {
    for (let i = 0; i < l.qty; i++) {
      p.alignCenter();
      p.bold(true); p.setTextSize(1, 1); p.println(l.name); p.setTextNormal(); p.bold(false);
      p.println(`Order ${order.orderNo}`);
      p.cut(); // one label per unit
      printed++;
    }
  }
  if (printed) await p.execute();
}

// One recipe per DRINK variety, with its make-quantity + ingredients.
async function printRecipes(order) {
  const drinks = (order.lines || []).filter((l) => l.kind === "drink");
  if (!drinks.length) return;
  const p = newPrinter(PRINTERS.recipe);
  if (!p) return;
  for (const l of drinks) {
    p.alignLeft();
    p.bold(true); p.setTextSize(1, 1); p.println(`${l.name} x${l.qty}`); p.setTextNormal(); p.bold(false);
    p.println(`Order ${order.orderNo} - make ${l.qty}`);
    p.drawLine();
    for (const ing of l.ingredients || []) p.println(`- ${ing}`);
    p.cut();
  }
  await p.execute();
}

// ---- queue ---------------------------------------------------------------
async function fetchQueue() {
  const res = await fetch(`${SERVER}/api/cafe/print-queue`, {
    headers: { "x-print-agent-token": TOKEN },
  });
  if (!res.ok) throw new Error(`queue HTTP ${res.status}`);
  const j = await res.json();
  return Array.isArray(j?.orders) ? j.orders : [];
}

async function ack(id) {
  const res = await fetch(`${SERVER}/api/cafe/print-queue`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-print-agent-token": TOKEN },
    body: JSON.stringify({ id }),
  });
  if (!res.ok) throw new Error(`ack HTTP ${res.status}`);
}

async function processOrder(order) {
  // Print all three before acking. If any printer throws, we DON'T ack, so the
  // order is retried on the next poll (a rare duplicate beats a missed ticket).
  await printReceipt(order);
  await printStickers(order);
  await printRecipes(order);
  await ack(order.id);
  console.log(`✓ printed ${order.orderNo} (${order.lines.length} lines)`);
}

async function tick() {
  let orders;
  try {
    orders = await fetchQueue();
  } catch (e) {
    console.error("• poll failed:", e.message);
    return;
  }
  for (const o of orders) {
    try {
      await processOrder(o);
    } catch (e) {
      console.error(`✗ print failed for ${o.orderNo}:`, e.message, "(will retry)");
    }
  }
}

// ---- test mode -----------------------------------------------------------
// `node index.js --test` prints a sample order to all 3 printers (no payment,
// no server) so you can verify wiring + calibrate the printers on-site.
const SAMPLE_ORDER = {
  id: "test",
  orderNo: "TEST-PRINT",
  total: 32500 * 2 + 39000,
  paidAt: null,
  lines: [
    { id: "the-one", name: "The One", kind: "cookie", qty: 2, price: 32500, free: false, ingredients: [] },
    { id: "ruby-glow", name: "Ruby Glow", kind: "drink", qty: 1, price: 39000, free: false, ingredients: ["Plain yoghurt base", "Strawberry", "Dragon fruit", "Honey"] },
    { id: "the-one", name: "The One", kind: "cookie", qty: 1, price: 32500, free: true, ingredients: [] },
  ],
};

async function runTest() {
  console.log("Test print → sending a sample order to all 3 printers…");
  try {
    await printReceipt(SAMPLE_ORDER);
    await printStickers(SAMPLE_ORDER);
    await printRecipes(SAMPLE_ORDER);
    console.log("✓ test print sent. Check the three printers.");
  } catch (e) {
    console.error("✗ test print failed:", e.message);
    process.exit(1);
  }
}

if (process.argv.includes("--test")) {
  runTest();
} else {
  console.log(`Cookie Doh print agent → ${SERVER} (every ${POLL_MS / 1000}s)`);
  console.log(`  receipt:  ${PRINTERS.receipt || "(none)"}`);
  console.log(`  stickers: ${PRINTERS.stickers || "(none)"}`);
  console.log(`  recipe:   ${PRINTERS.recipe || "(none)"}`);
  tick();
  setInterval(tick, POLL_MS);
}
