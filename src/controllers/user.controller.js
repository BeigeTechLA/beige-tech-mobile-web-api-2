const httpStatus = require("http-status");
const { v4: uuidv4 } = require("uuid");
const pick = require("../utils/pick");
const ApiError = require("../utils/ApiError");
const catchAsync = require("../utils/catchAsync");
const { userService, fcmService, fileService } = require("../services");

const createUser = catchAsync(async (req, res) => {
  const user = await userService.createUser(req.body);
  res.status(httpStatus.CREATED).send(user);
});

const getUsers = catchAsync(async (req, res) => {
  const filter = pick(req.query, ["name", "role", "search"]);
  const options = pick(req.query, ["sortBy", "limit", "page"]);
  const result = await userService.queryUsers(filter, options);
  res.send(result);
});

const getUser = catchAsync(async (req, res) => {
  const user = await userService.getUserById(req.params.userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found");
  }
  res.send(user);
});

const updateUser = catchAsync(async (req, res) => {
  //Fetch the file object from the request
  const uploadedProfilePicture = req.file;

  //Process profile picture if the file is uploaded
  if (uploadedProfilePicture) {
    const fileExtension = uploadedProfilePicture.originalname
      .split(".")
      .pop()
      .toLowerCase();
    const allowedExtensions = ["jpg", "jpeg", "png"];

    //Check if the file is an image
    if (!allowedExtensions.includes(fileExtension)) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Invalid profile picture file type"
      );
    }

    //Generate a unique file name using UUID and the original file extension
    const fileName = uuidv4() + "." + fileExtension;

    // Prepare file data with generated file name and S3 file path for storing in the database
    const fileData = {
      privacy: "Public",
      file_name: fileName,
      file_path: fileName,
    };
    fileData.file_name = fileName;
    fileData.file_path = fileName;
    fileData.privacy = "Public";

    // Upload the file to the AWS S3 bucket and store file data in the database
    const uploadedFileInfo = await fileService.uploadFile(
      uploadedProfilePicture.buffer,
      fileData
    );

    //Update the profile picture field in the request body
    req.body.profile_picture = uploadedFileInfo.download_url;
  }

  const user = await userService.updateUserById(req.params.userId, req.body);
  res.send(user);
});

const deleteUser = catchAsync(async (req, res) => {
  await userService.deleteUserById(req.params.userId);
  res.status(httpStatus.NO_CONTENT).send();
});

const updateFCMToken = catchAsync(async (req, res) => {
  const { registrationToken } = req.body;
  const { userId } = req.params;
  const updatedToken = await fcmService.saveFCMToken(userId, registrationToken);
  res.send(updatedToken);
});

/**
 * Get staff list filtered by specific roles
 * @route GET /users/staff
 */
const getStaffList = catchAsync(async (req, res) => {
  // Define the staff roles we want to filter by
  const roles = ['admin', 'project_manager', 'post_production_manager', 'sales_representative'];
  
  // Get staff list with only _id, name, and role
  const staff = await userService.getStaffByRoles(roles);
  res.send(staff);
});

module.exports = {
  createUser,
  getUsers,
  getUser,
  updateUser,
  deleteUser,
  updateFCMToken,
  getStaffList,
};
