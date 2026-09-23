import type { APIRoute } from 'astro';
import { createHash } from 'node:crypto';
import { Resend } from 'resend';
import { CLAIM_FIELDS, validateClaim, type Claim } from '../../lib/claim-validation';

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

// Adds or updates the claimant in the Mailchimp audience, then tags them.
// Uses PUT on the subscriber hash so repeat claims update rather than error.
async function addToMailchimp(claim: Claim) {
  const { MAILCHIMP_API_KEY, MAILCHIMP_SERVER_PREFIX, MAILCHIMP_AUDIENCE_ID } = import.meta.env;
  if (!MAILCHIMP_API_KEY || !MAILCHIMP_SERVER_PREFIX || !MAILCHIMP_AUDIENCE_ID) {
    throw new Error('Mailchimp is not configured.');
  }

  const hash = createHash('md5').update(claim.email.toLowerCase()).digest('hex');
  const base = `https://${MAILCHIMP_SERVER_PREFIX}.api.mailchimp.com/3.0/lists/${MAILCHIMP_AUDIENCE_ID}/members/${hash}`;
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Basic ${Buffer.from(`anystring:${MAILCHIMP_API_KEY}`).toString('base64')}`,
  };
  const [firstName, ...rest] = claim.name.split(/\s+/);

  const memberResponse = await fetch(base, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      email_address: claim.email,
      status_if_new: 'subscribed',
      merge_fields: {
        FNAME: firstName,
        LNAME: rest.join(' '),
        PHONE: claim.mobile,
        OFFICE: claim.office,
      },
    }),
  });

  if (!memberResponse.ok) {
    const errorBody = await memberResponse.json().catch(() => null);
    throw new Error(errorBody?.detail ?? `Mailchimp responded with ${memberResponse.status}.`);
  }

  const tagResponse = await fetch(`${base}/tags`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ tags: [{ name: 'bag-claim', status: 'active' }] }),
  });

  if (!tagResponse.ok) {
    throw new Error(`Mailchimp tagging responded with ${tagResponse.status}.`);
  }
}

async function emailTeam(claim: Claim) {
  const { RESEND_API_KEY, RESEND_FROM_EMAIL, CONTACT_TO_EMAIL } = import.meta.env;
  const resend = new Resend(RESEND_API_KEY);

  const { error } = await resend.emails.send({
    from: RESEND_FROM_EMAIL,
    to: CONTACT_TO_EMAIL,
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
    throw new Error(error.message);
  }
}

export const POST: APIRoute = async ({ request }) => {
  const { RESEND_API_KEY, RESEND_FROM_EMAIL, CONTACT_TO_EMAIL } = import.meta.env;

  if (!RESEND_API_KEY || !RESEND_FROM_EMAIL || !CONTACT_TO_EMAIL) {
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

  if (mailchimpResult.status === 'rejected') {
    console.error('Mailchimp signup failed for bag claim:', mailchimpResult.reason);
  }

  // The team must receive the claim; a Mailchimp failure alone shouldn't block the claimant.
  if (emailResult.status === 'rejected') {
    console.error('Resend email failed for bag claim:', emailResult.reason);
    return json({ error: 'Could not submit your claim. Please try again later.' }, 502);
  }

  return json({ success: true }, 200);
};
