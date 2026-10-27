// The AI cartoon step: one OpenRouter image call. Used by the dev-server plugin
// (cartoon-api.ts) and the Vercel Function (../../api/cartoon.ts); the key never
// reaches the browser.

export const DEFAULT_MODEL = "google/gemini-3.1-flash-image";

export const CARTOON_PROMPT =
  "Redraw this picture as a flat cartoon sticker for a multi-colour 3D print: " +
  "bold black outlines, at most 5 flat solid colours, no gradients, no shading, no texture, " +
  "no text, the subject only on a plain pure white background, same pose and framing.";

/** An OpenRouter error, with its HTTP status (402 means the key's credit limit is used up). */
export class OpenRouterError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function cartoonize(image: string, key: string, model = DEFAULT_MODEL): Promise<string> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Title": "Clicker Studio" },
    body: JSON.stringify({
      model,
      modalities: ["image", "text"],
      messages: [{ role: "user", content: [{ type: "text", text: CARTOON_PROMPT }, { type: "image_url", image_url: { url: image } }] }],
    }),
  });
  const body = (await res.json()) as {
    error?: { message?: string };
    choices?: { message?: { images?: { image_url?: { url?: string } }[] } }[];
  };
  if (!res.ok) throw new OpenRouterError(body.error?.message ?? `OpenRouter ${res.status}`, res.status);
  const url = body.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!url) throw new Error("The model returned no image");
  return url;
}
