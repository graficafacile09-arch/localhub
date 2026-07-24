import { NextResponse } from "next/server";

const MODEL = "@cf/google/gemma-4-26b-a4b-it";

export async function POST(request: Request) {
  console.log("=== ROUTE START MINIMA ===");

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !apiToken) {
    return NextResponse.json({ error: "Cloudflare non configurato" }, { status: 500 });
  }

  const formData = await request.formData();
  const file = formData.get("image");
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "Immagine mancante" }, { status: 422 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const filename = file instanceof File ? file.name : "product-image.jpg";
  const ext = filename.toLowerCase().split(".").pop() ?? "jpg";
  const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  const base64 = buffer.toString("base64");

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`;

  const cfResponse = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Descrivi questo prodotto in italiano. Restituisci solo JSON con: nome, categoria, descrizione, prezzo_suggerito, parole_chiave, confidenza.",
            },
            {
              type: "image_url",
              image_url: { url: `data:${mime};base64,${base64}` },
            },
          ],
        },
      ],
      max_tokens: 2000,
      temperature: 0.1,
    }),
  });

  const status = cfResponse.status;
  const body = await cfResponse.text();

  if (!cfResponse.ok) {
    return NextResponse.json({ success: false, status, body }, { status });
  }

  const json = JSON.parse(body);
  const content = (json.choices?.[0]?.message?.content ?? "")
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const parsed = JSON.parse(content);

  return NextResponse.json(parsed);
}
