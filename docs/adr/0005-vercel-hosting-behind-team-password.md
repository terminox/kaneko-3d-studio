# Host both tools on one Vercel project behind a shared team password

Teammates need Model Maker and Clicker Studio, which only ran on the owner's Mac. We host both on one Vercel project, `kaneko-tools`, at `kaneko-tools.vercel.app`:
- `/` is a launcher.
- Each tool is built under its own path (`/model-maker/`, `/clicker-studio/`).
- One Routing Middleware (`middleware.ts`) asks for a shared team password before serving anything, assets included.

Both tools run entirely in the browser, so the only server code is the AI cartoon function (`api/cartoon.ts`), which spends OpenRouter credit.

How it works:
- **Session.** A correct password sets a 30-day HttpOnly cookie, `<expiry>.<HMAC(AUTH_SECRET, expiry)>`. It's checked with Web Crypto, with no database and no auth service. The cartoon function checks the cookie again rather than trusting the middleware alone.
- **AI spending cap.** The deployment uses its own OpenRouter key with a daily credit limit. OpenRouter enforces it, so no counter store is needed. Vercel functions share no memory, so an in-code cap would have needed Redis.
- **Deploys.** They run from the owner's Mac with `vercel build --prod && vercel deploy --prebuilt --prod`. That uploads the ~55 MB of fonts, icons and WASM already downloaded by `bun run setup`, and needs no git remote.

## Considered options

- **Google sign-in with an email allowlist.** It removes one person at a time and shows who is who. Rejected for now: it needs a Google OAuth client and more code, and the team is small. It can replace the password later without touching the tools.
- **Vercel's own Deployment Protection.** No code, but it needs the Pro plan plus a seat per teammate or the Password Protection add-on.
- **Two Vercel projects, one per tool.** Rejected: two logins, two sets of secrets, and no single entry point.

## Consequences

- Removing one person means changing `TEAM_PASSWORD` and `AUTH_SECRET` for everyone.
- The project is on the Hobby plan, which Vercel limits to non-commercial use. Move it to Pro for ongoing business use.
- The apps are built with an absolute `--base /<tool>/`. Clicker Studio's worker resolves asset URLs against the site origin, so the relative `./` base would load fonts from `/`. Local builds keep `./`.
- OpenSCAD is GPL-2. Hosting it for the team counts as internal use, and the launcher links to its source anyway.
