const mongoose = require("mongoose");
const { toJSON, paginate } = require("./plugins");
const slugify = require('slugify');

const blogSchema = mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
    },
    description: {
      type: String,
      required: true,
    },
    shortDescription: {
      type: String,
    },
    featuredImage: {
      type: String,
    },
    viewsCount: {
      type: Number,
      default: 0,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Generate slug from title
blogSchema.pre("save", function (next) {
  // Only generate slug if title is modified or it's a new document
  if (this.isModified("title") || this.isNew) {
    this.slug = slugify(this.title, { lower: true, strict: true });
  }
  
  // Generate short description from description if not provided
  if (this.isModified("description") || this.isNew) {
    if (!this.shortDescription) {
      this.shortDescription = this.description.substring(0, 150);
      // Add ellipsis if description is longer than 150 chars
      if (this.description.length > 150) {
        this.shortDescription += '...';
      }
    }
  }
  
  next();
});

// add plugin that converts mongoose to json
blogSchema.plugin(toJSON);
blogSchema.plugin(paginate);

/**
 * @typedef Blog
 */
const Blog = mongoose.model("Blog", blogSchema);

module.exports = Blog;
