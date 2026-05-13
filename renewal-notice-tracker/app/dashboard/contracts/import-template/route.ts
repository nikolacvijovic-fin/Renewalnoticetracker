import { NextResponse } from "next/server";

const TEMPLATE = [
  "contract_title,counterparty_name,notice_deadline_date,renewal_date,expiration_date,termination_window,auto_renewal_flag,owner_email,recipient_emails",
  "MSA with Acme,Acme,2026-12-01,2026-12-31,2026-12-31,30 days,true,owner@example.com,ops@example.com"
].join("\n");

export async function GET() {
  return new NextResponse(TEMPLATE, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename=\"renewal-import-template.csv\"'
    }
  });
}
