import express from "express";
import { addExtensionnSourceController } from "../controllers/extensionInstallSource.controller.js";

const extensionInstallSourceRouter = express.Router();

extensionInstallSourceRouter
  .route("/create")
  .post(addExtensionnSourceController);

export { extensionInstallSourceRouter };
