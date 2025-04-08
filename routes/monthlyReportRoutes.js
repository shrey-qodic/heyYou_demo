import express from "express";
import {
  createMonthlyReportController,
  downloadMonthlyReportByUserIdController,
  downloadMonthlyReportController,
} from "../controllers/monthlyReport.controller.js";

const monthlyReportRouter = express.Router();

monthlyReportRouter.route("/create").post(createMonthlyReportController);
monthlyReportRouter
  .route("/download/:reportId")
  .get(downloadMonthlyReportController);

monthlyReportRouter
  .route("/download/:reportId/:userId")
  .get(downloadMonthlyReportByUserIdController);

export { monthlyReportRouter };
