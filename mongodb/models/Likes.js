import mongoose from "mongoose";

const LikeSchema = new mongoose.Schema({
  _id: { type: "string", required: true },
  userId: { type: String, required: true },
  postId: { type: String, required: true },
  autoLikeTimestamp: { type: Number, required: true },
  likeType: {
    type: String,
    enum: ["server", "front", "user"],
  },
  createdAt: { type: Number, default: Date.now },
});

// Create a unique compound index on userId and postId
LikeSchema.index({ userId: 1, postId: 1 }, { unique: true });

LikeSchema.index({ postId: 1 });



const Likes = mongoose.model("Likes", LikeSchema, "likes");

export default Likes;
