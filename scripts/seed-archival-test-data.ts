import crypto from "crypto";
import { Knex } from "knex";
import { db, destroyAll } from "../src/lib/knex/knex.ts";

// Plain knex script, no HTTP calls — 5,000 orders through the real API
// would be far too slow and need real core-service branches/customers.
// orders.restaurant_id/branch_id/customer_id/customer_address_id/
// delivery_agent_id have no FK constraints (core-owned, cross-service —
// just NOT NULL), so fabricated numeric ids are safe to insert directly.
const CHUNK_SIZE = 500;

function argValue(flag: string, fallback: string): string {
  const found = process.argv.find((a) => a.startsWith(`--${flag}=`));
  return found ? found.split("=")[1] : fallback;
}

const region = argValue("region", "eg");
const count = Number(argValue("count", "5000"));

// Fixed test identities — matches the customer/branch/agent already used
// throughout this project's manual test flows, so the verification step
// (GET /customer/orders?year=<prior>) has a known customer to query.
const CUSTOMER_ID = 9;
const RESTAURANT_ID = 5;
const BRANCH_ID = 15;
const CUSTOMER_ADDRESS_ID = 6;
const AGENT_ID = 12;
const PRODUCT_ID = 3;

async function insertChunked(
  conn: Knex,
  table: string,
  rows: object[],
): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    await conn(table).insert(rows.slice(i, i + CHUNK_SIZE));
  }
}

async function insertChunkedReturning<R>(
  conn: Knex,
  table: string,
  rows: object[],
  returning: string[],
): Promise<R[]> {
  const result: R[] = [];
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const inserted = await conn(table)
      .insert(rows.slice(i, i + CHUNK_SIZE))
      .returning(returning);
    result.push(...(inserted as R[]));
  }
  return result;
}

function isoAt(year: number, dayOffset: number): string {
  const d = new Date(Date.UTC(year, 0, 1, 12));
  d.setUTCDate(d.getUTCDate() + dayOffset);
  return d.toISOString();
}

interface InsertedOrder {
  id: number;
  order_id: number;
  created_at: string;
  payment_method: string;
}

async function seed(): Promise<void> {
  const conn = db(region);
  const currentYear = new Date().getUTCFullYear();
  const priorYear = currentYear - 1;

  console.log(
    `[seed] region=${region} count=${count} priorYear=${priorYear} currentYear=${currentYear}`,
  );

  const orderRows = Array.from({ length: count }, (_, i) => {
    const isPrior = i % 2 === 0;
    const year = isPrior ? priorYear : currentYear;
    const createdAt = isoAt(year, i % 300);
    const paymentMethod = i % 2 === 0 ? "online" : "cod";
    return {
      region,
      public_id: crypto.randomUUID(),
      country_code: region.toUpperCase(),
      restaurant_id: RESTAURANT_ID,
      branch_id: BRANCH_ID,
      customer_id: CUSTOMER_ID,
      customer_address_id: CUSTOMER_ADDRESS_ID,
      delivery_lat: 30.06,
      delivery_lng: 31.24,
      delivery_address_text_snapshot: "Seed Address, Cairo, EG",
      status: "delivered",
      subtotal: 250,
      delivery_fee: 1500,
      service_fee: 0,
      total: 1750,
      commission: 150,
      currency: "EGP",
      payment_method: paymentMethod,
      delivery_agent_id: AGENT_ID,
      created_at: createdAt,
      updated_at: createdAt,
      delivered_at: createdAt,
    };
  });

  const insertedOrders = await insertChunkedReturning<{
    id: number;
    created_at: string;
    payment_method: string;
  }>(conn, "orders", orderRows, ["id", "created_at", "payment_method"]);
  console.log(`[seed] orders inserted: ${insertedOrders.length}`);

  const itemRows = insertedOrders.map((o) => ({
    region,
    order_id: o.id,
    product_id: PRODUCT_ID,
    quantity: 1,
    unit_price_snapshot: 250,
    name_snapshot: "Seed Burger",
    image_url_snapshot: null,
    line_total: 250,
    created_at: o.created_at,
  }));
  await insertChunked(conn, "order_items", itemRows);
  console.log(`[seed] order_items inserted: ${itemRows.length}`);

  const txRows = insertedOrders.map((o) => ({
    region,
    order_id: o.id,
    transaction_type: "charge",
    method: o.payment_method === "online" ? "online" : "cod",
    provider_id: o.payment_method === "online" ? 1 : 2,
    status: "succeeded",
    amount: 1750,
    currency: "EGP",
    src_acc_id: CUSTOMER_ID,
    dst_acc_id: null,
    idempotency_key: `seed-charge-${o.id}`,
    created_at: o.created_at,
    updated_at: o.created_at,
  }));
  await insertChunked(conn, "transactions", txRows);
  console.log(`[seed] transactions inserted: ${txRows.length}`);

  const sessionRows = insertedOrders
    .filter((o) => o.payment_method === "online")
    .map((o) => ({
      region,
      order_id: o.id,
      provider_id: 1,
      provider_session_id: `seed-session-${o.id}`,
      redirect_url: "https://example.com",
      amount: 1750,
      currency: "EGP",
      status: "captured",
      raw_init_payload: JSON.stringify({}),
      created_at: o.created_at,
      updated_at: o.created_at,
    }));
  await insertChunked(conn, "payment_sessions", sessionRows);
  console.log(`[seed] payment_sessions inserted: ${sessionRows.length}`);

  const deliveryRows = insertedOrders.map((o) => ({
    region,
    order_id: o.id,
    agent_id: AGENT_ID,
    status: "delivered",
    pickup_lat: 30.05,
    pickup_lng: 31.23,
    dropoff_lat: 30.06,
    dropoff_lng: 31.24,
    distance_meters: 1000,
    earning_amount: 1200,
    currency: "EGP",
    assigned_at: o.created_at,
    delivered_at: o.created_at,
  }));
  const insertedDeliveries = await insertChunkedReturning<{
    id: number;
    order_id: number;
  }>(conn, "deliveries", deliveryRows, ["id", "order_id"]);
  console.log(`[seed] deliveries inserted: ${insertedDeliveries.length}`);

  const createdAtByOrderId = new Map(
    insertedOrders.map((o) => [o.id, o.created_at]),
  );
  const earningRows = insertedDeliveries.map((d) => ({
    region,
    agent_id: AGENT_ID,
    order_id: d.order_id,
    delivery_id: d.id,
    amount: 1200,
    currency: "EGP",
    earned_at: createdAtByOrderId.get(d.order_id),
  }));
  await insertChunked(conn, "agent_earnings", earningRows);
  console.log(`[seed] agent_earnings inserted: ${earningRows.length}`);

  const webhookCount = 200;
  const webhookRows = Array.from({ length: webhookCount }, (_, i) => {
    const isPrior = i % 2 === 0;
    const year = isPrior ? priorYear : currentYear;
    return {
      region,
      provider_id: 1,
      provider_event_id: `seed-evt-${region}-${crypto.randomUUID()}`,
      signature: "seed",
      payload: JSON.stringify({}),
      received_at: isoAt(year, i % 300),
    };
  });
  await insertChunked(conn, "payment_webhook_events", webhookRows);
  console.log(`[seed] payment_webhook_events inserted: ${webhookRows.length}`);

  console.log("[seed] done");
}

seed()
  .then(async () => {
    await destroyAll();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("[seed] failed:", err);
    await destroyAll().catch(() => {});
    process.exit(1);
  });
