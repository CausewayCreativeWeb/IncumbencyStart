/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly RESEND_API_KEY: string;
  readonly RESEND_FROM_EMAIL: string;
  readonly CONTACT_TO_EMAIL: string;
  readonly MAILCHIMP_API_KEY: string;
  readonly MAILCHIMP_SERVER_PREFIX: string;
  readonly MAILCHIMP_AUDIENCE_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
