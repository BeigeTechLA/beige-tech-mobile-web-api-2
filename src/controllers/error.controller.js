const catchAsync = require("../utils/catchAsync");

// get 403 Error
const error403 = catchAsync(async (req, res) => {
  console.log("error403");
  const response = {
    code: 403,
    status: false,
    message: "Access denied",
    data: "You are not eligible for the permission access",
  };
  res.status(403).json(response);
});

module.exports = {
  error403,
};
