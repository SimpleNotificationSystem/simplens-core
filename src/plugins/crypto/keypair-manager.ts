/**
 * Key-Pair Envelope Encryption Manager
 * 
 * Secures provider credentials using RSA-OAEP (2048-bit) + AES-256-GCM envelope encryption.
 * Automatically generates, caches, and persists RSA key pair in MongoDB or loads from environment.
 */

import crypto from 'crypto';
import system_config_model from '@src/database/models/system-config.models.js';
import type { encrypted_credentials } from '@src/types/types.js';
import { pluginLoaderLogger as logger } from '@src/workers/utils/logger.js';

const PUBLIC_KEY_CONFIG = 'plugin_credentials_public_key';
const PRIVATE_KEY_CONFIG = 'plugin_credentials_private_key';

let cachedPublicKey: string | null = null;
let cachedPrivateKey: string | null = null;

/**
 * Generate a new 2048-bit RSA key pair in PEM format
 */
export function generateRSAKeyPair(): { publicKey: string; privateKey: string } {
  return crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
  });
}

/**
 * Get or create RSA Public and Private Key Pair
 * Priority: Environment Variables > MongoDB SystemConfig > Generate & Persist
 */
export async function getOrCreateKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
  if (cachedPublicKey && cachedPrivateKey) {
    return { publicKey: cachedPublicKey, privateKey: cachedPrivateKey };
  }

  // 1. Check environment variables
  const envPub = process.env.SIMPLENS_PLUGIN_PUBLIC_KEY;
  const envPriv = process.env.SIMPLENS_PLUGIN_PRIVATE_KEY;
  if (envPub && envPriv) {
    cachedPublicKey = envPub.replace(/\\n/g, '\n');
    cachedPrivateKey = envPriv.replace(/\\n/g, '\n');
    return { publicKey: cachedPublicKey, privateKey: cachedPrivateKey };
  }

  // 2. Check MongoDB for existing keys
  const [pubDoc, privDoc] = await Promise.all([
    system_config_model.findOne({ key: PUBLIC_KEY_CONFIG }),
    system_config_model.findOne({ key: PRIVATE_KEY_CONFIG }),
  ]);

  if (pubDoc?.value && privDoc?.value) {
    cachedPublicKey = pubDoc.value as string;
    cachedPrivateKey = privDoc.value as string;
    return { publicKey: cachedPublicKey, privateKey: cachedPrivateKey };
  }

  // 3. Generate new key pair and store in MongoDB
  logger.info('Generating new RSA 2048-bit key pair for provider credential encryption...');
  const keyPair = generateRSAKeyPair();

  await Promise.all([
    system_config_model.findOneAndUpdate(
      { key: PUBLIC_KEY_CONFIG },
      { value: keyPair.publicKey },
      { upsert: true, new: true }
    ),
    system_config_model.findOneAndUpdate(
      { key: PRIVATE_KEY_CONFIG },
      { value: keyPair.privateKey },
      { upsert: true, new: true }
    ),
  ]);

  cachedPublicKey = keyPair.publicKey;
  cachedPrivateKey = keyPair.privateKey;
  logger.success('RSA key pair generated and persisted to MongoDB system_configs');

  return { publicKey: cachedPublicKey, privateKey: cachedPrivateKey };
}

/**
 * Encrypt credentials using hybrid envelope encryption (AES-256-GCM + RSA-OAEP)
 * @param plaintext - Credentials object or JSON string to encrypt
 */
export async function encryptCredentials(
  plaintext: Record<string, string> | string
): Promise<encrypted_credentials> {
  const { publicKey } = await getOrCreateKeyPair();
  const dataString = typeof plaintext === 'string' ? plaintext : JSON.stringify(plaintext);

  // 1. Generate random 256-bit AES Data Encryption Key (DEK)
  const dek = crypto.randomBytes(32);
  const iv = crypto.randomBytes(16);

  // 2. Encrypt plaintext credentials with AES-256-GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', dek, iv, {
    authTagLength: 16,
  });

  let encryptedData = cipher.update(dataString, 'utf8', 'hex');
  encryptedData += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  // 3. Encrypt AES DEK with RSA Public Key (RSA-OAEP with SHA-256)
  const encryptedDek = crypto.publicEncrypt(
    {
      key: publicKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    dek
  ).toString('hex');

  return {
    encrypted_data: encryptedData,
    iv: iv.toString('hex'),
    auth_tag: authTag,
    encrypted_dek: encryptedDek,
  };
}

/**
 * Decrypt credentials using hybrid envelope encryption (AES-256-GCM + RSA-OAEP)
 * @param credentials - Encrypted credentials subdocument
 * @returns Decrypted Record<string, string>
 */
export async function decryptCredentials(
  credentials: encrypted_credentials
): Promise<Record<string, string>> {
  const { privateKey } = await getOrCreateKeyPair();

  // 1. Decrypt AES DEK using RSA Private Key
  const dek = crypto.privateDecrypt(
    {
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    Buffer.from(credentials.encrypted_dek, 'hex')
  );

  // 2. Decrypt ciphertext using AES-256-GCM
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    dek,
    Buffer.from(credentials.iv, 'hex'),
    { authTagLength: 16 }
  );

  decipher.setAuthTag(Buffer.from(credentials.auth_tag, 'hex'));

  let decrypted = decipher.update(credentials.encrypted_data, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return JSON.parse(decrypted) as Record<string, string>;
}

/**
 * Clear cached key pair (used in tests)
 */
export function clearKeyPairCache(): void {
  cachedPublicKey = null;
  cachedPrivateKey = null;
}
