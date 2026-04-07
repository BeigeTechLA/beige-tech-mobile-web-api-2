const express = require("express");
const auth = require("../../middlewares/auth");
const encryptionController = require("../../controllers/encryption.controller");

const router = express.Router();

/**
 * E2E Encryption Routes
 *
 * POST   /setup              - Initialize E2E encryption for user
 * GET    /status             - Check if user has E2E enabled
 * GET    /recovery-data      - Get encrypted private key for key recovery
 * GET    /users/:userId/public-key  - Get user's public key
 * POST   /users/public-keys  - Batch get public keys
 * POST   /rooms/:roomId/keys - Store encrypted room keys
 * GET    /rooms/:roomId/key  - Get user's encrypted room key
 * GET    /user/room-keys     - Get all room keys for user
 */

// User E2E setup
router.post("/setup", auth(), encryptionController.setupE2E);
router.get("/status", auth(), encryptionController.checkE2EStatus);
router.get("/recovery-data", auth(), encryptionController.getRecoveryData);

// Public key endpoints
router.get("/users/:userId/public-key", auth(), encryptionController.getUserPublicKey);
router.post("/users/public-keys", auth(), encryptionController.getBatchPublicKeys);

// Room key endpoints
router.post("/rooms/:roomId/keys", auth(), encryptionController.storeRoomKeys);
router.get("/rooms/:roomId/key", auth(), encryptionController.getRoomKey);
router.get("/rooms/:roomId/key/plain", auth(), encryptionController.getPlainRoomKey); // Simplified - no RSA
router.get("/rooms/:roomId/status", auth(), encryptionController.checkRoomEncryptionStatus);
router.get("/user/room-keys", auth(), encryptionController.getAllUserRoomKeys);

// Admin: re-initialize encryption for a specific room
router.post("/rooms/:roomId/reinitialize", auth(), encryptionController.reinitializeRoomEncryption);
// Admin: migrate all rooms that are missing room_key
router.post("/migrate-all", auth(), encryptionController.migrateAllRoomEncryption);

module.exports = router;
