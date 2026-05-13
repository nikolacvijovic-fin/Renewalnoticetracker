export async function sendSlackMessage(params: {
  webhookUrl: string;
  channel?: string | null;
  fallbackChannel?: string | null;
  title: string;
  body: string;
  contractUrl: string;
}) {
  const payload = {
    text: `${params.title}\n${params.body}\n${params.contractUrl}`,
    channel: params.channel ?? params.fallbackChannel ?? undefined
  };

  const response = await fetch(params.webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Slack webhook failed with status ${response.status}`);
  }

  return {
    id: null,
    destination: payload.channel ?? "default",
    payload
  };
}
