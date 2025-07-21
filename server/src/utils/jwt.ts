import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { jwtConfig } from '../config/jwt.js';
import { redis } from '../services/redis.js';

export interface JwtPayload {
  sub: string;          // userId
  sid: string;          // sessionId (unique per login)
  role: 'user' | 'admin';
  jti: string;          // unique token id
  iat?: number;
  exp?: number;
  // Legacy compatibility fields
  playerId?: string;
  username?: string;
}

export interface RefreshTokenPayload {
  sid: string;          // sessionId
  sub: string;          // userId
  jti: string;          // unique token id
  iat?: number;
  exp?: number;
}

/**
 * Sign an access token with configured algorithm
 */
export function signAccessToken(payload: Omit<JwtPayload, 'jti' | 'iat' | 'exp'>): string {
  return jwt.sign(
    { 
      ...payload, 
      jti: randomUUID() 
    },
    jwtConfig.privateKey,
    { 
      algorithm: jwtConfig.algorithm, 
      expiresIn: jwtConfig.accessTtl,
      issuer: jwtConfig.issuer,
      audience: jwtConfig.audience
    }
  );
}

/**
 * Sign a refresh token with configured algorithm
 */
export function signRefreshToken(sid: string, userId: string): string {
  return jwt.sign(
    { 
      sid, 
      sub: userId, 
      jti: randomUUID() 
    },
    jwtConfig.privateKey,
    { 
      algorithm: jwtConfig.algorithm, 
      expiresIn: jwtConfig.refreshTtl,
      issuer: jwtConfig.issuer,
      audience: jwtConfig.audience
    }
  );
}

/**
 * Verify a token with configured algorithm and clock tolerance
 */
export function verifyToken<T = JwtPayload>(token: string): T {
  return jwt.verify(token, jwtConfig.publicKey, { 
    algorithms: [jwtConfig.algorithm],
    issuer: jwtConfig.issuer,
    audience: jwtConfig.audience,
    clockTolerance: 60 // 60 seconds tolerance for clock skew
  }) as T;
}

/**
 * Store refresh token in Redis
 */
export async function storeRefreshToken(sessionId: string, userId: string, ttl: number): Promise<void> {
  await redis.setex(`rt:${sessionId}`, ttl, userId);
}

/**
 * Validate refresh token exists in Redis
 */
export async function validateRefreshToken(sessionId: string): Promise<string | null> {
  return await redis.get(`rt:${sessionId}`);
}

/**
 * Revoke refresh token
 */
export async function revokeRefreshToken(sessionId: string): Promise<void> {
  await redis.delete(`rt:${sessionId}`);
}

/**
 * Add access token to deny list (for immediate revocation)
 */
export async function denyListAccessToken(jti: string, ttl: number): Promise<void> {
  await redis.setex(`deny:${jti}`, ttl, '1');
}

/**
 * Check if access token is deny-listed
 */
export async function isTokenDenyListed(jti: string): Promise<boolean> {
  const result = await redis.exists(`deny:${jti}`);
  return result === 1;
}

/**
 * Create a new session with tokens
 */
export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
}

export async function createSession(userId: string, role: 'user' | 'admin' = 'user'): Promise<SessionTokens> {
  const sessionId = randomUUID();
  
  // Create tokens
  const accessToken = signAccessToken({ sub: userId, sid: sessionId, role });
  const refreshToken = signRefreshToken(sessionId, userId);
  
  // Store refresh token in Redis
  await storeRefreshToken(sessionId, userId, jwtConfig.refreshTtl);
  
  return {
    accessToken,
    refreshToken,
    sessionId
  };
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  try {
    // Verify refresh token
    const payload = verifyToken<RefreshTokenPayload>(refreshToken);
    
    // Check if refresh token exists in Redis
    const userId = await validateRefreshToken(payload.sid);
    if (!userId || userId !== payload.sub) {
      return null;
    }
    
    // Create new access token with same session ID
    const newAccessToken = signAccessToken({ 
      sub: payload.sub, 
      sid: payload.sid, 
      role: 'user' // TODO: Get actual role from database
    });
    
    return newAccessToken;
  } catch (error) {
    return null;
  }
}

/**
 * Destroy session (logout)
 */
export async function destroySession(sessionId: string, accessTokenJti?: string): Promise<void> {
  // Revoke refresh token
  await revokeRefreshToken(sessionId);
  
  // Optionally deny-list the access token for immediate revocation
  if (accessTokenJti) {
    // Calculate remaining TTL for the access token
    const ttl = Math.min(jwtConfig.accessTtl, 900); // Max 15 minutes
    await denyListAccessToken(accessTokenJti, ttl);
  }
}