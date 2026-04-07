const mongoose = require("mongoose");
const {toJSON, paginate} = require("./plugins");

const paymentSchema = new mongoose.Schema({
    intent_id: {
        type: String,
        required: true
    },
    amount:{
        type: Number,
        required: true
    },
    currency:{
        type: String,
        required: true,
    },
    client_secret:{
        type: String,
        required: true,
    },
    description:{
        type: String,
        required: false,
    },
    status:{
        type: String,
        enum: [
            "requires_payment_method",
            "requires_confirmation",
            "requires_action",
            "payment_failed",
            "processing",
            "succeeded",
            "canceled"
        ]
    }
});

paymentSchema.plugin(toJSON);
paymentSchema.plugin(paginate);

const Payment = mongoose.model("Payment", paymentSchema);

module.exports = Payment;