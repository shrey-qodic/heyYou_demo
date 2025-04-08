import express from "express";
import {
  generateShareLinkByUserIdController,
  generateShareLinkController,
} from "../controllers/user.controller.js";

const generateLinkRouter = express.Router();

generateLinkRouter
  .route("/generateInviteLink")
  .post(generateShareLinkController);

generateLinkRouter
  .route("/generateInviteLink/:userId")
  .get(generateShareLinkByUserIdController);

export { generateLinkRouter };
