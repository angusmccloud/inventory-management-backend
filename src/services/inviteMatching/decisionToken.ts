import { generateHmacSignature, verifyHmacSignature } from '../../lib/hmac';

const TOKEN_TTL_MS = 15 * 60 * 1000;

const getDecisionSecret = (): string => {
  const secret =
    process.env['INVITATION_HMAC_SECRET_VALUE'] ||
    process.env['INVITATION_HMAC_SECRET'] ||
    process.env['PENDING_INVITE_TOKEN_SECRET'];

  if (secret) {
    return secret;
  }

  if (process.env['NODE_ENV'] !== 'production') {
    return 'local-pending-invite-secret';
  }

  throw new Error('Missing decision token secret');
};

export const buildDecisionToken = (memberId: string): string => {
  const issuedAt = Date.now();
  const payload = `${memberId}:${issuedAt}`;
  const signature = generateHmacSignature(payload, getDecisionSecret());
  const rawToken = `${payload}:${signature}`;
  return Buffer.from(rawToken, 'utf8').toString('base64');
};

export const verifyDecisionToken = (token: string, memberId: string): boolean => {
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const parts = decoded.split(':');
    if (parts.length !== 3) {
      return false;
    }

    const tokenMemberId = parts[0];
    const issuedAtRaw = parts[1];
    const signature = parts[2] || '';

    if (tokenMemberId !== memberId) {
      return false;
    }

    const issuedAt = Number(issuedAtRaw);
    if (!Number.isFinite(issuedAt)) {
      return false;
    }

    const age = Date.now() - issuedAt;
    if (age < 0 || age > TOKEN_TTL_MS) {
      return false;
    }

    const payload = `${tokenMemberId}:${issuedAt}`;
    return verifyHmacSignature(payload, signature, getDecisionSecret());
  } catch {
    return false;
  }
};
