const mongoose = require('mongoose');
const {toJSON} = require('./plugins');

const tokenSchema = mongoose.Schema(
    {
        tokens: [
            {
                type: String,
                required: true,
            }
        ],
        user: {
            type: mongoose.SchemaTypes.ObjectId,
            ref: 'User',
            required: true,
        },
    },
    {
        timestamps: true,
    }
);

// add plugin that converts mongoose to json
tokenSchema.plugin(toJSON);

/**
 * @typedef Token
 */
const Token = mongoose.model('FcmToken', tokenSchema);

module.exports = Token;
