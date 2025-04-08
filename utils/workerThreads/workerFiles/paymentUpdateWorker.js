import mongoose from "mongoose";
import Users from "../../../mongodb/models/Users.js";
import Accounts from "../../../mongodb/models/Accounts.js";
import Bills from "../../../mongodb/models/Bills.js";
import { getFormattedDate, idGeneratorHelper, isThirtyDaysPassed } from "../../helpers.js";
import { addOrUpdateContactInCRM } from "../../zoho/zohoServices.js";
import Likes from "../../../mongodb/models/Likes.js";
import tranzilaApiCall from "../../tranzilaApiCall.js";
import CONSTANTS from "../../constants.js";

const TZ_TERMINAL_NAME = process?.env?.TZ_TERMINAL_NAME || `heyoutok`;


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

          console.log(`STO PAYMENT CRON JOB STARTED FOR USER : ${user?._id}` , JSON.stringify({
            cardToken: user?.cardToken,
            cardExpiryMonth: user?.cardExpiryMonth,
            cardExpiryYear: user?.cardExpiryYear,
            companyId: curPrimaryCompany?.companyId,
            message:`aPyment started`
          }));
          
  
          const curPrimaryCompany = user?.companies?.find(
            (cmp) => cmp?.isPrimary === true
          );
  
          if (!curPrimaryCompany?.companyId) {
            console.log(`STO PAYMENT CRON JOB FILED FOR USER : ${user?._id}` , JSON.stringify({
              cardToken: user?.cardToken,
              cardExpiryMonth: user?.cardExpiryMonth,
              cardExpiryYear: user?.cardExpiryYear,
              companyId: curPrimaryCompany?.companyId,
              message:`Payment failed due to companyId not found`
            }));
            continue;
          }
  
          const company = await Accounts.findById(curPrimaryCompany?.companyId);
  
          if (!company || !company?._id) {
            console.log(
              `Admin user not valid ${decodedToken?.userId} for account : ${user?.accountId} & user : ${user?._id}`
            );

            console.log(`STO PAYMENT CRON JOB FILED FOR USER : ${user?._id}` , JSON.stringify({
              cardToken: user?.cardToken,
              cardExpiryMonth: user?.cardExpiryMonth,
              cardExpiryYear: user?.cardExpiryYear,
              companyId: curPrimaryCompany?.companyId,
              message:`Company doesn't exist in DB`
            }));

            continue;
          }
  
          const unExpiredStoBill = await Bills.findOne({
            userId: user?._id,
            isStoExpired: false,
            isCanceled: {$ne: true},
            standingOrderId: { $ne: null, $exists: true, $ne: "" },
          });

          // Add comment to check deployment

          console.log(`STO PAYMENT CRON JOB UNEXPIRED STOS : ${user?._id}` , JSON.stringify({
            cardToken: user?.cardToken,
            cardExpiryMonth: user?.cardExpiryMonth,
            cardExpiryYear: user?.cardExpiryYear,
            companyId: curPrimaryCompany?.companyId,
            message:`Payment failed due to companyId not found`,
           unExpiredStoBill
          }));
  
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

            console.log(`STO PAYMENT CRON JOB FILED FOR USER : ${user?._id}` , JSON.stringify({
              cardToken: user?.cardToken,
              cardExpiryMonth: user?.cardExpiryMonth,
              cardExpiryYear: user?.cardExpiryYear,
              companyId: curPrimaryCompany?.companyId,
              message:`No previous bill was found, will have to make payment from Admin app once`
            }));

            throw new Error(
              `Can't proceede futher because no previous bill was found , kindly make payment from our admin app once for account : ${user?.accountId} & user : ${user?._id}`
            );
          }
  
          const hasThirtyDaysPassedSinceLastBill = isThirtyDaysPassed(
            previousBill?.createdAt
          );
  
          if (!hasThirtyDaysPassedSinceLastBill) {

            console.log(`STO PAYMENT CRON JOB FILED FOR USER : ${user?._id}` , JSON.stringify({
              cardToken: user?.cardToken,
              cardExpiryMonth: user?.cardExpiryMonth,
              cardExpiryYear: user?.cardExpiryYear,
              companyId: curPrimaryCompany?.companyId,
              message:`Payment is already upto date for current month, Required days haven't passed yet`
            }));

            throw new Error(
              `This months bill for ${user?.firstName || ""} ${
                user?.lastName || ""
              } is already paid`
            );
          }
  
          if (bills && bills?.length > 0) {

            console.log(`STO PAYMENT CRON JOB FILED FOR USER : ${user?._id}` , JSON.stringify({
              cardToken: user?.cardToken,
              cardExpiryMonth: user?.cardExpiryMonth,
              cardExpiryYear: user?.cardExpiryYear,
              companyId: curPrimaryCompany?.companyId,
              message:`Payment is already upto date for current month, Required days haven't passed yet`
            }));

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

            console.log(`STO PAYMENT CRON JOB FILED FOR USER : ${user?._id}` , JSON.stringify({
              cardToken: user?.cardToken,
              cardExpiryMonth: user?.cardExpiryMonth,
              cardExpiryYear: user?.cardExpiryYear,
              companyId: curPrimaryCompany?.companyId,
              message:`Card has expired`
            }));


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
  
          // const usersThatLikedUsingOurTool = await Likes.aggregate([
          //   {
          //     $match: {
          //       createdAt: {
          //         $lte: currentDateMillis,
          //         $gte: thirtyDaysAgoMillis,
          //       },
          //     },
          //   },
          //   {
          //     $sort: {
          //       createdAt: -1,
          //     },
          //   },
          //   {
          //     $group: {
          //       _id: "$userId",
          //       totalLikes: { $sum: 1 },
          //       lastLikeDate: { $first: "$createdAt" }, // Set the last like date
          //     },
          //   },
          //   {
          //     $lookup: {
          //       from: "users", // Replace with your Users collection name
          //       localField: "_id",
          //       foreignField: "_id",
          //       as: "userDetails",
          //     },
          //   },
          //   {
          //     $unwind: "$userDetails",
          //   },
  
          //   {
          //     $match: {
          //       "userDetails.companies": {
          //         $elemMatch: {
          //           companyId: company?._id,
          //           isPrimary: true,
          //         },
          //       },
          //     },
          //   },
  
          //   {
          //     $project: {
          //       _id: 0,
          //       userId: "$_id",
          //       accountId: "$userDetails.accountId",
          //       userCreatedAt: { $toDate: "$userDetails.createdAt" },
          //       userName: {
          //         $concat: [
          //           "$userDetails.firstName",
          //           " ",
          //           "$userDetails.lastName",
          //         ],
          //       },
          //       userProfile: "$userDetails.profileImageLink",
          //       totalLikes: 1,
          //       lastLikeDate: { $toDate: "$lastLikeDate" },
          //     },
          //   },
          // ]);
          
          const usersThatLikedUsingOurTool =  await Users.find({
            companies: {
              $elemMatch: { companyId: company?._id, isPrimary: true },
            },
            status: "completed",
          }).count();

          console.log(`STO PAYMENT CRON JOB FILED FOR USER : ${user?._id}` , JSON.stringify({
            cardToken: user?.cardToken,
            cardExpiryMonth: user?.cardExpiryMonth,
            cardExpiryYear: user?.cardExpiryYear,
            companyId: curPrimaryCompany?.companyId,
            message:`No of users that liked are ${usersThatLikedUsingOurTool}`
          }));

        
          const NoOfusersThatLikedUsingOurTool =
            usersThatLikedUsingOurTool;

          const NoOfusersThatUsedAppPrevMonth =
            previousBill?.noOfUsers || previousBill?.totalAmount / 3 || 0;
  
          let newStoId = "";
          let prevStoId =
            previousBill?.standingOrderId || unExpiredStoBill?.standingOrderId;
  
          if (NoOfusersThatLikedUsingOurTool !== NoOfusersThatUsedAppPrevMonth) {
            // -> If yes expire previous STO & create new one
            console.log(`STO PAYMENT CRON JOB UPDATE STO : ${user?._id}` , JSON.stringify({
              cardToken: user?.cardToken,
              cardExpiryMonth: user?.cardExpiryMonth,
              cardExpiryYear: user?.cardExpiryYear,
              companyId: curPrimaryCompany?.companyId,
              message:`Users has changed for company, will try to update STO accordingly`
            }));

            if (prevStoId) {

              console.log(`STO PAYMENT CRON JOB UPDATE STO : ${user?._id}` , JSON.stringify({
                cardToken: user?.cardToken,
                cardExpiryMonth: user?.cardExpiryMonth,
                cardExpiryYear: user?.cardExpiryYear,
                companyId: curPrimaryCompany?.companyId,
                message:`Prev sto Id exists ${prevStoId}, can update STO`
              }));
  

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

                console.log(`STO PAYMENT CRON JOB UPDATE STO FAiLED : ${user?._id}` , JSON.stringify({
                  cardToken: user?.cardToken,
                  cardExpiryMonth: user?.cardExpiryMonth,
                  cardExpiryYear: user?.cardExpiryYear,
                  companyId: curPrimaryCompany?.companyId,
                  message:`STO update failed due to tranzilla API error`, 
                   tzApiRes
                }));
    

                throw new Error(
                  `Something went wrong while updating STO for account : ${user?.accountId} & user : ${user?._id}`
                );
              }
  
              await Bills.updateMany(
                { standingOrderId: prevStoId },
                { isStoExpired: true }
              );
            }

            console.log(`STO PAYMENT CRON JOB CREATE NEW STO AFTER UPDATE : ${user?._id}` , JSON.stringify({
              cardToken: user?.cardToken,
              cardExpiryMonth: user?.cardExpiryMonth,
              cardExpiryYear: user?.cardExpiryYear,
              companyId: curPrimaryCompany?.companyId,
              message:`Here I will try to create new STO`
            }));

  
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
              console.log(`STO PAYMENT CRON JOB CREATE NEW STO AFTER UPDATE FILED : ${user?._id}` , JSON.stringify({
                cardToken: user?.cardToken,
                cardExpiryMonth: user?.cardExpiryMonth,
                cardExpiryYear: user?.cardExpiryYear,
                companyId: curPrimaryCompany?.companyId,
                message:`STO creation failed due to tranzilla API error`,
                tzApiCreeateRes
              }));
              throw new Error(`Something went wrong while creating STO`);
            }
  
            newStoId = tzApiCreeateRes.data.sto_id;
          }


          console.log(`STO PAYMENT CRON JOB I WILL GENERATE BILL BASED ON STO UPDATE : ${user?._id}` , JSON.stringify({
            cardToken: user?.cardToken,
            cardExpiryMonth: user?.cardExpiryMonth,
            cardExpiryYear: user?.cardExpiryYear,
            companyId: curPrimaryCompany?.companyId,
            message:`Will try to generate bill based on STO OR prev STO update`,
            prevStoId,
            newStoId
          }));
  
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

            console.log(`STO PAYMENT CRON JOB I WILL GENERATE BILL AFTER STO UPDATE FAILED: ${user?._id}` , JSON.stringify({
              cardToken: user?.cardToken,
              cardExpiryMonth: user?.cardExpiryMonth,
              cardExpiryYear: user?.cardExpiryYear,
              companyId: curPrimaryCompany?.companyId,
              message:`Failed to create bill record`,
              billRec,
              prevStoId,
              newStoId
            }));

            throw new Error(
              `Something went wrong while creating bill record for account : ${user?.accountId} & user : ${user?._id}`
            );
          }
  
          console.log(
            `Bill created for account : ${user?.accountId} & user : ${user?._id}`
          );

          console.log(`STO PAYMENT CRON JOB BILL CREATED SUCESS: ${user?._id}` , JSON.stringify({
            cardToken: user?.cardToken,
            cardExpiryMonth: user?.cardExpiryMonth,
            cardExpiryYear: user?.cardExpiryYear,
            companyId: curPrimaryCompany?.companyId,
            message:`BILL CREATED SUCESS`,
            billRec,
            prevStoId,
            newStoId
          }));

        } catch (error) {
          console.log(`Error occured while creating bill for ${error?.message}`);
        }
      }
    } catch (error) {
      console.log(`Error occured while creating bill for ${error?.message}`);
    }
  };

const paymentCornMehodToRun = async () => {
  try {
    console.log(`UPDATING SUBSCRIPTION STATUS IN SAPERATE THREAD`);
    await mongoose.connect(process.env.MONGODB_URL);
    console.log(`Payment update worker called`);   
    await updateCreateBillForUsers();
    mongoose.disconnect();
    console.log(`MongoDB connection closed`);
  } catch (error) {
    console.log(`Error occured `, error);
    mongoose.disconnect();
  }
};

paymentCornMehodToRun()
