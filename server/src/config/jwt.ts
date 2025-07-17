import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load keys from file system
const privateKeyPath = path.join(__dirname, '../../jwtRS256.key');
const publicKeyPath = path.join(__dirname, '../../jwtRS256.key.pub');

export const jwtConfig = {
  privateKey: fs.readFileSync(privateKeyPath, 'utf8'),
  publicKey: fs.readFileSync(publicKeyPath, 'utf8'),
  accessTtl: 900, // 15 minutes in seconds
  refreshTtl: 604800, // 7 days in seconds
  issuer: 'dueled-api',
  audience: 'dueled-client'
};