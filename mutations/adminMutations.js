import pkg from "email-addresses";
import * as dotenv from "dotenv";
dotenv.config();
import axios from "axios";
import qs from "qs";
import {
  getDomainName,
  idGeneratorHelper,
  makeStringUrlFriendly,
  validateDomain,
} from "../utils/helpers.js";
import Accounts from "../mongodb/models/Accounts.js";
import Users from "../mongodb/models/Users.js";
import { generateLinkForInvitedUser } from "./userMutations.js";
import {
  addOrUpdateContactInCRM,
  updateZohoContactAndAccount,
} from "../utils/zoho/zohoServices.js";
import { updateStripeSubscription } from "./stripeMutations.js";
import logGracefulMessage from "../utils/logGracefulMessage.js";
const { parseOneAddress } = pkg;

const CHROME_WEBSTORE_LINK = process?.env?.CHROME_WEBSTORE_LINK || `https://chromewebstore.google.com/detail/heyou-for-linkedin-auto-l/kmdecpkbfpikmcihneemicicpiblfepm`;

export const createAdminDomainAccount = async (userData) => {
  const { email, officialCompanyUrl, adminUserId, isFromMobile } = userData;
  // if (!adminUserId) return false;
  if (!email) return false;
  const parsedAddrss = parseOneAddress(email);
  if (!parsedAddrss) return false;

  const foundUser = await Users.findById(adminUserId);

  const primaryCompanyId =
    foundUser?.companies?.find((cmp) => cmp?.isPrimary === true)?.companyId ||
    foundUser?.accountId;

  // if (!foundUser) return false;

  const existingAcc = await Accounts.findById(primaryCompanyId);

  const mainAdminUser = await Users.findOne({
    accountId: foundUser?.accountId || `N/A`,
    role: "Admin",
  });

  // if (!existingAcc) {
  //   return false;
  // }

  let userIsAdmin = existingAcc?.officialLinkedInCompanyUrl ? false : true;

  const companiesForUserToCreate = existingAcc?._id ? [ {
    companyId: existingAcc?._id,
    isAuthorOfCompany: false,
    officialLinkedInCompanyUrl: existingAcc?.officialLinkedInCompanyUrl,
    isPrimary: true,
  }] : []

  // todo create link
  const userInfo = {
    _id: idGeneratorHelper("usr"),
    role:  "User",
    ...userData,
    email: userData?.email?.toLowerCase() || "",
    companies: companiesForUserToCreate,
    active: true,
    status: "pending",
    createdAt: new Date(),
    inviterName: `${foundUser?.firstName || "Unknown"} ${
      foundUser?.lastName || ""
    }`,
    companyName: `${existingAcc?.company || "Unknown"} `,
    companyOwner: `${mainAdminUser?.firstName || "Unknown"} ${
      mainAdminUser?.lastName || ""
    }`,
  };
  // -
  const curUser = await Users.findOne({
    $or: [{ userProfileUrl: userData?.userProfileUrl || "N/A" }, { email }],
  });

  if (curUser) {
    // -
    // console.log("Im here");
    // This means that user already exists in DB by email or by profileURL.
    return false;
  }

  let finalAcc = existingAcc;
  let linkForInvitesUser = null;
  let generatedShareLink = CHROME_WEBSTORE_LINK;

  if(finalAcc && finalAcc?._id) {

     linkForInvitesUser = await generateLinkForInvitedUser(
      foundUser?._id,
      userInfo?._id,
      isFromMobile
    );

    userInfo.linkForInvitedUser = linkForInvitesUser?.linkForInvitedUser;
  
     generatedShareLink = `${
      process.env.FRONT_END_SITE_URL
    }/${makeStringUrlFriendly(
      finalAcc?.company
    )}/shared_invite/${finalAcc?._id?.replaceAll(
      "acc_",
      ""
    )}/${userInfo?._id?.replaceAll("usr_", "")}`;
  }

  

  userInfo.shareLink = generatedShareLink;

  const finalUserToCreate = finalAcc?._id
    ? { ...userInfo, accountId: finalAcc?._id }
    : { ...userInfo };

  const adminUser = await Users.findOne({
    accountId: foundUser?.accountId,
    role: "Admin",
  });

  const companyOwner = `${adminUser?.firstName || "Unknown"} ${
    adminUser?.lastName || ""
  }`;
  const companyName = `${finalAcc?.company || "Unknown"}`;

  // Create user in the database
  const userCreated = await Users.create({
    ...finalUserToCreate,
    companyOwner
  });


  try {
    if(primaryCompanyId && adminUserId) {
      const updatedSubcription = await updateStripeSubscription(primaryCompanyId, adminUserId)
    }
  } catch (error) {
    console.log("eroor", error)
    logGracefulMessage({
      status: "Error",
      message: `${error?.message}`,
      userId: `${userCreated?._id}`,
      accountId: `${userCreated?.accountId}`,
      method: `createAdminDomainAccount`,
    });
  }

  try {
    const mainRes = await addOrUpdateContactInCRM({
      ...(userCreated._doc || {}),
    });
  } catch (error) {
    logGracefulMessage({
      status: "Error",
      message: `${error?.message}`,
      userId: `${userCreated?._id}`,
      accountId: `${userCreated?.accountId}`,
      method: `createAdminDomainAccount`,
    });
  }

  if (!userCreated) return false;

  return true;
};
