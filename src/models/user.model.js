const mongoose = require("mongoose");
const validator = require("validator");
const bcrypt = require("bcryptjs");
const { toJSON, paginate } = require("./plugins");
const { roles } = require("../config/roles");

const userSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      validate(value) {
        if (!validator.isEmail(value)) {
          throw new Error("Invalid email");
        }
      },
    },
    password: {
      type: String,
      required: function () {
        // Password is required only if no social provider is used
        return !this.googleId && !this.facebookId;
      },
      trim: true,
      minlength: 8,
      validate(value) {
        if (!value.match(/\d/) || !value.match(/[a-zA-Z]/)) {
          throw new Error(
            "Password must contain at least one letter and one number"
          );
        }
      },
      private: true, // used by the toJSON plugin
    },
    contact_number: {
      type: String,
      trim: true,
    },
    location: {
      type: String,
      trim: true,
    },
    // 🔥 ADD OTP HERE
    otp: {
      code: {
        type: String,
        default: null,
      },
      expiresAt: {
        type: Date,
        default: null,
      },
      attempts: {
        type: Number,
        default: 0, // (optional: can limit OTP retries)
      },
    },
    isVerified: {
      type: Boolean,
      default: false,
    },

    role: {
      type: String,
      enum: roles,
      default: "user",
    },
    profile_picture: {
      type: String,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true,
    },
    facebookId: {
      type: String,
      unique: true,
      sparse: true,
    },
    socialProvider: {
      type: String,
      enum: ['local', 'google', 'facebook'],
      default: 'local',
    },
    // User active status (for deactivation per PRD)
    // Deactivated users cannot send messages and appear as "Inactive User" in chat history
    isActive: {
      type: Boolean,
      default: true,
    },
    // E2E Encryption keys (WhatsApp-style - auto-generated)
    e2e_encryption: {
      enabled: {
        type: Boolean,
        default: false,
      },
      public_key: {
        type: String,
        default: null,
      },
      encrypted_private_key: {
        type: String,
        default: null,
      },
      key_salt: {
        type: String,
        default: null,
      },
      key_version: {
        type: Number,
        default: 1,
      },
      setup_at: {
        type: Date,
        default: null,
      },
      // WhatsApp-style: Keys auto-generated on device, no password backup
      auto_generated: {
        type: Boolean,
        default: false,
      },
    },
  },
  {
    timestamps: true,
  }
);

// add plugin that converts mongoose to json
userSchema.plugin(toJSON);
userSchema.plugin(paginate);

/**
 * Check if email is taken
 * @param {string} email - The user's email
 * @param {ObjectId} [excludeUserId] - The id of the user to be excluded
 * @returns {Promise<boolean>}
 */
userSchema.statics.isEmailTaken = async function (email, excludeUserId) {
  const user = await this.findOne({ email, _id: { $ne: excludeUserId } });
  return !!user;
};

/**
 * Check if password matches the user's password
 * @param {string} password
 * @returns {Promise<boolean>}
 */
userSchema.methods.isPasswordMatch = async function (password) {
  const user = this;
  return bcrypt.compare(password, user.password);
};

userSchema.pre("save", async function (next) {
  const user = this;
  if (user.isModified("password")) {
    user.password = await bcrypt.hash(user.password, 8);
  }
  next();
});

// // set '' after saving password
// userSchema.post("save", function (doc, next) {
//   doc.password = "";
//   next();
// });

/**
 * @typedef User
 */
const User = mongoose.model("User", userSchema);

module.exports = User;
