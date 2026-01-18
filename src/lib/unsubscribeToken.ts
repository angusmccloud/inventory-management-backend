import { generateHmacSignature, verifyHmacSignature } from './hmac';

export interface UnsubscribeTokenPayload {
  memberId: string;
  familyId: string;
  action: 'unsubscribe_all';
  expiresAt: string; // ISO
}

export function createUnsubscribeToken(payload: UnsubscribeTokenPayload, secret: string): string {
  const json = JSON.stringify(payload);
  const b64 = Buffer.from(json).toString('base64');
  const sig = generateHmacSignature(b64, secret);
  return `${b64}.${sig}`;
}

export function validateUnsubscribeToken(token: string, secret: string): UnsubscribeTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [b64, sig] = parts as [string, string];

  if (!verifyHmacSignature(b64, sig, secret)) return null;

  try {
    const json = Buffer.from(b64, 'base64').toString('utf8');
    const payload = JSON.parse(json) as UnsubscribeTokenPayload;
    if (new Date(payload.expiresAt).getTime() < Date.now()) return null;
    if (payload.action !== 'unsubscribe_all') return null;
    return payload;
  } catch {
    return null;
  }
}

export default { createUnsubscribeToken, validateUnsubscribeToken };
