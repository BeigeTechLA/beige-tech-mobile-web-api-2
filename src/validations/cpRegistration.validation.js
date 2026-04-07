const Joi = require("joi");
const { password } = require("./custom.validation");

const registerCP = {
  body: Joi.object().keys({
    // Step 1: Personal Information
    name: Joi.string().required().trim(),
    email: Joi.string().required().email(),
    phone: Joi.string().required().trim(),
    password: Joi.string().required().custom(password),
    confirmPassword: Joi.string().required().valid(Joi.ref("password")),

    // Step 3: Professional Specialties
    services: Joi.array().items(Joi.string()).min(1),

    // Step 4: Experience & Equipment
    yearsExperience: Joi.string().allow("", null),
    equipment: Joi.array().items(Joi.string()),

    // Step 5: Online Profile & Rate
    website: Joi.string().uri().allow("", null),
    photographyRate: Joi.number().min(0).allow(null),
    videographyRate: Joi.number().min(0).allow(null),
    combinedRate: Joi.number().min(0).allow(null),

    // Optional location
    location: Joi.string().allow("", null),
  }),
};

const getCreativeByEmail = {
  query: Joi.object().keys({
    email: Joi.string().email().required(),
  }),
};

module.exports = {
  registerCP,
  getCreativeByEmail,
};
