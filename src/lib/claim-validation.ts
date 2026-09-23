// Validation rules for the bag claim form, shared by the browser and /api/claim
// so both always agree.

export const CLAIM_FIELDS = ['name', 'mobile', 'office', 'email'] as const;

export type ClaimField = (typeof CLAIM_FIELDS)[number];
export type Claim = Record<ClaimField, string>;
export type ClaimErrors = Partial<Record<ClaimField, string>>;

const ALLOWED_EMAIL_DOMAIN = 'parliament.uk';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const MESSAGES = {
  name: 'Please enter your full name.',
  mobileMissing: 'Please enter your mobile number.',
  mobileInvalid: 'Please enter a UK mobile number starting 07 or +44.',
  office: "Please enter your MP's office.",
  emailMissing: 'Please enter your email address.',
  emailInvalid: 'Please enter a valid email address, e.g. jane.okafor@parliament.uk.',
  emailDomain: "Please use your @parliament.uk email address. Other email addresses can't claim a bag.",
} as const;

/**
 * Accepts 07 + 9 digits, or +44 / 0044 + 10 digits starting 7 (the same
 * number written internationally). Returns it as "07700 900000", or null.
 */
export function normaliseUkMobile(value: string): string | null {
  const compact = value.replace(/[\s().-]/g, '');
  const match = compact.match(/^(?:0|\+44|0044)(7\d{9})$/);
  if (!match) return null;
  const national = `0${match[1]}`;
  return `${national.slice(0, 5)} ${national.slice(5)}`;
}

export function isParliamentEmail(value: string): boolean {
  const email = value.trim().toLowerCase();
  const at = email.lastIndexOf('@');
  return at > 0 && email.slice(at + 1) === ALLOWED_EMAIL_DOMAIN;
}

/** Trims every field and returns one error message per failing field. */
export function validateClaim(input: Partial<Record<ClaimField, unknown>>): { claim: Claim; errors: ClaimErrors } {
  const text = (key: ClaimField) => (typeof input[key] === 'string' ? (input[key] as string).trim() : '');
  const claim: Claim = { name: text('name'), mobile: text('mobile'), office: text('office'), email: text('email') };
  const errors: ClaimErrors = {};

  if (!claim.name) errors.name = MESSAGES.name;

  if (!claim.mobile) {
    errors.mobile = MESSAGES.mobileMissing;
  } else {
    const mobile = normaliseUkMobile(claim.mobile);
    if (mobile) claim.mobile = mobile;
    else errors.mobile = MESSAGES.mobileInvalid;
  }

  if (!claim.office) errors.office = MESSAGES.office;

  if (!claim.email) {
    errors.email = MESSAGES.emailMissing;
  } else if (!EMAIL_PATTERN.test(claim.email)) {
    errors.email = MESSAGES.emailInvalid;
  } else if (!isParliamentEmail(claim.email)) {
    errors.email = MESSAGES.emailDomain;
  }

  return { claim, errors };
}
