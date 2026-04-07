const jwt = require("jsonwebtoken");
const Role = require("../models/role.model");
const userService = require("../services/user.service");
const ApiError = require("../utils/ApiError");
const httpStatus = require("http-status");

const ENABLE_PERMISSION_CHECK = 0; // Set this to 0 to bypass the middleware

async function hasPermissions(role, permissions) {
  try {
    const foundRoles = await Role.find({ role: role });

    if (!foundRoles || foundRoles.length === 0) {
      throw new Error(`Role '${role}' not found or has been deleted.`);
    }

    const foundRole = foundRoles[0];

    const hasAllPermissions = permissions.some((permission) =>
      foundRole.permissions.includes(permission)
    );
    return hasAllPermissions;
  } catch (error) {
    console.error(error);
    return false;
  }
}

const getUserInfoFromToken = async (bearerToken) => {
  if (!bearerToken || !bearerToken.startsWith("Bearer ")) {
    throw new Error("Invalid token format");
  }
  const token = bearerToken.split(" ")[1];
  const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
  const user = await userService.getUserById(decodedToken.sub);
  return user;
};

const checkUserPermission = (permissionLists) => async (req, res, next) => {
  // Always try to extract user from token for req.user (needed for features like removed participant chat history)
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const user = await getUserInfoFromToken(authHeader);
      req.user = user;
    }
  } catch (e) {
    // Silently ignore - user extraction is optional when permission check is disabled
  }

  if (ENABLE_PERMISSION_CHECK === 0) {
    return next();
  } else {
    try {
      const authHeader = req.headers.authorization;
      let user, role;

      try {
        user = await getUserInfoFromToken(authHeader);
        role = user.role;
      } catch (error) {
        console.error("Error in getUserInfoFromToken:", error);
        throw new ApiError(
          httpStatus.FORBIDDEN,
          "Access denied: Invalid token",
          true
        );
      }

      const hasAllPermissions = await hasPermissions(role, permissionLists);

      if (!hasAllPermissions) {
        throw new ApiError(
          httpStatus.UNAUTHORIZED,
          `Access denied: ${role} is not eligible for this permission access`,
          true
        );
      }

      next();
    } catch (error) {
      if (error instanceof ApiError) {
        res.status(error.statusCode).json({
          code: error.statusCode,
          status: false,
          message: error.message,
          data: null,
        });
      } else {
        console.error("Error in checkUserPermission:", error);
        const serverError = new ApiError(500, "Internal Server Error", true);
        res.status(serverError.statusCode).json({
          code: serverError.statusCode,
          status: false,
          message: serverError.message,
          data: null,
        });
      }
    }
  }
};

module.exports = { checkUserPermission, getUserInfoFromToken };
