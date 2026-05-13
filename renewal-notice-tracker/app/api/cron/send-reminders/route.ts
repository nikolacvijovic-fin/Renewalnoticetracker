import { NextResponse } from "next/server";
import { addMinutes } from "date-fns";
import { env } from "@/lib/env";
import { processDueReminders } from "@/lib/notifications/reminders";

export async function POST(request: Request) {
  if (request.headers.get("x-cron-secret") !== env.CRON_SHARED_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const until = addMinutes(new Date(), 15).toISOString();
    const results = await processDueReminders(until);
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ error: "Reminder processing failed." }, { status: 500 });
  }
}
