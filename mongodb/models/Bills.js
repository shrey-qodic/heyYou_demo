import mongoose from "mongoose";

const BillsSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  createdAt: { type: Date, default: new Date() },
  // This is the user that paid
  userId: String,
  noOfUsers: Number,
  hash: String,
  standingOrderId: String,
  totalAmount: String,
  accountId: String,
  isCanceled: { type: Boolean, default: false },
  cancelledAt: Date,
  isStoExpired: { type: Boolean, default: false },
});

const Bills = mongoose.model("Bills", BillsSchema, "bills");

export default Bills;
