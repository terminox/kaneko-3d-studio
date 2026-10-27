// Vercel Function for Clicker Studio's AI cartoon button on the hosted site.
// Same contract as the dev-server plugin (clicker-studio/scripts/cartoon-api.ts):
// GET -> { enabled }, POST { image: dataUrl } -> { image: dataUrl }.
// The middleware already requires a session; this checks it again because the
// endpoint spends OpenRouter credit. The daily spending cap is the credit limit
// on the deployment's own OpenRouter key.
import { isSignedIn } from "../auth/session";
import { cartoonize, DEFAULT_MODEL, OpenRouterError } from "../clicker-studio/scripts/cartoon";

const MAX_BODY = 3 * 1024 * 1024; // the app sends a 768 px PNG, well under this

const send = (status: number, body: unknown) => Response.json(body, { status });

export function GET() {
  return send(200, { enabled: Boolean(process.env.OPENROUTER_API_KEY) });
}

export async function POST(request: Request) {
  if (!(await isSignedIn(request))) return send(401, { error: "Log in first." });
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return send(503, { error: "The AI cartoon is turned off on this site." });

  const raw = await request.text();
  if (raw.length > MAX_BODY) return send(413, { error: "The picture is too large." });
  let image: unknown;
  try {
    image = (JSON.parse(raw) as { image?: unknown }).image;
  } catch {
    return send(400, { error: "Bad request" });
  }
  if (typeof image !== "string" || !image.startsWith("data:image/")) return send(400, { error: "Send a picture as a data URL." });

  try {
    return send(200, { image: await cartoonize(image, key, process.env.OPENROUTER_IMAGE_MODEL || DEFAULT_MODEL) });
  } catch (e) {
    if (e instanceof OpenRouterError && e.status === 402) {
      return send(429, { error: "Today's AI cartoon limit is used up. Try again tomorrow (it resets at 07:00 Thai time)." });
    }
    return send(502, { error: e instanceof Error ? e.message : String(e) });
  }
}
