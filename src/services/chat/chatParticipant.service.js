/**
 * Chat Participant Service
 * Handles participant management (add, remove, query)
 */

const httpStatus = require("http-status");
const mongoose = require("mongoose");
const { ChatRoom, ChatMessage, User } = require("../../models");
const ApiError = require("../../utils/ApiError");
const encryptionService = require("../encryption.service");
const sendgridService = require("../sendgrid.service");
const { MESSAGING_INITIATED_TEMPLATE_ID } = require("../../config/sendgridTemplates");

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

const toParticipantPayload = async (entry, fallbackRole = null) => {
  if (!entry) return null;

  const rawId = entry.id ?? entry;
  const id = rawId != null ? String(rawId) : undefined;

  if (id && mongoose.Types.ObjectId.isValid(id)) {
    const user = await User.findById(id).select('_id name email profile_picture role').lean();
    if (user) {
      return {
        ...user,
        id: user._id?.toString() || id,
        added_at: entry.added_at,
        role: entry.role || fallbackRole || user.role || null,
        profileImage: entry.profileImage || user.profile_picture || null,
      };
    }
  }

  return {
    id,
    name: entry.name || entry.email || id || 'Participant',
    email: entry.email || null,
    added_at: entry.added_at,
    role: entry.role || fallbackRole || null,
    profileImage: entry.profileImage || null,
  };
};

const normalizeParticipantInput = (value) => {
  if (!value) return null;

  if (typeof value === "string" || typeof value === "number") {
    const id = String(value).trim();
    return id ? { id, name: id, email: null } : null;
  }

  const id = String(value.id || value.email || "").trim();
  if (!id) return null;

  return {
    id,
    name: value.name || value.email || id,
    email: value.email || null,
    role: value.role || null,
    profileImage: value.profileImage || null,
  };
};

const resolveStoredParticipantId = (value, depth = 0) => {
  if (value == null) return null;
  if (depth > 4) return null;
  if (typeof value === "string" || typeof value === "number") {
    const id = String(value).trim();
    return id || null;
  }

  const directCandidates = [value._id, value.id, value.user_id, value.userId, value.email];
  for (const candidate of directCandidates) {
    if (candidate == null) continue;
    if (typeof candidate === "string" || typeof candidate === "number") {
      const normalized = String(candidate).trim();
      if (normalized && normalized !== "[object Object]") {
        return normalized;
      }
      continue;
    }

    const nested = resolveStoredParticipantId(candidate, depth + 1);
    if (nested) {
      return nested;
    }
  }

  return null;
};

const normalizeRemovalRole = (role) => {
  const normalizedRole = String(role || "").trim().toLowerCase();
  if (normalizedRole === "admin" || normalizedRole === "sales_rep") {
    return "manager";
  }
  return normalizedRole;
};

