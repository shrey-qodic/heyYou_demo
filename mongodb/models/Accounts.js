import mongoose from "mongoose";

const AccountsSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  createdAt: Date,
  domainName: String,
  updatedAt: Date,
  isActive: Boolean,
  isVerified: Boolean,
  company: String,
  officialCompanyUrl: String,
  officialLinkedInCompanyUrl: String,
  usersCounter: Number,
  crmId: String,
  lastPostAlignedAt: Date,
  noOfContacts: Number,
  companySize: String,
  region: String,
  isHistoricalPostsScrapped: Boolean,
  companyLogoUrl: String,
  noOfSignUps: { type: Number, default: 0 },
  plan: { type: String, default: "Freemium" },
  currentMonthPosts: Number,
  totalPosts: Number,
  thisMonthsDailyAddedPosts: Date,
  totalLikesForThisMonth: Number,
  totalLikes: Number,
});

const Accounts = mongoose.model("Accounts", AccountsSchema, "accounts");

export default Accounts;
