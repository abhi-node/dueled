import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function setupJwtSystem() {
  try {
    logger.info('Setting up JWT system...');
    
    // Check if JWT keys exist
    const privateKeyPath = path.join(__dirname, '../../jwtRS256.key');
    const publicKeyPath = path.join(__dirname, '../../jwtRS256.key.pub');
    
    if (!fs.existsSync(privateKeyPath) || !fs.existsSync(publicKeyPath)) {
      logger.error('JWT keys not found!');
      logger.info('Expected paths:');
      logger.info('Private key:', privateKeyPath);
      logger.info('Public key:', publicKeyPath);
      logger.info('Please run: openssl genrsa -out jwtRS256.key 2048 && openssl rsa -in jwtRS256.key -pubout -out jwtRS256.key.pub');
      process.exit(1);
    }
    
    // Test key loading
    const privateKey = fs.readFileSync(privateKeyPath, 'utf8');
    const publicKey = fs.readFileSync(publicKeyPath, 'utf8');
    
    logger.info('JWT keys loaded successfully!');
    logger.info('Private key length:', privateKey.length);
    logger.info('Public key length:', publicKey.length);
    
    // Basic validation (support both PKCS#1 and PKCS#8 formats)
    if (!privateKey.includes('-----BEGIN PRIVATE KEY-----') && !privateKey.includes('-----BEGIN RSA PRIVATE KEY-----')) {
      logger.error('Private key appears to be invalid');
      process.exit(1);
    }
    
    if (!publicKey.includes('-----BEGIN PUBLIC KEY-----')) {
      logger.error('Public key appears to be invalid');
      process.exit(1);
    }
    
    logger.info('JWT system is ready!');
    logger.info('✓ RSA keys exist and are valid');
    logger.info('✓ JWT configuration loaded');
    logger.info('✓ Ready to start server');
    
  } catch (error) {
    logger.error('Error setting up JWT system:', error);
    process.exit(1);
  }
}

setupJwtSystem();