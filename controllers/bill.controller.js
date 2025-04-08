// createBillRecord

import * as Sentry from "@sentry/node";
import logGracefulMessage from "../utils/logGracefulMessage.js";
import {
  createBillRecord,
  createBillRecordByAccId,
} from "../mutations/billMutations.js";

const createBillRecordController = async (req, res) => {
  try {
    const { token, billRecord } = req.body;

    if (!token || !billRecord) {
      res.status(400).json({
        success: false,
        message: "bill to add missing props",
      });
      res.end("");
      return;
    }

    const createdbill = await createBillRecord(token, billRecord);

    if (!createdbill?.status === "success") {
      throw new Error(`Something went wrong | ${createdbill?.message}`);
    }

    res.status(200).json({
      success: true,
      message: "bill created successfully",
      data: createdbill,
    });
    res.end("");
    return;

    //
  } catch (error) {
    Sentry.captureException(error);

    res.status(400).json({ message: error?.message });
    res.end("");
  }
};
const createBillRecordByAccIdController = async (req, res) => {
  try {
    const { accountId, billRecord } = req.body;

    if (!accountId || !billRecord) {
      res.status(400).json({
        success: false,
        message: "bill to add missing props",
      });
      res.end("");
      return;
    }

    const createdbill = await createBillRecordByAccId(accountId, billRecord);

    if (!createdbill?.status === "success") {
      throw new Error(`Something went wrong | ${createdbill?.message}`);
    }

    res.status(200).json({
      success: true,
      message: "bill created successfully",
      data: createdbill,
    });
    res.end("");
    return;

    //
  } catch (error) {
    Sentry.captureException(error);

    res.status(400).json({ message: error?.message });
    res.end("");
  }
};

export { createBillRecordController, createBillRecordByAccIdController };
