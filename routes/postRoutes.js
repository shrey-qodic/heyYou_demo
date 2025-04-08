import express from "express";
import {
  compareAndAddPostsController,
  compareAndAddProspectPostsController,
  getLatestUnlikedPostsController,
  getPostFeedController,
  getPostsWhoseAalyticsToUpdateController,
  getLastThreeMonthsPostsController,
  listAllDuplicatePosts,
  prePostAlignController,
  updatePostAnalyticsController,
  addHistoricalPostsController,
  getLatestUnlikedPostsWithUserIdController,
  resetLikesAndPostsCountToZeroController,
  removeDuplicatePostsWithSameUrlController,
  checkPostStatus,
  getLatestAutoLikeUnlikedPostsWithUserIdController,
} from "../controllers/post.controller.js";

const postRouter = express.Router();

// postRouter.get("/prePostAlign/:accountId", prePostAlignController);
postRouter.route("/prePostAlign").post(prePostAlignController);
postRouter
  .route("/resetPostAndLikeCount")
  .get(resetLikesAndPostsCountToZeroController);
postRouter
  .route("/removeDuplicateUrlPosts")
  .get(removeDuplicatePostsWithSameUrlController);
postRouter.route("/get-posts").post(getLatestUnlikedPostsController);
postRouter
  .route("/get-posts-companies")
  .post(getLatestUnlikedPostsWithUserIdController);
postRouter
  .route("/get-auto-like-posts")
  .post(getLatestAutoLikeUnlikedPostsWithUserIdController);
postRouter.route("/compare-and-add-post").post(compareAndAddPostsController);
postRouter
  .route("/compare-and-add-post-prospect")
  .post(compareAndAddProspectPostsController);
postRouter.route("/feed").post(getPostFeedController);
postRouter.route("/checkDuplicates").get(listAllDuplicatePosts);

postRouter
  .route("/getPostsToUpdateAnalytics")
  .post(getPostsWhoseAalyticsToUpdateController);

postRouter.route("/updatePostAnalytics").post(updatePostAnalyticsController);
postRouter
  .route("/getLastThreeMonthsPosts")
  .post(getLastThreeMonthsPostsController);

postRouter.route("/addHistoricalPost").post(addHistoricalPostsController);
postRouter.route("/check-post-status").post(checkPostStatus);

export { postRouter };
