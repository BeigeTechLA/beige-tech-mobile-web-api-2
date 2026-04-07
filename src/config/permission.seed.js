const mongoose = require("mongoose");
const Permission = require("../models/permission.model");
const data = require("./seed/permission.seed.json");

const seedDB = async () => {
  try {
    // await Permission.deleteMany({});
    await Permission.insertMany(data);
    console.log("Data seeded!");
  } catch (err) {
    console.error("Error seeding data:", err);
  }
};

seedDB();
