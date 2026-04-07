const mongoose = require("mongoose");
const { toJSON, paginate } = require("./plugins");
const slugify = require('slugify');

const shootTypeSchema = mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      maxlength: 100,
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
      index: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: {
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  }
);

// Generate slug from title before saving
shootTypeSchema.pre("save", function (next) {
  if (this.isModified("title") || this.isNew) {
    this.slug = slugify(this.title, { 
      lower: true, 
      strict: true,
      remove: /[*+~.()'"!:@]/g
    });
  }
  next();
});

// Ensure slug uniqueness by appending number if needed
shootTypeSchema.pre("save", async function (next) {
  if (this.isModified("slug") || this.isNew) {
    const originalSlug = this.slug;
    let counter = 1;
    
    while (true) {
      const existingDoc = await this.constructor.findOne({ 
        slug: this.slug, 
        _id: { $ne: this._id } 
      });
      
      if (!existingDoc) break;
      
      this.slug = `${originalSlug}-${counter}`;
      counter++;
    }
  }
  next();
});

// Add plugins
shootTypeSchema.plugin(toJSON);
shootTypeSchema.plugin(paginate);

// Create indexes for better performance
shootTypeSchema.index({ status: 1, sortOrder: 1 });
shootTypeSchema.index({ title: "text" });

/**
 * @typedef ShootType
 */
const ShootType = mongoose.model("ShootType", shootTypeSchema, "shoot_types");

module.exports = ShootType;
