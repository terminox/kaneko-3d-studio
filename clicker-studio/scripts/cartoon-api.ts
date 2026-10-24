// Dev-server endpoint for the AI cartoon step: POST /api/cartoon with
// { image: dataUrl } -> { image: dataUrl }. The OpenRouter key stays here, in
// clicker-studio/.env, and never reaches the browser.
import type { Plugin } from "vite";
import { loadEnv } from "vite";

const DEFAULT_MODEL = "google/gemini-3.1-flash-image";

export const CARTOON_PROMPT =
  "Redraw this picture as a flat cartoon sticker for a multi-colour 3D print: " +
  "bold black outlines, at most 5 flat solid colours, no gradients, no shading, no texture, " +
  "no text, the subject only on a plain pure white background, same pose and framing.";

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
  if (!res.ok) throw new Error(body.error?.message ?? `OpenRouter ${res.status}`);
  const url = body.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!url) throw new Error("The model returned no image");
  return url;
}

export function cartoonApi(): Plugin {
  let env: Record<string, string> = {};
  return {
    name: "cartoon-api",
    configResolved(config) {
      env = loadEnv(config.mode, config.envDir ?? config.root, "");
    },
    configureServer(server) {
      server.middlewares.use("/api/cartoon", async (req, res) => {
        const send = (status: number, obj: unknown) => {
          res.statusCode = status;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(obj));
        };
        if (req.method === "GET") return send(200, { enabled: Boolean(env.OPENROUTER_API_KEY) });
        if (req.method !== "POST") return send(405, { error: "POST only" });
        if (!env.OPENROUTER_API_KEY) return send(503, { error: "Set OPENROUTER_API_KEY in clicker-studio/.env and restart." });
        let raw = "";
        for await (const chunk of req) raw += chunk;
        try {
          const { image } = JSON.parse(raw) as { image: string };
          send(200, { image: await cartoonize(image, env.OPENROUTER_API_KEY, env.OPENROUTER_IMAGE_MODEL || DEFAULT_MODEL) });
        } catch (e) {
          send(502, { error: e instanceof Error ? e.message : String(e) });
        }
      });
    },
  };
}
