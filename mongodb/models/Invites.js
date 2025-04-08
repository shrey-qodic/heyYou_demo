import mongoose from "mongoose";

const InvitesSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  createdAt: Date,
  updatedAt: Date,
  invitee_id: String,
  invitee_company_id: String,
  ipAddress: String,
  installed: Boolean,
  email: String,
  user_to_invite_id: String,
  referrer: String,
});

const Invites = mongoose.model("Invites", InvitesSchema, "invites");

export default Invites;
