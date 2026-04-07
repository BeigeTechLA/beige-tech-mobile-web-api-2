const express = require("express");
const roleController = require("../../controllers/role.controller");

const router = express.Router();

router.route("/").get(roleController.getAllRoles);
router.route("/").post(roleController.createRole);
router.route("/").delete(roleController.deleteRole);
router.route("/").put(roleController.updateRole);

module.exports = router;
