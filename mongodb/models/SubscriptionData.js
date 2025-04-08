import mongoose from "mongoose";

const SubscriptionSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  stripeSubscriptionId : {type: String, required: true},
  stripeInvoiceId : {type: String, required: true},
  customerId : {type: String, required: true},
  userId : {type: String, required: true},
  accountId : {type: String, required: true},
  status : {type: String, required: true}
},{ timestamps: true });

const Subscriptions = mongoose.model("Subscriptions", SubscriptionSchema, "subscriptions");

export default Subscriptions;
