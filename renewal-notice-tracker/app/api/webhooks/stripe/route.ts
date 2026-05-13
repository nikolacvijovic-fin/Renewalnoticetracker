import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Legacy billing webhook disabled in shipped-first runtime." },
    { status: 410 }
  );
}
