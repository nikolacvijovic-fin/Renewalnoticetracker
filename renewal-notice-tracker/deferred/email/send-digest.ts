import { Resend } from "resend";
import { env } from "@/lib/env";
import { LEGAL_DISCLAIMER } from "@/lib/constants";

const resend = new Resend(env.RESEND_API_KEY);

export async function sendMonthlyDigestEmail(params: {
  recipientEmail: string;
  organizationName: string;
  summary: string[];
  contractsUrl: string;
}) {
  return resend.emails.send({
    from: env.RESEND_FROM_EMAIL,
    to: params.recipientEmail,
    subject: `Monthly digest for ${params.organizationName}`,
    html: `
      <div style="font-family: Arial, sans-serif; color: #132238;">
        <h2>${params.organizationName} monthly digest</h2>
        <ul>${params.summary.map((line) => `<li>${line}</li>`).join("")}</ul>
        <p><a href="${params.contractsUrl}">Open contracts dashboard</a></p>
        <p style="font-size: 12px; color: #52606d;">${LEGAL_DISCLAIMER}</p>
      </div>
    `
  });
}
