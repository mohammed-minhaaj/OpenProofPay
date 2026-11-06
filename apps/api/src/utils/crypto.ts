import crypto from 'crypto';
import { env } from '../config/env.js';
import { AppError } from '../errors/AppError.js';

// Derive a consistent 32-byte key from JWT_ACCESS_SECRET for AES-256-GCM
const ENCRYPTION_KEY = crypto
  .createHash('sha256')
  .update(env.JWT_ACCESS_SECRET)
  .digest();

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV recommended for GCM

/**
 * Encrypt a plaintext secret using AES-256-GCM with authentication tag
 */
export function encryptSecret(plainText: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);

  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:ciphertext (all in hex)
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt a ciphertext string using AES-256-GCM, verifying authentication tag
 */
export function decryptSecret(encryptedPayload: string): string {
  try {
    const parts = encryptedPayload.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted payload format');
    }

    const [ivHex, authTagHex, cipherText] = parts as [string, string, string];
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(cipherText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (err) {
    throw AppError.internal('Failed to decrypt sensitive credential');
  }
}

/**
 * Generate a cryptographically signed, timestamped CSRF state token
 */
export function generateSignedOAuthState(userId: string): string {
  const timestamp = Date.now().toString();
  const random = crypto.randomBytes(16).toString('hex');
  const payload = `${userId}:${timestamp}:${random}`;

  const hmac = crypto
    .createHmac('sha256', env.JWT_ACCESS_SECRET)
    .update(payload)
    .digest('hex');

  return Buffer.from(`${payload}:${hmac}`).toString('base64url');
}

/**
 * Verify signed OAuth CSRF state and extract userId
 */
export function verifySignedOAuthState(stateStr: string, maxAgeMs = 15 * 60 * 1000): string {
  try {
    const decoded = Buffer.from(stateStr, 'base64url').toString('utf8');
    const parts = decoded.split(':');
    if (parts.length !== 4) {
      throw AppError.badRequest('Invalid OAuth state format', 'INVALID_STATE');
    }

    const [userId, timestampStr, random, receivedHmac] = parts as [string, string, string, string];
    const timestamp = parseInt(timestampStr, 10);

    // Verify expiration
    if (Date.now() - timestamp > maxAgeMs) {
      throw AppError.badRequest('OAuth state has expired. Please try connecting again.', 'EXPIRED_STATE');
    }

    // Verify HMAC
    const payload = `${userId}:${timestampStr}:${random}`;
    const expectedHmac = crypto
      .createHmac('sha256', env.JWT_ACCESS_SECRET)
      .update(payload)
      .digest('hex');

    const hmacBuffer = Buffer.from(receivedHmac, 'hex');
    const expectedBuffer = Buffer.from(expectedHmac, 'hex');

    if (hmacBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(hmacBuffer, expectedBuffer)) {
      throw AppError.badRequest('OAuth state signature verification failed', 'INVALID_STATE');
    }

    return userId;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw AppError.badRequest('Invalid OAuth state', 'INVALID_STATE');
  }
}

/**
 * Constant-time verification of GitHub HMAC-SHA256 webhook signatures
 */
export function verifyGitHubWebhookSignature(
  rawBody: Buffer | string,
  signatureHeader: string | undefined,
  secret: string
): boolean {
  if (!signatureHeader || !secret) {
    return false;
  }

  const parts = signatureHeader.split('=');
  if (parts.length !== 2 || parts[0] !== 'sha256') {
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody)
    .digest('hex');

  const signatureBuffer = Buffer.from(parts[1]!, 'hex');
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');

  if (signatureBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
}
