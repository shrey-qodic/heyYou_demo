import express from "express";
import { addLikeController } from "../controllers/like.controller.js";
import {
  getUiTemplateController,
  upsertUiTemplateController,
} from "../controllers/uitemplate.controller.js";

const uitemplatesRouter = express.Router();

uitemplatesRouter.route("/getUiTemplate").get(getUiTemplateController);
uitemplatesRouter.route("/upsertTemplate").post(upsertUiTemplateController);

export { uitemplatesRouter };
