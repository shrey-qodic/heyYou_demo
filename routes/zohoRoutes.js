import express from "express";
import {
  zohoCallback,
  editMainContact,
  marketingExtenstion,
} from "../controllers/zoho.controller.js";

const zohoRouter = express.Router();

zohoRouter.route("/zoho/callback").get(zohoCallback);
zohoRouter.route("/editMainContactZoho").post(editMainContact);
zohoRouter.route("/sendToZoho").post(marketingExtenstion); // used for marketing extenstion only

export { zohoRouter };
