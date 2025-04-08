import Posts from "../mongodb/models/Posts.js";
import { StatusConstant } from "../utils/constants.js";

const disableOldPosts = async () => {
  try {
    // Calculate the date 7 days ago
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Find and update posts older than 7 days
    const result = await Posts.updateMany(
      { updatedAt: { $lt: sevenDaysAgo }, autoLikeStatus: StatusConstant.Enabled, likeType: "AutoLike" },
      { $set: { autoLikeStatus: StatusConstant.Disabled } }
    );
    console.log(`${result.modifiedCount} posts were disabled.`);
  } catch (error) {
    console.error("Error updating posts:", error);
  }
};

export default disableOldPosts;
