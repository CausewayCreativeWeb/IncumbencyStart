# Incumbency.AI — Claim your bag

Astro landing page where Parliamentary staffers claim a free anti-theft laptop bag from Incumbency.AI.

- **Claim form** — posts to `src/pages/api/claim.ts`, which:
  - emails the claim (name, mobile, MP's office, email) to `CONTACT_TO_EMAIL` via **Resend**, and
  - adds or updates the claimant in your **Mailchimp** audience, tagged `bag-claim`.
  The claim succeeds as long as the Resend email sends; Mailchimp errors are logged server-side.
- **Vercel Web Analytics** — enabled through the `@astrojs/vercel` adapter.
- **Style guide** — design tokens and components at `/styleguide` (noindex).

Fonts are self-hosted from `public/fonts/`: Sora (titles), IBM Plex Sans (body) and IBM Plex Mono (buttons, labels, data), all under the SIL Open Font License.

## Getting started

```sh
npm install
cp .env.example .env
npm run dev
```

Fill in `.env` with your own keys (see below), then open http://localhost:4321.

## Environment variables

| Variable | Description |
| --- | --- |
| `RESEND_API_KEY` | API key from [resend.com/api-keys](https://resend.com/api-keys). |
| `RESEND_FROM_EMAIL` | Verified "from" address, e.g. `Website <hello@yourdomain.com>`. |
| `CONTACT_TO_EMAIL` | Inbox that should receive bag claims. |
| `MAILCHIMP_API_KEY` | API key from your Mailchimp account, e.g. `xxxxxxxx-us21`. |
| `MAILCHIMP_SERVER_PREFIX` | The data-center suffix on your API key, e.g. `us21`. |
| `MAILCHIMP_AUDIENCE_ID` | The audience/list ID subscribers should be added to. |

### Mailchimp audience fields

The claim route sends these merge fields: `FNAME`, `LNAME`, `PHONE` and `OFFICE`. `OFFICE` isn't a Mailchimp default, so create a text field with the merge tag `OFFICE` in **Audience → Settings → Audience fields and \*|MERGE|\* tags**. Mailchimp rejects the signup if a field is missing.

## Project structure

```
src/
  components/
    ui/                    # design-system components (Button, Field, Card, Accordion…)
    landing/               # page sections (ClaimHero, ClaimForm, AboutSection, SiteFooter…)
  layouts/
    Layout.astro
  pages/
    index.astro            # the landing page
    styleguide.astro       # design tokens & component reference
    api/
      claim.ts             # Resend email + Mailchimp signup
  styles/
    global.css             # fonts, tokens, base styles
public/
  fonts/                   # WOFF2 fonts + OFL licences
  images/bokeh-bg.webp     # hero background
```

## Deploying to Vercel

This project uses the [`@astrojs/vercel`](https://docs.astro.build/en/guides/integrations-guide/vercel/) adapter with `output: 'server'`, so it deploys as-is to Vercel with serverless functions for the API routes.

1. Push this repo to GitHub and import it into [Vercel](https://vercel.com/new).
2. Add the environment variables above in the Vercel project settings (Production, Preview, and Development as needed).
3. Deploy. Web Analytics is enabled automatically via the adapter's `webAnalytics` option — no extra setup needed once the project is on Vercel.

## Commands

| Command | Action |
| --- | --- |
| `npm install` | Install dependencies |
| `npm run dev` | Start the local dev server at `localhost:4321` |
| `npm run build` | Build the production site to `./dist/` |
| `npm run preview` | Preview the build locally |
