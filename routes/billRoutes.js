import express from "express";
import {
  createBillRecordByAccIdController,
  createBillRecordController,
} from "../controllers/bill.controller.js";
import { expireSto } from "../mutations/billMutations.js";
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const billRouter = express.Router();

billRouter.route("/create").post(createBillRecordController);
billRouter.route("/createByAccId").post(createBillRecordByAccIdController);
billRouter.route("/expireBySto/:userId").get(expireSto);

export { billRouter };
