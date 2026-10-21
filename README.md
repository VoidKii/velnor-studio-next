# Velnor Studio

A local-first research and planning workspace for YouTube creators. It keeps the existing dashboard, idea research, public channel/video lookup, packaging lab, saved work, scripts, calendar and settings in one small Next.js app.

## What works today

| Area | Current behavior | Needs credentials? |
| --- | --- | --- |
| Creator dashboard | Shows real local saved-work counts and clearly empty private analytics states. It does not display sample channel performance. | No |
| Idea research | Builds three practical local concepts from a niche, audience, format, goal and constraints. Each includes a hook, reasoning and four outline beats. | No |
| Optional AI idea drafting | Sends the submitted brief to the OpenAI Responses API only after the user selects **Draft with OpenAI**. It returns structured model suggestions, not researched claims or performance predictions. | `OPENAI_API_KEY` |
| Packaging lab | Edits two title drafts side by side, shows character/word counts and editorial comparison notes, and offers a human checklist. Drafts persist in this browser. Thumbnail preview only loads a supplied HTTPS image URL; it does not analyze the image. | No |
| Public YouTube research | Searches public videos or channels through YouTube Data API v3. Channel profile counts are the fields returned by YouTube and are shown as an API snapshot. | `YOUTUBE_API_KEY` |
| Saved work, scripts and calendar | Saves ideas, script drafts, and publish dates in this browser. They are not synced to another device. | No |
| Private channel analytics | No owner-authorized OAuth or YouTube Analytics reports are implemented. | Unavailable |
| Sign-in and cloud sync | Supabase is listed as a possible future integration but is not connected or used by this MVP. | Unavailable |

There are no fabricated keyword volumes, trends, thumbnail scores, YouTube rankings or private analytics. The local idea framework is deterministic editorial scaffolding; it does not claim to be AI research.

## Requirements

- Node.js 20.9 or newer
- pnpm 9+ or npm

## Run locally

```bash
pnpm install
Copy-Item .env.example .env.local
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). You can leave every value in `.env.local` blank and use the local research, packaging, library, script and calendar features without a paid service or account. Restart the development server after changing environment variables.

With npm, use `npm install`, `npm run dev`, `npm run build` and `npm start`.

## Optional OpenAI idea drafting

1. Add an API key to `OPENAI_API_KEY` in the server's `.env.local` file or hosting environment. Never use a `NEXT_PUBLIC_` prefix for this key.
2. Optionally set `OPENAI_IDEA_MODEL`. If unset, the route uses `gpt-6-astra`.
3. Restart the server. The research page reports whether a key is present; that status does not validate the key.
4. The local framework remains available. A brief is sent to OpenAI only when the user chooses **Draft with OpenAI**. The route requests schema-constrained output and disables response storage; the generated ideas remain model suggestions and are not independently researched.

The OpenAI API is optional and may incur usage charges under the configured API account. Avoid putting personal or sensitive details in the brief. Read the current [OpenAI Responses API documentation](https://developers.openai.com/api/reference/resources/responses/methods/create) before changing the integration.

## Optional public YouTube research

1. Create a Google Cloud project and enable YouTube Data API v3.
2. Create an API key and restrict it to the YouTube Data API and your server environment.
3. Set `YOUTUBE_API_KEY` in `.env.local` (local) or your hosting provider's server environment.
4. Restart the server and search from **Idea research**.

The server validates the query, caps public search result counts, limits upstream wait time, and never returns the API key. Results are ordered by YouTube relevance, not by view count or predicted performance. Public channel statistics can be hidden or rounded; video counts cover public videos, and total channel views are lifetime profile fields rather than a growth series. See YouTube's [Channels resource](https://developers.google.com/youtube/data/reference/rest/v3/channels) and [quota documentation](https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits) for current field definitions and quota policies. A snapshot timestamp is included in successful API responses.

An API key being present is not proof of a valid connection; an actual search tests it. Missing configuration and upstream errors have explicit UI states.

## Persistence and private analytics

Saved ideas, scripts, calendar dates and packaging drafts use `localStorage` in the active browser. Clearing browser data removes those copies. Supabase is not wired into the app; its blank example variables are reserved only. Do not add a Supabase service-role key to browser-visible configuration.

Private channel analytics need a YouTube owner-authorized OAuth flow and the appropriate YouTube Analytics API scopes. This application does not request those permissions or show invented analytics.

## Security and public deployment

Provider keys are read only by Next.js server routes. The public YouTube search and optional AI routes do not include user sign-in or shared, distributed rate limiting. A server-side key prevents browser exposure, but it does not prevent anonymous visitors from consuming that key's quota or API spend. Before enabling either key on a public deployment, put the routes behind authenticated access and hosting-level rate limits. For a private local workspace, keep the app bound to your trusted development environment and use provider-side key restrictions and quotas.

Only HTTPS thumbnail URLs are rendered, with referrer information suppressed. The image request goes from the browser directly to the URL's host. Drafts remain in local browser storage.

## Checks

```bash
pnpm typecheck
pnpm lint
pnpm build
```

## Deploy

Deploy on a Node.js host that supports Next.js 16. Set the build command to `pnpm build` and the start command to `pnpm start` (or use the equivalent npm commands). Do not configure provider keys for a public app until you add authenticated route access and shared rate limiting. No provider key is needed for the local-first experience.
