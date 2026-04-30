// app/api/cart/add/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST(req: Request) {
  const body = await req.json(); // { product_id, qty, ... }
  const cookieStore = cookies();

  let refCtx: any = null;
  const raw = cookieStore.get("ref_ctx")?.value;
  if (raw) { try { refCtx = JSON.parse(raw); } catch {} }

  // attach referral only if the same product
  const meta = { ...(body.meta || {}) };
  if (refCtx && refCtx.product_id === body.product_id) {
    meta.referral_id = refCtx.referral_id;
    meta.influencer_id = refCtx.influencer_id;
    meta.attributed_by = "link"; // matches your order_attributions constraint
  }

  // TODO: write your existing cart storage with this `meta` on the line
  // e.g. await cartRepo.add({ product_id: body.product_id, qty: body.qty, meta });

  return NextResponse.json({ ok: true });
}
