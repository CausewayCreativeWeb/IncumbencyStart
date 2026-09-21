# IncumbencyStart

An Astro starter for a one-page marketing site with:

- **Resend** — a contact form that sends email via a serverless API route (`src/pages/api/contact.ts`).
- **Mailchimp** — a newsletter signup form that adds subscribers to a Mailchimp audience via a serverless API route (`src/pages/api/subscribe.ts`).
- **Vercel Web Analytics** — enabled through the `@astrojs/vercel` adapter, so pageviews are tracked automatically once deployed on Vercel.

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
| `CONTACT_TO_EMAIL` | Inbox that should receive contact-form submissions. |
| `MAILCHIMP_API_KEY` | API key from your Mailchimp account, e.g. `xxxxxxxx-us21`. |
| `MAILCHIMP_SERVER_PREFIX` | The data-center suffix on your API key, e.g. `us21`. |
| `MAILCHIMP_AUDIENCE_ID` | The audience/list ID subscribers should be added to. |

## Project structure

```
src/
  components/
    Header.astro
    Hero.astro
    Features.astro
    NewsletterForm.astro   # posts to /api/subscribe
    ContactForm.astro      # posts to /api/contact
    Footer.astro
  layouts/
    Layout.astro
  pages/
    index.astro            # the one-pager
    api/
      contact.ts           # Resend
      subscribe.ts         # Mailchimp
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