const sendAddedParticipantsTemplateEmail = async ({
  chatRoom,
  addedParticipantIds = [],
  addedParticipantEmails = [],
  adminName,
}) => {
  try {
    if (!MESSAGING_INITIATED_TEMPLATE_ID) return;

    const objectIds = [...new Set(
      (addedParticipantIds || [])
        .map((id) => String(id || "").trim())
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
    )];

    const users = objectIds.length
      ? await User.find({ _id: { $in: objectIds } }).select("name email role").lean()
      : [];

    const recipients = new Map();
    users.forEach((user) => {
      const email = normalizeEmail(user?.email || "");
      if (!email) return;
      recipients.set(email, {
        email,
        name: String(user?.name || "").trim() || "Team Member",
        role: String(user?.role || "").trim() || null,
      });
    });

    (addedParticipantEmails || []).forEach((entry) => {
      const email = normalizeEmail(entry?.email || entry);
      if (!email || recipients.has(email)) return;
      recipients.set(email, {
        email,
        name: String(entry?.name || "").trim() || "Team Member",
        role: String(entry?.role || "").trim() || null,
      });
    });

    const recipientEmails = Array.from(recipients.keys());
    if (!recipientEmails.length) return;

    await sendgridService.sendDynamicTemplateEmail({
      to: recipientEmails,
      templateId: MESSAGING_INITIATED_TEMPLATE_ID,
      dynamicTemplateData: {
        chat_room_id: String(chatRoom?._id || ""),
        chat_name: String(chatRoom?.name || ""),
        order_id: String(chatRoom?.order_id || ""),
        sender_name: String(adminName || "Beige Admin"),
        message_preview: "You have been added to this conversation.",
        event_type: "participant_added",
        sent_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.warn("[chat] added-participant template email failed:", error?.message || error);
  }
};

/**
 * Add participants to a chat room (Admin only)
 */
const addParticipants = async (chatRoomId, participantData, adminId, adminName) => {
  const { role, user_ids, participants } = participantData;

  try {
    const chatRoom = await ChatRoom.findById(chatRoomId);
    if (!chatRoom) {
      throw new ApiError(httpStatus.NOT_FOUND, "Chat room not found");
    }

    if (chatRoom.status !== "active") {
      throw new ApiError(httpStatus.BAD_REQUEST, "Cannot add participants to an inactive chat");
    }

    const normalizedParticipants = Array.isArray(participants) && participants.length
      ? participants.map((entry) => normalizeParticipantInput(entry)).filter(Boolean)
      : Array.isArray(user_ids)
        ? user_ids.map((entry) => normalizeParticipantInput(entry)).filter(Boolean)
        : [];

    if (normalizedParticipants.length === 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Participants are required");
    }

    const addedUserIds = [];
    const addedUserNames = [];
    const addedParticipantEmails = [];

    for (const user of normalizedParticipants) {
      const participantEntry = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role || role || null,
        profileImage: user.profileImage || null,
        added_at: new Date(),
        added_by: adminId,
      };

      switch (role) {
        case 'client':
          if (
            chatRoom.client_id?.toString() !== String(user.id) &&
            chatRoom.client_snapshot?.id?.toString() !== String(user.id)
          ) {
            if (mongoose.Types.ObjectId.isValid(String(user.id))) {
              chatRoom.client_id = user.id;
              chatRoom.client_snapshot = undefined;
            } else {
              participantEntry.role = 'client';
              chatRoom.client_snapshot = participantEntry;
            }
            addedUserIds.push(user.id);
            addedUserNames.push(user.name);
            if (user.email) {
              addedParticipantEmails.push({
                email: user.email,
                name: user.name,
                role: participantEntry.role || role || "client",
              });
            }
          }
          break;
        case 'cp':
          const existingCp = chatRoom.cp_ids.find(cp => String(cp.id) === String(user.id));
          if (!existingCp) {
            participantEntry.decision = 'pending';
            chatRoom.cp_ids.push(participantEntry);
            addedUserIds.push(user.id);
            addedUserNames.push(user.name);
            if (user.email) {
              addedParticipantEmails.push({
                email: user.email,
                name: user.name,
                role: participantEntry.role || role || "cp",
              });
            }
          }
          break;
        case 'pm':
          if (!chatRoom.pm_id || String(chatRoom.pm_id) !== String(user.id)) {
            chatRoom.pm_id = user.id;
            addedUserIds.push(user.id);
            addedUserNames.push(user.name);
            if (user.email) {
              addedParticipantEmails.push({
                email: user.email,
                name: user.name,
                role: participantEntry.role || role || "pm",
              });
            }
          }
          break;
        case 'production':
          const existingProd = chatRoom.production_ids?.find(p => String(p.id) === String(user.id));
          if (!existingProd) {
            participantEntry.role = 'production';
            chatRoom.production_ids = chatRoom.production_ids || [];
            chatRoom.production_ids.push(participantEntry);
            addedUserIds.push(user.id);
            addedUserNames.push(user.name);
            if (user.email) {
              addedParticipantEmails.push({
                email: user.email,
                name: user.name,
                role: participantEntry.role || role || "production",
              });
            }
          }
          break;
        case 'manager':
        case 'admin':
        case 'sales_rep':
          const existingManager = chatRoom.manager_ids?.find(m => String(m.id) === String(user.id));
          if (!existingManager) {
            chatRoom.manager_ids = chatRoom.manager_ids || [];
            chatRoom.manager_ids.push(participantEntry);
            addedUserIds.push(user.id);
            addedUserNames.push(user.name);
            if (user.email) {
              addedParticipantEmails.push({
                email: user.email,
                name: user.name,
                role: participantEntry.role || role || "manager",
              });
            }
          }
          break;
        default:
          throw new ApiError(httpStatus.BAD_REQUEST, "Invalid role specified");
      }

      // Remove from removed_participants if re-adding
      if (chatRoom.removed_participants) {
        chatRoom.removed_participants = chatRoom.removed_participants.filter(
          rp => rp.user_id?.toString() !== String(user.id)
        );
      }
    }

    if (addedUserIds.length === 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, "All users are already participants");
    }

    // Grant encryption access BEFORE saving to DB so we can abort without any rollback needed
    try {
      const encryptableIds = addedUserIds.filter((id) => mongoose.Types.ObjectId.isValid(String(id)));
      if (encryptableIds.length === 0) {
        await chatRoom.save();
      } else {
      const encryptionResult = await encryptionService.grantEncryptionAccessToMultiple(
        chatRoomId,
        encryptableIds.map(id => id.toString()),
        adminId
      );
      console.log(`Encryption access granted to ${encryptionResult.granted.length} users, failed for ${encryptionResult.failed.length}`);

      if (encryptionResult.failed.length > 0) {
        const failedUsers = await User.find({ _id: { $in: encryptionResult.failed.map(f => f.userId || f) } }).select('name');
        const failedNames = failedUsers.map(u => u.name).join(', ');
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Cannot add participants without encryption keys. The following users need to set up encryption first: ${failedNames}`
        );
      }
      }
    } catch (err) {
      if (err.statusCode) throw err;
      throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Failed to grant encryption access: ${err.message}`);
    }

    // Encryption succeeded (or room has no encryption) — now persist participant changes
    await chatRoom.save();

    const roleLabel = role === 'cp' ? 'Creative Partner' :
                      role === 'client' ? 'Client' :
                      role === 'pm' ? 'Project Manager' :
                      role === 'production' ? 'Production Team' :
                      role === 'sales_rep' ? 'Sales Rep' :
                      role === 'admin' ? 'Admin' : 'Admin/Manager';

    const systemMessage = await ChatMessage.create({
      chat_room_id: chatRoomId,
      message: `${adminName} added ${addedUserNames.join(', ')} as ${roleLabel}`,
      message_type: 'system',
      system_message: {
        type: 'participant_added',
        actor_id: adminId,
        actor_name: adminName,
        target_ids: addedUserIds,
        target_names: addedUserNames,
        target_role: role,
      },
    });

    // Update last message
    await ChatRoom.findByIdAndUpdate(chatRoomId, { last_message: systemMessage._id });

    await sendAddedParticipantsTemplateEmail({
      chatRoom,
      addedParticipantIds: addedUserIds,
      addedParticipantEmails,
      adminName,
    });

    return { chatRoom, systemMessage };
  } catch (error) {
    throw error;
  }
};

/**
 * Remove a participant from a chat room (Admin only)
 */
const removeParticipant = async (chatRoomId, userId, role, adminId, adminName) => {
  try {
    const chatRoom = await ChatRoom.findById(chatRoomId).populate('order_id', 'order_name');
    if (!chatRoom) {
      throw new ApiError(httpStatus.NOT_FOUND, "Chat room not found");
    }
    const normalizedUserId = String(userId).trim();
    const normalizedRole = normalizeRemovalRole(role);

    const orderName = chatRoom.order_id?.order_name || 'the shoot';

    let removed = false;
    let removedParticipant = null;

    switch (normalizedRole) {
      case 'cp':
        const cpIndex = chatRoom.cp_ids.findIndex((cp) => resolveStoredParticipantId(cp) === normalizedUserId);
        if (cpIndex !== -1) {
          removedParticipant = chatRoom.cp_ids[cpIndex];
          chatRoom.cp_ids.splice(cpIndex, 1);
          removed = true;
        }
        break;
      case 'pm':
        if (resolveStoredParticipantId(chatRoom.pm_id) === normalizedUserId) {
          removedParticipant = chatRoom.pm_id;
          chatRoom.pm_id = null;
          removed = true;
        }
        break;
      case 'production':
        const prodIndex = chatRoom.production_ids?.findIndex((p) => resolveStoredParticipantId(p) === normalizedUserId);
        if (prodIndex !== -1 && prodIndex !== undefined) {
          removedParticipant = chatRoom.production_ids[prodIndex];
          chatRoom.production_ids.splice(prodIndex, 1);
          removed = true;
        }
        break;
      case 'manager':
        const managerIndex = chatRoom.manager_ids?.findIndex((m) => resolveStoredParticipantId(m) === normalizedUserId);
        if (managerIndex !== -1 && managerIndex !== undefined) {
          removedParticipant = chatRoom.manager_ids[managerIndex];
          chatRoom.manager_ids.splice(managerIndex, 1);
          removed = true;
        }
        break;
      default:
        throw new ApiError(httpStatus.BAD_REQUEST, "Invalid role specified");
    }

    if (!removed) {
      throw new ApiError(httpStatus.NOT_FOUND, "Participant not found in chat room");
    }

    const removedUserName =
      removedParticipant?.name ||
      removedParticipant?.email ||
      normalizedUserId;

    // Add to removed_participants for tracking
    chatRoom.removed_participants = chatRoom.removed_participants || [];
    chatRoom.removed_participants.push({
      user_id: normalizedUserId,
      removed_at: new Date(),
      removed_by: adminId,
      last_visible_message: chatRoom.last_message,
    });

    // Remove encryption key for this participant if room has encryption
    if (chatRoom.encryption?.enabled && chatRoom.encryption.participant_keys) {
      const keyIndex = chatRoom.encryption.participant_keys.findIndex(
        pk => resolveStoredParticipantId(pk.user_id) === normalizedUserId
      );
      if (keyIndex !== -1) {
        chatRoom.encryption.participant_keys.splice(keyIndex, 1);
        console.log(`Removed encryption key for user ${normalizedUserId} from room ${chatRoomId}`);
      }
    }

    await chatRoom.save();

    const roleLabel = normalizedRole === 'cp' ? 'Creative Partner' :
                      normalizedRole === 'pm' ? 'Project Manager' :
                      normalizedRole === 'production' ? 'Production Team' : 'Admin';

    const systemMessage = await ChatMessage.create({
      chat_room_id: chatRoomId,
      message: `${adminName} removed ${removedUserName} (${roleLabel}) from the conversation`,
      message_type: 'system',
      system_message: {
        type: 'participant_removed',
        actor_id: adminId,
        actor_name: adminName,
        target_ids: [normalizedUserId],
        target_names: [removedUserName],
        target_role: normalizedRole,
      },
    });

    // Update last message
    await ChatRoom.findByIdAndUpdate(chatRoomId, { last_message: systemMessage._id });

    // Send notification to the removed user
    try {
      const socketService = require('../socket.service');
      socketService.notifyRemovedParticipant(normalizedUserId, chatRoomId, orderName, adminName);
    } catch (notifError) {
      console.error('Failed to send removal notification:', notifError.message);
    }

    return { chatRoom, systemMessage };
  } catch (error) {
    throw error;
  }
};

/**
 * Get all participants of a chat room
 */
const getChatParticipants = async (chatRoomId) => {
  try {
    const chatRoom = await ChatRoom.findById(chatRoomId)
      .populate('client_id', '_id name email profile_picture role');

    if (!chatRoom) {
      throw new ApiError(httpStatus.NOT_FOUND, "Chat room not found");
    }

    const pm = chatRoom.pm_id ? await toParticipantPayload(chatRoom.pm_id, 'pm') : null;

    const client = chatRoom.client_id
      ? {
          ...(chatRoom.client_id.toObject ? chatRoom.client_id.toObject() : chatRoom.client_id),
          id: chatRoom.client_id?._id?.toString?.() || chatRoom.client_id?.id,
          role: 'client',
        }
      : await toParticipantPayload(chatRoom.client_snapshot, 'client');

    return {
      client,
      cps: await Promise.all((chatRoom.cp_ids || []).map((cp) => toParticipantPayload(cp, 'cp'))),
      pm,
      production: await Promise.all((chatRoom.production_ids || []).map((p) => toParticipantPayload(p, 'production'))),
      managers: await Promise.all((chatRoom.manager_ids || []).map((m) => toParticipantPayload(m, 'manager'))),
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Check if a user is a participant in a chat room
 */
const isParticipant = async (chatRoomId, userId) => {
  try {
    const chatRoom = await ChatRoom.findById(chatRoomId);
    if (!chatRoom) return false;

    const userIdStr = userId.toString();

    if (chatRoom.client_id?.toString() === userIdStr) return true;
    if (chatRoom.pm_id?.toString() === userIdStr) return true;
    if (chatRoom.cp_ids?.some(cp => cp.id.toString() === userIdStr)) return true;
    if (chatRoom.production_ids?.some(p => p.id.toString() === userIdStr)) return true;
    if (chatRoom.manager_ids?.some(m => m.id.toString() === userIdStr)) return true;

    return false;
  } catch (error) {
    return false;
  }
};

/**
 * Mark messages as read for a user in a chat room
 */
const markMessagesAsRead = async (chatRoomId, userId) => {
  try {
    const chatRoom = await ChatRoom.findById(chatRoomId);
    if (!chatRoom) {
      throw new ApiError(httpStatus.NOT_FOUND, "Chat room not found");
    }

    if (!chatRoom.unread_counts) {
      chatRoom.unread_counts = new Map();
    }
    chatRoom.unread_counts.set(userId.toString(), 0);
    await chatRoom.save();

    return { success: true, count: 0 };
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

/**
 * Get unread message count for a user
 */
const getUnreadMessageCount = async (userId) => {
  try {
    const userIdStr = userId.toString();

    const chatRooms = await ChatRoom.find({
      $or: [
        { client_id: userId },
        { pm_id: userId },
        { 'cp_ids.id': userId },
        { 'production_ids.id': userId },
        { 'manager_ids.id': userId },
      ],
    });

    let totalUnread = 0;
    for (const room of chatRooms) {
      const unreadCount = room.unread_counts?.get(userIdStr) || 0;
      totalUnread += unreadCount;
    }

    return totalUnread;
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

module.exports = {
  addParticipants,
  removeParticipant,
  getChatParticipants,
  isParticipant,
  markMessagesAsRead,
  getUnreadMessageCount,
};
