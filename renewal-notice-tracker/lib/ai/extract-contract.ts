import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { getAppConfig } from "@/lib/config";
import { extractedFieldSchema, computeNeedsReview } from "@/lib/validation/contract";

function getOpenAIClient() {
  return new OpenAI({ apiKey: getAppConfig().ai.openaiApiKey });
}

export async function extractContractMetadata(documentText: string) {
  const openai = getOpenAIClient();
  const config = getAppConfig();
  const response = await openai.beta.chat.completions.parse({
    model: config.ai.openaiModel,
    temperature: 0,
    response_format: zodResponseFormat(extractedFieldSchema, "contract_metadata"),
    messages: [
      {
        role: "system",
        content:
          "You extract contract renewal metadata. Never fabricate values. Unsupported or unclear fields must be null. Capture short evidence snippets grounded in the text. Reminder suggestions must be operational and not legal advice."
      },
      {
        role: "user",
        content: [
          "Extract the document into the schema.",
          "Only include renewal, notice, termination, governing law, and payment timing details when supported by the text.",
          "If a field is missing or uncertain, return null and lower confidence.",
          documentText.slice(0, 15000)
        ].join("\n\n")
      }
    ]
  });

  const parsed = response.choices[0]?.message.parsed;
  if (!parsed) {
    throw new Error("OpenAI did not return structured extraction output.");
  }

  return {
    ...parsed,
    needs_review: computeNeedsReview(parsed)
  };
}
