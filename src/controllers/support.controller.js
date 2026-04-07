const catchAsync = require("../utils/catchAsync");
const Support = require("../models/support.model");

// get all the roles
const getAllSupports = catchAsync(async (req, res) => {
  try {
    const { id, userid, page, limit, populate } = req.query;
    const pageNumber = parseInt(page, 10) || 1;
    const limitNumber = parseInt(limit, 10) || 10;
    let supports;

    const query = {};
    if (id) query._id = id;
    if (userid) query.userid = userid;

    const totalResults = await Support.countDocuments(query);
    const totalPages = Math.ceil(totalResults / limitNumber);
    const skip = (pageNumber - 1) * limitNumber;

    supports = await Support.find(query)
      .populate("userid")
      .skip(skip)
      .limit(limitNumber);

    if (supports.length === 0) {
      return res.status(404).json({ message: "No supports found" });
    }

    res.status(200).json({
      results: supports,
      page: pageNumber,
      limit: limitNumber,
      totalPages,
      totalResults,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "An error occurred", error: error.message });
  }
});

const getSupportById = catchAsync(async (req, res) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ message: "ID is required" });
  }

  const cleanId = id.replace(/^:/, "");
  const support = await Support.findById(cleanId).populate("userid");

  if (!support) {
    return res.status(404).json({ message: "Support not found" });
  }

  res.status(200).json({
    status: 200,
    data: support,
  });
});

// create a new role
const createSupport = catchAsync(async (req, res) => {
  try {
    const { title, des, status, userid } = req.body;
    const newSupport = new Support({
      title,
      des,
      status,
      userid,
    });
    await newSupport.save();
    res
      .status(201)
      .json({ message: "Support inserted successfully", data: newSupport });
  } catch (error) {
    res
      .status(500)
      .json({ message: "An error occurred", error: error.message });
  }
});

// delete a role
const deleteSupport = catchAsync(async (req, res) => {
  try {
    const { id } = req.query;
    const support = await Support.findById(id);
    if (!support) {
      return res.status(404).json({ error: "id not found" });
    }
    await Support.deleteOne({ _id: id });
    res.status(200).json({ message: "Support deleted successfully" });
  } catch (error) {
    if (error.name === "CastError" && error.kind === "ObjectId") {
      return res.status(400).json({ error: "Invalid support ID format" });
    }
    res
      .status(500)
      .json({ error: "An error occurred while deleting the support" });
  }
});

// update a role
const updateSupport = catchAsync(async (req, res) => {
  try {
    const { id } = req.query;
    const updateData = req.body;

    const support = await Support.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!support) {
      return res.status(404).json({ error: "Support not found" });
    }

    res.status(200).json({ message: "Support updated successfully", support });
  } catch (error) {
    if (error.name === "CastError" && error.kind === "ObjectId") {
      return res.status(400).json({ error: "Invalid support ID format" });
    }
    res
      .status(500)
      .json({ error: "An error occurred while updating the support" });
  }
});

module.exports = {
  getAllSupports,
  getSupportById,
  createSupport,
  deleteSupport,
  updateSupport,
};
