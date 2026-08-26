const mongoose = require('mongoose');
const {toJSON} = require('./plugins');

const tokenSchema = mongoose.Schema(
    {
        user_id: {
            type: String,
            required: true,
            trim: true,
        },
        fcm_token: {
            type: String,
            required: true,
            trim: true,
            maxlength: 1024,
        },
        session_id: {
            type: String,
            trim: true,
            default: null,
        },
        device_type: {
            type: String,
            enum: ['android', 'ios', 'web'],
            required: true,
            lowercase: true,
            trim: true,
        },
        app_user_type: {
            type: String,
            trim: true,
            default: null,
        },
        notification_preferences: {
            push_enabled: {
                type: Boolean,
                default: true,
            },
            topics: {
                shoots: {
                    type: Boolean,
                    default: true,
                },
                messages: {
                    type: Boolean,
                    default: true,
                },
                meetings: {
                    type: Boolean,
                    default: true,
                },
                files: {
                    type: Boolean,
                    default: true,
                },
            },
        },
        is_active: {
            type: Boolean,
            default: true,
        },
        last_used_at: {
            type: Date,
            default: Date.now,
        },
    },
    {
        timestamps: true,
    }
);

// add plugin that converts mongoose to json
tokenSchema.plugin(toJSON);

tokenSchema.index(
    { fcm_token: 1 },
    {
        unique: true,
        partialFilterExpression: { fcm_token: { $type: 'string' } },
    }
);
tokenSchema.index({ user_id: 1, is_active: 1 });
tokenSchema.index({ user_id: 1, session_id: 1 });

/**
 * @typedef Token
 */
const Token = mongoose.model('FcmToken', tokenSchema);

module.exports = Token;
