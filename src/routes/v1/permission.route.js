const express = require("express");
const permissionController = require("../../controllers/permission.controller");

const router = express.Router();

router.route("/").get(permissionController.getAllPermissions);
router.route("/").post(permissionController.createPermission);

module.exports = router;
