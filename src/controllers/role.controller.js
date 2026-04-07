const catchAsync = require("../utils/catchAsync");
const Role = require("../models/role.model");

// get all the roles
const getAllRoles = catchAsync(async (req, res) => {
  const { search, id } = req.query;
  try {
    const query = {};
    if (search) query.role = search;
    if (id) query._id = id;

    const roles = await Role.find(query);

    if (roles.length === 0) {
      return res.status(404).json({ message: "No roles found" });
    }

    if (id) {
      // search || id
      return res.status(200).json(roles[0]);
    }
    res.status(200).json(roles);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// create a new role
const createRole = catchAsync(async (req, res) => {
  const { name, role, details, permissions, is_delete } = req.body;
  const newRole = new Role({
    name,
    role,
    details,
    permissions,
    is_delete,
  });
  await newRole.save();
  res.status(201).json({ message: "Role inserted Successfully", newRole });
});

// delete a role
const deleteRole = catchAsync(async (req, res) => {
  const { id } = req.query;
  const role = await Role.findById(id);
  if (!role) {
    return res.status(404).json({ error: "Role not found" });
  }
  if (!role.is_delete) {
    return res.status(403).json({ error: `${role.name} cannot be deleted` });
  }
  await Role.deleteOne({ _id: id });
  res.status(200).json({ message: `${role.name} deleted successfully` });
});

// update a role
const updateRole = catchAsync(async (req, res) => {
  const { id } = req.query;
  const { name, role, details, permissions } = req.body;
  const updatedRole = await Role.findByIdAndUpdate(
    id,
    { name, role, details, permissions },
    { new: true, runValidators: true }
  );
  if (!updatedRole) {
    return res.status(404).json({ error: "Role not found" });
  }
  res.status(200).json(updatedRole);
});

module.exports = {
  getAllRoles,
  createRole,
  deleteRole,
  updateRole,
};
