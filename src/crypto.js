'use strict';

const crypto = require('crypto');

// Clé de chiffrement AES-256-GCM pour les tokens Discord stockés en base.
// En production, définis ENCRYPTION_KEY (64 caractères hexa = 32 octets) dans .env.
// Si absente, une clé est générée à la volée (les tokens ne survivront pas
// à un redémarrage du process : à réserver au développement local).
let keyMaterial = process.env.ENCRYPTION_KEY;
if (!keyMaterial) {
  console.warn(
    '[crypto] ENCRYPTION_KEY absente de .env : une clé temporaire est générée. ' +
      'Les tokens chiffrés ne seront plus lisibles après redémarrage. Voir .env.example.'
  );
  keyMaterial = crypto.randomBytes(32).toString('hex');
}

const KEY = crypto.createHash('sha256').update(String(keyMaterial)).digest();

function encrypt(plainText) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('hex'), authTag.toString('hex'), encrypted.toString('hex')].join(':');
}

function decrypt(payload) {
  const [ivHex, authTagHex, dataHex] = String(payload).split(':');
  if (!ivHex || !authTagHex || !dataHex) throw new Error('Payload chiffré invalide');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const data = Buffer.from(dataHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString('utf8');
}

function maskToken(token) {
  if (!token) return '';
  const visible = token.slice(0, 6);
  return `${visible}${'•'.repeat(18)}`;
}

module.exports = { encrypt, decrypt, maskToken };
