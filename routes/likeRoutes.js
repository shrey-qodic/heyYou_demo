import express from "express";
import {
  addLikeController,
  syncLikeDataForAllUsersController,
  syncLikesAndPostCountController,
  syncLikesForAllAccountsController,
  syncLikesForAllUsersAccountsController,
  syncLikesInsightsController,
  syncLikesOnAccountLevelController,
} from "../controllers/like.controller.js";

const likeRouter = express.Router();

likeRouter.route("/like").post(addLikeController);
likeRouter.route("/syncInsightsLikesForUser").post(syncLikesInsightsController);
likeRouter
  .route("/syncInsightsLikesForAllUsers")
  .get(syncLikeDataForAllUsersController);

likeRouter
  .route("/syncAccountLevelLikes/:accountId")
  .get(syncLikesOnAccountLevelController);
likeRouter
  .route("/syncLikesAndPostCount/:userId")
  .get(syncLikesAndPostCountController);

likeRouter
  .route("/syncLikesForAllAccounts")
  .get(syncLikesForAllAccountsController);

likeRouter
  .route("/syncLikesForAllUsersAndAccounts")
  .get(syncLikesForAllUsersAccountsController);

export { likeRouter };
