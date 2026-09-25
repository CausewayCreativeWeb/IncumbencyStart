// Records a successful bag claim in Google Analytics from the server, via the
// GA4 Measurement Protocol. Nothing is read from or stored on the visitor's
// device, and no personal details are sent, so it runs whether or not they
// accepted analytics cookies.
import { randomInt } from 'node:crypto';
import { ANALYTICS_ID } from './site';

/** GA identifiers the browser passes along, only for visitors who accepted cookies. */
export type AnalyticsIds = { clientId?: string; sessionId?: string };

const CLIENT_ID_PATTERN = /^\d{1,20}\.\d{1,20}$/;
const SESSION_ID_PATTERN = /^\d{1,20}$/;

/** Keeps only well-formed GA ids from an untrusted request body. */
export function parseAnalyticsIds(value: unknown): AnalyticsIds {
  if (!value || typeof value !== 'object') return {};
  const { clientId, sessionId } = value as Record<string, unknown>;
  return {
    clientId: typeof clientId === 'string' && CLIENT_ID_PATTERN.test(clientId) ? clientId : undefined,
    sessionId: typeof sessionId === 'string' && SESSION_ID_PATTERN.test(sessionId) ? sessionId : undefined,
  };
}

// A throwaway id in GA's own format, so a visitor who declined cookies is
// counted once and can't be linked to anything else.
function anonymousClientId() {
  return `${randomInt(1_000_000_000, 2_000_000_000)}.${Math.floor(Date.now() / 1000)}`;
}

export async function recordClaimConversion(ids: AnalyticsIds) {
  const { GA_API_SECRET } = import.meta.env;
  if (!GA_API_SECRET) return;

  const url = `https://www.google-analytics.com/mp/collect?measurement_id=${ANALYTICS_ID}&api_secret=${encodeURIComponent(GA_API_SECRET)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(3000),
    body: JSON.stringify({
      client_id: ids.clientId ?? anonymousClientId(),
      non_personalized_ads: true,
      consent: { ad_user_data: 'DENIED', ad_personalization: 'DENIED' },
      events: [
        {
          name: 'generate_lead',
          params: {
            form: 'bag_claim',
            engagement_time_msec: 1,
            ...(ids.sessionId && { session_id: ids.sessionId }),
          },
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Measurement Protocol responded with ${response.status}.`);
  }
}
