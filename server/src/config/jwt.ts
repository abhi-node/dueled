import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Function to load JWT keys with fallback
function loadJwtKeys() {
  // First try environment variables (for production)
  if (process.env.JWT_SECRET) {
    return {
      privateKey: process.env.JWT_SECRET,
      publicKey: process.env.JWT_SECRET, // For symmetric keys
      algorithm: 'HS256' as const // Symmetric algorithm
    };
  }

  // Then try file system (for development)
  const privateKeyPath = path.join(__dirname, '../../jwtRS256.key');
  const publicKeyPath = path.join(__dirname, '../../jwtRS256.key.pub');

  try {
    return {
      privateKey: fs.readFileSync(privateKeyPath, 'utf8'),
      publicKey: fs.readFileSync(publicKeyPath, 'utf8'),
      algorithm: 'RS256' as const // Asymmetric algorithm
    };
  } catch (error) {
    // Fallback to a default secret (not recommended for production)
    console.warn('JWT keys not found, using default secret. This is not secure for production!');
    const defaultSecret = process.env.JWT_SECRET || 'dueled-development-secret-key-change-in-production';
    return {
      privateKey: defaultSecret,
      publicKey: defaultSecret,
      algorithm: 'HS256' as const // Symmetric algorithm for fallback
    };
  }
}

const keys = loadJwtKeys();

export const jwtConfig = {
  privateKey: keys.privateKey,
  publicKey: keys.publicKey,
  algorithm: keys.algorithm,
  accessTtl: 900, // 15 minutes in seconds
  refreshTtl: 604800, // 7 days in seconds
  issuer: 'dueled-api',
  audience: 'dueled-client'
};