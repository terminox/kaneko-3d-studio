# Kaneko 3D Printing tools

Three in-browser tools for making print-ready Bambu 3MF files:
- [Model Maker](model-maker/README.md): parametric OpenSCAD models.
- [Clicker Studio](clicker-studio/README.md): the clicker designer.
- [Tag Studio](tag-studio/README.md): picture name tags, one per name.

Terms are in [CONTEXT.md](CONTEXT.md), and decisions are in [docs/adr](docs/adr).

## Hosted for the team

**https://kaneko-tools.vercel.app**, behind a shared team password ([ADR 0005](docs/adr/0005-vercel-hosting-behind-team-password.md)).

| Path | What |
|---|---|
| `/` | Launcher (`site/index.html`) |
| `/login` | Password page (`site/login.html`). `middleware.ts` handles `/auth/login` and `/auth/logout` |
| `/model-maker/`, `/clicker-studio/`, `/tag-studio/` | The tools, built with `--base /<tool>/` |
| `/clicker-studio/api/cartoon`, `/tag-studio/api/cartoon` | AI cartoon, rewritten to the function `api/cartoon.ts` (one key, one daily cap) |

### Deploy

Deploys run from this Mac (assets from `bun run setup` in each tool are uploaded as they are):

```sh
bun install
vercel build --prod             # runs scripts/build-site.sh into dist/, plus the middleware and function
vercel deploy --prebuilt --prod
```

`bun run build:site` builds `dist/` without Vercel. `bun test auth` and `bun run typecheck` check the auth code.

### Settings (Vercel → kaneko-tools → Settings → Environment Variables, Production)

| Variable | What |
|---|---|
| `TEAM_PASSWORD` | The password teammates type. If it's empty, nobody can log in. |
| `AUTH_SECRET` | Signs the login cookie. Any long random string: `openssl rand -hex 32`. |
| `OPENROUTER_API_KEY` | A key only for this site, with a daily credit limit (see below). If it's empty, the AI cartoon button hides itself. |
| `OPENROUTER_IMAGE_MODEL` | Optional; defaults to `google/gemini-3.1-flash-image`. |

Environment variables apply on the next deploy, so redeploy after changing one.

- **Change the password or remove someone:** set a new `TEAM_PASSWORD`, and set a new `AUTH_SECRET` too, which logs everyone out. Then redeploy and send the new password to the team.
- **AI cartoon budget:** in OpenRouter → Keys, edit this site's key. Set a credit limit and "Reset: daily" (resets at midnight UTC, 07:00 Thai time). When it runs out, the button says the daily limit is used up.

The project is on Vercel's Hobby plan, which is for non-commercial use. Move it to Pro for ongoing business use.
