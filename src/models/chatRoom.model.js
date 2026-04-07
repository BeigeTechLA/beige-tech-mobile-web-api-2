const mongoose = require("mongoose");
const { toJSON, paginate, paginateChat } = require("./plugins");

const chatRoomSchema = new mongoose.Schema(
  {
    // Unique 3-digit chat ID for display (e.g., "123")
    chat_id: {
      type: String,
      unique: true,
      sparse: true,
    },
    // Chat display name: ClientName_ChatID (e.g., "Lana_Guzman_123")
    name: {
      type: String,
      required: false,
    },
    client_id: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: "User",
      required: false, // Optional to support guest bookings
    },
    client_snapshot: {
      id: {
        type: mongoose.Schema.Types.Mixed,
        required: false,
      },
      name: {
        type: String,
        required: false,
      },
      email: {
        type: String,
        required: false,
      },
      added_at: {
        type: Date,
        default: Date.now,
      },
      added_by: {
        type: mongoose.Schema.Types.Mixed,
      },
      role: {
        type: String,
        required: false,
        default: "client",
      },
    },
    cp_ids: [
      {
        id: {
          type: mongoose.Schema.Types.Mixed,
          required: true,
        },
        name: {
          type: String,
          required: false,
        },
        email: {
          type: String,
          required: false,
        },
        decision: {
          type: String,
          required: true,
        },
        added_at: {
          type: Date,
          default: Date.now,
        },
        added_by: {
          type: mongoose.Schema.Types.Mixed,
        },
        role: {
          type: String,
          required: false,
          default: "cp",
        },
      },
    ],
    manager_ids: [
      {
        id: {
          type: mongoose.Schema.Types.Mixed,
          required: true,
        },
        name: {
          type: String,
          required: false,
        },
        email: {
          type: String,
          required: false,
        },
        added_at: {
          type: Date,
          default: Date.now,
        },
        added_by: {
          type: mongoose.Schema.Types.Mixed,
        },
        role: {
          type: String,
          required: false,
          default: "manager",
        },
      },
    ],
    // Project Manager
    pm_id: {
      type: mongoose.Schema.Types.Mixed,
      required: false,
    },
    // Production team members
    production_ids: [
      {
        id: {
          type: mongoose.Schema.Types.Mixed,
          required: true,
        },
        name: {
          type: String,
          required: false,
        },
        email: {
          type: String,
          required: false,
        },
        role: {
          type: String,
          default: "production",
        },
        added_at: {
          type: Date,
          default: Date.now,
        },
        added_by: {
          type: mongoose.Schema.Types.Mixed,
        },
      },
    ],
    order_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      unique: true,
      sparse: true,
      required: false,
    },
    external_order_ref: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      required: false,
    },
    last_message: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ChatMessage",
      default: null,
    },
    // Chat room status for shoot lifecycle
    status: {
      type: String,
      enum: ["active", "read_only", "archived"],
      default: "active",
    },
    // Track removed participants (they can't see future messages)
    removed_participants: [
      {
        user_id: {
          type: mongoose.Schema.Types.Mixed,
        },
        removed_at: {
          type: Date,
          default: Date.now,
        },
        removed_by: {
          type: mongoose.Schema.Types.Mixed,
        },
        // Timestamp of last message visible to this user
        last_visible_message: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "ChatMessage",
        },
      },
    ],
    // Unread count per participant
    unread_counts: {
      type: Map,
      of: Number,
      default: {},
    },
    // E2E Encryption settings for this room
    encryption: {
      enabled: {
        type: Boolean,
        default: false,
      },
      // Raw room key (stored on server for auto-distribution to new participants)
      // Note: This means server can technically decrypt messages
      room_key: {
        type: String,
        default: null,
        select: false, // Don't include in normal queries for security
      },
      // Encrypted room keys for each participant
      participant_keys: [
        {
          user_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
          },
          encrypted_room_key: {
            type: String,
            required: true,
          },
          key_version: {
            type: Number,
            default: 1,
          },
          granted_by: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
          },
          granted_at: {
            type: Date,
            default: Date.now,
          },
        },
      ],
    },
  },
  {
    timestamps: true,
  }
);

chatRoomSchema.plugin(toJSON);
chatRoomSchema.plugin(paginate);
chatRoomSchema.plugin(paginateChat);
chatRoomSchema.index({ client_id: 1 });

const ChatRoomModel = mongoose.model("ChatRoom", chatRoomSchema);

module.exports = ChatRoomModel;
