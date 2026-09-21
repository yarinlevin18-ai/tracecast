const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
export const ID_LENGTH = 12;

/** Random, url safe, unguessable enough for unlisted links (62^12). */
export function makeId(): string {
  const bytes = new Uint8Array(ID_LENGTH);
  crypto.getRandomValues(bytes);
  let out = "";
  // b % 62 has a slight bias; acceptable for unlisted ids, not for security tokens.
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

export function isValidId(id: string): boolean {
  return new RegExp(`^[0-9A-Za-z]{${ID_LENGTH}}$`).test(id);
}
