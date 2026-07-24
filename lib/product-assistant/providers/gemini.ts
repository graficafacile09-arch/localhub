const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export async function callGeminiGeneration(
  apiKey: string,
  model: string,
  prompt: string,
  imageBase64: string,
  mime: string
) {
  const url = `${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`;

  const body = JSON.stringify({
    contents: [
      {
        parts: [
          { text: prompt },
          { inlineData: { mimeType: mime, data: imageBase64 } },
        ],
      },
    ],
    generationConfig: {
      maxOutputTokens: 300,
      temperature: 0.1,
    },
  });

  const tStart = performance.now();
  const bodySize = new Blob([body]).size;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  const tHeaders = performance.now();
  const status = response.status;
  const rawBody = await response.text();
  const tBody = performance.now();

  return {
    status,
    rawBody,
    bodySize,
    latencyHeaders: tHeaders - tStart,
    latencyBody: tBody - tHeaders,
    tBody,
  };
}
