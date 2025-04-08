import mongoose from "mongoose";

const PostSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  createdAt: Date,
  postUrl: String,
  accountId: { type: String, required: true },
  userId: { type: String},
  postTitle: String,
  postImage: String,
  postTotalLikes: Number,
  impressions: String,
  reactions: String,
  autoLikeStatus: String,
  likeType: String,
  comments: String,
  reposts: String,
  linkedInCreatedAt: Date,
  lastAnnalyticsAligned: Date,
  hashTags: [String],
  postHashtags: [String],
  postMentions: [String],
},
{ timestamps: true } 
);

PostSchema.index({ accountId: 1 });

const Posts = mongoose.model("Posts", PostSchema, "posts");
Posts.syncIndexes(); 

export default Posts;
