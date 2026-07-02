const httpStatus = require("http-status");
const ApiError = require("../utils/ApiError");
const auth = require("./auth");

const getExpectedInternalKey = () =>
  process.env.EXTERNAL_MEETINGS_KEY ||
  process.env.INTERNAL_BRIDGE_KEY ||
  process.env.INTERNAL_FILE_MANAGER_KEY ||
  "beige-internal-dev-key";

const hasValidInternalKey = (req) => {
  const providedKey = req.headers["x-internal-key"];
  return Boolean(providedKey && providedKey === getExpectedInternalKey());
};

const internalBridgeOrJwtAuth = (...requiredRights) => {
  const jwtAuth = auth(...requiredRights);

  return (req, res, next) => {
    if (hasValidInternalKey(req)) {
      req.authMode = "internal-bridge";
      console.log("[Auth] Request authenticated by internal bridge key", {
        path: req.originalUrl,
        method: req.method,
      });
      return next();
    }

    return jwtAuth(req, res, (err) => {
      if (err) {
        return next(err);
      }

      req.authMode = "jwt";
      console.log("[Auth] Request authenticated by JWT", {
        path: req.originalUrl,
        method: req.method,
        userId: req.user?.id || req.user?._id || null,
        email: req.user?.email || null,
      });
      return next();
    });
  };
};

const requireInternalBridgeKey = (req, res, next) => {
  if (!hasValidInternalKey(req)) {
    return next(new ApiError(httpStatus.UNAUTHORIZED, "Invalid internal integration key"));
  }

  req.authMode = "internal-bridge";
  console.log("[Auth] Request authenticated by internal bridge key", {
    path: req.originalUrl,
    method: req.method,
  });
  return next();
};

module.exports = {
  internalBridgeOrJwtAuth,
  requireInternalBridgeKey,
};
