// Vercel Routing Middleware: the team-password gate in front of every path.
// Signed-in requests pass through; everything else gets the login page.
import { next } from "@vercel/functions";
import { clearedCookie, isSignedIn, passwordMatches, safeNext, sessionCookie, signSession } from "./auth/session";

const OPEN = new Set(["/login", "/login.html"]);

const redirect = (to: string, cookie?: string) =>
  new Response(null, { status: 303, headers: { Location: to, ...(cookie ? { "Set-Cookie": cookie } : {}) } });

export default async function middleware(request: Request) {
  const url = new URL(request.url);
  const secret = process.env.AUTH_SECRET ?? "";

  if (url.pathname === "/auth/login" && request.method === "POST") {
    const form = await request.formData();
    const to = safeNext(String(form.get("next") ?? ""));
    if (secret && (await passwordMatches(secret, process.env.TEAM_PASSWORD ?? "", String(form.get("password") ?? "")))) {
      return redirect(to, sessionCookie(await signSession(secret)));
    }
    await new Promise((r) => setTimeout(r, 500)); // slows down guessing
    return redirect(`/login?error=1&next=${encodeURIComponent(to)}`);
  }
  if (url.pathname === "/auth/logout") return redirect("/login", clearedCookie);

  const signedIn = await isSignedIn(request, secret);
  if (OPEN.has(url.pathname)) {
    return signedIn ? redirect(safeNext(url.searchParams.get("next"))) : next();
  }
  if (signedIn) return next();

  if (url.pathname.includes("/api/")) {
    return Response.json({ error: "Log in first: open the site and enter the team password." }, { status: 401 });
  }
  return redirect(`/login?next=${encodeURIComponent(url.pathname + url.search)}`);
}
