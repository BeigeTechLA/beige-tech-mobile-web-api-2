const express = require("express");
const auth = require("../../middlewares/auth");
const blogController = require("../../controllers/blog.controller");
const upload = require('../../middlewares/upload');
const router = express.Router();


router
  .route("/create")
  .post(upload('featuredImage'), blogController.createBlog);

router
  .route("/edit/:id")
  .get(blogController.getBlogForEdit);

router
  .route("/all")
  .get(auth(), blogController.getAllBlogs);

router
  .route("/:id")
  .put(upload('featuredImage'), blogController.updateBlog)
  .delete(auth(), blogController.deleteBlog);

module.exports = router;
