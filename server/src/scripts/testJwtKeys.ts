import { jwtConfig } from '../config/jwt.js';
import { logger } from '../utils/logger.js';

try {
  logger.info('Testing JWT configuration...');
  logger.info('Private key length:', jwtConfig.privateKey.length);
  logger.info('Public key length:', jwtConfig.publicKey.length);
  logger.info('JWT config loaded successfully!');
} catch (error) {
  logger.error('Error loading JWT config:', error);
}