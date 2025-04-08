import express from "express";
import {
  bulkUpsertLinkUserAccountController,
  checkIfUserAccountAlreadyLinkedController,
  upsertLinkUserAccountController,
} from "../controllers/userAccounts.controller.js";

const userAccountsRouter = express.Router();

userAccountsRouter
  .route("/upsertAndLink")
  .post(upsertLinkUserAccountController);

userAccountsRouter
  .route("/bulkUpsertAndLink")
  .post(bulkUpsertLinkUserAccountController);

userAccountsRouter
  .route("/checkConnection")
  .post(checkIfUserAccountAlreadyLinkedController);

export { userAccountsRouter };
