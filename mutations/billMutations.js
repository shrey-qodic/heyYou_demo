import * as dotenv from "dotenv";
import jwt from "jsonwebtoken";
// import axios from "axios";
import { getFormattedDate, idGeneratorHelper } from "../utils/helpers.js";
import logGracefulMessage from "../utils/logGracefulMessage.js";
import Bills from "../mongodb/models/Bills.js";
import Users from "../mongodb/models/Users.js";
import tranzilaApiCall from "../utils/tranzilaApiCall.js";
import CONSTANTS from "../utils/constants.js";
import {
  addOrUpdateContactInCRM,
  createOrUpdateAccount,
  updateAccountInfo,
} from "../utils/zoho/zohoServices.js";
import Accounts from "../mongodb/models/Accounts.js";
import moment from "moment";
dotenv.config();

const TZ_TERMINAL_NAME = process?.env?.TZ_TERMINAL_NAME || `heyoutok`;
const TZ_STO_CHARGE_FREQUENCY =
  "monthly" || process?.env?.TZ_STO_CHARGE_FREQUENCY;
const JWT_SECRET_KEY = process.env.JWT_SECRET;
const createBillRecord = async (token, billRecord) => {
  // Temp card token "D0fc802f2786b192708"

  try {
    const decodedToken = jwt.verify(token, JWT_SECRET_KEY, (err, decoded) => {
      if (err) {
        throw new Error("Invalid token signature");
      }
      return decoded;
    });

    let curUser = await Users.findById(decodedToken?.userId);

    console.log(
      `CREATE BILL BY TOKEN : FOUND USER - ${curUser?._id}`,
      JSON.stringify(curUser)
    );

    const curUsersPrimCmp = curUser?.companies?.find(
      (cmp) => cmp?.isPrimary === true
    );

    console.log(
      `CREATE BILL BY TOKEN : FOUND Primary Account - ${curUser?._id}`,
      JSON.stringify(curUsersPrimCmp)
    );

    const curAccAdminUser = await Users.findOne({
      role: "Admin",
      companies: {
        $elemMatch: {
          companyId: curUsersPrimCmp?.companyId,
          isPrimary: true,
        },
      },
    });

    console.log(
      `CREATE BILL BY TOKEN : FOUND ACC ADMIN - ${curUser?._id}`,
      JSON.stringify(curAccAdminUser)
    );

    // if (!curUser?._id) {
    //   throw new Error(
    //     `Can't bill the user either because user doens't exist or its not admin`
    //   );
    // }

    const yearPrefix = new Date().getFullYear().toString().slice(0, 2);

    if (
      !curUser?.cardToken ||
      !curUser.cardExpiryMonth ||
      !curUser?.cardExpiryYear
    ) {
      // I will create it here
      console.log(
        `CREATE BILL BY TOKEN : NO CARD DETAILS FOUND - ${curUser?._id}`
      );
      if (
        !billRecord?.cardExpiryMonth ||
        !billRecord.cardExpiryYear ||
        !billRecord?.cardToken
      ) {
        console.log(
          `CREATE BILL BY TOKEN : ERR - NO BILL FOUND - ${curUser?._id}`
        );
        throw new Error(`Card details not found need to create again`);
      }

      // -

      console.log(
        `CREATE BILL BY TOKEN : UPDATE USERS CARD DETAILS BY BILL RECORD - ${curUser?._id}`
      );
      curUser = await Users.findByIdAndUpdate(
        curUser?._id,
        {
          cardToken: billRecord?.cardToken,
          cardExpiryMonth: billRecord?.cardExpiryMonth,
          cardExpiryYear: `${yearPrefix}${billRecord?.cardExpiryYear}`,
        },
        { new: true }
      );

      console.log(
        `CREATE BILL BY TOKEN : UPGRADE ACCOUNT PLAN TO PAID - ${curUser?._id} - ${curUsersPrimCmp?.companyId}`
      );
      const updatedAccount = await Accounts.findByIdAndUpdate(
        curUsersPrimCmp?.companyId,
        {
          plan: "Paid",
        },
        { new: true }
      );

      console.log(
        `CREATE BILL BY TOKEN : UPGRADE ADMIN USERS PLAN TO PAID - ${curUser?._id} - ${curUsersPrimCmp?.companyId}`
      );
      const updatedUser = await Users.findByIdAndUpdate(
        curAccAdminUser?._id,
        { accountPlan: "Paid" },
        { new: true }
      );

      console.log(
        `CREATE BILL BY TOKEN : UPDATE IN CRM - ${curUser?._id} - ${curUsersPrimCmp?.companyId}`
      );
      await addOrUpdateContactInCRM(updatedUser, false);
      await addOrUpdateContactInCRM(curUser, false);
      await updateAccountInfo(updatedAccount);
    }

    console.log(
      `CREATE BILL BY TOKEN : STARTING ACTUAL BILL CREATION FLOW - ${curUser?._id} - ${curUsersPrimCmp?.companyId}`
    );

    const numberOfCurActiveUsers = billRecord?.totalActiveUsers?.length || 3;
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1;
    const currentYear = currentDate.getFullYear();

    // Find the bill with the same month and year
    const prevBill = await Bills.findOne({
      $expr: {
        $and: [
          { $eq: [{ $month: "$createdAt" }, currentMonth] },
          { $eq: [{ $year: "$createdAt" }, currentYear] },
        ],
      },
      isCanceled: { $ne: true },
    });

    if (prevBill) {
      console.log(
        `CREATE BILL BY TOKEN : PREV MONTH BILL FOUND, ALREADY PAID - ${curUser?._id} - ${curUsersPrimCmp?.companyId}`,
        JSON.stringify(prevBill)
      );
      throw new Error(`This months bill is already paid`);
    }

    console.log(
      `CREATE BILL BY TOKEN : MAKING TZ API CALL - ${curUser?._id} - ${curUsersPrimCmp?.companyId}`
    );
    const tzApiRes = await tranzilaApiCall(
      CONSTANTS.API.CRM.CREATE_STANDING_ORDER,
      {
        terminal_name: TZ_TERMINAL_NAME,
        sto_payments_number: 12,
        charge_frequency: TZ_STO_CHARGE_FREQUENCY,
        first_charge_date: getFormattedDate(30),
        charge_dom: 1,
        client: {
          name: `${curUser?.firstName} ${curUser?.lastName}`,
          email: `${curUser?.email}`,
        },
        item: {
          name: "Heyou App",
          unit_price: 3,
          units_number: numberOfCurActiveUsers * 1,
          price_currency: "USD",
          vat_percent: 17,
          price_type: "G",
        },
        card: {
          token: curUser?.cardToken,
          expire_month: curUser?.cardExpiryMonth * 1,
          expire_year: curUser?.cardExpiryYear * 1,
        },
        response_language: "english",
        created_by_user: "Alon",
      }
    );

    if (!tzApiRes?.status === "success") {
      console.log(
        `CREATE BILL BY TOKEN : TZ API FAILED - ${curUser?._id} - ${curUsersPrimCmp?.companyId}`
      );
      throw new Error(`${tzApiRes?.message}`);
    }

    console.log(
      `CREATE BILL BY TOKEN : ADD DATA FOR BILL - ${curUser?._id} - ${curUsersPrimCmp?.companyId}`
    );
    const billRecToAdd = {
      _id: idGeneratorHelper("bill"),
      createdAt: currentDate,
      userId: curUser?._id,
      noOfUsers: numberOfCurActiveUsers,
      hash: billRecord?.hash,
      standingOrderId: tzApiRes?.data?.sto_id,
      totalAmount: 3 * numberOfCurActiveUsers,
      accountId: curUsersPrimCmp?.companyId,
    };

    const billRec = await Bills.create(billRecToAdd);

    if (!billRec?._id) {
      console.log(
        `CREATE BILL BY TOKEN : BILL WASN'T CREATED - ${curUser?._id} - ${curUsersPrimCmp?.companyId}`
      );
      throw new Error(`Something went wrong while creating bill record`);
    }
    logGracefulMessage({
      status: "Success",
      message: `Bill created successfully`,
      userId: ``,
      accountId: ``,
      method: `createBillRecord`,
    });
    return {
      status: "success",
      message: `Bill record with standing order created successfully`,
      invoice: billRec,
    };
  } catch (error) {
    //
    logGracefulMessage({
      status: "Error",
      message: `${error?.message}`,
      userId: ``,
      accountId: ``,
      method: `createBillRecord`,
    });
    return {
      status: "error",
      message: `${error?.message}`,
      invoice: null,
    };
  }
};

