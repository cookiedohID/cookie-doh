function getEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export type CreateBiteshipOrderInput = {
  external_id: string; // midtrans_order_id
  destination_address: string;
  destination_contact_name: string;
  destination_contact_phone: string;

  destination_postal_code?: number | null; // from orders.postal
  destination_area_id?: string | null; // from orders.destination_area_id (optional but ok)

  courier_company: string; // required by order API
  courier_type: string; // required by order API

  items: Array<{
    name: string;
    description?: string;
    quantity: number;
    value: number;
    weight: number; // grams
  }>;

  order_note?: string | null; // from orders.notes
};

export async function createBiteshipOrder(input: CreateBiteshipOrderInput) {
  const apiKey = getEnv("BITESHIP_API_KEY");

  const origin_postal_code = Number(getEnv("BITESHIP_ORIGIN_POSTAL_CODE"));
  if (!origin_postal_code || Number.isNaN(origin_postal_code)) {
    throw new Error("Invalid BITESHIP_ORIGIN_POSTAL_CODE");
  }

  const origin_address = getEnv("BITESHIP_ORIGIN_ADDRESS");
  const origin_contact_name = getEnv("BITESHIP_ORIGIN_CONTACT_NAME");
  const origin_contact_phone = getEnv("BITESHIP_ORIGIN_CONTACT_PHONE");
  const origin_note = process.env.BITESHIP_ORIGIN_NOTE ?? "";

  const shipper_contact_name = process.env.BITESHIP_SHIPPER_NAME ?? origin_contact_name;
  const shipper_contact_phone = process.env.BITESHIP_SHIPPER_PHONE ?? origin_contact_phone;
  const shipper_contact_email = process.env.BITESHIP_SHIPPER_EMAIL ?? undefined;
  const shipper_organization = process.env.BITESHIP_SHIPPER_ORG ?? "Cookie Doh";

  const payload: any = {
    // shipper
    shipper_contact_name,
    shipper_contact_phone,
    shipper_organization,
    ...(shipper_contact_email ? { shipper_contact_email } : {}),

    // origin
    origin_contact_name,
    origin_contact_phone,
    origin_address,
    origin_note,
    origin_postal_code,

    // destination
    destination_contact_name: input.destination_contact_name,
    destination_contact_phone: input.destination_contact_phone,
    destination_address: input.destination_address,

    ...(input.destination_postal_code
      ? { destination_postal_code: Number(input.destination_postal_code) }
      : {}),
    ...(input.destination_area_id ? { destination_area_id: input.destination_area_id } : {}),

    // courier (required)
    courier_company: input.courier_company,
    courier_type: input.courier_type,

    // delivery type
    delivery_type: "now",

    // note
    order_note: input.order_note ?? "",

    // items
    items: input.items,
  };

  const res = await fetch("https://api.biteship.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(
      `Biteship create order failed (${res.status}): ${data?.error ?? JSON.stringify(data)}`
    );
  }

  return data;
}
