// Characters used to generate a 6-char code. Ambiguous characters
// (O/0, I/1, etc.) are excluded for readability when shared verbally.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateCode(length = 6): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let code = '';
  for (let i = 0; i < length; i++) {
    code += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return code;
}

// Validates a code: exactly 6 chars from the allowed alphabet.
export const CODE_REGEX = /^[A-Z2-9]{6}$/;

export function isValidCode(code: string): boolean {
  return CODE_REGEX.test(code);
}

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}
