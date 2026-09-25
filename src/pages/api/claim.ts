import type { APIRoute } from 'astro';
import { createHash } from 'node:crypto';
import { Resend } from 'resend';
import { CLAIM_FIELDS, validateClaim, type Claim } from '../../lib/claim-validation';
import { parseAnalyticsIds, recordClaimConversion } from '../../lib/analytics-server';
import { env, missing } from '../../lib/server-env';

export const prerender = false;

const MAX_LENGTH = 200;

function json(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function field(body: Record<string, unknown>, key: string) {
  const value = body[key];
  return typeof value === 'string' ? value.trim().slice(0, MAX_LENGTH) : '';
}

const RESEND_VARS = ['RESEND_API_KEY', 'RESEND_FROM_EMAIL', 'CONTACT_TO_EMAIL'] as const;
const MAILCHIMP_VARS = ['MAILCHIMP_API_KEY', 'MAILCHIMP_SERVER_PREFIX', 'MAILCHIMP_AUDIENCE_ID'] as const;

// Keeps claimant emails out of logs while leaving them recognisable: j***@parliament.uk
function maskEmail(email: string) {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, 1)}***@${domain}`;
}

function describeError(error: unknown) {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause instanceof Error ? ` (cause: ${error.cause.name}: ${error.cause.message})` : '';
  return `${error.name}: ${error.message}${cause}`;
}

// Mailchimp error bodies carry a title, a detail and, for bad merge fields, a
// per-field errors list: https://mailchimp.com/developer/marketing/docs/errors/
async function mailchimpError(step: string, response: Response) {
  const text = await response.text().catch(() => '');
  let summary = text.slice(0, 500);
  try {
    const body = JSON.parse(text);
    const fields = Array.isArray(body.errors)
      ? ` fields=${body.errors.map((e: { field?: string; message?: string }) => `${e.field}: ${e.message}`).join('; ')}`
      : '';
    summary = `title="${body.title}" detail="${body.detail}"${fields}`;
  } catch {
    // Not JSON: keep the raw (truncated) text.
  }
  return new Error(`Mailchimp ${step} failed with HTTP ${response.status}: ${summary}`);
}

// Adds or updates the claimant in the Mailchimp audience, then tags them.
// Uses PUT on the subscriber hash so repeat claims update rather than error.
async function addToMailchimp(claim: Claim) {
  const absent = missing(MAILCHIMP_VARS);
  if (absent.length) {
    throw new Error(`Mailchimp is not configured — missing: ${absent.join(', ')}`);
  }
  const apiKey = env('MAILCHIMP_API_KEY')!;
  const serverPrefix = env('MAILCHIMP_SERVER_PREFIX')!;
  const audienceId = env('MAILCHIMP_AUDIENCE_ID')!;

  // The key ends in its data centre (e.g. "-us21"); a mismatched prefix is a common cause of 401s.
  const keySuffix = apiKey.includes('-') ? apiKey.split('-').pop() : undefined;
  if (keySuffix !== serverPrefix) {
    console.warn(
      `[claim] MAILCHIMP_SERVER_PREFIX is "${serverPrefix}" but the API key ends in "-${keySuffix ?? '(none)'}"; they should match.`,
    );
  }

  const hash = createHash('md5').update(claim.email.toLowerCase()).digest('hex');
  const base = `https://${serverPrefix}.api.mailchimp.com/3.0/lists/${audienceId}/members/${hash}`;
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Basic ${Buffer.from(`anystring:${apiKey}`).toString('base64')}`,
  };
  const context = `(server prefix "${serverPrefix}", audience id "${audienceId}")`;
  // Split on the first space; a single name is repeated as the last name.
  const [firstName, ...rest] = claim.name.trim().split(/\s+/);
  const lastName = rest.join(' ') || firstName;

  let memberResponse: Response;
  try {
    memberResponse = await fetch(base, {
      method: 'PUT',
      headers,
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        email_address: claim.email,
        status_if_new: 'subscribed',
        merge_fields: {
          FNAME: firstName,
          LNAME: lastName,
          PHONE: claim.mobile,
          OFFICE: claim.office,
        },
      }),
    });
  } catch (error) {
    throw new Error(`Mailchimp upsert member request failed ${context}: ${describeError(error)}`);
  }
  if (!memberResponse.ok) {
    const error = await mailchimpError('upsert member', memberResponse);
    error.message += ` ${context}`;
    throw error;
  }

  let tagResponse: Response;
  try {
    tagResponse = await fetch(`${base}/tags`, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({ tags: [{ name: 'bag-claim', status: 'active' }] }),
    });
  } catch (error) {
    throw new Error(`Mailchimp add tag request failed ${context}: ${describeError(error)}`);
  }
  if (!tagResponse.ok) {
    const error = await mailchimpError('add tag', tagResponse);
    error.message += ` ${context}`;
    throw error;
  }
}

async function emailTeam(claim: Claim) {
  const resend = new Resend(env('RESEND_API_KEY'));

  const { error } = await resend.emails.send({
    from: env('RESEND_FROM_EMAIL')!,
    to: env('CONTACT_TO_EMAIL')!,
    replyTo: claim.email,
    subject: `New bag claim: ${claim.name} (${claim.office})`,
    html: `
      <p><strong>Name:</strong> ${escapeHtml(claim.name)}</p>
      <p><strong>Mobile:</strong> ${escapeHtml(claim.mobile)}</p>
      <p><strong>MP's office:</strong> ${escapeHtml(claim.office)}</p>
      <p><strong>Email:</strong> ${escapeHtml(claim.email)}</p>
    `,
  });

  if (error) {
    const status = 'statusCode' in error ? ` HTTP ${error.statusCode}` : '';
    throw new Error(`Resend ${error.name}${status}: ${error.message}`);
  }
}

export const POST: APIRoute = async ({ request }) => {
  const absentResend = missing(RESEND_VARS);
  if (absentResend.length) {
    console.error(`[claim] Resend is not configured — missing: ${absentResend.join(', ')}`);
    return json({ error: 'The claim form is not configured on the server.' }, 500);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request body.' }, 400);
  }

  const { claim, errors } = validateClaim(Object.fromEntries(CLAIM_FIELDS.map((key) => [key, field(body, key)])));
  const firstError = CLAIM_FIELDS.map((key) => errors[key]).find(Boolean);

  if (firstError) {
    return json({ error: firstError, fields: errors }, 400);
  }

  const [emailResult, mailchimpResult] = await Promise.allSettled([emailTeam(claim), addToMailchimp(claim)]);
  const who = `office="${claim.office}" email=${maskEmail(claim.email)}`;

  if (mailchimpResult.status === 'rejected') {
    console.error(`[claim] Mailchimp signup failed: ${describeError(mailchimpResult.reason)}`);
  }

  // The team must receive the claim; a Mailchimp failure alone shouldn't block the claimant.
  if (emailResult.status === 'rejected') {
    console.error(`[claim] Resend email failed: ${describeError(emailResult.reason)}`);
    console.error(`[claim] result email=failed mailchimp=${mailchimpResult.status === 'fulfilled' ? 'ok' : 'failed'} ${who}`);
    return json({ error: 'Could not submit your claim. Please try again later.' }, 502);
  }

  // Reporting the conversion must never fail the claim itself.
  let analytics = 'failed';
  try {
    analytics = await recordClaimConversion(parseAnalyticsIds(body.analytics));
  } catch (error) {
    console.error(`[claim] Google Analytics conversion failed: ${describeError(error)}`);
  }

  console.log(
    `[claim] result email=sent mailchimp=${mailchimpResult.status === 'fulfilled' ? 'ok' : 'failed'} ga=${analytics} ${who}`,
  );
  return json({ success: true }, 200);
};
