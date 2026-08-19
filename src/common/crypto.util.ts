import {
  createHash,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';

/**
 * Gera um código numérico de 6 dígitos (100000–999999) usando CSPRNG.
 */
export function generateNumericCode(length = 6): string {
  const min = 10 ** (length - 1);
  const max = 10 ** length;
  return String(randomInt(min, max));
}

/**
 * Hasheia um código curto e descartável com SHA-256 + salt do env.
 *
 * Códigos de e-mail são curtos (6 dígitos) e de uso único, então bcrypt
 * seria overkill. Usamos SHA-256 com um salt estável vindo do JWT_SECRET
 * para evitar rainbow tables mesmo se o banco vazar.
 */
export function hashCode(code: string, salt: string): string {
  return createHash('sha256').update(`${salt}:${code}`).digest('hex');
}

/**
 * Comparação constante-tempo entre dois hashes hex (mesmo comprimento).
 */
export function compareCode(
  code: string,
  salt: string,
  expectedHash: string,
): boolean {
  const actual = Buffer.from(hashCode(code, salt), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

/**
 * TTL padrão dos códigos de e-mail (15 minutos), em milissegundos.
 */
export const CODE_TTL_MS = 15 * 60 * 1000;

/**
 * Número máximo de tentativas inválidas por código antes de invalidá-lo.
 */
export const CODE_MAX_ATTEMPTS = 5;

/**
 * Gera um refresh token opaco de 256 bits (32 bytes) codificado em base64url.
 * O token é enviado ao cliente em cookie HttpOnly; apenas o hash é persistido.
 */
export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Hasheia um refresh token (opaco) com SHA-256 antes de persistir.
 * Em caso de vazamento do banco, os tokens não podem ser reusados.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Comparação constante-tempo entre dois hashes hex de refresh token.
 */
export function compareToken(token: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashToken(token), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
