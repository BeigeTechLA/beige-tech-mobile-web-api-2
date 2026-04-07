/**
 * Chat Service
 *
 * This file re-exports the refactored chat services for backward compatibility.
 * The service has been split into smaller, more maintainable modules:
 *
 * Structure:
 * - chat/
 *   - index.js                  - Barrel exports
 *   - chatRoom.service.js       - Chat room CRUD operations
 *   - chatMessage.service.js    - Message operations, reactions, replies
 *   - chatParticipant.service.js - Participant management
 */

module.exports = require('./chat');
