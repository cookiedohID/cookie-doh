// web/lib/waBot.ts
//
// The WhatsApp assistant "brain": Claude Haiku + a small set of read-only tools
// scoped to the sender's own number (order status + reward balance), plus a
// human-handoff signal. Manual tool loop, capped. Replies are kept short.
//
// Model: claude-haiku-4-5 (chosen for cost/speed on high-volume FAQ traffic).

import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt } from "@/lib/waKnowledge";
import { loyaltyFromOrders } from "@/lib/loyalty";
import { grantsForPhone } from "@/lib/loyaltyGrants";
import { subscriptionRewardBalance } from "@/lib/subscriptionRewards";
import { phoneSignificant } from "@/lib/phone";

export type WaTurn = { role: "user" | "assistant"; text: string };

export type WaBotResult = {
  configured: boolean; // false when ANTHROPIC_API_KEY is missing
  reply: string | null;
  handoff?: { reason: string };
};

const MODEL = "claude-haiku-4-5";
const MAX_TOOL_ROUNDS = 4;

function idr(n: any) {
  return "Rp" + Math.round(Number(n || 0)).toLocaleString("id-ID");
}

// ── Tool implementations (server-side, scoped to the sender's phone) ────────

async function lookupMyOrders(supa: any, phone: string): Promise<string> {
  const sig = phoneSignificant(phone);
  if (!sig) return "No recent orders found for this number.";
  const { data } = await supa
    .from("orders")
    .select("order_no, fulfilment_status, payment_status, total_idr, created_at, tracking_url, meta, items_json, accepted_at")
    .ilike("customer_phone", `%${sig}%`)
    .order("created_at", { ascending: false })
    .limit(20);
  // ilike is a loose prefilter; require an exact significant-digit match.
  const mine = (data || []).filter((o: any) => phoneSignificant(o?.customer_phone) === sig).slice(0, 3);
  if (!mine.length) return "No recent orders found for this number.";

  return mine
    .map((o: any) => {
      const ref = o?.order_no ? `#${o.order_no}` : "(order)";
      const paid = String(o?.payment_status).toUpperCase() === "PAID";
      const track = o?.tracking_url || o?.meta?.tracking_url || "";
      let stage = "Pending payment";
      if (paid) stage = track ? "On its way" : o?.accepted_at ? "Accepted, preparing" : "Paid, awaiting prep";
      const when = o?.created_at ? new Date(o.created_at).toISOString().slice(0, 10) : "";
      return [
        `${ref} — ${stage}${o?.fulfilment_status ? ` (${o.fulfilment_status})` : ""} — ${idr(o?.total_idr)}${when ? ` — ${when}` : ""}`,
        track ? `  tracking: ${track}` : "",
      ].filter(Boolean).join("\n");
    })
    .join("\n");
}

async function lookupMyRewards(supa: any, phone: string): Promise<string> {
  const sig = phoneSignificant(phone);
  if (!sig) return "No reward history for this number yet.";
  const { data } = await supa
    .from("orders")
    .select("payment_status, items_json, customer_phone")
    .ilike("customer_phone", `%${sig}%`)
    .limit(1000);
  const mine = (data || []).filter((o: any) => phoneSignificant(o?.customer_phone) === sig);
  const grant = await grantsForPhone(supa, phone);
  const loyalty = loyaltyFromOrders(mine, grant);
  const sub = await subscriptionRewardBalance(supa, phone);
  return [
    `Free cookies available (buy-10): ${loyalty.freeCookies}`,
    `Free drinks available (buy-10): ${loyalty.freeDrinks}`,
    `Cookie stamps toward next free: ${loyalty.cookieStamps}/10`,
    `Drink stamps toward next free: ${loyalty.drinkStamps}/10`,
    `Subscription reward cookies available (buy-6): ${sub.available}`,
  ].join("\n");
}

const TOOLS: Anthropic.Tool[] = [
  {
    name: "lookup_my_orders",
    description:
      "Look up THIS customer's recent orders (status + tracking link) by their WhatsApp number. Use when they ask about their order, delivery, or tracking. No input needed.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "lookup_my_rewards",
    description:
      "Look up THIS customer's reward balance — free cookies/drinks from the buy-10 loyalty, stamp progress, and subscription buy-6 reward cookies. Use when they ask how many free cookies / points / rewards they have. No input needed.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "request_human",
    description:
      "Escalate to a human teammate. Use when the request needs a person: complaints, refunds, changing/cancelling a paid order, wholesale/custom/event orders, allergy-critical questions, anything you can't answer from your knowledge, or when the customer asks to talk to a human.",
    input_schema: {
      type: "object",
      properties: { reason: { type: "string", description: "One short line on what the customer needs." } },
      required: ["reason"],
      additionalProperties: false,
    },
  },
];

async function runTool(name: string, input: any, supa: any, phone: string): Promise<string> {
  if (name === "lookup_my_orders") return lookupMyOrders(supa, phone);
  if (name === "lookup_my_rewards") return lookupMyRewards(supa, phone);
  if (name === "request_human") return "Escalation noted — a teammate will follow up shortly.";
  return "Unknown tool.";
}

// Run one inbound message through the assistant. `history` is prior turns
// (oldest→newest), NOT including the current message.
export async function runWaBot(opts: {
  supa: any;
  phone: string;
  text: string;
  history: WaTurn[];
}): Promise<WaBotResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { configured: false, reply: null };

  const client = new Anthropic({ apiKey });

  const messages: Anthropic.MessageParam[] = [
    ...opts.history.map((t) => ({ role: t.role, content: t.text } as Anthropic.MessageParam)),
    { role: "user", content: opts.text },
  ];

  let handoff: { reason: string } | undefined;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 500,
      system: [{ type: "text", text: buildSystemPrompt(), cache_control: { type: "ephemeral" } }],
      tools: TOOLS,
      messages,
    });

    const toolUses = resp.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");

    if (resp.stop_reason !== "tool_use" || toolUses.length === 0) {
      const reply = resp.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();
      return { configured: true, reply: reply || null, handoff };
    }

    // Execute tools, collect results.
    messages.push({ role: "assistant", content: resp.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      if (tu.name === "request_human") {
        const reason = String((tu.input as any)?.reason || "Customer needs help");
        handoff = { reason };
      }
      const out = await runTool(tu.name, tu.input, opts.supa, opts.phone);
      results.push({ type: "tool_result", tool_use_id: tu.id, content: out });
    }
    messages.push({ role: "user", content: results });
  }

  // Exhausted tool rounds without a final text — fall back to handoff.
  return {
    configured: true,
    reply: null,
    handoff: handoff || { reason: "Conversation needs a teammate." },
  };
}
