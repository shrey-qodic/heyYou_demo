import mongoose from "mongoose";

const MonnthlyReportSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  createdAt: { type: Date, default: new Date() },
  reportedForDate: { type: Date, default: new Date() },
  accountId: String,
  posts: [
    {
      postId: String,
      impressions: String,
      reactions: String,
      comments: String,
      reposts: String,
    },
  ],
});

const MonthlyReports = mongoose.model(
  "MonthlyReports",
  MonnthlyReportSchema,
  "monthlyReports"
);

export default MonthlyReports;
