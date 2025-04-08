import mongoose from "mongoose";

const UserAccountsSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  linkedInUrl: String,
  name: String,
  createdAt: Date,
  updatedAt: Date,
  crmId: String,
  startedAligningAt: Date,
  lastPostAlignedAt: Date,
});

const UserAccounts = mongoose.model(
  "UserAccounts",
  UserAccountsSchema,
  "userAccounts"
);

export default UserAccounts;
