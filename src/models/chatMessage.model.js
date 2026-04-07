const mongoose = require("mongoose");
const {toJSON, paginate} = require("./plugins");

const chatMessageSchema = new mongoose.Schema({

        chat_room_id: {
            type: mongoose.SchemaTypes.ObjectId,
            ref: "Chatroom",
            required: true
        },

        message: {
            type: String,

            required: false,
            default: ""
        },

        sent_by: {
            type: mongoose.Schema.Types.Mixed,
            required: false // Not required for system messages
        },

        sent_by_name: {
            type: String,
            required: false
        },

        sent_by_email: {
            type: String,
            required: false
        },

        status: {
            type: String,
            required: false,
            enum: ["Sent", "Delivered", "Seen"],
            default: "Sent"
        },

        // File upload fields
        file_url: {
            type: String,
            required: false
        },

        file_name: {
            type: String,
            required: false
        },

        file_type: {
            type: String,
            required: false
        },

        message_type: {
            type: String,
            enum: ["text", "image", "file", "system"],
            default: "text"
        },

        // System message details (when message_type is "system")
        system_message: {
            type: {
                type: String,
                enum: [
                    "participant_added",
                    "participant_removed",
                    "chat_created",
                    "chat_archived",
                    "chat_reactivated"
                ]
            },
            // User who triggered the action
            actor_id: {
                type: mongoose.Schema.Types.Mixed
            },
            actor_name: String,
            // Target user(s) for the action
            target_ids: [{
                type: mongoose.Schema.Types.Mixed
            }],
            target_names: [String],
            // Role of the target (cp, pm, production, etc.)
            target_role: String
        },

        // Reply to another message
        reply_to: {
            type: mongoose.SchemaTypes.ObjectId,
            ref: "ChatMessage",
            required: false
        },

        // Message edit tracking
        is_edited: {
            type: Boolean,
            default: false
        },
        edited_at: {
            type: Date,
            required: false
        },
        edited_by: {
            type: mongoose.Schema.Types.Mixed,
            required: false
        },

        // Soft delete (message shows as "This message was deleted")
        is_deleted: {
            type: Boolean,
            default: false
        },
        deleted_at: {
            type: Date,
            required: false
        },
        deleted_by: {
            type: mongoose.Schema.Types.Mixed,
            required: false
        },

        // Message reactions
        reactions: [{
            emoji: {
                type: String,
                required: true
            },
            user_id: {
                type: mongoose.Schema.Types.Mixed,
                required: true
            },
            user_name: {
                type: String,
                required: true
            },
            created_at: {
                type: Date,
                default: Date.now
            }
        }],

        // E2E Encrypted message content
        encrypted_content: {
            ciphertext: {
                type: String,
                default: null
            },
            iv: {
                type: String,
                default: null
            },
            algorithm: {
                type: String,
                default: "AES-256-GCM"
            },
            key_version: {
                type: Number,
                default: 1
            }
        },

        // E2E Encrypted file name (file_url remains unencrypted)
        encrypted_file_name: {
            ciphertext: {
                type: String,
                default: null
            },
            iv: {
                type: String,
                default: null
            }
        },

        // Flag to indicate if message is E2E encrypted
        is_encrypted: {
            type: Boolean,
            default: false
        }

    },
    {
        timestamps: true,
    });

chatMessageSchema.plugin(toJSON);
chatMessageSchema.plugin(paginate);

const ChatMessageModel = mongoose.model("ChatMessage", chatMessageSchema);

module.exports = ChatMessageModel;
