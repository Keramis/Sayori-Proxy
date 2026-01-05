/**
 * JWE Session management using jose library
 * Handles encrypted session tokens stored in HTTP-only cookies
 */

import * as jose from 'jose';
import type { Request, Response } from 'express';

/**
 * Session payload structure stored in the JWE token
 */
export interface SessionPayload {
  userId: string;           // Discord user ID
  accessToken: string;      // Discord access token
  refreshToken: string;     // Discord refresh token
  tokenExpiresAt: number;   // When the access token expires (timestamp in milliseconds)
}

// Cookie configuration constants
export const SESSION_COOKIE_NAME = 'discord_session';
const SESSION_EXPIRY_DAYS = 7;
const SESSION_EXPIRY_SECONDS = SESSION_EXPIRY_DAYS * 24 * 60 * 60;
const SESSION_EXPIRY_MS = SESSION_EXPIRY_SECONDS * 1000;

// Cache the encryption key to avoid repeated derivation
let cachedEncryptionKey: Uint8Array | null = null;

/**
 * Derive a256-bit encryption key from SESSION_SECRET
 * Uses the secret directly as a UTF-8 encoded key
 * @returns256-bit encryption key
 */
export async function getEncryptionKey(): Promise<Uint8Array> {
  if (cachedEncryptionKey) {
    return cachedEncryptionKey;
  }

  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error('SESSION_SECRET must be set in environment variables');
  }

  if (secret.length < 32) {
    throw new Error('SESSION_SECRET must be at least 32 characters long');
  }

  // Convert the secret to a UTF-8 encoded byte array
  const encoder = new TextEncoder();
  const secretBytes = encoder.encode(secret);

  // Use the first 32 bytes (256 bits) for AES-256
  cachedEncryptionKey = secretBytes.slice(0, 32);

  return cachedEncryptionKey;
}

/**
 * Create a JWE-encrypted session token
 * @param payload - Session data to encrypt
 * @returns JWE token string
 */
export async function createSessionToken(payload: SessionPayload): Promise<string> {
  const key = await getEncryptionKey();

  try {
    const token = await new jose.EncryptJWT({
      userId: payload.userId,
      accessToken: payload.accessToken,
      refreshToken: payload.refreshToken,
      tokenExpiresAt: payload.tokenExpiresAt,
    }).setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
      .setIssuedAt()
      .setExpirationTime(`${SESSION_EXPIRY_SECONDS}s`)
      .encrypt(key);

    return token;
  } catch (error) {
    console.error('Error creating session token:', error);
    throw error;
  }
}

/**
 * Verify and decrypt a JWE session token
 * @param token - JWE token string
 * @returns Session payload if valid, null if invalid or expired
 */
export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  const key = await getEncryptionKey();

  try {
    const { payload } = await jose.jwtDecrypt(token, key, {
      clockTolerance: 5, // Allow 5 seconds of clock skew
    });

    // Validate the payload structure
    if (
      typeof payload.userId !== 'string' ||
      typeof payload.accessToken !== 'string' ||
      typeof payload.refreshToken !== 'string' ||
      typeof payload.tokenExpiresAt !== 'number'
    ) {
      console.error('Invalid session payload structure');
      return null;
    }

    return {
      userId: payload.userId,
      accessToken: payload.accessToken,
      refreshToken: payload.refreshToken,
      tokenExpiresAt: payload.tokenExpiresAt,
    };
  } catch (error) {
    // Token is invalid or expired
    if (error instanceof jose.errors.JWTExpired) {
      console.log('Session token expired');
    } else if (error instanceof jose.errors.JWEDecryptionFailed) {
      console.error('Session token decryption failed');
    } else {
      console.error('Error verifying session token:', error);
    }
    return null;
  }
}

/**
 * Extract and verify session from request cookies
 * @param req - Express request object
 * @returns Session payload if valid, null otherwise
 */
export async function getSessionFromRequest(req: Request): Promise<SessionPayload | null> {
  // Extract cookie from request
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) {
    return null;
  }

  // Parse cookies manually (simple parser for our single cookie)
  const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
    const [key, value] = cookie.trim().split('=');
    if (key && value) {
      acc[key] = decodeURIComponent(value);
    }
    return acc;
  }, {} as Record<string, string>);

  const token = cookies[SESSION_COOKIE_NAME];
  if (!token) {
    return null;
  }

  return verifySessionToken(token);
}

/**
 * Set the session cookie on the response
 * @param res - Express response object
 * @param token - JWE token to store in cookie
 */
export function setSessionCookie(res: Response, token: string): void {
  const isProduction = process.env.NODE_ENV === 'production';

  // Build cookie options
  const options = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'HttpOnly',
    'Path=/',
    `Max-Age=${SESSION_EXPIRY_SECONDS}`,
    'SameSite=Lax',
  ];

  // Only set Secure flag in production (requires HTTPS)
  if (isProduction) {
    options.push('Secure');
  }

  res.setHeader('Set-Cookie', options.join('; '));
}

/**
 * Clear the session cookie
 * @param res - Express response object
 */
export function clearSessionCookie(res: Response): void {
  const options = [
    `${SESSION_COOKIE_NAME}=`,
    'HttpOnly',
    'Path=/',
    'Max-Age=0',
    'SameSite=Lax',
  ];

  res.setHeader('Set-Cookie', options.join('; '));
}