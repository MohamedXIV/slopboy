/**
 * OAuth 2.1 Token Verifier for Remote MCP.
 *
 * Implements token verification conforming to RFC 6749, RFC 6750, and RFC 9068:
 * - Validates Bearer token headers.
 * - Verifies Issuer (iss), Audience (aud), Expiration (exp), and Not-Before (nbf).
 * - Enforces resource-bound tokens (preventing token forwarding from other APIs).
 * - Enforces minimum required scopes (e.g. mcp:write for draft creation).
 * - Resolves authenticated user identity (sub) server-side; NEVER accepts client-supplied user IDs.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

export interface AuthSubject {
  readonly userId: string;
  readonly clientId: string;
  readonly scopes: readonly string[];
  readonly issuer: string;
  readonly audience: string;
  readonly issuedAt: number;
  readonly expiresAt: number;
}

export interface TokenVerificationOptions {
  readonly expectedIssuer: string;
  readonly expectedAudience: string;
  readonly secretKey: string;
  readonly requiredScope?: string;
  readonly clockToleranceSeconds?: number;
}

export interface VerificationResult {
  readonly ok: boolean;
  readonly subject?: AuthSubject;
  readonly error?: {
    readonly status: 400 | 401 | 403;
    readonly error: 'invalid_request' | 'invalid_token' | 'insufficient_scope';
    readonly errorDescription: string;
    readonly wwwAuthenticate: string;
  };
}

export interface JwtPayload {
  readonly iss: string;
  readonly sub: string;
  readonly aud: string | readonly string[];
  readonly exp: number;
  readonly nbf?: number;
  readonly iat?: number;
  readonly client_id?: string;
  readonly scope?: string;
  readonly [key: string]: unknown;
}

function base64UrlEncode(data: string | Buffer): string {
  const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64UrlDecodeToBuffer(str: string): Buffer {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64');
}

function base64UrlDecode(str: string): string {
  return base64UrlDecodeToBuffer(str).toString('utf8');
}

/**
 * Creates a signed JWT for testing and development authorization flows.
 */
export function createTestAccessToken(
  payload: {
    sub: string;
    iss: string;
    aud: string;
    scope: string;
    client_id?: string;
    expiresInSeconds?: number;
  },
  secretKey: string
): string {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + (payload.expiresInSeconds ?? 3600);

  const header = { alg: 'HS256', typ: 'at+jwt' };
  const fullPayload: JwtPayload = {
    iss: payload.iss,
    sub: payload.sub,
    aud: payload.aud,
    client_id: payload.client_id || 'test-client',
    scope: payload.scope,
    iat: now,
    exp,
  };

  const headerEncoded = base64UrlEncode(JSON.stringify(header));
  const payloadEncoded = base64UrlEncode(JSON.stringify(fullPayload));
  const signingInput = `${headerEncoded}.${payloadEncoded}`;

  const signature = createHmac('sha256', secretKey).update(signingInput).digest();
  const signatureEncoded = base64UrlEncode(signature);

  return `${signingInput}.${signatureEncoded}`;
}

/**
 * Verifies an OAuth 2.1 Bearer Token from an HTTP Authorization header.
 */
