import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Monthly digest is deferred from shipped-first runtime." },
    { status: 410 }
  );
}
