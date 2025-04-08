import Accounts from "../../mongodb/models/Accounts.js";
import Bills from "../../mongodb/models/Bills.js";
import Likes from "../../mongodb/models/Likes.js";
import Users from "../../mongodb/models/Users.js";
import CONSTANTS from "../constants.js";
import createCronJob, {
  CRON_JOB_SCHEDULES,
} from "../creeateCronJob/createCronJob.js";
import {
  getFormattedDate,
  idGeneratorHelper,
  isThirtyDaysPassed,
} from "../helpers.js";
import tranzilaApiCall from "../tranzilaApiCall.js";
import { paymentMethodWorkerExecution } from "../workerThreads/extensionPaymentUpdateForAllUsers.js";
import { addOrUpdateContactInCRM } from "../zoho/zohoServices.js";

const TZ_TERMINAL_NAME = "heyoutok" || process?.env?.TZ_TERMINAL_NAME;

const updateCreateBillForUsers = async () => {
  console.log(`Starting payment cron job now`);
  try {
    const currentUsersToBill = await Users.find({
      role: "Admin",
      cardToken: { $ne: null, $exists: true, $ne: "" },
      cardExpiryMonth: { $ne: null, $exists: true, $ne: "" },
      cardExpiryYear: { $ne: null, $exists: true, $ne: "" },
    });

    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1;

    for (const user of currentUsersToBill) {
      try {
        // - Check if bill of current month exists for this user

        const curPrimaryCompany = user?.companies?.find(
          (cmp) => cmp?.isPrimary === true
        );

        if (!curPrimaryCompany?.companyId) {
          continue;
        }

        const company = await Accounts.findById(curPrimaryCompany?.companyId);

        if (!company || !company?._id) {
          console.log(
            `Admin user not valid ${decodedToken?.userId} for account : ${user?.accountId} & user : ${user?._id}`
          );
          continue;
        }

        const unExpiredStoBill = await Bills.findOne({
          userId: user?._id,
          isStoExpired: false,
          isCanceled: {$ne: true},
          standingOrderId: { $ne: null, $exists: true, $ne: "" },
        });

        const bills = await Bills.aggregate([
          {
            $match: {
              userId: user?._id,
              $expr: {
                $eq: [{ $month: "$createdAt" }, currentMonth],
              },
            },
          },
        ]);

        const previousBills = await Bills.aggregate([
          {
            $match: {
              userId: user?._id,
              $expr: {
                $eq: [{ $month: "$createdAt" }, currentMonth - 1],
              },
            },
          },
        ]);

        const previousBill = previousBills[0];

        if (!previousBill) {
          const updatedUser = await Users.findByIdAndUpdate(
            user?._id,
            {
              cardToken: null,
              cardExpiryYear: null,
              cardExpiryMonth: null,
            },
            { new: true }
          );
          await addOrUpdateContactInCRM(updatedUser, false);
          throw new Error(
            `Can't proceede futher because no previous bill was found , kindly make payment from our admin app once for account : ${user?.accountId} & user : ${user?._id}`
          );
        }

        const hasThirtyDaysPassedSinceLastBill = isThirtyDaysPassed(
          previousBill?.createdAt
        );

        if (!hasThirtyDaysPassedSinceLastBill) {
          throw new Error(
            `This months bill for ${user?.firstName || ""} ${
              user?.lastName || ""
            } is already paid`
          );
        }

        if (bills && bills?.length > 0) {
          throw new Error(
            `This months bill for ${user?.firstName || ""} ${
              user?.lastName || ""
            } is already paid`
          );
        }

        const { cardExpiryMonth, cardExpiryYear } = user;

        const cardExpired =
          cardExpiryYear < currentDate.getFullYear() ||
          (cardExpiryYear === currentDate.getFullYear() &&
            cardExpiryMonth <= currentDate.getMonth());

        if (cardExpired) {
          throw new Error(
            `Can't proceede futher because card details are expired for account : ${user?.accountId} & user : ${user?._id}`
          );
        }

        currentDate.setHours(0, 0, 0, 0);

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
        thirtyDaysAgo.setHours(0, 0, 0, 0);

        const currentDateMillis = currentDate.getTime();
        const thirtyDaysAgoMillis = thirtyDaysAgo.getTime();

        const usersThatLikedUsingOurTool = await Likes.aggregate([
          {
            $match: {
              createdAt: {
                $lte: currentDateMillis,
                $gte: thirtyDaysAgoMillis,
              },
            },
          },
          {
            $sort: {
              createdAt: -1,
            },
          },
          {
            $group: {
              _id: "$userId",
              totalLikes: { $sum: 1 },
              lastLikeDate: { $first: "$createdAt" }, // Set the last like date
            },
          },
          {
            $lookup: {
              from: "users", // Replace with your Users collection name
              localField: "_id",
              foreignField: "_id",
              as: "userDetails",
            },
          },
          {
            $unwind: "$userDetails",
          },

          {
            $match: {
              "userDetails.companies": {
                $elemMatch: {
                  companyId: company?._id,
                  isPrimary: true,
                },
              },
            },
          },

          {
            $project: {
              _id: 0,
              userId: "$_id",
              accountId: "$userDetails.accountId",
              userCreatedAt: { $toDate: "$userDetails.createdAt" },
              userName: {
                $concat: [
                  "$userDetails.firstName",
                  " ",
                  "$userDetails.lastName",
                ],
              },
              userProfile: "$userDetails.profileImageLink",
              totalLikes: 1,
              lastLikeDate: { $toDate: "$lastLikeDate" },
            },
          },
        ]);

        const NoOfusersThatLikedUsingOurTool =
          usersThatLikedUsingOurTool?.length || 0;
        const NoOfusersThatUsedAppPrevMonth =
          previousBill?.noOfUsers || previousBill?.totalAmount / 3 || 0;

        let newStoId = "";
        let prevStoId =
          previousBill?.standingOrderId || unExpiredStoBill?.standingOrderId;

        if (NoOfusersThatLikedUsingOurTool !== NoOfusersThatUsedAppPrevMonth) {
          // -> If yes expire previous STO & create new one
          if (prevStoId) {
            const tzApiRes = await tranzilaApiCall(
              CONSTANTS.API.CRM.UPDATE_STANDING_ORDER,
              {
                terminal_name: TZ_TERMINAL_NAME,
                sto_id: prevStoId * 1,
                sto_status: "inactive",
                response_language: "english",
                updated_by_user: `${user?.firstName} ${user?.lastName}`,
              }
            );

            if (tzApiRes?.data?.error_code !== 0) {
              throw new Error(
                `Something went wrong while updating STO for account : ${user?.accountId} & user : ${user?._id}`
              );
            }

            await Bills.updateMany(
              { standingOrderId: prevStoId },
              { isStoExpired: true }
            );
          }

          // -> Creeate new STO based on new users now
          const tzApiCreeateRes = await tranzilaApiCall(
            CONSTANTS.API.CRM.CREATE_STANDING_ORDER,
            {
              terminal_name: TZ_TERMINAL_NAME,
              sto_payments_number: 12,
              charge_frequency: "monthly",
              first_charge_date: getFormattedDate(),
              charge_dom: 1,
              client: {
                name: `${user?.firstName} ${user?.lastName}`,
                email: `${user?.email}`,
              },
              item: {
                name: "Heyou App",
                unit_price: 3,
                units_number: NoOfusersThatLikedUsingOurTool * 1,
                price_currency: "USD",
                vat_percent: 17,
                price_type: "G",
              },
              card: {
                token: user?.cardToken,
                expire_month: user?.cardExpiryMonth * 1,
                expire_year: user?.cardExpiryYear * 1,
              },
              response_language: "english",
              created_by_user: "Alon",
            }
          );

          if (tzApiCreeateRes?.data?.error_code !== 0) {
            throw new Error(`Something went wrong while creating STO`);
          }

          newStoId = tzApiCreeateRes.data.sto_id;
        }

        const billRecToAdd = {
          _id: idGeneratorHelper("bill"),
          createdAt: currentDate,
          userId: user?._id,
          totalActiveUsers: NoOfusersThatLikedUsingOurTool,
          hash: "N/A",
          standingOrderId: newStoId || prevStoId,
          totalAmount: 3 * NoOfusersThatLikedUsingOurTool,
        };

        const billRec = await Bills.create(billRecToAdd);

        if (!billRec?._id) {
          throw new Error(
            `Something went wrong while creating bill record for account : ${user?.accountId} & user : ${user?._id}`
          );
        }

        console.log(
          `Bill created for account : ${user?.accountId} & user : ${user?._id}`
        );
      } catch (error) {
        console.log(`Error occured while creating bill for ${error?.message}`);
      }
    }
  } catch (error) {
    console.log(`Error occured while creating bill for ${error?.message}`);
  }
};

const extensionPaymentScheduleCronJob = () =>
  createCronJob(
    CRON_JOB_SCHEDULES.EVERY_DAY_MIDNIGHT,
    paymentMethodWorkerExecution
  );

export { extensionPaymentScheduleCronJob as default, updateCreateBillForUsers };
