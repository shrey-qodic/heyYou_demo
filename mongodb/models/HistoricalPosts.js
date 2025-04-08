import mongoose from "mongoose";

const HistoricalPostsSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  accountId: { type: String, required: true },
  addedByUser: { type: String, required: true },
  historicalPostIds: [String],
});

const HistoricalPosts = mongoose.model(
  "HistoricalPosts",
  HistoricalPostsSchema,
  "historicalPosts"
);

export default HistoricalPosts;