// This event is working when payment is done using hosted fields
const createBillRecordByAccId = async (accountId, billRecord) => {
  try {
    console.log(`CREATE BILL BY ACC ID : FOUND ACC - ${accountId}`);

    const allUsers = await Users.find({
      companies: {
        $elemMatch: { companyId: accountId },
      },
      status: "completed",
    }).lean();

    console.log(
      `CREATE BILL BY ACC ID : GOT ALL USERS - ${accountId}`,
      JSON.stringify(allUsers)
    );

    let curUser = await Users?.findOne({
      companies: {
        $elemMatch: { companyId: accountId },
      },
      role: "Admin",
    }).lean();

    console.log(
      `CREATE BILL BY ACC ID : FOUND ADMIN USER - ${accountId} - USR - ${curUser?._id}`,
      JSON.stringify(curUser)
    );

    const curUsersPrimCmpId = curUser?.companies?.find(
      (cmp) => cmp?.isPrimary
    )?.companyId;

    console.log(
      `CREATE BILL BY ACC ID : PRIMARY ACC - ${curUsersPrimCmpId} - USR - ${curUser?._id}`
    );

    if (!curUser?._id) {
      console.log(
        `CREATE BILL BY ACC ID : NO ADMIN FOUND - ${accountId} - USR - ${curUser?._id}`
      );
      const updatedAccount = await Accounts.findByIdAndUpdate(
        curUsersPrimCmpId,
        {
          plan: "Freemium",
        },
        { new: true }
      ).lean();

      await updateAccountInfo(updatedAccount);

      console.log(
        `CREATE BILL BY ACC ID : CHANGED PLAN TO FREEMIUM - ${curUsersPrimCmpId} - USR - ${curUser?._id}`
      );

      throw new Error(
        `Can't bill the user either because user doens't exist or its not admin`
      );
    }

    const yearPrefix = new Date().getFullYear().toString().slice(0, 2);

    if (
      !curUser?.cardToken ||
      !curUser.cardExpiryMonth ||
      !curUser?.cardExpiryYear
    ) {
      // I will create it here
      console.log(
        `CREATE BILL BY ACC ID : NO CARD DETAILS FOUND - ${curUsersPrimCmpId} - USR - ${curUser?._id}`
      );
      if (
        !billRecord?.cardExpiryMonth ||
        !billRecord.cardExpiryYear ||
        !billRecord?.cardToken
      ) {
        console.log(
          `CREATE BILL BY ACC ID : NO BILL FOUND - ${curUsersPrimCmpId} - USR - ${curUser?._id}`
        );
        const updatedAccount = await Accounts.findByIdAndUpdate(
          curUsersPrimCmpId,
          {
            plan: "Freemium",
          },
          { new: true }
        ).lean();

        await updateAccountInfo(updatedAccount);

        throw new Error(`Card details not found need to create again`);
      }

      console.log(
        `CREATE BILL BY ACC ID : UPDATE ADMIN USER CARD - ${curUsersPrimCmpId} - USR - ${curUser?._id}`
      );

      // -
      curUser = await Users.findByIdAndUpdate(
        curUser?._id,
        {
          cardToken: billRecord?.cardToken,
          cardExpiryMonth: billRecord?.cardExpiryMonth,
          cardExpiryYear: `${yearPrefix}${billRecord?.cardExpiryYear}`,
        },
        { new: true }
      );

      console.log(
        `CREATE BILL BY ACC ID : UPDATE ACC PAYMENT STATUS - ${curUsersPrimCmpId} - USR - ${curUser?._id}`
      );
      const updatedAccount = await Accounts.findByIdAndUpdate(
        curUsersPrimCmpId,
        {
          plan: "Paid",
        },
        { new: true }
      ).lean();

      console.log(
        `CREATE BILL BY ACC ID : UPDATE CRM - ${curUsersPrimCmpId} - USR - ${curUser?._id}`
      );
      await addOrUpdateContactInCRM(curUser, false);
      await updateAccountInfo(updatedAccount);
    }

    const numberOfCurActiveUsers = billRecord?.totalActiveUsers?.length || 1;
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1;
    const currentYear = currentDate.getFullYear();

    // Find the bill with the same month and year
    const prevBill = await Bills.findOne({
      $and: [
        {
          $expr: {
            $and: [
              { $eq: [{ $month: "$createdAt" }, currentMonth] },
              { $eq: [{ $year: "$createdAt" }, currentYear] },
            ],
          },
        },
        { userId: { $in: allUsers?.map((usr) => usr?._id.toString()) } },
        { isCanceled: { $ne: true } },
      ],
    });

    if (prevBill) {
      console.log(
        `CREATE BILL BY ACC ID : FOUND PREV BILL, ALREADY PAID - ${curUsersPrimCmpId} - USR - ${curUser?._id}`
      );
      throw new Error(`This months bill is already paid`);
    }

    console.log(
      `CREATE BILL BY ACC ID : MAKE TZ API - ${curUsersPrimCmpId} - USR - ${curUser?._id}`
    );
    const tzApiRes = await tranzilaApiCall(
      CONSTANTS.API.CRM.CREATE_STANDING_ORDER,
      {
        terminal_name: TZ_TERMINAL_NAME,
        sto_payments_number: 12,
        charge_frequency:
          accountId === `acc_9227afc9d23d` ? "weekly" : TZ_STO_CHARGE_FREQUENCY,
        first_charge_date: getFormattedDate(30),
        charge_dom: 1,
        client: {
          name: `${curUser?.firstName} ${curUser?.lastName}`,
          email: `${curUser?.email}`,
        },
        item: {
          name: "Heyou App",
          unit_price: 3,
          units_number: numberOfCurActiveUsers * 1,
          price_currency: "USD",
          vat_percent: 17,
          price_type: "G",
        },
        card: {
          token: curUser?.cardToken,
          expire_month: curUser?.cardExpiryMonth * 1,
          expire_year: curUser?.cardExpiryYear * 1,
        },
        response_language: "english",
        created_by_user: "Alon",
      }
    );

    if (!tzApiRes?.status === "success") {
      console.log(
        `CREATE BILL BY ACC ID : TZ API FAILED - ${curUsersPrimCmpId} - USR - ${curUser?._id}`
      );
      throw new Error(`${tzApiRes?.message}`);
    }

    console.log(
      `CREATE BILL BY ACC ID : PREPARE BILL RECORD TO ADD - ${curUsersPrimCmpId} - USR - ${curUser?._id}`
    );

    const billRecToAdd = {
      _id: idGeneratorHelper("bill"),
      createdAt: currentDate,
      userId: curUser?._id,
      noOfUsers: numberOfCurActiveUsers,
      hash: billRecord?.hash,
      standingOrderId: tzApiRes?.data?.sto_id,
      totalAmount: 3 * numberOfCurActiveUsers,
      accountId: curUsersPrimCmpId,
    };

    const billRec = await Bills.create(billRecToAdd);

    if (!billRec?._id) {
      console.log(
        `CREATE BILL BY ACC ID : WASN't ABLE TO CREATE BILL - ${curUsersPrimCmpId} - USR - ${curUser?._id}`,
        JSON.stringify(billRecord)
      );
      throw new Error(`Something went wrong while creating bill record`);
    }
    logGracefulMessage({
      status: "Success",
      message: `Bill created successfully`,
      userId: ``,
      accountId: ``,
      method: `createBillRecord`,
    });
    return {
      status: "success",
      message: `Bill record with standing order created successfully`,
      invoice: billRec,
    };
  } catch (error) {
    //
    logGracefulMessage({
      status: "Error",
      message: `${error?.message}`,
      userId: ``,
      accountId: ``,
      method: `createBillRecord`,
    });
    return {
      status: "error",
      message: `${error?.message}`,
      invoice: null,
    };
  }
};

