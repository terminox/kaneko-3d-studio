// Dev-server endpoint for the AI cartoon step: POST /api/cartoon with
// { image: dataUrl } -> { image: dataUrl }. The OpenRouter key stays here, in
// clicker-studio/.env, and never reaches the browser. The hosted site uses
// ../../api/cartoon.ts instead.
import type { Plugin } from "vite";
import { loadEnv } from "vite";
import { cartoonize, DEFAULT_MODEL } from "./cartoon.ts";

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
