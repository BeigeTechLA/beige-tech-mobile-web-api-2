const crypto = require('crypto');
const config = require('../config/config');

/**
 * Encrypts a string or object using AES-256-CBC
 * Compatible with CryptoJS.AES.encrypt on the frontend
 * @param {string|Object} data - Data to encrypt (string or object)
 * @returns {string} - URL-safe encrypted string
 */
const encrypt = (data) => {
  try {
    // Convert object to string if needed
    const stringData = typeof data === 'object' ? JSON.stringify(data) : String(data);
    
    // Get the key and IV from config
    const key = config.encryption.key;
    
    // For AES-256-CBC, we need a 32-byte key
    // Use SHA-256 to derive a consistent 32-byte key from the provided key
    const keyBuffer = crypto.createHash('sha256').update(String(key)).digest();
    
    // For IV, we need a 16-byte buffer
    // If IV is not provided, derive it from the key (for development only)
    const iv = config.encryption.iv || key.slice(0, 16);
    const ivBuffer = Buffer.from(iv.padEnd(16, '0').slice(0, 16));
    
    // Create cipher using the encryption key and IV
    const cipher = crypto.createCipheriv('aes-256-cbc', keyBuffer, ivBuffer);
    
    // Encrypt the data
    let encrypted = cipher.update(stringData, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    // Make the result URL-safe for passing in URLs
    return encodeURIComponent(encrypted);
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt data');
  }
};

/**
 * Decrypts an encrypted string back to its original form
 * Compatible with CryptoJS.AES.decrypt on the frontend
 * @param {string} encryptedData - URL-safe encrypted string
 * @param {boolean} parseJson - Whether to parse the result as JSON
 * @returns {string|Object} - Decrypted data (string or object)
 */
const decrypt = (encryptedData, parseJson = false) => {
  try {
    // Decode URL-safe string
    const decoded = decodeURIComponent(encryptedData);
    
    // Get the key and IV from config
    const key = config.encryption.key;
    
    // For AES-256-CBC, we need a 32-byte key
    // Use SHA-256 to derive a consistent 32-byte key from the provided key
    const keyBuffer = crypto.createHash('sha256').update(String(key)).digest();
    
    // For IV, we need a 16-byte buffer
    // If IV is not provided, derive it from the key (for development only)
    const iv = config.encryption.iv || key.slice(0, 16);
    const ivBuffer = Buffer.from(iv.padEnd(16, '0').slice(0, 16));
    
    // Create decipher using the encryption key and IV
    const decipher = crypto.createDecipheriv('aes-256-cbc', keyBuffer, ivBuffer);
    
    // Decrypt the data
    let decrypted = decipher.update(decoded, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    
    // Parse as JSON if requested
    return parseJson ? JSON.parse(decrypted) : decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt data');
  }
};

module.exports = {
  encrypt,
  decrypt
};