export function verifyAccessToken(
  authHeader: string | undefined | null,
  options: TokenVerificationOptions
): VerificationResult {
  if (!authHeader || typeof authHeader !== 'string') {
    return {
      ok: false,
      error: {
        status: 401,
        error: 'invalid_request',
        errorDescription: 'Missing Authorization header with Bearer token',
        wwwAuthenticate: 'Bearer error="invalid_request", error_description="Missing Authorization header"',
      },
    };
  }

  const parts = authHeader.trim().split(/\s+/);
  if (parts.length !== 2 || parts[0]?.toLowerCase() !== 'bearer') {
    return {
      ok: false,
      error: {
        status: 400,
        error: 'invalid_request',
        errorDescription: 'Authorization header must use Bearer scheme (RFC 6750)',
        wwwAuthenticate: 'Bearer error="invalid_request", error_description="Bearer scheme required"',
      },
    };
  }

  const token = parts[1];
  if (token.length > 16384 || Buffer.byteLength(options.secretKey, 'utf8') < 32) {
    return {
      ok: false,
      error: {
        status: 401, error: 'invalid_token',
        errorDescription: 'Token cannot be verified with this configuration',
        wwwAuthenticate: 'Bearer error="invalid_token"',
      },
    };
  }
  const segments = token.split('.');
  if (segments.length !== 3) {
    return {
      ok: false,
      error: {
        status: 401,
        error: 'invalid_token',
        errorDescription: 'Malformed JWT access token structure',
        wwwAuthenticate: 'Bearer error="invalid_token", error_description="Malformed token"',
      },
    };
  }

  const [headerB64, payloadB64, signatureB64] = segments;

  // JWT signature bytes alone are insufficient: enforce the expected algorithm
  // and access-token profile, otherwise algorithm confusion is possible.
  try {
    const header = JSON.parse(base64UrlDecode(headerB64));
    if (header?.alg !== 'HS256' || header?.typ !== 'at+jwt') {
      throw new Error('Unsupported token header');
    }
  } catch {
    return {
      ok: false,
      error: {
        status: 401, error: 'invalid_token',
        errorDescription: 'Unsupported JWT algorithm or token type',
        wwwAuthenticate: 'Bearer error="invalid_token"',
      },
    };
  }

  // Verify HMAC signature
  const signingInput = `${headerB64}.${payloadB64}`;
  const expectedSig = createHmac('sha256', options.secretKey).update(signingInput).digest();
  const actualSig = base64UrlDecodeToBuffer(signatureB64);

  if (expectedSig.length !== actualSig.length || !timingSafeEqual(expectedSig, actualSig)) {
    return {
      ok: false,
      error: {
        status: 401,
        error: 'invalid_token',
        errorDescription: 'Invalid token signature',
        wwwAuthenticate: 'Bearer error="invalid_token", error_description="Invalid signature"',
      },
    };
  }

  // Parse payload
  let payload: JwtPayload;
  try {
    payload = JSON.parse(base64UrlDecode(payloadB64));
  } catch {
    return {
      ok: false,
      error: {
        status: 401,
        error: 'invalid_token',
        errorDescription: 'Invalid token payload JSON',
        wwwAuthenticate: 'Bearer error="invalid_token", error_description="Invalid payload"',
      },
    };
  }

  const now = Math.floor(Date.now() / 1000);
  const tolerance = options.clockToleranceSeconds ?? 5;

  // 1. Verify expiration
  if (!Number.isFinite(payload.exp) || payload.exp + tolerance < now) {
    return {
      ok: false,
      error: {
        status: 401,
        error: 'invalid_token',
        errorDescription: 'Access token has expired',
        wwwAuthenticate: 'Bearer error="invalid_token", error_description="Token expired"',
      },
    };
  }

  // 2. Verify Not Before (nbf) if present
  if (payload.nbf !== undefined && (!Number.isFinite(payload.nbf) || payload.nbf - tolerance > now)) {
    return {
      ok: false,
      error: {
        status: 401,
        error: 'invalid_token',
        errorDescription: 'Token is not yet active',
        wwwAuthenticate: 'Bearer error="invalid_token", error_description="Token not active"',
      },
    };
  }

  // 3. Verify Issuer (iss)
  if (payload.iss !== options.expectedIssuer) {
    return {
      ok: false,
      error: {
        status: 401,
        error: 'invalid_token',
        errorDescription: `Token issuer mismatch: expected "${options.expectedIssuer}", got "${payload.iss}"`,
        wwwAuthenticate: 'Bearer error="invalid_token", error_description="Issuer mismatch"',
      },
    };
  }

  // 4. Verify Audience (aud) - RFC 9068
  const audienceList = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audienceList.includes(options.expectedAudience)) {
    return {
      ok: false,
      error: {
        status: 403,
        error: 'invalid_token',
        errorDescription: `Token audience mismatch: resource requires "${options.expectedAudience}"`,
        wwwAuthenticate: `Bearer error="invalid_token", error_description="Audience mismatch", resource="${options.expectedAudience}"`,
      },
    };
  }

  // 5. Verify Subject (sub)
  if (!payload.sub || typeof payload.sub !== 'string') {
    return {
      ok: false,
      error: {
        status: 401,
        error: 'invalid_token',
        errorDescription: 'Token missing subject (sub) claim',
        wwwAuthenticate: 'Bearer error="invalid_token", error_description="Missing subject"',
      },
    };
  }

  // 6. Extract scopes and verify required scope
  if (payload.scope !== undefined && typeof payload.scope !== 'string') {
    return { ok: false, error: {
      status: 401, error: 'invalid_token',
      errorDescription: 'Malformed scope claim',
      wwwAuthenticate: 'Bearer error="invalid_token"',
    } };
  }
  const scopes = (payload.scope || '').split(/\s+/).filter(Boolean);
  if (options.requiredScope && !scopes.includes(options.requiredScope)) {
    return {
      ok: false,
      error: {
        status: 403,
        error: 'insufficient_scope',
        errorDescription: `Access requires scope "${options.requiredScope}". Granted scopes: "${scopes.join(' ')}"`,
        wwwAuthenticate: `Bearer error="insufficient_scope", scope="${options.requiredScope}"`,
      },
    };
  }

  const subject: AuthSubject = {
    userId: payload.sub,
    clientId: payload.client_id || 'unknown',
    scopes,
    issuer: payload.iss,
    audience: options.expectedAudience,
    issuedAt: payload.iat ?? now,
    expiresAt: payload.exp,
  };

  return { ok: true, subject };
}
