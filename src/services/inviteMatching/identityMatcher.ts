/**
 * Identity normalization helpers for pending-invite matching.
 */

export interface NormalizedIdentityInput {
  email?: string | null;
  phone?: string | null;
}

export interface NormalizedIdentity {
  email?: string;
  phone?: string;
}

export const normalizeEmail = (email?: string | null): string | undefined => {
  const trimmed = email?.trim().toLowerCase();
  return trimmed ? trimmed : undefined;
};

export const normalizePhoneE164 = (phone?: string | null): string | undefined => {
  if (!phone) {
    return undefined;
  }

  const trimmed = phone.trim();
  if (!trimmed) {
    return undefined;
  }

  const hasPlus = trimmed.startsWith('+');
  const digitsOnly = trimmed.replace(/\D/g, '');
  if (!digitsOnly) {
    return undefined;
  }

  return hasPlus ? `+${digitsOnly}` : `+${digitsOnly}`;
};

export const normalizeIdentity = (input: NormalizedIdentityInput): NormalizedIdentity => {
  return {
    email: normalizeEmail(input.email),
    phone: normalizePhoneE164(input.phone),
  };
};

export const buildIdentityKeys = (input: NormalizedIdentityInput): string[] => {
  const normalized = normalizeIdentity(input);
  const keys: string[] = [];

  if (normalized.email) {
    keys.push(`IDENTITY#${normalized.email}`);
  }

  if (normalized.phone) {
    keys.push(`IDENTITY#${normalized.phone}`);
  }

  return keys;
};
