import express from "express";
import {
  extensionPing,
  getLatestInsights,
} from "../controllers/insight.controller.js";

const insightRouter = express.Router();

insightRouter.route("/insight").get(getLatestInsights);
insightRouter.route("/pingExtension").post(extensionPing);

export { insightRouter };
