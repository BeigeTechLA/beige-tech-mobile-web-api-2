const Joi = require("joi");

const createCheckoutSession = {
  body: Joi.object().keys({
    serviceType: Joi.string().valid("videography", "photography", "editing_only", "all", "shoot-edit", "shoot-raw").optional(),
    contentType: Joi.alternatives()
      .try(
        Joi.string().valid("videography", "photography", "both"),
        Joi.array().items(
          Joi.string().valid(
            "photo",
            "video",
            "edit",
            "all",
            "videography",
            "photography",
            "both"
          )
        )
      )
      .required(),
    startDateTime: Joi.string().isoDate().required(),
    durationHours: Joi.number().integer().min(2).required(),
    location: Joi.string().when("needStudio", {
      is: false,
      then: Joi.required(),
      otherwise: Joi.optional().allow(""),
    }),
    needStudio: Joi.boolean().default(false),
    shootType: Joi.string().required(),
    editType: Joi.string().optional().allow(""),
    // Guest information fields
    guestName: Joi.string().required(),
    guestEmail: Joi.string().email().required(),
    guestPhone: Joi.string().required(),
  }),
};

const createPaymentIntent = {
  body: Joi.object().keys({
    serviceType: Joi.string().valid("videography", "photography", "editing_only", "all", "shoot-edit", "shoot-raw").optional(),
    contentType: Joi.alternatives()
      .try(
        Joi.string().valid("videography", "photography", "both"),
        Joi.array().items(
          Joi.string().valid(
            "photo",
            "video",
            "edit",
            "all",
            "videography",
            "photography",
            "both"
          )
        )
      )
      .required(),
    startDateTime: Joi.string().isoDate().required(),
    durationHours: Joi.number().integer().min(2).required(),
    location: Joi.string().when("needStudio", {
      is: false,
      then: Joi.required(),
      otherwise: Joi.optional().allow(""),
    }),
    needStudio: Joi.boolean().default(false),
    shootType: Joi.string().required(),
    editType: Joi.string().optional().allow(""),
    // Guest information fields - optional if userId is present (authenticated users)
    guestName: Joi.string().optional().allow(""),
    guestEmail: Joi.string().email().optional().allow(""),
    guestPhone: Joi.string().optional().allow(""),
    // Authentication field for passing user ID
    userId: Joi.string().optional().allow(null),
    // Discount code fields
    discountCode: Joi.string().optional().allow(null, ""),
    isDiscounted: Joi.boolean().optional(),
    amount: Joi.number().min(0).optional(),
    skipPayment: Joi.boolean().optional(),
    // Sales rep manual pricing override
    manualPrice: Joi.number().min(500).optional().allow(null),
  }),
};

const confirmPayment = {
  body: Joi.object().keys({
    paymentIntentId: Joi.string().required(),
    paymentMethodId: Joi.string().required(),
  }),
};

module.exports = {
  createCheckoutSession,
  createPaymentIntent,
  confirmPayment,
};
