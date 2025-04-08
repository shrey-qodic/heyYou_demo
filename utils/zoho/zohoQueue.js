import * as Sentry from "@sentry/node";
import Users from "../../mongodb/models/Users.js";
import Accounts from "../../mongodb/models/Accounts.js";
import { updateZohoContactAndAccount } from "./zohoServices.js";
import logGracefulMessage from "../logGracefulMessage.js";
const FIVEMINUTE = 60 * 1000 * 5; // 5 minute in milliseconds

// Function to fetch all accounts without a crmId
async function fetchAccountsWithoutZohoId() {
  try {
    const accounts = await Accounts.find({ crmId: { $exists: false } });
    return accounts;
  } catch (error) {
    logGracefulMessage({
      status: "Error",
      message: `${error?.message}`,
      userId: ``,
      accountId: ``,
      method: `fetchAccountsWithoutZohoId`,
    });

    return [];
  }
}
// Function to fetch all users without a crmId
async function fetchUsersWithoutZohoId() {
  try {
    const users = await Users.find({ crmId: { $exists: false } });
    return users;
  } catch (error) {
    logGracefulMessage({
      status: "Error",
      message: `${error?.message}`,
      userId: ``,
      accountId: ``,
      method: `fetchUsersWithoutZohoId`,
    });

    return [];
  }
}
// Main function to process users and accounts without Zoho IDs
async function processRecordsWithoutZohoId() {
  // console.log('Proccess Records without zoho id started')
  setInterval(async () => {
    const accountsWithoutZohoId = await fetchAccountsWithoutZohoId();
    const usersWithoutZohoId = await fetchUsersWithoutZohoId();

    for (const account of accountsWithoutZohoId) {
      try {
        await updateZohoContactAndAccount(account, null);
        logGracefulMessage({
          status: "Success",
          accountId: `${account?._id}`,
          userId: ``,
          message: `Updated zoho contact and account successfully`,
          method: `updateZohoContactAndAccount`,
        });
        // console.log(`Account ${account._id} updated by processRecordsWithoutZohoId`);
      } catch (error) {
        logGracefulMessage({
          status: "Error",
          accountId: `${account?._id}`,
          userId: ``,
          message: `${error?.message}`,
          method: `updateZohoContactAndAccount`,
        });
      }
    }

    for (const user of usersWithoutZohoId) {
      try {
        await updateZohoContactAndAccount(null, user);
        logGracefulMessage({
          status: "Success",
          accountId: ``,
          userId: `${user?._id}`,
          message: `Updated zoho contact and account successfully`,
          method: `updateZohoContactAndAccount`,
        });
        // console.log(`User ${user._id} updated by processRecordsWithoutZohoId`);
      } catch (error) {
        logGracefulMessage({
          status: "Error",
          accountId: ``,
          userId: `${user?._id}`,
          message: `${error?.message}`,
          method: `updateZohoContactAndAccount`,
        });
      }
    }
  }, FIVEMINUTE);
}

export { processRecordsWithoutZohoId };
