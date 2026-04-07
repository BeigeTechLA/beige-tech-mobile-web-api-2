const express = require("express");
const blogController = require("../../controllers/blog.controller");

const router = express.Router();

// Public routes for frontend
router
  .route("/blogs")
  .get(blogController.getPublicBlogs);

router
  .route("/blogs/:slug")
  .get(blogController.getBlogBySlug);

module.exports = router;
