import { NextResponse } from "next/server";
import { handleWebhook } from "@/lib/billing/provider";
import { persistBillingWebhookUpdate } from "@/lib/billing/service";

export async function POST(request: Request) {
  const body = await request.text();

  try {
    const result = await handleWebhook("paddle", { body, headers: request.headers });
    await persistBillingWebhookUpdate(result);
    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json({ error: "Invalid webhook" }, { status: 400 });
  }
}
