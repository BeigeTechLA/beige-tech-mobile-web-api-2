const mongoose = require("mongoose");
const Schema = mongoose.Schema;


// Create a schema to keep track of the ticket count
const CounterSchema = new Schema({
  count: {
    type: Number,
    default: 0,
  },
});

const Counter = mongoose.model("Counter", CounterSchema);

const SupportSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
    },
    des: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "completed"],
      default: "pending",
    },
    userid: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    ticket_count: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

// Pre-save middleware to auto-increment ticket_count
SupportSchema.pre("save", async function (next) {
  if (this.isNew) {
    const counter = await Counter.findOneAndUpdate(
      {},
      { $inc: { count: 1 } },
      { new: true, upsert: true }
    );
    this.ticket_count = counter.count;
  }
  next();
});

// // add plugin that converts mongoose to json\
// SupportSchema.plugin(toJSON);
// SupportSchema.plugin(paginate);

const Support = mongoose.model("Support", SupportSchema);

module.exports = Support;
