import express from "express";
import { extLogout } from "../controllers/ext.controller.js";

const extRouter = express.Router();

extRouter.route("/logout/:removedCookie").get(extLogout);
// extRouter.route("/installed/:currentCookie").get(extInstalled);

export { extRouter };
