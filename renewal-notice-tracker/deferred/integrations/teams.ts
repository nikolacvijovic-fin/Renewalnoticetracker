export async function sendTeamsMessage(params: {
  webhookUrl: string;
  fallbackChannel?: string | null;
  title: string;
  body: string;
  contractUrl: string;
}) {
  const payload = {
    "@type": "MessageCard",
    "@context": "https://schema.org/extensions",
    summary: params.title,
    title: params.title,
    text: `${params.body}<br/><a href="${params.contractUrl}">Open contract</a>`,
    themeColor: "2f493f"
  };

  const response = await fetch(params.webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Teams webhook failed with status ${response.status}`);
  }

  return {
    id: null,
    destination: params.fallbackChannel ?? "default",
    payload
  };
}
