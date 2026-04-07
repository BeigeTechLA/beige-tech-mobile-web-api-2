const catchAsync = require("../utils/catchAsync");
const Permission = require("../models/permission.model");

// get all the permissions
const getAllPermissions = catchAsync(async (req, res) => {
  try {
    const permissions = await Permission.find({});

    if (!permissions || permissions.length === 0) {
      return res.status(404).json({ message: "No permissions found" });
    }

    res.status(200).json(permissions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// create new permission
const createPermission = catchAsync(async (req, res) => {
  try {
    const { order, module_name, permissions } = req.body;

    const newPermission = new Permission({
      order,
      module_name,
      permissions,
    });

    await newPermission.save();

    res.status(201).json({
      message: "Permission created successfully",
      data: newPermission,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = {
  getAllPermissions,
  createPermission,
};