const expireSto = async (req, res) => {
  try {
    const { userId } = req?.params;
    const user = await Users.findById(userId);
    if (!user?._id) {
      res
        .status(200)
        .json({ success: false, message: `${userId} doesn't exists in DB` });
      res.end();
    }

    const curUserPrimCmp = user?.companies?.find(
      (cmp) => cmp?.isPrimary === true
    );

    const validityStartDate = moment().subtract(30, "days"); // 30 days ago
    const today = moment(); // Today's date

    // Find the active subscription bill within the 30-day validity window
    const pastValidBill = await Bills.findOne({
      accountId: curUserPrimCmp?.companyId,
      isCanceled: { $ne: true },
      createdAt: {
        $gte: validityStartDate.toDate(),
        $lte: today.toDate(),
      },
    }).lean();

    const prevStoId = pastValidBill?.standingOrderId;
    if (prevStoId) {
      const tzApiRes = await tranzilaApiCall(
        CONSTANTS.API.CRM.UPDATE_STANDING_ORDER,
        {
          terminal_name: TZ_TERMINAL_NAME,
          sto_id: prevStoId * 1,
          sto_status: "inactive",
          response_language: "english",
        }
      );

      if (tzApiRes?.data?.error_code !== 0) {
        throw new Error(`Something went wrong while updating STO`);
      }

      await Bills.findByIdAndUpdate(pastValidBill?._id, {
        isCanceled: true,
        cancelledAt: moment().toDate(),
      });

      const updatedUser = await Users.findByIdAndUpdate(
        user?._id,
        { accountPlan: "Freemium" },
        { returnDocument: "after" }
      );
      const updatedAcc = await Accounts.findByIdAndUpdate(
        curUserPrimCmp?.companyId,
        { plan: "Freemium" },
        { returnDocument: "after" }
      );

      await addOrUpdateContactInCRM(updatedUser, false);
      await createOrUpdateAccount(updatedAcc, true);

      res.status(200).json({
        success: true,
        message: `${userId} sto status Updated !`,
        data: tzApiRes?.data,
      });
      return res.end();
    }

    throw new Error(`No previous STO found for ${userId}`);
  } catch (error) {
    //
    res.status(200).json({
      success: true,
      message: `${error?.message}`,
      data: error,
    });
    res.end();
    console.log("Something went wrong while updating STO");
  }
};

const deactivateAllStos = async (req, res) => {
  try {
    const response = await tranzilaApiCall(
      CONSTANTS.API.CRM.GET_STANDING_ORDER,
      { terminal_name: TZ_TERMINAL_NAME, response_language: "english" }
    );

    const activeStos = response?.data?.stos?.filter(
      (sto) => sto?.sto_status === "active"
    );

    const resArr = await Promise.all(
      activeStos?.map((sto) => {
        const obToUpdate = {
          terminal_name: TZ_TERMINAL_NAME,
          sto_id: sto?.sto_id * 1,
          sto_status: "inactive",
          response_language: "english",
        };
        return tranzilaApiCall(
          CONSTANTS.API.CRM.UPDATE_STANDING_ORDER,
          obToUpdate
        );
      })
    );

    res.status(200).json({ resArr, activeStos });
  } catch (error) {
    res.status(2400).json({ ...error });
  }
};

export {
  createBillRecord,
  expireSto,
  createBillRecordByAccId,
  deactivateAllStos,
};
