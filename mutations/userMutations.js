import jwt from "jsonwebtoken";
import * as Sentry from "@sentry/node";
import Likes from "../mongodb/models/Likes.js";
import puppeteer from "puppeteer";
import * as dotenv from "dotenv";
import axios from "axios";

import Users from "../mongodb/models/Users.js";
import {
  getDomainName,
  idGeneratorHelper,
  makeStringUrlFriendly,
  toCookieObject,
} from "../utils/helpers.js";
import Posts from "../mongodb/models/Posts.js";
import { uploadScreenshotViaStream } from "../utils/upload.js";
import {
  addOrUpdateContactInCRM,
  createAccountInCRM,
  deleteAccountsBulk,
  deleteCrmUserById,
  deleteZohoAccount,
  deleteZohoUser,
  getAccountIdByName,
  getCrmIdForAccount,
  getCrmIdFromUserEmail,
  getListOfAccountsCrm,
  sendVerificationEmail,
  updateAccountInfo,
  updateNoOfAccInCrm,
  updateUsersLastSeenStatusInCrm,
  updateZohoContactAndAccount,
} from "../utils/zoho/zohoServices.js";
import // retrieveStoredCookie,
// storeCookieAsSecretKey,
// updateStoredCookie,
"../utils/secretsManagerClient.js";
import Accounts from "../mongodb/models/Accounts.js";
import Invites from "../mongodb/models/Invites.js";
import { mixpanelUpdateUserRole, mixpanelTrack } from "../utils/mixpanel.js";
import { generateVerificationCode } from "../utils/helpers.js";
import Otps from "../mongodb/models/Otps.js";
import sendActiveCampaignMail from "../utils/activecampaign/sendActiveCampaignMail.js";
import otpLoginAdminTemplate from "../utils/activecampaign/emailTemplates/otpLoginAdminTemplate.js";
import logGracefulMessage from "../utils/logGracefulMessage.js";
import CONSTANTS from "../utils/constants.js";
import ExtensionInstallSource from "../mongodb/models/ExtensionInstallSource.js";
import Bills from "../mongodb/models/Bills.js";
import UserAccounts from "../mongodb/models/UserAccounts.js";
import moment from "moment";
import { updateStripeSubscription } from "./stripeMutations.js";
dotenv.config();

// Constants from env or any other local files
const ADMIN_APP_URL =
  process?.env?.ADMIN_APP_URL || "https://my-staging.heyou.io";
const ADMIN_CRM_URL =
  process?.env?.ADMIN_CRM_URL || `https://heyou.activehosted.com`;
// --------

const userUpsert = async (cookie, userAgent) => {
  // console.log("userUpsert: started", { cookie, userAgent });

  // TODO: check if the user with this cookie info exists

  // If yes, then all good. if no, please create user record
  let cookieJSessionId = cookie
    .split("; ")
    .filter((coo) => coo.indexOf("JSESSIONID=") >= 0);
  if (!cookieJSessionId.length) {
    logGracefulMessage({
      status: "Error",
      accountId: ``,
      userId: ``,
      message: `No cookie JsessionId found`,
      method: `userUpsert`,
    });

    return false;
  }

  const csrfToken = cookieJSessionId[0]
    .slice("JSESSIONID=".length)
    .replace(/"/g, "");

  const options = {
    method: "GET",
    hostname: "www.linkedin.com",
    port: null,
    path: "/voyager/api/me",
    followRedirects: false,
    headers: {
      referer: "https://www.linkedin.com/in/me/",
      cookie,
      "csrf-token": csrfToken,
      origin: "https://www.linkedin.com",
      authority: "www.linkedin.com",
      "x-requested-with": "XMLHttpRequest",
      "x-restli-protocol-version": "2.0.0",
      accept: "application/vnd.linkedin.normalized+json+2.1",
      "x-li-track":
        '{"clientVersion":"1.5.*","osName":"web","timezoneOffset":2,"deviceFormFactor":"DESKTOP","mpName":"voyager-web"}',
    },
  };
  try {
    // console.log("Will do linked in api call");
    const response = await axios.get(
      "https://www.linkedin.com/voyager/api/me",
      {
        headers: options.headers,
        maxRedirects: 10,
      }
    );

    // console.log("Response is", response?.data);

    if (!response || !response.data) {
      logGracefulMessage({
        status: "Error",
        accountId: ``,
        userId: ``,
        message: `No cookie JsessionId found`,
        method: `userUpsert`,
      });
    }

    const userExists = await Users.findOne({
      memberId: response?.data?.data?.plainId,
    });

    if (userExists) {
      // console.log("userUpsert: user exists, update user");

      // update the key first
      // const secretUpdateResponse = await updateStoredCookie(
      //   cookie,
      //   userExists.memberId,
      //   userExists._id
      // );

      const updatedUser = await Users.updateOne(
        {
          memberId: response?.data?.data?.plainId,
        },
        {
          $set: {
            firstName: response?.data?.included[0]?.firstName,
            lastName: response?.data?.included[0]?.lastName,
            cookie,
            userAgent,
          },
          $unset: {
            uninstallReason: 1,
            uninstalledAt: 1,
          },
        }
      );
      // console.log("userUpsert: updated", {
      //   updatedUser,
      //   // secretName: secretUpdateResponse?.Name,
      //   // versionId: secretUpdateResponse?.VersionId,
      // });
      return "existing";
    }
    // await extractEmailAddress(cookie);

    // const storeInfo = {
    //   _id: idGeneratorHelper("usr"),
    //   memberId: response?.data?.data?.plainId,
    //   firstName: response?.data?.included[0]?.firstName,
    //   lastName: response?.data?.included[0]?.lastName,
    //   cookie,
    //   userAgent,
    //   installedAt: new Date(),
    // };
    // await Users.create(storeInfo);

    // // Store new secret key for the user cookie
    // const secretResponse = await storeCookieAsSecretKey(
    //   cookie,
    //   storeInfo.memberId,
    //   storeInfo._id
    // );

    // console.log("userUpsert: ready to create new user", {
    //   storeInfo,
    //   secretName: secretResponse?.Name,
    //   versionId: secretResponse?.VersionId,
    // });

    return "new";
  } catch (error) {
    logGracefulMessage({
      status: "Error",
      accountId: ``,
      userId: ``,
      message: `${error?.message}`,
      method: `userUpsert`,
    });
    return false;
  }
};

const saveLinkedInPost = async (url) => {
  try {
    // console.log("saveLinkedInPost: started", { url });

    const postExists = await Posts.findOne({ postUrl: url });
    if (postExists) {
      // console.log("saveLinkedInPost: post already exists");
      return {
        success: false,
        message: "post already exists",
        postId: null,
      };
    }
    const addPost = await Posts.create({
      _id: idGeneratorHelper("post"),
      createdAt: new Date(),
      postUrl: url,
    });

    // console.log("saveLinkedInPost: success");

    logGracefulMessage({
      status: "Success",
      accountId: ``,
      userId: ``,
      message: `The post has been added successfully}`,
      method: `saveLinkedInPost`,
    });

    return {
      success: true,
      message: "The post has been added successfully",
      postId: addPost?._id,
    };
  } catch (error) {
    logGracefulMessage({
      status: "Error",
      accountId: ``,
      userId: ``,
      message: `${error?.message}`,
      method: `saveLinkedInPost`,
    });

    return {
      success: false,
      message: error?.message,
      postId: null,
    };
  }
};

const visitAndCapturePage = async (userId, postId) => {
  try {
    // console.log("visitAndCapturePage: started", { userId, postId });
    // fetch user
    // const fetchUserSecret = await retrieveStoredCookie(userId);

    // fetch post
    const fetchPost = await Posts.findById(postId);

    if (!fetchPost || !fetchUserSecret) {
      logGracefulMessage({
        status: "Error",
        accountId: ``,
        userId,
        message: `visitAndCapturePage failed`,
        method: `visitAndCapturePage`,
      });

      return {
        success: false,
        message: "Unable to retrieve post or user info",
        photoUrl: null,
      };
    }
    // // SecretString is from the aws secret keys
    // const { cookie, memberId } = JSON.parse(fetchUserSecret?.SecretString);

    // this is from mongo db
    const { cookie } = fetchUserSecret;
    // console.log("visitAndCapturePage: user secrets retrieved", {
    //   cookie,
    // });

    if (!cookie) {
      logGracefulMessage({
        status: "Error",
        accountId: ``,
        userId,
        message: `No cookie found`,
        method: `visitAndCapturePage`,
      });

      return {
        success: false,
        message: "Unable to retrieve user secrets",
        photoUrl: null,
      };
    }
    // view by puppeteer
    const options = { width: 1920, height: 1080 };

    const browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-gpu",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
      ],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: options.width, height: options.height });
    await page.setExtraHTTPHeaders({
      referer: "https://www.linkedin.com/in/me/",
    });
    const cookieItems = await toCookieObject(cookie);

    if (cookieItems) {
      await page.setCookie(...cookieItems);
    }
    await page.setUserAgent(process.env.DEFAULT_USER_AGENT);
    // console.log("visitAndCapturePage: ready", {
    //   options,
    //   userAgent: process.env.DEFAULT_USER_AGENT,
    //   referer: "https://www.linkedin.com/in/me/",
    //   userId,
    //   postId,
    //   usercookie: cookie,
    // });
    // Before calling goto, do not follow redirects
    // await page.setRequestInterception(true);
    // page.on("request", (request) => {
    //   const maxRedirectChainLength = 2;
    //   console.log("visitAndCapturePage: on request event", {
    //     isNavigationRequest: request.isNavigationRequest(),
    //     redirectChain: request.redirectChain(),
    //     maxRedirectChainLength,
    //   });
    //   if (request.isNavigationRequest()) {
    //     console.log("visitAndCapturePage: aborting further requests");
    //     request.abort();
    //   } else {
    //     console.log(
    //       "visitAndCapturePage: further requests will still continue"
    //     );
    //     request.continue();
    //   }
    // });

    // Go to
    await page.goto(fetchPost?.postUrl, { waitUntil: "load", timeout: 0 });
    // capture photo
    const screenshot = await page.screenshot({ encoding: "binary" });
    const photoUrl = await uploadScreenshotViaStream(screenshot);

    // like the post
    await page.waitForSelector(".react-button__trigger", {
      visible: true,
      timeout: 0,
    });
    // await page.click(".react-button__trigger");

    const reactButton = await page.$(".react-button__trigger"); // Fetch the first matching element

    if (reactButton) {
      const isLiked = await reactButton.evaluate(
        (element) => element.getAttribute("aria-pressed") === "true"
      );

      if (isLiked) {
        // console.log("Button is already liked.");
        return {
          success: true,
          message: "User already liked",
          photoUrl,
        };
      } else {
        await reactButton.click(); // Click on the first matching element
        // console.log("Clicked the .react-button__trigger element.");
      }
    } else {
      // console.log("No .react-button__trigger elements found.");
    }
    await browser.close();

    logGracefulMessage({
      status: "Success",
      accountId: ``,
      userId,
      message: `visitAndCapturePage success`,
      method: `visitAndCapturePage`,
    });

    return {
      success: true,
      message: "Viewed the page and Liked",
      photoUrl,
    };
  } catch (error) {
    logGracefulMessage({
      status: "Error",
      accountId: ``,
      userId,
      message: `${error?.message}`,
      method: `visitAndCapturePage`,
    });
    return {
      success: false,
      message: error?.message,
      photoUrl: null,
    };
  }
};

const extractEmailAddress = async (cookie) => {
  // console.log("extractEmailAddress: started", {});

  // view by puppeteer
  const options = { width: 1920, height: 1080 };

  const browser = await puppeteer.launch({
    headless: false,
    args: ["--no-sandbox", "--disable-gpu"],
    devtools: true,
    userDataDir: "./user_data",
  });
  try {
    const page = await browser.newPage();
    page.on("console", (message) =>
      console.log(
        `${message.type().substr(0, 3).toUpperCase()} ${message.text()}`
      )
    );
    // await page.setRequestInterception(true);

    // page.on("request", (request) => {
    //   if (
    //     ["image", "stylesheet", "font"].indexOf(request.resourceType()) !== -1
    //   ) {
    //     console.log("🚫 abort requests ...");
    //     request.abort();
    //   } else {
    //     console.log("🚀 continue requests ...");
    //     request.continue();
    //   }
    // });
    await page.setViewport({ width: options.width, height: options.height });
    await page.setExtraHTTPHeaders({
      referer: "https://www.linkedin.com/in/me/",
    });
    const cookieItems = await toCookieObject(cookie);
    // console.log("extractEmailAddress: cookieItems", { cookieItems });
    if (cookieItems) {
      await page.setCookie(...cookieItems);
    }
    await page.setUserAgent(process.env.DEFAULT_USER_AGENT);
    // console.log("extractEmailAddress: ready", {
    //   options,
    //   userAgent: process.env.DEFAULT_USER_AGENT,
    //   referer: "https://www.linkedin.com/in/me/",
    //   usercookie: cookie,
    // });

    // Go to
    await page.goto(
      "https://www.linkedin.com/mypreferences/d/manage-email-addresses",
      { waitUntil: "load", timeout: 0 }
    );
    // extractEmailAddress: failed {
    //   errorMessage: 'Waiting for selector `.email` failed: Waiting failed: 30000ms exceeded',
    //   stack: {
    //     error: TimeoutError: Waiting for selector `.email` failed: Waiting failed: 30000ms exceeded
    //         at Timeout.<anonymous> (file:///F:/Upwork/Projects/HeYou/code/heyou-poc/server/node_modules/puppeteer-core/lib/esm/puppeteer/common/WaitTask.js:56:37)
    //         at listOnTimeout (node:internal/timers:559:17)
    //         at processTimers (node:internal/timers:502:7)
    //   }
    // }
    // like the post
    const element = await page.waitForSelector(
      ".email.config-setting__label-text",
      {
        visible: true,
      }
    );
    // console.log("extractEmailAddress: element -> ", element);
    const value = await element.evaluate((el) => el.textContent);
    // console.log("extractEmailAddress: value of the p tag", {
    //   value,
    // });

    logGracefulMessage({
      status: "Success",
      accountId: ``,
      userId: ``,
      message: `extractEmailAddress success`,
      method: `extractEmailAddress`,
    });

    return await browser.close();
  } catch (error) {
    await browser.close();

    logGracefulMessage({
      status: "Error",
      accountId: ``,
      userId: ``,
      message: `extractEmailAddress failed`,
      method: `extractEmailAddress`,
    });

    return {
      success: false,
      message: error?.message,
    };
  }
};

// const reactToLinkedInPost = async (userId, postId) => {
//   try {
//     console.log("reactToLinkedInPost: started", { userId, postId });
//     // fetch user
//     const fetchUserSecret = await Users.findById(userId);
//     // fetch post
//     const fetchPost = await Posts.findById(postId);
//     if (!checkPostUrl(fetchPost?.postUrl)) {
//       return {
//         success: false,
//         message: "Failed to check url",
//       };
//     }
//     // TODO: Extract threadUrn
//     let cookieJSessionId = fetchUserSecret.cookie
//       .split("; ")
//       .filter((cookie) => cookie.indexOf("JSESSIONID=") >= 0);
//     const csrfToken = cookieJSessionId[0]
//       .slice("JSESSIONID=".length)
//       .replace(/"/g, "");
//     try {
//       const likeResponse = await axios({
//         method: "post",
//         url: "https://www.linkedin.com/voyager/api/feed/reactions",
//         data: {
//           reactionType: "LIKE",
//           threadUrn: fetchPost?.threadUrn,
//         },
//         headers: {
//           referer: fetchPost?.postUrl,
//           cookie: fetchUserSecret?.cookie,
//           "csrf-token": csrfToken,
//           origin: "https://www.linkedin.com",
//           authority: "www.linkedin.com",
//           "x-requested-with": "XMLHttpRequest",
//           "x-restli-protocol-version": "2.0.0",
//           accept: "application/vnd.linkedin.normalized+json+2.1",
//           "user-agent": fetchUserSecret?.userAgent || process.env.DEFAULT_USER_AGENT,
//           "x-li-track":
//             '{"clientVersion":"1.5.*","osName":"web","timezoneOffset":2,"deviceFormFactor":"DESKTOP","mpName":"voyager-web"}',
//         },
//       });

//       console.log(likeResponse);
//       return {
//         success: true,
//         message: "Liked the post",
//       };
//     } catch (error) {
//       console.log("reactToLinkedInPost: failed", {
//         errorMessage: error?.message,
//         stack: { error },
//       });
//       return {
//         success: false,
//         message: error?.message,
//       };
//     }
//   } catch (error) {
//     console.log("reactToLinkedInPost: failed", {
//       errorMessage: error?.message,
//     });
//     return {
//       success: false,
//       message: error?.message,
//     };
//   }
// };

const updateUserEmail = async ({ oldEmail, newEmail }) => {
  try {
    const user = await Users.findOne({ email: oldEmail });
    const updatedAccount = await Accounts.findById(user?.accountId);

    if (!user) {
      return "User not found"; // Return an appropriate message if the user is not found
    }

    user.email = newEmail;
    await user.save();

    try {
      await addOrUpdateContactInCRM(user);
    } catch (error) {
      logGracefulMessage({
        status: "Error",
        message: `${error?.message}`,
        userId: `${user?._id}`,
        accountId: `${user?.accountId}`,
        method: `updateUsersEmail`,
      });
    }

    logGracefulMessage({
      status: "Success",
      message: `Email updated successfully`,
      userId: `${user?._id}`,
      accountId: `${user?.accountId}`,
      method: `updateUsersEmail`,
    });

    return {
      status: "success",
      message: `Email ${oldEmail} Updated to ${newEmail} successfully`,
    };
  } catch (error) {
    logGracefulMessage({
      status: "Error",
      message: `${error?.message}`,
      userId: ``,
      accountId: ``,
      method: `updateUsersEmail`,
    });
    return {
      status: "false",
      message: error.message,
    };
  }
};

const updateUserProfileUrl = async ({ userProfileUrl, update, ipAddress }) => {
  try {
    const inviteRecord = await Invites.findOne({ ipAddress });

    if (inviteRecord && inviteRecord._id && !inviteRecord?.installed) {
      const inviteAcc = await Accounts.findOne({
        id: inviteRecord.invitee_company_id,
      });
      const inviteUser = await Users.findOneAndUpdate(
        { userProfileUrl },
        {
          ...update,
          accountId: inviteAcc._id,
          updatedAt: new Date(),
          officialCompanyUrl: inviteAcc.officialCompanyUrl,
          domainName: inviteAcc.domainName,
          company: inviteAcc.companyName,
          status: "completed",
          role: "User",
          inviteType: "link",
          invite: true,
          onBoardingComplete: true,
          email: inviteAcc?.email,
        }
      );
      await inviteUser.save();

      mixpanelUpdateUserRole(inviteRecord._id, "User");

      // await Invites.findByIdAndDelete(inviteRecord._id);

      await Invites.findByIdAndUpdate(inviteRecord._id, { installed: true });

      try {
        if (inviteUser.email) {
          await updateZohoContactAndAccount("", inviteUser);
        }
      } catch (error) {
        logGracefulMessage({
          status: "Error",
          message: `${error?.message}`,
          userId: `${inviteUser?._id}`,
          accountId: `${inviteUser?.accountId}`,
          method: `updateUserByprofileUrl`,
        });
      }

      return {
        status: "success",
        message: `user updated successfully by profile url -- invite url`,
        user: {
          ...inviteUser._doc,
          officialLinkedInCompanyUrl: inviteAcc.officialLinkedInCompanyUrl,
        },
      };
    }

    const domainToCheck =
      update.officialCompanyUrl ||
      `https://${update.email.split("@")[1]}` ||
      "";

    const validDomainName = getDomainName(domainToCheck);
    if (validDomainName === "Invalid URL") return false;

    // check for duplicate
    const existingAcc = await Accounts.findOne({
      domainName: validDomainName,
    });

    let userRole = existingAcc?.domainName ? "User" : "Admin";

    let updatedUser = {
      ...update,
      status: "completed",
      role: userRole,
    };

    let createdAcc = existingAcc;
    let accId = existingAcc?._id || idGeneratorHelper("acc");

    if (!existingAcc && !existingAcc?._id) {
      const accountInfo = {
        _id: accId,
        createdAt: new Date(),
        updatedAt: new Date(),
        adminEmail: update.email,
        domainName: validDomainName,
        isActive: true,
        isVerified: true,
        company: update.company,
        officialCompanyUrl: update.officialCompanyUrl,
        officialLinkedInCompanyUrl: update?.officialLinkedInCompanyUrl || "",
      };
      createdAcc = await Accounts.create(accountInfo);
      // console.log("createAdminDomainAccount: ready to create new account", {
      //   accountInfo,
      //   createdAcc,
      // });
      if (!createdAcc) return false;
    }

    const user = await Users.findOneAndUpdate(
      { userProfileUrl },
      {
        ...updatedUser,
        accountId: accId,
        updatedAt: new Date(),
        inviteType: userRole === "User" ? "email" : "none",
        onBoardingComplete: true,
      }
    );
    await user.save();

    mixpanelUpdateUserRole(user._id, userRole);
    try {
      await updateZohoContactAndAccount(updatedAccount, user);
    } catch (error) {
      logGracefulMessage({
        status: "Error",
        message: `${error?.message}`,
        userId: `${user?._id}`,
        accountId: `${user?.accountId}`,
        method: `updateUserByprofileUrl`,
      });
    }

    logGracefulMessage({
      status: "Success",
      message: `Users updated by profile successfully`,
      userId: `${user?._id}`,
      accountId: `${accId}`,
      method: `updateUserByprofileUrl`,
    });

    return {
      status: "success",
      message: `user updated successfully by profile url`,
      user: {
        ...user._doc,
        accountId: accId,
        updatedAt: new Date(),
        inviteType: userRole === "User" ? "email" : "none",
        officialLinkedInCompanyUrl:
          createdAcc?.officialLinkedInCompanyUrl || "",
      },
    };
  } catch (error) {
    logGracefulMessage({
      status: "Error",
      message: `${error?.message}`,
      userId: ``,
      accountId: ``,
      method: `updateUserByprofileUrl`,
    });

    return {
      status: "false",
      message: error.message,
    };
  }
};

const updateUsersEmail = async ({ userId, email }) => {
  try {
    const domainToCheck = `https://${email.split("@")[1]}` || "";

    const validDomainName = getDomainName(domainToCheck);
    if (validDomainName === "Invalid URL") {
      logGracefulMessage({
        status: "Error",
        accountId: ``,
        userId: `${userId}`,
        message: `updateUsersEmail failed`,
        method: `updateUsersEmail`,
      });

      return false;
    }

    const oldUser = await Users.findOne({ _id: userId });

    if (!oldUser || !oldUser?.accountId) {
      logGracefulMessage({
        status: "Error",
        accountId: ``,
        userId: `${userId}`,
        message: `updateUsersEmail failed`,
        method: `updateUsersEmail`,
      });
      return false;
    }

    const alreadyInvitedByEmailUser = await Users.findOne({
      email: email,
      invite: true,
    });

    if (alreadyInvitedByEmailUser && alreadyInvitedByEmailUser?._id) {
      // - delete prev user to prevent duplicate records

      await Users.findByIdAndUpdate(userId, {
        crmId: alreadyInvitedByEmailUser?.crmId,
        accountId: alreadyInvitedByEmailUser?.accountId,
      });

      await Users.findByIdAndDelete(alreadyInvitedByEmailUser?._id);
    }

    const user = await Users.findByIdAndUpdate(userId, { email });

    const updatedAccount = await Accounts.findByIdAndUpdate(oldUser.accountId, {
      domainName: validDomainName,
    });

    user.email = email;

    const adminUser = await Users.findOne({
      accountId: user?.accountId,
      role: "Admin",
    });

    const companyOwner = `${adminUser?.firstName || "Unknown"} ${
      adminUser?.lastName || ""
    }`;
    const companyName = `${updatedAccount?.company || "Unknown"}`;

    try {
      await addOrUpdateContactInCRM({
        ...user?._doc,
        companyOwner,
        companyName,
      });
      await updateAccountsContactsNumber(user?.accountId);
    } catch (error) {
      logGracefulMessage({
        status: "Error",
        accountId: ``,
        userId: `${userId}`,
        message: `updateUsersEmail failed`,
        method: `updateUsersEmail`,
      });
    }

    logGracefulMessage({
      status: "Success",
      accountId: ``,
      userId: `${userId}`,
      message: `user email updated`,
      method: `updateUsersEmail`,
    });

    return {
      status: "success",
      message: `user email successfully`,
      user: { ...oldUser._doc, email },
    };
  } catch (error) {
    logGracefulMessage({
      status: "Error",
      accountId: ``,
      userId: `${userId}`,
      message: `updateUsersEmail failed`,
      method: `updateUsersEmail`,
    });
    return {
      status: "false",
      message: error.message,
    };
  }
};

const updateAccountsContactsNumber = async (accountId) => {
  try {
    const curAcc = await Accounts.findById(accountId);

    if (!curAcc?._id) {
      throw new Error("No account found for account " + accountId);
    }

    const users = await Users?.find({ accountId });

    const noOfSignUps =
      users?.filter((user) => user?.onBoardingComplete)?.length + 1;

    const noOfContacts = users?.length + 1;

    const updateAccInCrmRes = await updateNoOfAccInCrm(
      curAcc?.crmId,
      noOfContacts,
      noOfSignUps
    );
    await updateAccInCrmRes.json();
    await Accounts.findByIdAndUpdate(accountId, { noOfContacts });
    return curAcc;
  } catch (error) {
    //
    console.log("I got error no of contacts update", error);
    return error;
  }
};

const createOrRetrieveUserByProfileUrl = async (curUserToBeCreated) => {
  const {
    userProfileUrl,
    firstName,
    lastName,
    cookie,
    userAgent,
    officialLinkedInCompanyUrl,
    company,
    ipAddress,
    email,
    extensionVersion,
  } = curUserToBeCreated;

  try {
    // - TODO: Now already invited logic will be moved here
    // - Need to create logic for that
    const invitedUser = await Invites.findOne({ ipAddress });
    const userThatInvited = await Users.findById(invitedUser?.invitee_id);
    const mainReferer = await ExtensionInstallSource.findOne({ ipAddress });
    const user = await Users.findOne({ userProfileUrl });
    const prevAccFound = await Accounts.findOne({ officialLinkedInCompanyUrl });
    const userType = prevAccFound ? "User" : "Admin";
    let accountIdForUser = prevAccFound?._id || "";
    let currentUserCompany = prevAccFound?.company || "";

    const installSource = mainReferer?.referrer || "Not Found";
    const utm_medium = mainReferer?.utm_medium || "Not Found";
    const utm_campaign = mainReferer?.utm_campaign || "Not Found";

    // todo fix usersCounter - not working right now
    if (!user && prevAccFound) {
      const newUsersCounter = (prevAccFound?.usersCounter || 0) + 1;
      const newSignupsCounter = (prevAccFound?.noOfSignUps || 0) + 1;
      await Accounts.findByIdAndUpdate(prevAccFound?._id, {
        usersCounter: newUsersCounter,
        noOfSignUps: newSignupsCounter,
      });

      // Update CRM here also
    }

    // If user exists already , return it immediately
    if (user && user?._id) {
      // - This is for removing uninstall if user comes back
      if (user && user.uninstalledAt) {
        user.uninstalledAt = null;
        await user.save();
      }

      // - If user exists but account does not
      if (!user?.accountId) {
        let updatedUserWithAccountId = null;

        // - In case of account already exists
        if (prevAccFound?._id) {
          updatedUserWithAccountId = await Users.findByIdAndUpdate(
            user?._id,
            {
              ...curUserToBeCreated,
              accountId: prevAccFound?._id,
            },
            { new: true }
          );
          await addOrUpdateContactInCRM(updatedUserWithAccountId?._doc, false);

          return {
            status: "success",
            message: `user updated with accountIdd successfully`,
            user: {
              ...updatedUserWithAccountId._doc,
              officialLinkedInCompanyUrl:
                prevAccFound?.officialLinkedInCompanyUrl || "",
              onBoardingComplete: false,
              currentUserCompany: prevAccFound?.company,
            },
          };
        } else if (!prevAccFound?._id) {
          const accountInfo = {
            _id: idGeneratorHelper("acc"),
            createdAt: new Date(),
            updatedAt: new Date(),
            isActive: true,
            isVerified: true,
            company: company,
            usersCounter: 1,
            noOfContacts: 1,
            noOfSignUps: 1,
            officialLinkedInCompanyUrl: officialLinkedInCompanyUrl || "",
          };

          const newlyCreatedAccount = await Accounts.create(accountInfo);
          accForUserToBeCreated = newlyCreatedAccount;
          accountIdForUser = newlyCreatedAccount._id;
          currentUserCompany = newlyCreatedAccount.company;

          updatedUserWithAccountId = await Users.findByIdAndUpdate(
            user?._id,
            { ...curUserToBeCreated, accountId: newlyCreatedAccount?._id },
            { new: true }
          );

          await addOrUpdateContactInCRM(updatedUserWithAccountId?._doc, false);

          return {
            status: "success",
            message: `user updated with accountIdd successfully`,
            user: {
              ...updatedUserWithAccountId._doc,
              officialLinkedInCompanyUrl:
                newlyCreatedAccount?.officialLinkedInCompanyUrl || "",
              onBoardingComplete: false,
              currentUserCompany: newlyCreatedAccount?.company,
            },
          };
        }
      }

      const account = await Accounts.findById(user.accountId);
      const prevBoading = user?.onBoardingComplete;

      if (!user?.onBoardingComplete && user.email) {
        user.onBoardingComplete = true;
        await user.save();
      }
      // - Only do CRM stuff after onBoarding this API is called before onboarding
      // if (!user?.email) {
      //   try {
      // await updateZohoContactAndAccount(account, user);
      //   } catch (error) {
      //     console.error("Error updating user:", error);
      //   }
      // }

      return {
        status: "success",
        message: `user retrieved successfully`,
        user: {
          ...user._doc,
          officialLinkedInCompanyUrl: account?.officialLinkedInCompanyUrl || "",
          onBoardingComplete: prevBoading,
          currentUserCompany,
        },
      };
    }

    if (!user && !user?._id && curUserToBeCreated?.email) {
      let createdUser = null;
      const userWithEmail = await Users.findOne({
        email: curUserToBeCreated?.email,
      });

      let usersWithEmailCompany = await Accounts.findById(
        userWithEmail?.accountId || prevAccFound?._id
      );

      if (!usersWithEmailCompany?._id) {
        const accountInfo = {
          _id: idGeneratorHelper("acc"),
          createdAt: new Date(),
          updatedAt: new Date(),
          isActive: true,
          isVerified: true,
          company: company,
          usersCounter: 1,
          noOfContacts: 1,
          noOfSignUps: 1,
          officialLinkedInCompanyUrl: officialLinkedInCompanyUrl || "",
        };

        usersWithEmailCompany = await Accounts.create(accountInfo);
      }

      if (userWithEmail?._id) {
        createdUser = await Users.findOneAndUpdate(
          { _id: userWithEmail?._id },
          {
            ...curUserToBeCreated,
            ...userWithEmail?._doc,
            accountId: usersWithEmailCompany?._id,
            onBoardingComplete: true,
            status: "completed",
            installedAt: new Date(),
            updatedAt: new Date(),
            installSource,
            utm_medium,
            utm_campaign,
          },
          { new: true }
        );

        if (createdUser?.crmId) {
          // update usr in DRM also.
          try {
            const res = await addOrUpdateContactInCRM({
              ...createdUser?._doc,
            });
            logGracefulMessage({
              status: "Success",
              accountId: ``,
              userId: ``,
              message: `Added/Updated user in CRM successfully`,
              method: `addOrUpdateContactInCRM`,
              extensionVersion,
            });
          } catch (error) {
            logGracefulMessage({
              status: "Error",
              accountId: ``,
              userId: ``,
              message: `Error for addOrUpdateContactInCRM`,
              method: `addOrUpdateContactInCRM`,
            });
          }
        }

        return {
          status: "success",
          message: `user created successfully - invited user`,
          user: {
            ...createdUser._doc,
            officialLinkedInCompanyUrl:
              usersWithEmailCompany?.officialCompanyUrl ||
              usersWithEmailCompany?._doc?.officialLinkedInCompanyUrl,
            onBoardingComplete: false,
            currentUserCompany: usersWithEmailCompany?.company || "",
          },
        };
      }
    }
    // - This flow is for person who is invited
    else if (!user && !user?._id && invitedUser?._id) {
      const prevAcc = await Accounts.findById(invitedUser?.invitee_company_id);
      const prevUser = await Users.findOne({
        _id: invitedUser?.user_to_invite_id,
      });

      let createdUser = null;
      // - invited by email

      if (prevUser?._id) {
        createdUser = await Users.findOneAndUpdate(
          { _id: prevUser?._id },
          {
            ...curUserToBeCreated,
            email: curUserToBeCreated?.email,
            status: "completed",
            installedAt: new Date(),
            updatedAt: new Date(),
            installSource,
            utm_medium,
            utm_campaign,
          },
          { new: true }
        );
      }

      if (createdUser?.crmId) {
        // update usr in DRM also.
        try {
          const res = await addOrUpdateContactInCRM({
            ...createdUser?._doc,
          });
          logGracefulMessage({
            status: "Success",
            accountId: ``,
            userId: ``,
            message: `Added/Updated user in CRM successfully`,
            method: `addOrUpdateContactInCRM`,
            extensionVersion,
          });
        } catch (error) {
          logGracefulMessage({
            status: "Error",
            accountId: ``,
            userId: ``,
            message: `Error for addOrUpdateContactInCRM`,
            method: `addOrUpdateContactInCRM`,
          });
        }
      }

      // - invite by link
      else {
        const userIdToBeCreated = idGeneratorHelper("usr");
        const generatedShareLink = `${
          process.env.FRONT_END_SITE_URL
        }/${makeStringUrlFriendly(
          prevAcc.company
        )}/shared_invite/${prevAcc?._id.replaceAll(
          "acc_",
          ""
        )}/${userIdToBeCreated?.replaceAll("usr_", "")}`;

        const adminUser3 = await Users.findOne({
          accountId: invitedUser.invitee_company_id,
          role: "Admin",
        });

        const companyOwner3 = `${adminUser3?.firstName || "Unknown"} ${
          adminUser3?.lastName || ""
        }`;
        const companyName3 = `${prevAcc?.company || "Unknown"}`;

        const userToBeCreated = {
          _id: userIdToBeCreated,
          ...curUserToBeCreated,
          accountId: invitedUser.invitee_company_id,
          status: "completed",
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          installedAt: new Date(),
          onBoardingComplete: true,
          role: "User",
          officialLinkedInCompanyUrl: prevAcc?.officialLinkedInCompanyUrl,
          shareLink: generatedShareLink,
          installSource,
          inviterName: `${userThatInvited?.firstName} ${userThatInvited?.lastName}`,
          utm_medium,
          utm_campaign,
          companyOwner: companyOwner3,
          companyName: companyName3,
          paymentLink: `${ADMIN_APP_URL}/payment/${invitedUser?.invitee_company_id?.replaceAll(
            "acc_",
            ""
          )}`,
        };

        createdUser = await Users.create(userToBeCreated);

        if (createdUser?.email) {
          try {
            const previousInvitedUserByEmail = await Users.findOne({
              email: createdUser?.email,
            });
            if (previousInvitedUserByEmail && previousInvitedUserByEmail?._id) {
              await Users.findByIdAndUpdate(createdUser?._id, {
                crmId: previousInvitedUserByEmail?.crmId,
                installSource,
                utm_medium,
                utm_campaign,
              });
              if (createdUser?._id !== previousInvitedUserByEmail?._id) {
                await Users.findByIdAndDelete(previousInvitedUserByEmail?._id);
              }
            }
            await addOrUpdateContactInCRM({
              ...userToBeCreated,
              ...createdUser?._doc,
            });

            logGracefulMessage({
              status: "Success",
              accountId: ``,
              userId: ``,
              message: `created/retrieved user from DB`,
              method: `createOrRetrieveUserByProfileUrl`,
              extensionVersion,
            });
          } catch (error) {
            logGracefulMessage({
              status: "Error",
              accountId: ``,
              userId: ``,
              message: `${error?.message}`,
              method: `createOrRetrieveUserByProfileUrl`,
              extensionVersion,
            });
          }
        }
      }

      return {
        status: "success",
        message: `user created successfully - invited user`,
        user: {
          ...createdUser._doc,
          officialLinkedInCompanyUrl: prevAcc?._doc?.officialLinkedInCompanyUrl,
          onBoardingComplete: false,
          currentUserCompany: prevAcc?.company || "",
        },
      };
    }

    let accForUserToBeCreated = prevAccFound;
    const newUserToBeGeneratedId = idGeneratorHelper("usr");

    if (!prevAccFound) {
      const accountInfo = {
        _id: idGeneratorHelper("acc"),
        createdAt: new Date(),
        updatedAt: new Date(),
        isActive: true,
        isVerified: true,
        company: company,
        usersCounter: 1,
        noOfContacts: 1,
        noOfSignUps: 1,
        officialLinkedInCompanyUrl: officialLinkedInCompanyUrl || "",
      };

      const newlyCreatedAccount = await Accounts.create(accountInfo);
      accForUserToBeCreated = newlyCreatedAccount;
      accountIdForUser = newlyCreatedAccount._id;
      currentUserCompany = newlyCreatedAccount.company;
    }

    const generatedShareLink = `${
      process.env.FRONT_END_SITE_URL
    }/${makeStringUrlFriendly(
      accForUserToBeCreated.company
    )}/shared_invite/${accForUserToBeCreated?._id.replaceAll(
      "acc_",
      ""
    )}/${newUserToBeGeneratedId?.replaceAll("usr_", "")}`;

    const previousInvitedUserByEmail = await Users.findOne({
      email: curUserToBeCreated?.email,
    });
    const crmIdForUser = previousInvitedUserByEmail?.crmId;

    if (previousInvitedUserByEmail && previousInvitedUserByEmail?._id) {
      await Users.findByIdAndDelete(previousInvitedUserByEmail?._id);
    }

    const adminUser2 = await Users.findOne({
      accountId: accountIdForUser,
      role: "Admin",
    });

    const companyOwner = `${adminUser2?.firstName || "Unknown"} ${
      adminUser2?.lastName || ""
    }`;
    const companyName = `${accForUserToBeCreated?.company || "Unknown"}`;

    // create new useer
    const userToBeCreated = {
      _id: newUserToBeGeneratedId,
      ...curUserToBeCreated,
      accountId: accountIdForUser,
      status: "completed",
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      installedAt: new Date(),
      onBoardingComplete: true,
      role: userType,
      shareLink: generatedShareLink,
      crmId: crmIdForUser,
      installSource,
      utm_medium,
      utm_campaign,
      inviterName: `${userThatInvited?.firstName || "Unknown"} ${
        userThatInvited?.lastName || ""
      }`,
      companyName,
      companyOwner:
        userType === "Admin"
          ? `${curUserToBeCreated?.firstName} ${curUserToBeCreated?.lastName}`
          : companyOwner,
      paymentLink: `${ADMIN_APP_URL}/payment/${accountIdForUser?.replaceAll(
        "acc_",
        ""
      )}`,
    };

    const createdUser = await Users.create(userToBeCreated);
    const accForZoho = await Accounts.findById(createdUser?.accountId);

    if (createdUser?.email) {
      try {
        await addOrUpdateContactInCRM({
          ...userToBeCreated,
          ...createdUser?._doc,
        });
        logGracefulMessage({
          status: "Success",
          accountId: `${createdUser?.accountId}`,
          userId: `${createdUser?._id}`,
          message: `Added/Updated contact in CRM`,
          method: `addOrUpdateContactInCRM`,
        });
      } catch (error) {
        logGracefulMessage({
          status: "Error",
          accountId: `${createdUser?.accountId}`,
          userId: `${createdUser?._id}`,
          message: `${error?.message}`,
          method: `addOrUpdateContactInCRM`,
          extensionVersion,
        });
      }
    }

    return {
      status: "success",
      message: `user created successfully`,
      user: {
        ...createdUser._doc,
        officialLinkedInCompanyUrl: officialLinkedInCompanyUrl,
        onBoardingComplete: false,
        currentUserCompany,
      },
    };

    // - return the prev user
  } catch (error) {
    logGracefulMessage({
      status: "Error",
      message: `${error?.message}`,
      userId: ``,
      accountId: ``,
      method: `updateUserByprofileUrl`,
      extensionVersion,
    });
    return {
      status: "false",
      message: error.message,
    };
  }
};

const getUserById = async (userId) => {
  try {
    const foundUser = await Users.findById(userId);
    if (!foundUser?._id) {
      throw new Error(`User ${userId} does not exist`);
    }

    return {
      status: "success",
      message: `user retrieved successfully`,
      user: {
        ...foundUser._doc,
      },
    };

    // - return the prev user
  } catch (error) {
    logGracefulMessage({
      status: "Error",
      message: `${error?.message}`,
      userId: ``,
      accountId: ``,
      method: `getUserById`,
      extensionVersion,
    });
    return {
      status: "false",
      message: error.message,
    };
  }
};

// helper to add no of contacts of account
const getNoOfContactsForAccount = async (accountId) => {
  const numOfUsersThatHaveThisAcc = await Users.aggregate([
    { $match: { "companies.companyId": accountId } },
    { $count: "numOfUsers" },
  ]);

  return numOfUsersThatHaveThisAcc[0]
    ? numOfUsersThatHaveThisAcc[0].numOfUsers
    : 1;
};

// Newly updated function with all the supporting functions for better error handling and readability
/**
 * Creates or retrieves a user by their LinkedIn profile URL
 * @param {Object} curUserToBeCreated - User data object containing profile information
 * @returns {Object} Response with created/retrieved user data and status
 */
const createOrRetrieveUserByProfileUrlWithCompanies = async (curUserToBeCreated) => {
  const { 
    userProfileUrl, 
    email, 
    company, 
    companyLogo, 
    ipAddress, 
    scrappedOfficialLinkedInCompanyUrl 
  } = curUserToBeCreated;

  console.log(
    `STARTING TO CREATE OR RETRIEVE USER BY PROFILE URL`,
    JSON.stringify({
      curUserToBeCreated,
      scrappedOfficialLinkedInCompanyUrl,
    })
  );

  try {
    // Validate company input
    if (!company || ["N/A", "Full-time"].includes(company.trim())) {
      throw new Error(`Invalid company name: ${company}`);
    }

    // Generate IDs and gather installation source data
    const { newAccountId, newUserId, installSourceData, companyLogoUrl } = await prepareUserCreationData(curUserToBeCreated);

    // Find existing user and account
    const { existingUser, existingAccount, isCompanyAlreadyCreated, companyUsersCount } = await findExistingEntities(userProfileUrl, email, scrappedOfficialLinkedInCompanyUrl);

    // Update account if needed
    if (isCompanyAlreadyCreated) {
      await updateExistingAccount(existingAccount, companyLogoUrl);
    }

    // Get latest posts for the company
    const transformedPosts = await getLatestCompanyPosts(isCompanyAlreadyCreated, existingAccount, companyLogoUrl);

    // Create a new account if necessary
    if (!isCompanyAlreadyCreated && scrappedOfficialLinkedInCompanyUrl) {
      await createNewAccount(
        newAccountId, 
        company.trim(), 
        scrappedOfficialLinkedInCompanyUrl, 
        companyLogoUrl
      );
    }

    // Determine the account to use (existing or newly created)
    const currentAccount = existingAccount || 
      await Accounts.findOne({ officialLinkedInCompanyUrl: scrappedOfficialLinkedInCompanyUrl }) ||
      await Accounts.findById(newAccountId);

    if (!currentAccount) {
      throw new Error(`Unable to retrieve or create account for ${scrappedOfficialLinkedInCompanyUrl}`);
    }

    // Handle different user scenarios
    if (existingUser) {
      // Handle invited user with pending status
      if (existingUser.status === "pending" && existingUser.invite) {
        return await handlePendingInvitedUser(
          existingUser, 
          curUserToBeCreated, 
          currentAccount, 
          installSourceData,
          transformedPosts
        );
      }

      // Handle regular existing user
      return await handleExistingUser(
        existingUser, 
        curUserToBeCreated, 
        currentAccount, 
        isCompanyAlreadyCreated, 
        companyUsersCount,
        transformedPosts
      );
    }

    // Check if user is invited
    const inviteInfo = await checkUserInvite(email, ipAddress);
    if (inviteInfo.isInvited) {
      return await handleInvitedUser(
        newUserId, 
        curUserToBeCreated, 
        inviteInfo, 
        installSourceData,
        transformedPosts
      );
    }

    // Handle regular new user creation
    return await handleRegularNewUser(
      newUserId, 
      curUserToBeCreated, 
      currentAccount, 
      companyUsersCount, 
      installSourceData,
      transformedPosts
    );

  } catch (error) {
    console.error("Error in createOrRetrieveUserByProfileUrlWithCompanies:", error);
    return {
      status: "error",
      message: `User creation failed: ${error.message}`,
      isCreated: false,
    };
  }
};

// --------------------------------------
// Supporting functions for the main function
// --------------------------------------
/**
 * Updates an existing account with logo and CRM ID if needed
 * @param {Object} account - Account to update
 * @param {string} logoUrl - Logo URL to use if not set
 */
const updateExistingAccount = async (account, logoUrl) => {
  if (!account || (account.companyLogoUrl && account.crmId)) {
    return;
  }
  
  const accCrmId = account.crmId || 
    await getCrmIdForAccount(account.company?.toLowerCase());
  
  await Accounts.findByIdAndUpdate(account._id, {
    companyLogoUrl: account.companyLogoUrl || logoUrl,
    crmId: accCrmId,
  });
};

/**
 * Creates a new account
 * @param {string} accountId - ID for the new account
 * @param {string} companyName - Company name
 * @param {string} linkedInUrl - LinkedIn company URL
 * @param {string} logoUrl - Company logo URL
 */
const createNewAccount = async (accountId, companyName, linkedInUrl, logoUrl) => {
  await Accounts.create({
    _id: accountId,
    createdAt: new Date(),
    updatedAt: new Date(),
    isActive: true,
    isVerified: true,
    company: companyName,
    usersCounter: 1,
    noOfContacts: 1,
    noOfSignUps: 1,
    officialLinkedInCompanyUrl: linkedInUrl,
    companyLogoUrl: logoUrl,
    crmId: null,
  });
};

/**
 * Handles an existing user
 * @param {Object} existingUser - Existing user
 * @param {Object} userData - New user data
 * @param {Object} account - Company account
 * @param {boolean} isCompanyCreated - Whether company exists
 * @param {number} usersCount - Company user count
 * @param {Array} posts - Company posts
 * @returns {Object} Response with updated user
 */
const handleExistingUser = async (existingUser, userData, account, isCompanyCreated, usersCount, posts) => {
  // Reactivate uninstalled user if applicable
  if (existingUser?.uninstalledAt) {
    await Users.findByIdAndUpdate(existingUser._id, {
      uninstalledAt: null,
      uninstallReason: null,
    });
    await addOrUpdateContactInCRM(existingUser, false);
  }
  
  // Update job title and region if not set already
  if (
    (!existingUser?.region || !existingUser?.jobTitle) &&
    userData?.region && 
    userData?.jobTitle
  ) {
    await Users.findByIdAndUpdate(existingUser._id, {
      region: userData.region,
      jobTitle: userData.jobTitle,
    });
    await addOrUpdateContactInCRM(existingUser, false);
  }
  
  const isAdmin = existingUser.role === "Admin" || usersCount < 1;
  
  console.log(
    `ADMIN CHECK - EXISTING USER`,
    JSON.stringify({ ...userData, isAdmin })
  );
  
  // Prepare updated companies array
  const newCompanies = [...(existingUser?.companies || [])].map((cmp) => ({
    ...cmp,
    isPrimary: cmp.companyId === account._id,
  }));
  
  // Add company if not already in user's companies
  const hasCompany = newCompanies?.some(comp => comp.companyId === account._id);
  if (!hasCompany) {
    newCompanies.push({
      companyId: account._id,
      isPrimary: true,
      isAuthorOfCompany: false,
      officialLinkedInCompanyUrl: account.officialLinkedInCompanyUrl,
    });
  }
  
  // Get CRM ID if not present
  const crmId = !existingUser.crm && existingUser.email
    ? await getCrmIdFromUserEmail(existingUser.email)
    : null;
  
  // Update user
  const updatedUser = await Users.findByIdAndUpdate(
    existingUser?._id,
    {
      ...userData,
      companies: newCompanies,
      onBoardingComplete: true,
      status: "completed",
      role: isAdmin ? "Admin" : "User",
      crmId: existingUser.crmId || crmId,
    },
    { new: true }
  );
  
  // Get current primary company
  const curPrimCompanyId = updatedUser.companies.find(cmp => cmp.isPrimary)?.companyId || 
    updatedUser.accountId;
  const curCompany = await Accounts.findById(curPrimCompanyId);
  
  await addOrUpdateContactInCRM(updatedUser, false);
  
  return {
    status: "success",
    message: "User retrieved successfully",
    isCreated: false,
    user: {
      ...updatedUser._doc,
      officialLinkedInCompanyUrl: curCompany?.officialCompanyUrl || curCompany?.officialLinkedInCompanyUrl,
      currentUserCompany: curCompany?.company || "",
    },
    postsToShowFromPopupFromDb: posts,
  };
};

/**
 * Prepares initial data needed for user creation
 * @param {Object} userData - User data
 * @returns {Object} Prepared data including IDs and source information
 */
const prepareUserCreationData = async ({ companyLogo, ipAddress }) => {
  const newAccountId = idGeneratorHelper("acc");
  const newUserId = idGeneratorHelper("usr");
  
  // Get installation source data
  const mainReferer = (await ExtensionInstallSource.findOne({ ipAddress })) || {};
  const installSourceData = {
    installSource: mainReferer.referrer || "Not Found",
    utm_medium: mainReferer.utm_medium || "Not Found",
    utm_campaign: mainReferer.utm_campaign || "Not Found"
  };
  
  // Determine company logo URL
  const defaultCompanyLogoUrl = "https://ext-icons.s3.amazonaws.com/logo.svg";
  const companyLogoUrl = companyLogo || defaultCompanyLogoUrl;
  
  return {
    newAccountId,
    newUserId,
    installSourceData,
    companyLogoUrl
  };
};

/**
 * Finds existing user and account entities
 * @param {string} userProfileUrl - LinkedIn profile URL
 * @param {string} email - User email
 * @param {string} companyUrl - LinkedIn company URL
 * @returns {Object} Found entities and related information
 */
const findExistingEntities = async (userProfileUrl, email, companyUrl) => {
  // Find existing user by profile URL or email
  const existingUser = await Users.findOne({ 
    $or: [{ userProfileUrl }, { email }] 
  }).lean();
  
  // Find existing account by company URL or by companies associated with the profile URL
  const userCompanyIds = (await Users.find({ userProfileUrl })
    .select("companies"))
    ?.map(user => user.companies?.map(c => c.companyId))
    .flat()
    .filter(Boolean) || [];
  
  const existingAccount = await Accounts.findOne({
    $or: [
      { officialLinkedInCompanyUrl: companyUrl },
      { _id: { $in: userCompanyIds } }
    ]
  }).lean();
  
  const isCompanyAlreadyCreated = !!existingAccount?._id;
  
  // Count users for the company
  const companyUsersAgg = await Users.aggregate([
    {
      $match: {
        companies: {
          $elemMatch: {
            companyId: existingAccount?._id || "NOT_FOUND",
          },
        },
      },
    },
    {
      $facet: {
        count: [{ $count: "usersCount" }],
      },
    },
    {
      $project: {
        usersCount: {
          $ifNull: [{ $arrayElemAt: ["$count.usersCount", 0] }, 0],
        },
      },
    },
  ]);
  
  const companyUsersCount = companyUsersAgg[0]?.usersCount || 0;
  
  return {
    existingUser,
    existingAccount,
    isCompanyAlreadyCreated,
    companyUsersCount
  };
};

/**
 * Handles an invited user
 * @param {string} userId - New user ID
 * @param {Object} userData - User data
 * @param {Object} inviteInfo - Invite information
 * @param {Object} sourceData - Installation source data
 * @param {Array} posts - Company posts
 * @returns {Object} Response with created user
 */
const handleInvitedUser = async (userId, userData, inviteInfo, sourceData, posts) => {
  const { inviteRecord, userThatInvited, inviterCompany } = inviteInfo;
  const { installSource, utm_medium, utm_campaign } = sourceData;
  
  console.log(
    `PROCESSING INVITED USER`,
    JSON.stringify({ ...userData, inviteInfo: inviteRecord })
  );
  
  const newUserData = {
    _id: userId,
    ...userData,
    status: "completed",
    companies: [
      {
        companyId: inviterCompany._id,
        isAuthorOfCompany: false,
        officialLinkedInCompanyUrl: inviterCompany.officialLinkedInCompanyUrl,
        isPrimary: true,
      },
    ],
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    installedAt: new Date(),
    onBoardingComplete: true,
    role: "User",
    shareLink: `${process.env.FRONT_END_SITE_URL}/${makeStringUrlFriendly(
      inviterCompany.company
    )}/shared_invite/${inviterCompany?._id?.replaceAll(
      "acc_",
      ""
    )}/${userId.replaceAll("usr_", "")}`,
    installSource,
    utm_medium,
    utm_campaign,
    inviterName: `${userThatInvited?.firstName || ""} ${userThatInvited?.lastName || ""}`,
    companyName: inviterCompany.company,
    companyOwner: `${userThatInvited?.firstName || ""} ${userThatInvited?.lastName || ""}`,
    paymentLink: `${ADMIN_APP_URL}/payment/${inviterCompany._id.replaceAll("acc_", "")}`,
  };
  
  const createdUser = await Users.create(newUserData);
  await addOrUpdateContactInCRM(newUserData, true);
  
  // Update invite record
  await Invites.findByIdAndUpdate(inviteRecord?._id, {
    installed: true,
  });
  
  // Update subscription if needed
  try {
    if (inviterCompany._id && userThatInvited._id) {
      await updateStripeSubscription(inviterCompany._id, userThatInvited._id);
    }
  } catch (error) {
    console.log("Error updating subscription for invited user:", error);
  }
  
  console.log(`USER CREATED FROM INVITE: ${newUserData?.email}`);
  
  return {
    status: "success",
    message: "User created successfully from invite",
    isCreated: true,
    user: {
      ...createdUser._doc,
      officialLinkedInCompanyUrl: inviterCompany.officialCompanyUrl || 
        inviterCompany.officialLinkedInCompanyUrl,
      onBoardingComplete: false,
      currentUserCompany: inviterCompany.company || "",
    },
    postsToShowFromPopupFromDb: posts,
  };
};

/**
 * Handles a regular new user creation
 * @param {string} userId - New user ID
 * @param {Object} userData - User data
 * @param {Object} account - Company account
 * @param {number} usersCount - Company user count
 * @param {Object} sourceData - Installation source data
 * @param {Array} posts - Company posts
 * @returns {Object} Response with created user
 */
const handleRegularNewUser = async (userId, userData, account, usersCount, sourceData, posts) => {
  const { installSource, utm_medium, utm_campaign } = sourceData;
  
  // Find company owner
  const companyOwner = await Users.findOne({
    companies: {
      $elemMatch: { companyId: account._id, isAuthorOfCompany: true },
    },
  });
  
  const newUserData = {
    _id: userId,
    ...userData,
    status: "completed",
    companies: [
      {
        companyId: account._id,
        isAuthorOfCompany: false,
        officialLinkedInCompanyUrl: account.officialLinkedInCompanyUrl,
        isPrimary: true,
      },
    ],
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    installedAt: new Date(),
    onBoardingComplete: true,
    role: usersCount > 0 ? "User" : "Admin",
    shareLink: `${process.env.FRONT_END_SITE_URL}/${makeStringUrlFriendly(
      account.company
    )}/shared_invite/${account._id.replaceAll(
      "acc_",
      ""
    )}/${userId.replaceAll("usr_", "")}`,
    installSource,
    utm_medium,
    utm_campaign,
    inviterName: `${companyOwner?.firstName || ""} ${companyOwner?.lastName || ""}`,
    companyName: account.company,
    companyOwner: `${companyOwner?.firstName || ""} ${companyOwner?.lastName || ""}`,
    paymentLink: `${ADMIN_APP_URL}/payment/${account._id.replaceAll("acc_", "")}`,
  };
  
  const createdUser = await Users.create(newUserData);
  await addOrUpdateContactInCRM(newUserData, true);
  
  // Update subscription if needed
  if (usersCount > 0 && account._id && companyOwner?._id) {
    try {
      await updateStripeSubscription(account._id, companyOwner._id);
    } catch (error) {
      console.log("Error updating subscription for new user:", error);
    }
  }
  
  console.log(`REGULAR USER CREATED: ${newUserData?.email}`);
  
  return {
    status: "success",
    message: "User created successfully",
    isCreated: true,
    user: {
      ...createdUser._doc,
      officialLinkedInCompanyUrl: account.officialCompanyUrl || account.officialLinkedInCompanyUrl,
      onBoardingComplete: false,
      currentUserCompany: account.company || "",
    },
    postsToShowFromPopupFromDb: posts,
  };
};

/**
 * Checks if a user is invited
 * @param {string} email - User email
 * @param {string} ipAddress - IP address
 * @returns {Object} Invite information
 */
const checkUserInvite = async (email, ipAddress) => {
  const inviteRecord = await Invites.findOne({
    $or: [{ email }, { ipAddress }],
  });
  
  if (!inviteRecord || !ipAddress) {
    return { isInvited: false };
  }
  
  const userThatInvited = await Users.findById(inviteRecord?.invitee_id || `--NULL--`);
  if (!userThatInvited) {
    return { isInvited: false };
  }
  
  const userThatInvitedPrimCmpId = userThatInvited?.companies?.find(cmp => cmp.isPrimary)?.companyId || 
    userThatInvited?.accountId;
  
  const inviterCompany = await Accounts.findById(userThatInvitedPrimCmpId).lean();
  if (!inviterCompany) {
    return { isInvited: false };
  }
  
  return {
    isInvited: true,
    inviteRecord,
    userThatInvited,
    inviterCompany
  };
};

/**
 * Gets latest posts for a company
 * @param {boolean} isCompanyCreated - Whether company already exists
 * @param {Object} account - Company account
 * @param {string} logoUrl - Logo URL to use
 * @returns {Array} Transformed posts
 */
const getLatestCompanyPosts = async (isCompanyCreated, account, logoUrl) => {
  if (!isCompanyCreated || !account?._id) {
    return [];
  }
  
  const latestPosts = await Posts.find({ accountId: account._id })
    .sort({ linkedInCreatedAt: -1 })
    .limit(3);
  
  return latestPosts.map(post => ({
    ...post._doc,
    companyName: account.company,
    companyLogo: account.companyLogoUrl || logoUrl,
  }));
};

// --------------------------------------
// All the functions below are old and need to be refactored
// --------------------------------------


const updatePaymentLinkForAllAdminsInCrmAndDb = async () => {
  try {
    const allAdmins = await Users.find({
      role: "Admin",
      onBoardingComplete: true,
    });

    allAdmins.forEach(async (adminUser) => {
      // -
      const curAccId =
        adminUser?.companies?.filter((cmp) => cmp?.isPrimary)[0]?.companyId ||
        adminUser?.accountId;

      const paymentLink = `${ADMIN_APP_URL}/payment/${curAccId.replaceAll(
        "acc_",
        ""
      )}`;
      const updatedUser = await Users.findByIdAndUpdate(
        adminUser?._id,
        {
          paymentLink,
        },
        { new: true }
      );

      await addOrUpdateContactInCRM(
        {
          ...updatedUser?._doc,
        },
        false
      );
    });

    return {
      success: true,
      message: `All payment links updated successfully`,
      data: {},
    };
  } catch (error) {
    return {
      success: false,
      message: `All payment links was't updated successfully`,
      data: {},
    };
  }
};

const updateUsersSchemaAccordingToNewCompaniesArray = async () => {
  try {
    const allUsers = await Users.find({
      $or: [
        { companies: { $exists: false } },
        { companies: null },
        { companies: { $size: 0 } },
      ],
      accountId: { $exists: true },
    });

    for (const curUser of allUsers) {
      const curAccObj = await Accounts.findById(curUser?.accountId);
      await Users.findByIdAndUpdate(curUser?._id, {
        companies: [
          {
            companyId: curUser?.accountId,
            isAuthorOfCompany: curUser?.isAuthorOfPage || false,
            officialLinkedInCompanyUrl: curAccObj?.officialLinkedInCompanyUrl,
            isPrimary: true,
          },
        ],
      });
    }

    return {
      success: true,
      message: `Updated users companies according to new schema`,
      data: {},
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to Update users companies according to new schema`,
      data: {},
    };
  }
};

// --------------------------------------
// --------------------------------------
// --------------------------------------
const updateLastFrontendLikeForUser = async (userId, lastFrontLike) => {
  try {
    const updatedUser = await Users.findByIdAndUpdate(userId, {
      lastFrontLike,
    });
    logGracefulMessage({
      status: "Success",
      accountId: ``,
      userId: `${userId}`,
      message: `user last frontlike updated successfully`,
      method: `updateLastFrontendLikeForUser`,
    });

    return {
      status: "success",
      message: `user lastFrontLike updated successfully`,
      user: updatedUser,
    };
  } catch (error) {
    logGracefulMessage({
      status: "Error",
      accountId: ``,
      userId: `${userId}`,
      message: `${error?.message}`,
      method: `updateLastFrontendLikeForUser`,
    });
  }
};

const userUninstalled = async (userId) => {
  //
  try {
    const user = await Users.findById(userId);
    if (!user) {
      return {
        status: "true",
        message: `"No user with id  ${userId}`,
      };
    }

    await Accounts.findOneAndUpdate(
      { _id: user.accountId },
      { $inc: { usersCounter: -1 } }, // Decrease the counter by 1
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    const updatedUser = await Users.findByIdAndUpdate(
      user._id,
      {
        uninstalledAt: new Date().getTime(),
        updatedAt: new Date().getTime(),
      },
      { new: true }
    );

    await updateUsersLastSeenStatusInCrm(updatedUser, true);
    await addOrUpdateContactInCRM(updatedUser, false);

    mixpanelTrack(
      "Extension Uninstalled",
      {
        id: updatedUser?._id,
        accountId:
          updatedUser?.companies?.filter((comp) => comp?.isPrimary)[0]
            ?.companyId || updatedUser?.accountId,
        companyName: updatedUser?.companyName,
        email: updatedUser?.email,
        city_country: updatedUser?.city,
        designation: updatedUser?.designation,
        firstName: updatedUser?.firstName,
        LastName: updatedUser?.lastName,
        role: updatedUser?.role,
        status: updatedUser?.status,
        linkedinProfileUrl: updatedUser?.linkedinProfileUrl,
      },
      updatedUser?.mixpanelDistinctId || updatedUser?._id
    );

    logGracefulMessage({
      status: "Success",
      accountId: ``,
      userId: `${userId}`,
      message: `User uninstalled successfully`,
      method: `userUninstalled`,
    });

    return {
      status: "success",
      message: `user uninstalled  successfully`,
      user: updatedUser,
    };
  } catch (error) {
    logGracefulMessage({
      status: "Error",
      accountId: ``,
      userId: `${userId}`,
      message: `${error?.message}`,
      method: `userUninstalled`,
    });

    return {
      status: "true",
      message: error.message,
    };
  }
};
const checkIfEmailExists = async (email) => {
  //
  try {
    const user = await Users.findOne({ email });

    if (!user && !user?.email) {
      logGracefulMessage({
        status: "Success",
        accountId: ``,
        userId: `${email}`,
        message: `Email doesn't exist `,
        method: `checkIfEmailExists`,
      });

      return {
        status: "success",
        message: `Email doesn't already `,
        emailAlreadyExists: false,
      };
    }

    logGracefulMessage({
      status: "Success",
      accountId: ``,
      userId: `${email}`,
      message: `Email exist already`,
      method: `checkIfEmailExists`,
    });

    return {
      status: "success",
      message: `Email exists already `,
      emailAlreadyExists: true,
    };
  } catch (error) {
    logGracefulMessage({
      status: "Error",
      accountId: ``,
      userId: `${email}`,
      message: `${error?.message}`,
      method: `userUninstalled`,
    });

    return {
      status: "true",
      message: error.message,
      emailAlreadyExists: true,
    };
  }
};

const generateShareLink = async (userId, accountId) => {
  //
  try {
    const curAccount = await Accounts.findById(accountId);
    const curUser = await Users.findById(userId);

    if (!curAccount || !curUser) {
      throw new Error("Provid correct form data");
    }

    const encryptedUserId = userId.replaceAll("usr_", "");

    const encryptedCompanyId = accountId.replaceAll("acc_", "");

    const generatedLink = `${
      process.env.FRONT_END_SITE_URL
    }/${makeStringUrlFriendly(
      curAccount.company
    )}/shared_invite/${encryptedCompanyId}/${encryptedUserId}`;

    logGracefulMessage({
      status: "Success",
      accountId: `${accountId}`,
      userId: `${userId}`,
      message: `${error?.message}`,
      method: `share link generated successfully`,
    });

    return {
      status: "success",
      message: `share link generated successfully!`,
      shareLink: generatedLink,
    };
  } catch (error) {
    logGracefulMessage({
      status: "Error",
      accountId: `${accountId}`,
      userId: `${userId}`,
      message: `${error?.message}`,
      method: `generateShareLink`,
    });
  }
};

const generateShareLinkById = async (userId) => {
  try {
    const curUser = await Users.findById(userId).lean();
    if (!curUser) {
      throw new Error("Provide correct form data: userId");
    }

    const primAccId =
      curUser?.companies?.find((item) => item?.isPrimary)?.companyId ||
      curUser?.accountId;
    if (!primAccId) {
      throw new Error("Provide correct form data: userId or primary accountId");
    }

    const curAccount = await Accounts.findById(primAccId).lean();
    if (!curAccount) {
      throw new Error("Provide correct form data: accountId");
    }

    const encryptedUserId = userId.replace("usr_", "");
    const encryptedCompanyId = curAccount._id.replace("acc_", "");
    const generatedLink = `${
      process.env.FRONT_END_SITE_URL
    }/${makeStringUrlFriendly(
      curAccount?.company?.trim()?.replaceAll(" ", "_")
    )}/shared_invite/${encryptedCompanyId}/${encryptedUserId}`;

    // Uncomment this line if you need to send the link to Zoho
    // await sendGeneratedShareLinkToZoho(curUser, generatedLink);

    const updatedUser = await Users.findByIdAndUpdate(
      userId,
      { shareLink: generatedLink },
      { new: true, lean: true }
    );

    await addOrUpdateContactInCRM(updatedUser, false);

    logGracefulMessage({
      status: "Success",
      accountId: primAccId,
      userId: userId,
      message: "Share link generated successfully",
      method: "generateShareLinkById",
    });

    return {
      status: "success",
      message: "Share link generated successfully!",
      shareLink: generatedLink,
    };
  } catch (error) {
    logGracefulMessage({
      status: "Error",
      accountId: "",
      userId: userId,
      message: error.message,
      method: "generateShareLinkById",
    });

    return {
      status: "error",
      message: error.message,
    };
  }
};

const generateLinkForInvitedUser = async (
  userId,
  invitedUserId,
  isFromMobile
) => {
  //
  try {
    const OldUser = await Users.findById(userId);
    if (!userId) {
      throw new Error("Provid correct form data : userId");
    }
    const accountId = OldUser?.companies?.find((c) => c?.isPrimary)?.companyId;
    const curAccount = await Accounts.findById(accountId || OldUser?.accountId);

    if (!curAccount) {
      throw new Error("Provid correct form data : accountId");
    }

    const encryptedUserId = userId.replaceAll("usr_", "");

    const encryptedCompanyId = curAccount._id.replaceAll("acc_", "");

    const encryptedInvitedUserId = invitedUserId.replaceAll("usr_", "");

    const generatedLink = `${
      process.env.FRONT_END_SITE_URL
    }/${makeStringUrlFriendly(
      curAccount.company
    )}/shared_invite/${encryptedCompanyId}/${encryptedInvitedUserId}?email=true${
      isFromMobile ? "&mobile=true" : ""
    }`;

    logGracefulMessage({
      status: "Success",
      accountId: ``,
      userId: `${userId}`,
      message: `link for invited user generated successfully!`,
      method: `generateShareLinkForInvitedUser`,
    });

    return {
      status: "success",
      message: `link for invited user generated successfully!`,
      linkForInvitedUser: generatedLink,
    };
  } catch (error) {
    logGracefulMessage({
      status: "Error",
      accountId: ``,
      userId: `${userId}`,
      message: `${error?.message}`,
      method: `generateShareLinkForInvitedUser`,
    });
  }
};

const sendGeneratedShareLinkToZoho = async (curUser, generatedLink) => {
  const contactData = {
    Invite_link: generatedLink,
    Mongo_ID: curUser._id,
  };
  try {
    await updateZohoContactAndAccount(null, contactData);
    logGracefulMessage({
      status: "Success",
      message: `sent generate share link to zoho`,
      userId: `${curUser?._id}`,
      accountId: `${curUser?.accountId}`,
      method: `sendGeneratedShareLinkToZoho`,
    });
  } catch (error) {
    logGracefulMessage({
      status: "Error",
      message: `${error?.message}`,
      userId: `${curUser?._id}`,
      accountId: `${curUser?.accountId}`,
      method: `sendGeneratedShareLinkToZoho`,
    });
  }
};

const addLinkInvitedUser = async (
  encryptedUserId,
  encryptedAccountId,
  ipAddress,
  email
) => {
  //
  try {
    const decryptedUserId = `usr_${encryptedUserId}`;
    const curUser = await Users.findById(decryptedUserId);

    const curAccount = await Accounts.findById(
      curUser?.companies?.find((c) => c.isPrimary)?.companyId ||
        curUser?.accountId
    );

    const extInstallSrcObj = await ExtensionInstallSource.findOne({
      ipAddress,
    });

    const extInstallSrc = extInstallSrcObj?.referrer || "";

    // console.log(decryptedAcccountId, decryptedUserId);

    if (!curAccount || !curUser) {
      throw new Error("Provide correct form data");
    }

    const oldInvite = await Invites.findOne({ ipAddress });

    if (oldInvite?._id && !oldInvite?.installed) {
      throw new Error(
        "User has already been invited but haven't completed process yet"
      );
    }

    if (oldInvite?._id && oldInvite?.installed) {
      throw new Error(
        "User has already been invited and completed the process"
      );
    }

    let inviteToCreate = null;
    // If invited by email
    if (email) {
      inviteToCreate = {
        _id: idGeneratorHelper("invite"),
        createdAt: new Date().getTime(),
        updatedAt: new Date().getTime(),
        invitee_id: curUser?._id,
        invitee_company_id:
          curUser?.companies?.find((c) => c.isPrimary)?.companyId ||
          curUser?.accountId,
        ipAddress,
        email,
        user_to_invite_id: decryptedUserId,
        referrer: extInstallSrc,
      };
    }
    // If invited by link
    else {
      inviteToCreate = {
        _id: idGeneratorHelper("invite"),
        createdAt: new Date().getTime(),
        updatedAt: new Date().getTime(),
        invitee_id: curUser?._id,
        invitee_company_id:
          curUser?.companies?.find((c) => c.isPrimary)?.companyId ||
          curUser?.accountId,
        ipAddress,
        email,
        referrer: extInstallSrc,
      };
    }

    const createdInvite = await Invites.create(inviteToCreate);

    logGracefulMessage({
      status: "Success",
      accountId: `acc_${encryptedAccountId}`,
      userId: `usr_${encryptedUserId}`,
      message: `Invite Created Successfully`,
      method: `addLinkInvitedUser`,
    });

    return {
      status: "success",
      message: `invite created successfully!`,
      createdInvite,
    };
  } catch (error) {
    logGracefulMessage({
      status: "Error",
      accountId: `acc_${encryptedAccountId}`,
      userId: `usr_${encryptedUserId}`,
      message: `${error?.message}`,
      method: `addLinkInvitedUser`,
    });
  }
};

const getUsersImagesBySimilarAccountId = async (encryptedAccountId) => {
  try {
    const decryptedAcccountId = `acc_${encryptedAccountId}`;

    const account = await Accounts.findById(decryptedAcccountId);

    if (!account || !account?._id) {
      return {
        status: "false",
        message: `Account not found`,
        usersImages: [],
      };
    }

    const usersWithAccountId = await Users.find({ accountId: account._id });

    if (!usersWithAccountId || usersWithAccountId.length < 1) {
      return {
        status: "false",
        message: `No users with account found`,
        usersImages: [],
      };
    }

    const usersImages = usersWithAccountId
      .map((user) => user.profileImageLink)
      .filter((userImg) => userImg?.length > 0);

    logGracefulMessage({
      status: "Success",
      message: `Users images fetched successfully`,
      userId: ``,
      accountId: `acc_${encryptedAccountId}`,
      method: `getUsersImagesBySimilarAccountId`,
    });

    return {
      status: "success",
      message: `Users images fetched successfully`,
      usersImages,
    };
  } catch (error) {
    logGracefulMessage({
      status: "Error",
      message: `${error?.message}`,
      userId: ``,
      accountId: `acc_${encryptedAccountId}`,
      method: `getUsersImagesBySimilarAccountId`,
    });
  }
};

const validateEmailCode = async (userId, verificationCode) => {
  const user = await Users.findById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  const currentTime = new Date();
  if (
    user.verificationCode === verificationCode &&
    user.verificationCodeExpires > currentTime
  ) {
    user.emailVerified = true;
    user.verificationCode = null;
    user.verificationCodeExpires = null;
    await user.save();

    return { valid: true, message: "Email verified successfully" };
  } else {
    // Verification code is incorrect or expired
    return { valid: false, message: "Invalid or expired verification code" };
  }
};

const generateVerificationCodeForUser = async (userId, email) => {
  const user = await Users.findById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  const verificationCode = generateVerificationCode();
  const expirationTime = new Date(new Date().getTime() + 5 * 60000); // 5 MINUTES

  // save to the user
  user.verificationCode = verificationCode;
  user.verificationCodeExpires = expirationTime;
  await user.save();

  await sendVerificationEmail(verificationCode, email);

  return verificationCode;
};

const restrictToDeleteOnlyTestingCompaniesAndUsers = (companyName = "") => {
  const COMPANIES_THAT_I_CAN_DELETE_FROM =
    CONSTANTS.TEST_SYSTEM.TESTING_COMPANIES;

  const isAbleToDelete = COMPANIES_THAT_I_CAN_DELETE_FROM.includes(companyName);

  if (!isAbleToDelete) {
    throw new Error(`You can only delete Test companies`);
  }
};

const clearUsersData = async ({ userId }) => {
  try {
    const user = await Users.findById(userId);
    const currentUserCompany = await Accounts.findById(user?.accountId);
    restrictToDeleteOnlyTestingCompaniesAndUsers(currentUserCompany?.company);
    if (!user) {
      throw new Error("User already deleted or deos not exist");
    }

    const deletedlikes = await Likes.deleteMany({ userId });
    const deletedInvites = await Invites.deleteMany({ invitee_id: userId });
    const deletedZohoRes = await deleteZohoUser(user?.crmId);
    const deletedUser = await Users.deleteOne({ _id: userId });

    logGracefulMessage({
      status: "Success",
      message: `Succesfully cleared users data`,
      userId: `${userId}`,
      accountId: ``,
      method: `clearUsersData`,
    });

    return {
      status: "success",
      message: `user data cleared successfully`,
      deletedData: {
        deletedInvites,
        deletedlikes,
        deletedZohoRes,
        deletedUser,
      },
    };
  } catch (error) {
    logGracefulMessage({
      status: "Error",
      message: `${error?.message}`,
      userId: `${userId}`,
      accountId: ``,
      method: `clearUsersData`,
    });
    return {
      status: "false",
      message: error.message,
    };
  }
};

const clearUserDataWithAccounts = async ({
  userEmail,
  deleteAccount = false,
}) => {
  //
  try {
    const user = await Users.findOne({ email: userEmail });
    const currentUserCompany = await Accounts.findById(user?.accountId);
    restrictToDeleteOnlyTestingCompaniesAndUsers(currentUserCompany?.company);

    if (!user) {
      throw new Error(`User already deleted or deos not exist ${userEmail}`);
    }

    let deletedlikes = await Likes.deleteMany({ userId: user?._id });
    const deletedInvites = await Invites.deleteMany({ invitee_id: user?._id });
    const deletedZohoRes = await deleteZohoUser(user?.crmId);
    const deletedUser = await Users.deleteOne({ _id: user?._id });
    let deletedAccount = {};
    let deletedZohoAccount = {};
    let deletedPosts = {};
    let otherDeletedLinkes = {};
    let otherDeletedUsers = { count: 0 };
    let otherDeletedDbUsers = {};

    if (deleteAccount && user?.role === "Admin") {
      deletedAccount = await Accounts.findByIdAndDelete(user?.accountId);
      const prevPosts = await Posts.find({ accountId: user?.accountId });
      const prevUsersToDelInCrm = await Users.find({
        accountId: user?.accountId,
      });
      otherDeletedDbUsers = await Users.deleteMany({
        accountId: user?.accountId,
      });
      deletedPosts = await Posts.deleteMany({ accountId: user?.accountId });
      otherDeletedLinkes = await Likes.deleteMany({
        postId: { $in: prevPosts.map((post) => post._id) },
      });
      deletedZohoAccount = await deleteZohoAccount(deletedAccount?.crmId);

      prevUsersToDelInCrm?.forEach(async (usr) => {
        if (usr?.crmId) {
          await deleteZohoUser(usr?.crmId);
          otherDeletedUsers.count++;
        }
      });
    }

    logGracefulMessage({
      status: "Success",
      message: `users data cleared successfully`,
      userId: ``,
      accountId: ``,
      method: `clearUserDataWithAccounts`,
    });

    return {
      status: "success",
      message: `user data cleared successfully ${
        deleteAccount && user?.role === "Admin"
          ? "With accounts!"
          : "Without accounts"
      }`,
      deletedData: {
        deletedInvites,
        deletedlikes,
        deletedZohoRes,
        deletedUser,
        deletedAccount,
        deletedZohoAccount,
        deletedPosts,
        otherDeletedLinkes,
        otherDeletedUsers,
      },
    };
  } catch (error) {
    logGracefulMessage({
      status: "Error",
      message: `${error?.message}`,
      userId: ``,
      accountId: ``,
      method: `clearUserDataWithAccounts`,
    });
    return {
      status: "false",
      message: error.message,
    };
  }
};

const clearUsersDataByEmail = async ({ userEmail }) => {
  try {
    const user = await Users.findOne({ email: userEmail });

    const currentUserCompany = await Accounts.findById(user?.accountId);
    restrictToDeleteOnlyTestingCompaniesAndUsers(currentUserCompany?.company);

    if (!user) {
      throw new Error(`User already deleted or deos not exist ${userEmail}`);
    }

    const deletedlikes = await Likes.deleteMany({ userId: user?._id });
    const deletedInvites = await Invites.deleteMany({ invitee_id: user?._id });
    const deletedZohoRes = await deleteZohoUser(user?.crmId);
    const deletedUser = await Users.deleteOne({ _id: user?._id });

    logGracefulMessage({
      status: "Error",
      message: `users data cleared successfully`,
      userId: ``,
      accountId: ``,
      method: `clearUsersDataByEmail`,
    });

    return {
      status: "success",
      message: `user data cleared successfully`,
      deletedData: {
        deletedInvites,
        deletedlikes,
        deletedZohoRes,
        deletedUser,
      },
    };
  } catch (error) {
    logGracefulMessage({
      status: "Error",
      message: `${error?.message}`,
      userId: ``,
      accountId: ``,
      method: `clearUsersDataByEmail`,
    });
    return {
      status: "false",
      message: error.message,
    };
  }
};

const validateAndSendOtp = async ({ userEmail }) => {
  try {
    const user = await Users.findOne({ email: userEmail }).lean();

    if (!user) {
      throw new Error(`User does not exist with ${userEmail}`);
    }

    // Commenting this check to allow users with other roles to login.
    /* if (user.role !== "Admin") {
      // -
      throw new Error(
        `User does not have permisson to access panel ${userEmail}`
      );
    } */

    const generatedOTP = generateVerificationCode();

    const otpToEnter = {
      _id: idGeneratorHelper("otp"),
      otp: generatedOTP,
      userId: user._id,
    };

    const deletePrevOtps = await Otps.deleteMany({ userId: user._id });
    const createdOtp = await Otps.create(otpToEnter);

    const template = otpLoginAdminTemplate(generatedOTP);

    const resAfterSendingMail = await sendActiveCampaignMail(
      user.email,
      "Your password to Heyou",
      template
    );

    if (!resAfterSendingMail?.emailSent) {
      throw new Error(resAfterSendingMail?.message);
    }

    logGracefulMessage({
      status: "Succeess",
      message: `OTP generated and sent successfully`,
      userId: ``,
      accountId: ``,
      method: `validateAndSendOtp`,
    });

    return {
      status: "success",
      message: `user otp generated & sent successfully`,
      data: user,
    };
  } catch (error) {
    logGracefulMessage({
      status: "Error",
      message: `${error?.message}`,
      userId: ``,
      accountId: ``,
      method: `validateAndSendOtp`,
    });
    return {
      status: "false",
      message: error.message,
    };
  }
};

const validateOtp = async ({ email, otp }) => {
  try {
    const user = await Users.findOne({ email: email });
    const foundOtp = await Otps.findOne({ otp: otp, userId: user._id });

    if (!user) {
      throw new Error(`User does not exist with ${email}`);
    }

    if (!foundOtp) {
      throw new Error(`OTP not valid for ${email}`);
    }

    const delOtp = await Otps.findByIdAndDelete(foundOtp._id);

    const token = jwt.sign(
      { userId: user._id, email: user.email, userRole: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1y" }
    );

    logGracefulMessage({
      status: "Success",
      message: `OTP valiated and sent correctly`,
      userId: ``,
      accountId: ``,
      method: `validateOtp`,
    });

    return {
      status: "success",
      message: `OTP validated`,
      cookieToSet: {
        name: "heyou_adminpanel_auth",
        value: token,
        options: { maxAge: 365 * 24 * 60 * 60 * 1000, httpOnly: true },
      },
      user,
    };
  } catch (error) {
    logGracefulMessage({
      status: "Error",
      message: `${error?.message}`,
      userId: ``,
      accountId: ``,
      method: `validateOtp`,
    });
    return {
      status: "false",
      message: `OTP not valid for ${email}`,
    };
  }
};

const verifyToken = async ({ token }) => {
  try {
    const decodedUser = jwt.verify(
      token,
      process.env.JWT_SECRET,
      (err, decoded) => {
        if (err) {
          throw new Error("Invalid token signature");
        }
        return decoded;
      }
    );

    // console.log("User decoded", decodedUser);

    const user = await Users.findById(decodedUser.userId);

    if (!user?._id) {
      throw new Error(`Invalid token`);
    }

    logGracefulMessage({
      status: "Success",
      message: `Token verified`,
      userId: `${decodedUser?.userId}`,
      accountId: `${decodedUser?.accountId}`,
      method: `verifyToken`,
    });

    return {
      status: "success",
      message: `Token verified successfully`,
      cookieToSet: {
        name: "heyou_adminpanel_auth",
        value: token,
        options: { maxAge: 365 * 24 * 60 * 60 * 1000, httpOnly: true },
      },
      user,
    };
  } catch (error) {
    logGracefulMessage({
      status: "Error",
      message: `${error?.message}`,
      userId: ``,
      accountId: ``,
      method: `verifyToken`,
    });
    return {
      status: "failed",
      message: error.message,
    };
  }
};

const getAllRelatedUsersFromToken = async ({ token }) => {
  try {
    const decodedToken = jwt.verify(
      token,
      process.env.JWT_SECRET,
      (err, decoded) => {
        if (err) {
          throw new Error("Invalid token signature");
        }
        return decoded;
      }
    );

    // console.log("Decoded token: ", decodedToken);
    const adminUser = await Users.findById(decodedToken.userId);

    if (!adminUser) {
      throw new Error(`Admin user not valid ${decodedToken?.userId}`);
    }

    // Commenting this code to Allow all users.
    /* if (adminUser?.role !== "Admin") {
      throw new Error(
        `User is not Admin ${decodedToken?.userId} - ${adminUser?.email}`
      );
    } */
    
    const companyForAdmin = adminUser?.companies?.find(
      (cm) => cm.isPrimary === true
    );
    const account = await Accounts.findById(companyForAdmin?.companyId)

    const allLikesForCompany = await Likes.find();

    const userQuery = {
      companies: {
        $elemMatch: {
          companyId: companyForAdmin?.companyId,
          isPrimary: true,
        },
      },
    };
    
    if (adminUser.role !== "Admin") {
      userQuery._id = adminUser._id;
    }
    
    const allUsersByAccount = await Users.find(userQuery);

    const allFosterConIds = [
      ...new Set(
        allUsersByAccount
          ?.filter((usr) => usr.status === "completed")
          .map((usr) => usr.linkedUsersAccountIds)
          .flat()
      ),
    ];

    // const FOSTER_CONNECTIONS_INDIVIDUAL_AGG_PIPELINE = [
    //   {
    //     $match: {
    //       accountId: {
    //         $in: [...allFosterConIds],
    //       },
    //     },
    //   },
    //   {
    //     $lookup: {
    //       from: "likes",
    //       localField: "_id",
    //       foreignField: "postId",
    //       as: "likeInfo",
    //     },
    //   },
    //   {
    //     $match: {
    //       likeInfo: {
    //         $elemMatch: {
    //           userId: { $in: [...allUsersByAccount.map((usr) => usr._id)] },
    //         },
    //       },
    //     },
    //   },

    //   {
    //     $unwind: {
    //       path: "$likeInfo",
    //       includeArrayIndex: "string",
    //       preserveNullAndEmptyArrays: true,
    //     },
    //   },

    //   {
    //     $lookup: {
    //       from: "users",
    //       localField: "likeInfo.userId",
    //       foreignField: "_id",
    //       as: "userInfo",
    //     },
    //   },
    //   {
    //     $unwind: {
    //       path: "$userInfo",
    //       includeArrayIndex: "string",
    //       preserveNullAndEmptyArrays: true,
    //     },
    //   },
    //   {
    //     $project: {
    //       userInfo: 1,
    //       likeInfo: 1,
    //       accountId: 1,
    //     },
    //   },
    //   {
    //     $lookup: {
    //       from: "userAccounts",
    //       localField: "accountId",
    //       foreignField: "_id",
    //       as: "prospectAccountInfo",
    //     },
    //   },

    //   {
    //     $unwind: {
    //       path: "$prospectAccountInfo",
    //       includeArrayIndex: "string",
    //       preserveNullAndEmptyArrays: true,
    //     },
    //   },

    //   {
    //     $group: {
    //       _id: { userId: "$likeInfo.userId", accountId: "$accountId" },
    //       totalLikes: { $sum: 1 },
    //       userInfo: { $first: "$userInfo" }, // Take the first userInfo (since it's 1:1 mapping)
    //       prospectAccountInfo: { $first: "$prospectAccountInfo" }, // Take the first prospectAccountInfo
    //     },
    //   },
    //   {
    //     $project: {
    //       _id: 0,
    //       userId: "$_id.userId",
    //       accountId: "$_id.accountId",
    //       totalLikes: 1,
    //       userInfo: 1,
    //       prospectAccountInfo: 1,
    //     },
    //   },
    // ];

    // const FOSTER_CONNECTIONS_USER_ACC_AGG_PIPELINE = [
    //   {
    //     // Match the specific prospect accounts you're interested in
    //     $match: {
    //       _id: {
    //         $in: [...allFosterConIds],
    //       },
    //     },
    //   },
    //   {
    //     // Look up posts related to each account
    //     $lookup: {
    //       from: "posts",
    //       localField: "_id",
    //       foreignField: "accountId",
    //       as: "posts",
    //     },
    //   },
    //   {
    //     // Unwind the posts to handle them individually
    //     $unwind: {
    //       path: "$posts",
    //       includeArrayIndex: "string",
    //       preserveNullAndEmptyArrays: true, // Include accounts with no posts
    //     },
    //   },
    //   {
    //     // Lookup the likes related to each post
    //     $lookup: {
    //       from: "likes",
    //       localField: "posts._id",
    //       foreignField: "postId",
    //       as: "likeInfo",
    //     },
    //   },
    //   {
    //     // Unwind the likeInfo to handle each like individually
    //     $unwind: {
    //       path: "$likeInfo",
    //       includeArrayIndex: "string",
    //       preserveNullAndEmptyArrays: true, // Include posts with no likes
    //     },
    //   },
    //   {
    //     // Look up user info for each like (which user liked the post)
    //     $lookup: {
    //       from: "users",
    //       localField: "likeInfo.userId",
    //       foreignField: "_id",
    //       as: "userInfo",
    //     },
    //   },
    //   {
    //     // Unwind userInfo to handle each like's user individually
    //     $unwind: {
    //       path: "$userInfo",
    //       includeArrayIndex: "string",
    //       preserveNullAndEmptyArrays: true, // Accounts with no likes will have null userInfo
    //     },
    //   },
    //   {
    //     // Group by accountId and userId to count total likes per user per account
    //     $group: {
    //       _id: {
    //         userId: "$likeInfo.userId", // User who liked the post
    //         accountId: "$_id", // Prospect account
    //       },
    //       totalLikes: { $sum: 1 }, // Count total likes for the prospect account by user
    //       userInfo: { $first: "$userInfo" }, // Get user info for each user
    //       prospectAccountInfo: { $first: "$$ROOT" }, // Get full account info
    //     },
    //   },
    //   {
    //     // Project the final output
    //     $project: {
    //       _id: 0,
    //       userId: "$_id.userId",
    //       accountId: "$_id.accountId",
    //       totalLikes: {
    //         $cond: {
    //           if: { $eq: ["$userInfo", null] }, // Check if userInfo is null
    //           then: 0, // If userInfo is null, set totalLikes to 0
    //           else: "$totalLikes", // Otherwise, keep the totalLikes value
    //         },
    //       }, // Set totalLikes to 0 if no likes
    //       userInfo: {
    //         $cond: {
    //           if: {
    //             $or: [
    //               { $eq: ["$userInfo", null] }, // Check if userInfo is null
    //               {
    //                 $eq: [
    //                   {
    //                     $size: {
    //                       $filter: {
    //                         input: "$userInfo.companies",
    //                         as: "company",
    //                         cond: {
    //                           $and: [
    //                             {
    //                               $eq: [
    //                                 "$$company.companyId",
    //                                 companyForAdmin?.companyId || "N/A",
    //                               ],
    //                             },
    //                             {
    //                               $eq: ["$$company.isPrimary", true],
    //                             },
    //                           ],
    //                         },
    //                       },
    //                     },
    //                   },
    //                   0, // If no matching company is found
    //                 ],
    //               },
    //             ],
    //           },
    //           then: null, // If no valid companyId or isPrimary is true, set userInfo to null
    //           else: "$userInfo", // Otherwise, keep the original userInfo
    //         },
    //       }, // User info for the person who liked the posts
    //       prospectAccountInfo: 1, // Info about the prospect account
    //     },
    //   },
    //   {
    //     // Sort the results by userInfo.name in ascending order
    //     $sort: {
    //       "userInfo.firstName": -1, // 1 for ascending order, -1 for descending order
    //     },
    //   },
    // ];

    const FOSTER_CONNECTIONS_USER_ACC_AGG_PIPELINE = [
      {
        // Match the specific prospect accounts you're interested in
        $match: {
          _id: {
            $in: [...allFosterConIds],
          },
        },
      },

      {
        // Lookup users who have the userAccount IDs in linkedUsersAccountIds
        $lookup: {
          from: "users", // The collection containing the users
          localField: "_id", // Field in userAccount collection
          foreignField: "linkedUsersAccountIds", // Field in users collection containing linked account IDs
          as: "linkedUser", // The result will be placed in this array
        },
      },

      {
        $unwind: {
          path: "$linkedUser",
          includeArrayIndex: "string",
          preserveNullAndEmptyArrays: true,
        },
      },

      {
        // Look up posts related to each account
        $lookup: {
          from: "posts",
          localField: "_id",
          foreignField: "accountId",
          as: "posts",
        },
      },

      {
        // Lookup the likes related to each post
        $lookup: {
          from: "likes",
          localField: "posts._id",
          foreignField: "postId",
          as: "likeInfo",
        },
      },

      {
        // Filter the likeInfo array to only include likes by the linkedUser
        $addFields: {
          likeInfo: {
            $filter: {
              input: "$likeInfo",
              as: "like",
              cond: {
                $eq: ["$$like.userId", "$linkedUser._id"],
              },
            },
          },
        },
      },

      {
        // Project to get the count of likes for each post
        $project: {
          userInfo: "$linkedUser",
          prospectAccountInfo: {
            name: "$name", // Include name from the root document
            linkedInUrl: "$linkedInUrl", // Include linkedInUrl from the root document
          },
          totalLikes: {
            $size: { $ifNull: ["$likeInfo", []] }, // If likeInfo is null, treat it as an empty array
          },
        },
      },

      {
        $match: {
          "userInfo.companies": {
            $elemMatch: {
              companyId: companyForAdmin?.companyId || "--NA--",
              isPrimary: true,
            },
          },
        },
      },
    ];

    const fosterConResAgg = await UserAccounts.aggregate(
      FOSTER_CONNECTIONS_USER_ACC_AGG_PIPELINE
    );

    // const FOSTER_CONNECTIONS_AGG_PIPELINE = [
    //   {
    //     $match: {
    //       _id: { $in: [...allFosterConIds] },
    //     },
    //   },
    //   {
    //     $lookup: {
    //       from: "users", // Reference to the Users collection
    //       localField: "_id", // Field in UserAccounts collection
    //       foreignField: "linkedUsersAccountIds", // Field in Users collection
    //       as: "connectedUsers", // Name of the array to store connected users
    //       pipeline: [
    //         {
    //           $match: {
    //             status: "completed",
    //             "companies.companyId": companyForAdmin?.companyId,
    //             "companies.isPrimary": true,
    //           },
    //         },
    //         {
    //           $project: {
    //             email: 1,
    //             name: 1,
    //             userProfileUrl: 1,
    //             role: 1,
    //           },
    //         },
    //       ],
    //     },
    //   },
    // ];

    // const allFosterConnectionsAgg = await UserAccounts.aggregate(
    //   FOSTER_CONNECTIONS_AGG_PIPELINE
    // );

    const usersWithLikes = allUsersByAccount.map((user) => {
      return {
        ...user._doc,
        likes: allLikesForCompany.filter((like) => like.userId === user._id)
          .length,
      };
    });

    // const finalUsers = usersWithLikes?.filter(
    //   (user) => user?._id !== adminUser?._id
    // );

    const finalUsers = usersWithLikes;

    logGracefulMessage({
      status: "Success",
      message: `All users for account fetched`,
      userId: ``,
      accountId: ``,
      method: `returnAllRelatedUsersFromToken`,
    });

    return {
      status: "success",
      message: `Got all users for account`,
      users: finalUsers,
      ...(account && { account }),
      fosterConnections: fosterConResAgg || [],
      noOfFosterConnections: allFosterConIds?.length || 0,
    };
  } catch (error) {
    logGracefulMessage({
      status: "Error",
      message: `${error?.message}`,
      userId: ``,
      accountId: ``,
      method: `returnAllRelatedUsersFromToken`,
    });
    return {
      status: "false",
      message: error.message,
    };
  }
};

const getAllRelatedPostsFromToken = async ({ token, page = 1, rowsPerPage = 10 }) => {
  try {
    const decodedToken = jwt.verify(
      token,
      process.env.JWT_SECRET,
      (err, decoded) => {
        if (err) {
          throw new Error("Invalid token signature");
        }
        return decoded;
      }
    );

    const User = await Users.findById(decodedToken.userId);

    if (!User) {
      throw new Error(`Admin user not valid ${decodedToken?.userId}`);
    }

    // if (adminUser?.role !== "Admin") {
    //   throw new Error(
    //     `User is not Admin ${decodedToken?.userId} - ${adminUser?.email}`
    //   );
    // }
   

    const companyForUser = User?.companies?.find(
      (cm) => cm.isPrimary === true
    );

    const filterCriteria = { accountId: companyForUser?.companyId };
    if (!companyForUser) {
      throw new Error("Admin does not have a primary company assigned.");
    }

    if (User.role === "User") {
      filterCriteria.userId = User._id;
    } else if (User.role !== "Admin") {
      throw new Error(`Unauthorized access: ${decodedToken?.userId} - ${user?.email}`);
    }

    // Pagination logic
    const skip = (page - 1) * rowsPerPage;

    const allAutoLikePost = await Posts.find(filterCriteria).skip(skip).limit(rowsPerPage).sort({ createdAt: -1 });

    const totalPosts = await Posts.countDocuments({ accountId: companyForUser?.companyId });

    const postsWithUserData = await Promise.all(
      allAutoLikePost.map(async (post) => {
        const user = await Users.findById(post.userId);
        const postTotalAutoLike = await Likes.countDocuments({ postId: post._id });

        return {
          ...post.toObject(),
          ...(user ? user.toObject() : {}),
          postAutolikeCount: postTotalAutoLike,
        };
      })
    );

    return {
      status: "success",
      data: postsWithUserData,
      pagination: {
        totalPosts,
        currentPage: page,
        totalPages: Math.ceil(totalPosts / rowsPerPage),
        rowsPerPage,
      },
    };
  } catch (error) {
    logGracefulMessage({
      status: "Error",
      message: `${error?.message}`,
      userId: "",
      accountId: "",
      method: `getAllRelatedPostsFromToken`,
    });

    return {
      status: "false",
      message: error.message,
    };
  }
};

const getAllUsersToPayForFromToken = async ({ token }) => {
  try {
    const decodedToken = jwt.verify(
      token,
      process.env.JWT_SECRET,
      (err, decoded) => {
        if (err) {
          throw new Error("Invalid token signature");
        }
        return decoded;
      }
    );

    // console.log("Decoded token: ", decodedToken);
    const adminUser = await Users.findById(decodedToken.userId).lean();

    if (!adminUser?._id || adminUser?.role !== "Admin") {
      throw new Error(`Admin user not valid ${decodedToken?.userId}`);
    }

    const companyForAdmin = adminUser?.companies?.find(
      (cm) => cm.isPrimary === true
    );

    const company = await Accounts.findById(companyForAdmin?.companyId);

    if (!company || !company?._id) {
      throw new Error(`Admin user not valid ${decodedToken?.userId}`);
    }

    if (!adminUser?.role === "Admin") {
      throw new Error(
        `User is not Admin ${decodedToken?.userId} - ${adminUser?.email}`
      );
    }

    // const today = new Date();

    // // Calculate the start date for the validity period
    // const validityStartDate = new Date(today);
    // validityStartDate.setDate(today.getDate() - 30); // 30 days before today

    const validityStartDate = moment().subtract(30, "days"); // 30 days ago
    const today = moment(); // Today's date

    // Find the active subscription bill within the 30-day validity window
    const pastValidBill = await Bills.findOne({
      accountId: company?._id,
      isCanceled: { $ne: true },
      createdAt: {
        $gte: validityStartDate.toDate(),
        $lte: today.toDate(),
      },
    }).lean();

    // For new requirement if user pays one time show him the bill for the month
    // const pastValidBill = await Bills.findOne({
    //   accountId: company?._id,
    // }).lean();

    if (pastValidBill?._id) {
      return {
        status: "success",
        message: `Payment details are already up to date`,
        usersToPayFor: [],
        adminUser,
        companyInfo: company,
        curMonthBill: pastValidBill,
      };
    }

    // if (
    //   adminUser?.cardToken &&
    //   adminUser?.cardExpiryMonth &&
    //   adminUser?.cardExpiryYear
    // ) {
    //   const { cardExpiryMonth, cardExpiryYear } = adminUser;
    //   const currentDate = new Date();

    //   const cardExpired =
    //     cardExpiryYear < currentDate.getFullYear() ||
    //     (cardExpiryYear === currentDate.getFullYear() &&
    //       cardExpiryMonth <= currentDate.getMonth());

    // }

    // today.setHours(0, 0, 0, 0);

    // const thirtyDaysAgo = new Date();
    // thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
    // thirtyDaysAgo.setHours(0, 0, 0, 0);

    // const todayMillis = today.getTime();
    // const thirtyDaysAgoMillis = thirtyDaysAgo.getTime();

    // const usersThatLikedUsingOurTool = await Likes.aggregate([
    //   {
    //     $match: {
    //       createdAt: {
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
    //       from: "users",
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
    //       userCreatedAt: { $toDate: "$userDetails.createdAt" },
    //       userName: {
    //         $concat: ["$userDetails.firstName", " ", "$userDetails.lastName"],
    //       },
    //       userProfile: "$userDetails.profileImageLink",
    //       totalLikes: 1,
    //     },
    //   },
    // ]);

    // console.log("Result:", usersThatLikedUsingOurTool);

    const allActiveUsersAssociatedWithCurCompany = await Users.find({
      $or: [{ adminEnabled: true }, { adminEnabled: { $exists: false } }],
      companies: {
        $elemMatch: {
          companyId: company?._id,
          isPrimary: true,
        },
      },
    }).count();

    logGracefulMessage({
      status: "Success",
      message: `All users who used our service this month retrieved successfully`,
      userId: ``,
      accountId: `${company?._id}`,
      method: `getAllUsersToPayForFromToken`,
    });

    return {
      status: "success",
      message: `All users who used our service this month retried successfully`,
      usersToPayFor: allActiveUsersAssociatedWithCurCompany,
      companyInfo: company,
      adminUser,
      totalCost: (allActiveUsersAssociatedWithCurCompany || 0) * 3,
      costPerUser: 3,
    };
  } catch (error) {
    logGracefulMessage({
      status: "Error",
      message: `${error?.message}`,
      userId: ``,
      accountId: ``,
      method: `getAllUsersToPayForFromToken`,
    });
    return {
      status: "false",
      message: error.message,
    };
  }
};

const getAllUsersToPayForByAccountId = async (accountId) => {
  try {
    const adminUser = await Users.findOne({
      role: "Admin",
      companies: {
        $elemMatch: { companyId: accountId },
      },
    }).lean();

    const company = await Accounts.findById(accountId);

    // add comment to check deployment

    if (!adminUser || !adminUser?._id) {
      throw new Error(`No Admin user found for account ID: ${accountId}`);
    }

    if (!company || !company?._id) {
      throw new Error(`Account ID not valid: ${accountId}`);
    }

    // const today = new Date();

    // // Calculate the start date for the validity period
    // const validityStartDate = new Date(today);
    // validityStartDate.setDate(today.getDate() - 30); // 30 days before today

    const validityStartDate = moment().subtract(30, "days"); // 30 days ago
    const today = moment(); // Today's date

    // Find the active subscription bill within the 30-day validity window
    const pastValidBill = await Bills.findOne({
      accountId: company?._id,
      isCanceled: { $ne: true },
      createdAt: {
        $gte: validityStartDate.toDate(),
        $lte: today.toDate(),
      },
    }).lean();

    // const pastValidBill = await Bills.findOne({
    //   accountId: company?._id,
    // }).lean();

    if (pastValidBill?._id) {
      return {
        status: "success",
        message: `Payment details are already up to date`,
        usersToPayFor: [],
        adminUser,
        companyInfo: company,
        curMonthBill: pastValidBill,
      };
    }

    // if (
    //   adminUser?.cardToken &&
    //   adminUser?.cardExpiryMonth &&
    //   adminUser?.cardExpiryYear
    // ) {
    //   const { cardExpiryMonth, cardExpiryYear } = adminUser;
    //   const currentDate = new Date();

    //   const cardExpired =
    //     cardExpiryYear < currentDate.getFullYear() ||
    //     (cardExpiryYear === currentDate.getFullYear() &&
    //       cardExpiryMonth <= currentDate.getMonth());

    //   // Will handle logic in case of card is expired
    // }

    // today.setHours(0, 0, 0, 0);

    // const thirtyDaysAgo = new Date();
    // thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
    // thirtyDaysAgo.setHours(0, 0, 0, 0);

    // const todayMillis = today.getTime();
    // const thirtyDaysAgoMillis = thirtyDaysAgo.getTime();

    // const usersThatLikedUsingOurTool = await Likes.aggregate([
    //   {
    //     $match: {
    //       createdAt: {
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
    //           companyId: accountId,
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
    //       userCreatedAt: {
    //         $toDate: "$userDetails.createdAt",
    //       },
    //       userName: {
    //         $concat: ["$userDetails.firstName", " ", "$userDetails.lastName"],
    //       },
    //       userProfile: "$userDetails.profileImageLink",
    //       totalLikes: 1,
    //       lastLikeDate: { $toDate: "$lastLikeDate" },
    //     },
    //   },
    // ]);

    const allActiveUsersAssociatedWithCurCompany = await Users.find({
      $or: [{ adminEnabled: true }, { adminEnabled: { $exists: false } }],
      companies: {
        $elemMatch: {
          companyId: company?._id,
          isPrimary: true,
        },
      },
    }).count();

    logGracefulMessage({
      status: "Success",
      message: `All users who used our service this month retrieved successfully`,
      userId: ``,
      accountId: `${adminUser?.accountId}`,
      method: `getAllUsersToPayForByAccountId`,
    });

    return {
      status: "success",
      message: `All users who used our service this month retrived successfully`,
      usersToPayFor: allActiveUsersAssociatedWithCurCompany,
      companyInfo: company,
      adminUser,
      totalCost: (allActiveUsersAssociatedWithCurCompany || 0) * 3,
      costPerUser: 3,
    };
  } catch (error) {
    logGracefulMessage({
      status: "Error",
      message: `${error?.message}`,
      userId: ``,
      accountId: ``,
      method: `getAllUsersToPayForByAccountId`,
    });
    return {
      status: "false",
      message: error.message,
    };
  }
};

const updateNoOfContactsForAllUsers = async () => {
  try {
    const accountUsersCountAgg = await Users.aggregate([
      [
        // Unwind the companies array to create a document for each company
        { $unwind: "$companies" },

        // Perform a lookup to join with the accounts collection
        {
          $lookup: {
            from: "accounts", // The name of the accounts collection
            localField: "companies.companyId", // Field from the users collection
            foreignField: "_id", // Field from the accounts collection
            as: "accountDetails", // Name of the new array field to add
          },
        },

        // Unwind the accountDetails array to access the crmId
        { $unwind: "$accountDetails" },

        // Group by companyId and crmId, and count the number of users
        {
          $group: {
            _id: {
              companyId: "$companies.companyId",
              crmId: "$accountDetails.crmId", // Include crmId in the grouping
            },
            userCount: { $sum: 1 }, // Count the number of users
          },
        },

        // Optionally, sort the results by userCount in descending order
        { $sort: { userCount: -1 } },
      ],
    ]);

    for (const accItem of accountUsersCountAgg) {
      const accId = accItem?._id?.companyId;
      const accCrmId = accItem?._id?.crmId;
      const userCount = (accItem?.userCount || 0) * 1;

      if (!accId || !accCrmId) {
        continue;
      }

      await Users.updateMany(
        {
          "companies.companyId": accId,
          "companies.isPrimary": true,
        },
        {
          $set: {
            noOfContactsInAccount: `${userCount}`,
          },
        }
      );

      await Accounts.findByIdAndUpdate(accId, {
        noOfContacts: `${userCount}`,
      });

      await updateNoOfAccInCrm(accCrmId, userCount, userCount);
    }

    const allUsersWithCrmId = await Users.find({
      crmId: { $ne: null, $exists: true },
    });

    for (const usr of allUsersWithCrmId) {
      addOrUpdateContactInCRM(usr, false);
    }

    logGracefulMessage({
      status: "Success",
      message: `No of contacts updated for all users`,
      userId: ``,
      accountId: ``,
      method: `updateNoOfContactsForAllUsers`,
    });

    return {
      status: "Success",
      message: `No of contacts updated for all users`,
      data: {},
    };
  } catch (error) {
    console.log(
      JSON.stringify({
        error,
        message: `Error occured`,
      })
    );
    logGracefulMessage({
      status: "Success",
      message: `No of contacts not updated for all users`,
      userId: ``,
      accountId: ``,
      method: `updateNoOfContactsForAllUsers`,
    });
    return {
      status: "Success",
      message: `No of contacts not updated for all users`,
      data: error,
    };
  }
};

const removeProspectConnectionFromUser = async (userId, prospectId, token) => {
  try {
    const decodedToken = jwt.verify(
      token,
      process.env.JWT_SECRET,
      (err, decoded) => {
        if (err) {
          throw new Error("Invalid token signature");
        }
        return decoded;
      }
    );

    // console.log("Decoded token: ", decodedToken);
    const adminUser = await Users.findById(decodedToken.userId).lean();

    if (!adminUser?._id || adminUser?.role !== "Admin") {
      throw new Error(`Admin user not valid ${decodedToken?.userId}`);
    }

    const prevUser = await Users.findById(userId).lean();

    if (!prevUser?._id) {
      return {
        success: false,
        message: `removeProspectConnectionFromUser failed`,
        data: {
          message: `Incorrect userId`,
        },
      };
    }

    const updatedUser = await Users.findByIdAndUpdate(prevUser?._id, {
      linkedUsersAccountIds:
        prevUser?.linkedUsersAccountIds?.filter(
          (prevId) => prevId !== prospectId
        ) || [],
    });

    return {
      success: true,
      message: `removeProspectConnectionFromUser success`,
      data: updatedUser,
    };
  } catch (error) {
    return {
      success: false,
      message: `removeProspectConnectionFromUser failed`,
      data: error,
    };
  }
};

const updateUsersExtensioVersion = async (userId, newExtensionVersion) => {
  try {
    const updatedUser = await Users.findByIdAndUpdate(userId, {
      latestBgExtensionVersion: newExtensionVersion,
    });
    return {
      success: true,
      message: `Updated extensino version`,
      data: updatedUser,
    };
  } catch (error) {
    return {
      success: false,
      message: `Not Updated extensino version`,
      data: error,
    };
  }
};

const addCompanyDetailsToAllUsers = async () => {
  console.log(`I will update all users company name and owner information`);
  try {
    const users = await Users.find({
      crmId: { $ne: null, $exists: true },
      accountId: { $ne: null, $exists: true },
    });

    for (const user of users) {
      const curAcc = await Accounts.findById(user?.accountId);

      if (!curAcc || !curAcc._id) {
        console.log(`Skipping user ${user._id} due to missing data`);
        continue;
      }

      const adminUser = await Users.findOne({
        accountId: user.accountId,
        role: "Admin",
      });

      const companyOwner = `${adminUser?.firstName || "Unknown"} ${
        adminUser?.lastName || ""
      }`;
      const companyName = `${curAcc?.company || "Unknown"}`;

      try {
        await addOrUpdateContactInCRM(
          {
            ...(user._doc || {}),
            companyName,
            companyOwner,
          },
          false
        );
      } catch (error) {
        console.log(`Error occurred for user ${user._id}: ${error.message}`);
      }
    }

    console.log({
      success: true,
      message: `All users' company name & owner information updated`,
    });
  } catch (error) {
    console.log(
      JSON.stringify({
        success: false,
        message: `Error while updating all users' company name & owner information`,
        data: error,
      })
    );
  }
};
// updateUserById
// - Add comment for deployment
const updateUserById = async (userId, update) => {
  try {
    const prevUser = await Users.findById(userId).lean();

    if (!prevUser) {
      throw new Error(`User ${userId} not found`);
    }

    const prevUsersPrimCompanyId =
      prevUser?.companies?.find((cmp) => cmp.isPrimary === true)?.companyId ||
      `-1`;

    const prevAccount = await Accounts.findById(prevUsersPrimCompanyId);

    const isTitleChanged = update?.designation
      ? prevUser?.designation !== update?.designation
      : false;

    let accountId = prevAccount?._id;
    let role = prevUser?.role;
    let shareLink = prevUser?.shareLink;
    let companyName = prevUser?.companyName;
    let companyOwner = prevUser?.companyOwner;
    const isAuthor = update?.isAuthorOfPage;

    if (update?.isAuthorOfPage !== undefined) {
      const newCompanies = prevUser?.companies?.map((item) => {
        if (item.isPrimary) {
          return {
            ...item,
            isAuthorOfCompany: !!isAuthor,
          };
        }

        return {
          ...item,
        };
      });

      const updatedUser = await Users.findByIdAndUpdate(
        prevUser._id,
        {
          companies: newCompanies,
        },
        { new: true }
      );

      await addOrUpdateContactInCRM(updatedUser, false);

      return {
        status: "success",
        message: `Succesfully updated users data`,
        isCompanyUpdated: false,
        data: updatedUser,
      };
    }

    // If it gets in below block
    // It means company was changed
    if (
      update?.company &&
      update?.officialLinkedInCompanyUrl &&
      prevAccount?.company !== update?.company &&
      prevAccount?.officialLinkedInCompanyUrl !==
        update?.officialLinkedInCompanyUrl
    ) {
      // FOR NOW, DON't UPDATE COMPANY.
      // TODO 🔴 - Need to change this back

      return {
        status: "success",
        message: `Succesfully updated users data`,
        isCompanyUpdated: false,
        data: prevUser,
      };

      // ------------------------

      const users = await Users.find({ accountId: prevAccount?._id });

      const noOfSignUps = users?.filter(
        (user) => user?.onBoardingComplete
      )?.length;

      const noOfContacts = users?.length;

      const updateAccInCrmRes = await updateNoOfAccInCrm(
        prevAccount?.crmId,
        noOfContacts,
        noOfSignUps
      );

      const isAlreadyPresentInUsersCompanyArray = prevUser?.companies?.some(
        (c) =>
          c.officialLinkedInCompanyUrl === update.officialLinkedInCompanyUrl
      );

      if (isAlreadyPresentInUsersCompanyArray) {
        const updatedCmpanies = prevUser?.companies?.map((c) => {
          if (
            c?.officialLinkedInCompanyUrl === update.officialLinkedInCompanyUrl
          ) {
            return {
              ...c,
              isPrimary: true,
            };
          }
          return { ...c, isPrimary: false };
        });

        const updatedCompanyUser = await Users.findByIdAndUpdate(
          prevUser?._id,
          {
            companies: updatedCmpanies,
          },
          { new: true }
        );

        logGracefulMessage({
          status: "Success",
          message: `Succesfully updated users data`,
          userId: `${userId}`,
          accountId: ``,
          method: `updateUserById`,
          response: updatedCompanyUser,
        });

        return {
          status: "success",
          message: `Succesfully updated users data`,
          isCompanyUpdated: true,
          data: updatedCompanyUser,
        };
      }

      //
      const foundCompany = await Accounts.findOne({
        officialLinkedInCompanyUrl: update?.officialLinkedInCompanyUrl,
      });

      let accToUpdate = foundCompany;
      let isAdminOfAccount = false;

      if (!foundCompany || !foundCompany?._id) {
        const accountInfo = {
          _id: idGeneratorHelper("acc"),
          createdAt: new Date(),
          updatedAt: new Date(),
          isActive: true,
          isVerified: true,
          company: update?.company,
          usersCounter: 1,
          noOfContacts: 1,
          noOfSignUps: 1,
          officialLinkedInCompanyUrl: update?.officialLinkedInCompanyUrl,
        };

        const newlyCreatedAccount = await Accounts.create(accountInfo);
        accToUpdate = newlyCreatedAccount;
        const createdAccInCrm = await createAccountInCRM(accountInfo);

        await addOrUpdateContactInCRM({
          ...prevUser,
          organization: createdAccInCrm?.account?.id,
        });

        isAdminOfAccount = true;
      }

      if (prevUser?.companies?.length > 2) {
        return {
          status: "success",
          message: `User already has 3 companies registered!`,
          isCompanyUpdated: false,
          data: prevUser,
        };
      }

      const newCompnies = prevUser?.companies?.map((c) => {
        return { ...c, isPrimary: false };
      });

      newCompnies.push({
        companyId: accToUpdate?._id,
        isAuthorOfPage: update?.isAuthorOfPage,
        officialLinkedInCompanyUrl: accToUpdate?.officialLinkedInCompanyUrl,
        isPrimary: true,
      });

      let additionalCompanyStatUpdate = {};

      if (newCompnies?.length === 2) {
        // const allUsersWithThisCompany = await Users.aggregate([
        //   { $unwind: "$companies" },
        //   { $match: { "companies.companyId": accToUpdate?._id } },
        // ]);

        const allUsersWithThisCompany = await Users.aggregate([
          { $match: { "companies.companyId": accToUpdate?._id } },
        ]);

        const newNumOfContacts = (allUsersWithThisCompany?.length || 0) + 1;

        const foundAcc = await Accounts.findByIdAndUpdate(accToUpdate?._id, {
          usersCounter: newNumOfContacts,
        });

        additionalCompanyStatUpdate.secondAccountName = foundAcc.company;
        additionalCompanyStatUpdate.noOfContactsInSecondAccount =
          newNumOfContacts;

        for (const curUser of allUsersWithThisCompany) {
          const compIdx = curUser.companies.findIndex(
            (c) => c.companyId === accToUpdate?._id
          );

          if (compIdx === 1) {
            await Users.findByIdAndUpdate(curUser?._id, {
              noOfContactsInSecondAccount: newNumOfContacts,
            });
          } else if (compIdx === 2) {
            await Users.findByIdAndUpdate(curUser?._id, {
              noOfContactsInThirdAccount: newNumOfContacts,
            });
          }
        }
      } else if (newCompnies?.length === 3) {
        // const allUsersWithThisCompany = await Users.aggregate([
        //   { $unwind: "$companies" },
        //   { $match: { "companies.companyId": accToUpdate?._id } },
        // ]);

        const allUsersWithThisCompany = await Users.aggregate([
          { $match: { "companies.companyId": accToUpdate?._id } },
        ]);

        const newNumOfContacts = (allUsersWithThisCompany?.length || 0) + 1;

        const foundAcc = await Accounts.findByIdAndUpdate(accToUpdate?._id, {
          usersCounter: newNumOfContacts,
        });

        additionalCompanyStatUpdate.thirdAccountName = foundAcc.company;
        additionalCompanyStatUpdate.noOfContactsInThirdAccount =
          newNumOfContacts;

        for (const curUser of allUsersWithThisCompany) {
          const compIdx = curUser.companies.findIndex(
            (c) => c.companyId === accToUpdate?._id
          );

          if (compIdx === 1) {
            await Users.findByIdAndUpdate(curUser?._id, {
              noOfContactsInSecondAccount: newNumOfContacts,
            });
          } else if (compIdx === 2) {
            await Users.findByIdAndUpdate(curUser?._id, {
              noOfContactsInThirdAccount: newNumOfContacts,
            });
          }
        }
      }

      const updatedCompanyUser = await Users.findByIdAndUpdate(
        prevUser?._id,
        {
          role:
            prevUser?.role !== "Admin" && isAdminOfAccount ? "Admin" : "User",
          companies: newCompnies,
          isAuthorOfPage: false,
          ...additionalCompanyStatUpdate,
        },
        { new: true }
      );

      await addOrUpdateContactInCRM(updatedCompanyUser, false);

      logGracefulMessage({
        status: "Success",
        message: `Succesfully updated users data`,
        userId: `${userId}`,
        accountId: ``,
        method: `updateUserById`,
      });

      return {
        status: "success",
        message: `Succesfully updated users data`,
        isCompanyUpdated: true,
        data: updatedCompanyUser,
      };
    }

    const updatedCompanies = prevUser?.companies?.map((c) => {
      if (c?.isPrimary) {
        return {
          ...c,
        };
      }
      return c;
    });

    const updatedUser = await Users.findByIdAndUpdate(
      userId,
      {
        ...update,
        companies: updatedCompanies,
        accountId,
        role,
        companyName,
        companyOwner,
        shareLink,
        lastProfileSyncDate: new Date(),
      },
      { new: true }
    );

    const updatedUsersCrm = await addOrUpdateContactInCRM({
      ...prevUser,
      ...update,
      role,
      companyName,
      companyOwner,
      shareLink,
      accountId,
    });

    logGracefulMessage({
      status: "Success",
      message: `Succesfully updated users data`,
      userId: `${userId}`,
      accountId: ``,
      method: `updateUserById`,
    });

    return {
      status: "success",
      message: `Succesfully updated users data`,
      data: updatedUser,
    };
  } catch (error) {
    logGracefulMessage({
      status: "Error",
      message: `${error?.message}`,
      userId: `${userId}`,
      accountId: ``,
      method: `updateUserById`,
    });
    return {
      status: "false",
      message: error.message,
    };
  }
};

const deleteUsersProspectsWithUserId = async (userId) => {
  try {
    const prevUser = await Users.findById(userId);

    if (!prevUser) {
      throw new Error(`User ${userId} not found`);
    }

    const remainingProspectIdsToDelete =
      prevUser?.linkedUsersAccountIds?.slice(5) || [];

    const finalProspectIdsForUser =
      prevUser?.linkedUsersAccountIds?.slice(0, 5) || [];

    const updatedUser = await Users.findByIdAndUpdate(
      prevUser._id,
      {
        linkedUsersAccountIds: finalProspectIdsForUser,
      },
      { new: true }
    );

    await UserAccounts.deleteMany({
      _id: { $in: remainingProspectIdsToDelete },
    });

    await Posts.deleteMany({
      accountId: { $in: remainingProspectIdsToDelete },
    });

    logGracefulMessage({
      status: "Success",
      message: `Succesfully adjusted user prospects`,
      userId: `${userId}`,
      accountId: ``,
      method: `deleteUsersProspectsWithUserId`,
    });

    return {
      status: "success",
      message: `Succesfully adjusted user prospects`,
      data: updatedUser,
    };
  } catch (error) {
    logGracefulMessage({
      status: "Error",
      message: `${error?.message}`,
      userId: `${userId}`,
      accountId: ``,
      method: `deleteUsersProspectsWithUserId`,
    });
    return {
      status: "false",
      message: error.message,
    };
  }
};

const deleteUserProspectsOfUninstalledUsers = async () => {
  try {
    // Step 1: Find all uninstalled users
    const prevUsers = await Users.find({
      uninstalledAt: { $exists: true, $ne: null },
    }).exec();

    // Collect all linkedUsersAccountIds for processing
    const allLinkedUsersAccountIds = prevUsers.flatMap(
      (user) => user.linkedUsersAccountIds || []
    );

    // Step 2: Update all uninstalled users to clear their linkedUsersAccountIds
    await Promise.all(
      prevUsers.map((user) =>
        Users.findByIdAndUpdate(
          user._id,
          { linkedUsersAccountIds: [] },
          { new: true }
        ).exec()
      )
    );

    // Step 3: Find all users who are still referencing these account IDs
    const otherUsersWithProspects = await Users.find({
      linkedUsersAccountIds: { $in: allLinkedUsersAccountIds },
    }).exec();

    // Collect all account IDs still referenced
    const referencedAccountIds = new Set(
      otherUsersWithProspects.flatMap(
        (user) => user.linkedUsersAccountIds || []
      )
    );

    // Step 4: Filter out account IDs that are not referenced by any other user
    const accountIdsToDelete = allLinkedUsersAccountIds.filter(
      (id) => !referencedAccountIds.has(id)
    );

    // Step 5: Delete UserAccounts and Posts for the account IDs not referenced by other users
    await Promise.all([
      UserAccounts.deleteMany({
        _id: { $in: accountIdsToDelete },
      }).exec(),
      Posts.deleteMany({
        accountId: { $in: accountIdsToDelete },
      }).exec(),
    ]);

    logGracefulMessage({
      status: "Success",
      message: "Successfully adjusted all uninstalled users' prospects",
      userId: "",
      accountId: "",
      method: "deleteUserProspectsOfUninstalledUsers",
    });

    return {
      status: "success",
      message: "Successfully adjusted user prospects",
      data: {},
    };
  } catch (error) {
    logGracefulMessage({
      status: "Error",
      message: error.message,
      userId: "",
      accountId: "",
      method: "deleteUserProspectsOfUninstalledUsers",
    });
    return {
      status: "false",
      message: error.message,
    };
  }
};

const inviterNameForAllUsersInCrm = async (req, res) => {
  try {
    const allUsers = await Users.find({
      crmId: { $ne: null, $exists: true },
      $or: [
        { inviterName: { $in: [null, undefined] } },
        { inviterName: { $eq: "" } },
      ],
    });

    for (const user of allUsers) {
      const newUser = await Users.findByIdAndUpdate(
        user?._id,
        { inviterName: " " },
        { new: true }
      );
      // console.log(newUser?._doc);
      await addOrUpdateContactInCRM({ ...newUser?._doc });
    }

    res.status(200).json({
      message: `Completed adding invited user name to ${allUsers?.length} Users`,
      success: true,
    });
    res.end();
  } catch (error) {
    //
    res.status(200).json({
      message: `something went wrong: ${error.message}`,
      success: true,
    });
    res.end();
  }
};

const upsertUserWithOrWithoutCompanyOrEmail = async (req, res) => {
  const {
    email,
    utm_medium,
    utm_campaign,
    name,
    onBoardingFailReason,
    ...rest
  } = req.body;
  try {
    const newUserToBeGeneratedId = idGeneratorHelper("usr");

    if (!email) {
      throw new Error("Email is required to create user");
    }

    const prevUserFound = await Users.findOne({ email });

    const userToBeCreated = {
      _id: newUserToBeGeneratedId,
      firstName: name ? name.split(" ")[0] : "",
      lastName: name ? name.split(" ")[1] : "",
      role: prevUserFound?.role || "Admin",
      ...rest,
      status: prevUserFound?.status || "pending",
      active: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      installedAt: new Date(),
      onBoardingComplete: false,
      onBoardingFailReason:
        prevUserFound?.onBoardingFailReason || onBoardingFailReason,
      utm_medium,
      utm_campaign,
      inviterName: "Unknown",
    };

    const { _id, ...userData } = userToBeCreated;

    // Upsert the user by email without modifying the _id
    const upsertedUser = await Users.findOneAndUpdate(
      { email },
      {
        $set: userData, // Use $set to update existing fields
        $setOnInsert: { _id }, // Use $setOnInsert to preserve _id during insert
      },
      { upsert: true, new: true }
    );

    await addOrUpdateContactInCRM({ ...upsertedUser?._doc }, true);

    res.status(200).json({
      message: `User upsert with email successfull`,
      success: true,
      data: { upsertedUser, isUpdated: !!prevUserFound },
    });
    res.end();
  } catch (error) {
    //
    res.status(200).json({
      message: `something went wrong: ${error.message}`,
      success: true,
      data: error,
    });
    res.end();
  }
};

const getAccountUrlToScrapPosts = async (userId) => {
  try {
    const currUser = await Users.findById(userId);
    if (!currUser?._id) {
      return console.log(`No user found for ${userId}`);
    }

    const curUsersCompanyIds = currUser?.companies?.map((c) => c.companyId);

    const curUsersAccounts = await Accounts.find({
      _id: { $in: curUsersCompanyIds },
    });

    // Aggregate to get all company IDs except those belonging to the current user
    const allCompaniesExceptCurUser = await Users.aggregate([
      {
        $match: {
          uninstalledAt: { $exists: false },
          "companies.officialLinkedInCompanyUrl": {
            $regex: /linkedin\.com\/company\//,
            $not: /\/search\/results\/all/,
          },
        },
      },

      // Step 1: Deconstruct the companies array
      { $unwind: "$companies" },

      // Step 2: Group to collect all unique company IDs
      {
        $group: {
          _id: null,
          allCompanyIds: { $addToSet: "$companies.companyId" },
        },
      },

      // Step 3: Exclude current user's company IDs
      {
        $project: {
          _id: 0,
          allCompanyIds: {
            $setDifference: ["$allCompanyIds", curUsersCompanyIds],
          },
        },
      },
    ]);

    let otherAccounsIds = allCompaniesExceptCurUser[0]?.allCompanyIds || [];

    const otherAccounts = await Accounts.find({
      _id: { $in: otherAccounsIds },
    }).lean();

    // otherAccounts = await Promise.all(
    //   otherAccounts.map(async (account) => {
    //     const userCount = await Users.countDocuments({
    //       companies: { $elemMatch: { companyId: account._id } },
    //     });
    //     return {
    //       ...account._doc, // Spread existing account fields
    //       userCount,
    //     };
    //   })
    // );

    // Get link of first  compayny.
    // So even if something is wrong first company gets scrapped.
    let linkOfcompanyToScrapPostsFrom = null;

    // const curAccForLink = curUsersAccounts?.filter((c) => {
    //   return (
    //     new Date(c.lastPostAlignedAt) < new Date().setHours(0, 0, 0, 0) ||
    //     !c?.lastPostAlignedAt
    //   );
    // })[0];

    const fourHoursAgo = new Date();
    fourHoursAgo.setHours(fourHoursAgo.getHours() - 4);

    const curAccForLink = curUsersAccounts?.filter((c) => {
      const lastPostDate = new Date(c.lastPostAlignedAt);
      return (
        lastPostDate <= fourHoursAgo || // If lastPostAlignedAt is more than 4 hours ago
        !c?.lastPostAlignedAt // or if lastPostAlignedAt is not defined
      );
    })[0];

    linkOfcompanyToScrapPostsFrom = curAccForLink?.officialLinkedInCompanyUrl;

    if (linkOfcompanyToScrapPostsFrom) {
      return {
        message: `Got link to scrap posts from ${linkOfcompanyToScrapPostsFrom} from user ${userId}`,
        success: true,
        data: {
          accountLink: linkOfcompanyToScrapPostsFrom,
          accountId: curAccForLink?._id,
        },
      };
    }

    /**
     * No link was scrapped here ,
     * I will scrap link from some
     * account from otheer companies
     * Based on these checks
     * 1. Account that has more no of active users or total users count
     * 2. Account that was scrapped before today but within this week
     */

    // Check 1: Account that has more number of active users or total users count
    const accountWithMostUsers = otherAccounts.reduce((prev, current) => {
      return (current.activeUsersCount || 0) > (prev.activeUsersCount || 0)
        ? current
        : prev;
    }, {});

    // Check 2: Account that was scrapped before today but within this week
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Set to start of today

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    oneWeekAgo.setHours(0, 0, 0, 0); // Set to start of the day

    const recentScrapedAccount = otherAccounts.filter(
      (c) =>
        new Date(c.lastPostAlignedAt) < today &&
        new Date(c.lastPostAlignedAt) >= oneWeekAgo
    )[0];

    const accForWhichLinkToReturnFrom =
      accountWithMostUsers?.officialLinkedInCompanyUrl
        ? accountWithMostUsers
        : recentScrapedAccount;

    // Determine which account link to return
    linkOfcompanyToScrapPostsFrom =
      accForWhichLinkToReturnFrom?.officialLinkedInCompanyUrl;

    if (linkOfcompanyToScrapPostsFrom) {
      return {
        message: `Got link to scrap posts from ${linkOfcompanyToScrapPostsFrom} from other companies for user ${userId}`,
        success: true,
        data: {
          accountLink: linkOfcompanyToScrapPostsFrom,
          accountId: accForWhichLinkToReturnFrom?._id,
        },
      };
    }

    linkOfcompanyToScrapPostsFrom =
      curUsersAccounts[0]?.officialLinkedInCompanyUrl;

    return {
      message: `Got default company link for user ${userId}`,
      success: false,
      data: {
        accountLink: linkOfcompanyToScrapPostsFrom,
        accountId: curUsersAccounts[0]?._id,
      },
    };
  } catch (error) {
    res.status(200).json({
      message: `something went wrong: ${error.message}`,
      success: true,
      data: error,
    });
    res.end();
  }
};

const addInviterNameForAllUsers = async () => {
  try {
    const users = await Users.find({
      crmId: { $ne: null, $exists: true },
      role: { $ne: "Admin" },
      $or: [
        { inviterName: { $exists: false } },
        { inviterName: { $in: ["Not Found", "Unknown"] } },
      ],
    });

    for (const user of users) {
      const curAccId = user?.companies[0] ? user?.companies[0]?.companyId : "";
      const curAcc = await Accounts.findById(curAccId);

      if (!curAcc || !curAcc._id) {
        console.log(`Skipping user ${user._id} due to missing data`);
        continue;
      }

      const adminUser = await Users.findOne({
        role: "Admin",
        companies: {
          $elemMatch: { companyId: curAccId },
        },
      });

      const adminUserName = `${adminUser?.firstName || ""} ${
        adminUser?.lastName || ""
      }`;

      await Users.findByIdAndUpdate(user._id, { inviterName: adminUserName });

      try {
        await addOrUpdateContactInCRM(
          {
            ...(user._doc || {}),
            inviterName: adminUserName,
          },
          false
        );
      } catch (error) {
        console.log(`Error occurred for user ${user._id}: ${error.message}`);
      }
    }

    return {
      success: true,
      message: `All users' invitername information updated`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Error while updating all users' invitername information`,
      data: error,
    };
  }
};

const getUserFromProfileUrl = async (userProfileUrl) => {
  try {
    if (!userProfileUrl?.trim()) {
      throw new Error(`Invalid user profile link`);
    }

    const retrievedUser = await Users.findOne({ userProfileUrl }).lean();
    if (!retrievedUser._id) {
      throw new Error(`User doesn't exists with this url`);
    }

    const retrievedUserCompanyId = retrievedUser?.companies?.find(
      (cmp) => cmp.isPrimary === true
    )?.companyId;
    const retrievedUserCompany = await Accounts.findOne({
      _id: retrievedUserCompanyId,
    }).lean();
    const prospectConnectionCount =
      retrievedUser?.linkedUsersAccountIds?.length || 0;
    const isPaidPlan = retrievedUserCompany?.plan === "Paid";

    let shouldShowUpgradePanel = false;

    const likeAggregationResults = await Users.aggregate([
      { $match: { _id: retrievedUser?._id } },
      //
      {
        $project: {
          primaryCompany: {
            $arrayElemAt: [
              {
                $filter: {
                  input: "$companies",
                  as: "company",
                  cond: {
                    $eq: ["$$company.isPrimary", true],
                  },
                },
              },
              0,
            ],
          },
        },
      },

      // Lookup from posts
      {
        $lookup: {
          from: "posts",
          localField: "primaryCompany.companyId",
          foreignField: "accountId",
          as: "posts",
        },
      },

      //
      {
        $unwind: {
          path: "$posts",
        },
      },

      {
        $lookup: {
          from: "likes",
          localField: "posts._id",
          foreignField: "postId",
          as: "likes",
        },
      },

      //
      {
        $group: {
          _id: null,
          totalCompanyLikes: { $sum: { $size: "$likes" } },
        },
      },

      //
      {
        $project: {
          _id: 0,
          totalCompanyLikes: { $ifNull: ["$totalCompanyLikes", 0] }, // Ensure 0 if no likes
        },
      },
    ]);

    const primCompaniesTotalLikes =
      likeAggregationResults[0]?.totalCompanyLikes || 0;

    if (
      !isPaidPlan &&
      (prospectConnectionCount >= 15 || primCompaniesTotalLikes >= 30)
    ) {
      shouldShowUpgradePanel = true;
    }

    const noOfUsersInAccount = await Users.find({
      companies: {
        $elemMatch: {
          companyId: retrievedUserCompanyId,
          isPrimary: true,
        },
      },
    }).count();

    const userAccounts = await UserAccounts.find({
      _id: { $in: retrievedUser?.linkedUsersAccountIds || [] },
    });

    return {
      success: true,
      message: `User profile retrieved success.`,
      data: {
        ...retrievedUser,
        isAlreadyAvailable: true,
        shouldShowUpgradePanel,
        noOfUsersInAccount,
        userAccounts,
      },
    };
  } catch (error) {
    return {
      success: false,
      message: `Error user doesn't exists with ${userProfileUrl} url.`,
      data: error,
    };
  }
};

const addCrmUrlToUsers = async () => {
  try {
    const usersWithoutCrmUrl = await Users.find({
      crmId: { $ne: null, $exists: true },
      $or: [{ crmUrl: { $eq: null } }, { crmUrl: { $exists: false } }],
    }).lean();

    for (const user of usersWithoutCrmUrl) {
      const updatedUser = await Users.findByIdAndUpdate(
        user?._id,
        {
          crmUrl: `${ADMIN_CRM_URL}/app/contacts/${user?.crmId}`,
        },
        {
          new: true,
        }
      ).lean();

      await addOrUpdateContactInCRM(updatedUser, false);
    }

    return {
      success: true,
      message: `User CRM urls updated success`,
      data: {},
    };
  } catch (error) {
    return {
      success: false,
      message: `Error occured.`,
      data: error,
    };
  }
};

const synAllAccountsCrmId = async () => {
  try {
    const allAccountsWthoutCrmId = await Accounts.find({
      crmId: { $eq: null },
    }).lean();

    const response = await getListOfAccountsCrm();
    const accounts = response.data.accounts;

    for (const acc of allAccountsWthoutCrmId) {
      // Find the account that matches the given company name
      const matchedAccount = accounts.find(
        (account) =>
          account?.name.trim()?.toLowerCase() ===
          acc?.company?.trim()?.toLowerCase()
      );

      if (acc?._id && matchedAccount?.id) {
        await Accounts.updateOne(
          { _id: acc?._id },
          { crmId: matchedAccount.id }
        );
      }
    }

    return {
      success: true,
      message: `Accounts CRMs updated success`,
      data: {},
    };
  } catch (error) {
    return {
      success: false,
      message: `Error occured.`,
      data: error,
    };
  }
};

const removeCompleteDataFromDBAndCrm = async (userId) => {
  try {
    const curUser = await Users.findById(userId).lean();

    if (!curUser?._id) {
      throw new Error(`User with id ${userId} not found`);
    }

    const curUsersCompaniesIds = curUser?.companies?.map(
      (cmp) => cmp?.companyId
    );

    const curUsersCompanies = await Accounts.find({
      _id: {
        $in: curUsersCompaniesIds,
      },
    }).lean();

    const response = await getListOfAccountsCrm();
    const crmAccounts = response.data.accounts;
    const curUserCrmAccounts = [];

    for (const curCmp of curUsersCompanies) {
      const matchedAccount = crmAccounts.find(
        (crmAcc) =>
          crmAcc?.name.trim()?.toLowerCase() ===
          curCmp?.company?.trim()?.toLowerCase()
      );

      if (matchedAccount?.id) {
        curUserCrmAccounts.push(matchedAccount.id);
      }

      const allPosts = await Posts.find({ accountId: curCmp?._id }).lean();
      await Posts.deleteMany({ accountId: curCmp?._id });
      await Likes.deleteMany({
        postId: { $in: allPosts?.map((pst) => pst?._id) },
      });
    }

    await deleteAccountsBulk(curUserCrmAccounts);
    await deleteCrmUserById(curUser?.crmId);
    await Users.findByIdAndDelete(curUser?._id);
    await Accounts.deleteMany({
      _id: {
        $in: curUsersCompanies,
      },
    });

    return {
      success: true,
      message: `Accounts removeCompleteDataFromDBAndCrm CRMs updated success`,
      data: {},
    };
  } catch (error) {
    return {
      success: false,
      message: `Error removeCompleteDataFromDBAndCrm occured.`,
      data: error,
    };
  }
};

const syncAllUsersAdminStatus = async () => {
  try {
    const allAdminUsers = await Users.aggregate([
      { $unwind: "$companies" },
      {
        $group: {
          _id: "$companies.companyId",
          userCount: { $sum: 1 },
        },
      },
      {
        $match: {
          userCount: 1,
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "companies.companyId",
          as: "adminUser",
        },
      },
      {
        $unwind: "$adminUser",
      },
      {
        $match: {
          "adminUser.role": {
            $ne: "Admin",
          },
        },
      },
      {
        $project: {
          "adminUser._id": 1,
          "adminUser.role": 1,
        },
      },
    ]);

    for (const usr of allAdminUsers) {
      // Find the account that matches the given company name
      const updatedUser = await Users.findByIdAndUpdate(
        usr?.adminUser?._id,
        { role: "Admin" },
        { new: true }
      );

      updatedUser?._id && (await addOrUpdateContactInCRM(updatedUser, false));
    }

    return {
      success: true,
      message: `All user admin update success`,
      data: {},
    };
  } catch (error) {
    return {
      success: false,
      message: `Error occured.`,
      data: error,
    };
  }
};

const syncAllEndUsersInviterName = async () => {
  try {
    const allGroupedUsers = await Users.aggregate([
      // Unwind the companies array to process individual companies
      { $unwind: "$companies" },

      // Filter to keep only primary companies
      { $match: { "companies.isPrimary": true } },

      // Group by companyId and collect users
      {
        $group: {
          _id: "$companies.companyId",
          users: {
            $push: {
              _id: "$_id",
              firstName: "$firstName",
              lastName: "$lastName",
              role: "$role",
            },
          },
        },
      },

      // Project the result
      {
        $project: {
          companyId: "$_id",

          users: 1,
          _id: 0, // Exclude the default _id field to keep it clean
        },
      },
    ]);

    for (const usrAgg of allGroupedUsers) {
      // Find the account that matches the given company name
      const { companyId, users } = usrAgg;

      if (!users?.length) {
        return;
      }

      const admUsr = users?.find((usr) => usr?.role === "Admin") || [];
      const nonAdminUsr = users?.filter((usr) => usr?.role === "User") || [];

      if (!admUsr) {
        return;
      }

      for (const nonAdmUsr of nonAdminUsr) {
        const updatedUser = await Users.findByIdAndUpdate(
          nonAdmUsr?._id,
          {
            inviterName: `${admUsr?.firstName || ""} ${admUsr?.lastName || ""}`,
          },
          { new: true }
        );

        updatedUser?._id && (await addOrUpdateContactInCRM(updatedUser, false));
      }
    }

    return {
      success: true,
      message: `All user inviter name update success`,
      data: {},
    };
  } catch (error) {
    return {
      success: false,
      message: `Error occured.`,
      data: error,
    };
  }
};

const updateAllUsersPaidAccountStatusInCrm = async () => {
  const allAccounts = await Accounts.find({ plan: "Paid" }).lean();

  for (const acc of allAccounts) {
    const curAccAdminUser = await Users.findOne({
      role: "Admin",
      companies: {
        $elemMatch: {
          companyId: acc?._id,
          isPrimary: true,
        },
      },
    });
    const updatedUser = await Users.findByIdAndUpdate(
      curAccAdminUser?._id,
      { accountPlan: "Paid" },
      { new: true }
    );
    await updateAccountInfo(acc);
    await addOrUpdateContactInCRM(updatedUser, false);
  }

  return {
    success: true,
    message: `Updated all accounts paid status in CRM`,
    data: {},
  };
};

const syncUsersAccounts = async () => {
  try {
    const allUsers = await Users.find({}).lean();

    for (const curUser of allUsers) {
      const primAcc = curUser?.companies?.find(
        (cmp) => cmp?.isPrimary === true
      );

      const primAccData = await Accounts.findById(primAcc?.companyId).lean();

      // - Sync users account accordingly.
      // - If account in DB exists, but doesn't have a crmId
      if (primAccData?._id && !primAccData?.crmId) {
        const foundCrmAccId = await getAccountIdByName(primAccData?.company);

        if (!foundCrmAccId) {
          // This means account doesn't exists in CRM but it does in DB, create account in CRM then.
          const createdAccInCrm = await createAccountInCRM(primAccData);
          await Accounts.findByIdAndUpdate(
            primAccData?._id,
            {
              crmId: createdAccInCrm?.id,
            },
            { new: true }
          );

          const allAssociatedMembers = await Users.find({
            companies: {
              $elemMatch: {
                companyId: primAccData?._id,
                isPrimary: true,
              },
            },
          }).lean();

          for (const associatedUser of allAssociatedMembers) {
            await addOrUpdateContactInCRM({
              ...associatedUser,
              organization: createdAccInCrm?.id,
            });
          }
        } else {
          await Accounts.findByIdAndUpdate(
            primAccData?._id,
            {
              crmId: foundCrmAccId,
            },
            { new: true }
          );

          const allAssociatedMembers = await Users.find({
            companies: {
              $elemMatch: {
                companyId: primAccData?._id,
                isPrimary: true,
              },
            },
          }).lean();

          for (const associatedUser of allAssociatedMembers) {
            await addOrUpdateContactInCRM({
              ...associatedUser,
              organization: foundCrmAccId,
            });
          }
        }
      }
    }

    return {
      success: true,
      message: `Sync users accounts success`,
      data: {},
    };
  } catch (error) {
    return {
      success: false,
      message: `Sync users accounts success`,
      data: {},
    };
  }
};

const updateUserPaymentStatus = async (userId, adminEnabled) => {
  try {
    const updatedUser = await Users.findByIdAndUpdate(
      userId,
      { adminEnabled },
      { new: true }
    );

    return {
      success: true,
      message: `updateUserPaymentStatus success`,
      data: updatedUser,
    };
  } catch (error) {
    return {
      success: false,
      message: `updateUserPaymentStatus failed`,
      data: { ...error },
    };
  }
};

export {
  getAccountUrlToScrapPosts,
  syncUsersAccounts,
  userUpsert,
  saveLinkedInPost,
  visitAndCapturePage,
  // reactToLinkedInPost,
  extractEmailAddress,
  updateUserEmail,
  createOrRetrieveUserByProfileUrl,
  updateUserProfileUrl,
  updateLastFrontendLikeForUser,
  userUninstalled,
  generateShareLink,
  addLinkInvitedUser,
  generateShareLinkById,
  getUsersImagesBySimilarAccountId,
  generateLinkForInvitedUser,
  validateEmailCode,
  generateVerificationCodeForUser,
  updateUsersEmail,
  clearUsersData,
  clearUsersDataByEmail,
  validateAndSendOtp,
  validateOtp,
  verifyToken,
  getAllRelatedUsersFromToken,
  clearUserDataWithAccounts,
  getAllUsersToPayForFromToken,
  updateAccountsContactsNumber,
  updateUsersExtensioVersion,
  addCompanyDetailsToAllUsers,
  updateUserById,
  checkIfEmailExists,
  inviterNameForAllUsersInCrm,
  getAllUsersToPayForByAccountId,
  updateNoOfContactsForAllUsers,
  createOrRetrieveUserByProfileUrlWithCompanies,
  updatePaymentLinkForAllAdminsInCrmAndDb,
  upsertUserWithOrWithoutCompanyOrEmail,
  updateUsersSchemaAccordingToNewCompaniesArray,
  getUserById,
  addInviterNameForAllUsers,
  deleteUsersProspectsWithUserId,
  deleteUserProspectsOfUninstalledUsers,
  getUserFromProfileUrl,
  addCrmUrlToUsers,
  synAllAccountsCrmId,
  syncAllUsersAdminStatus,
  syncAllEndUsersInviterName,
  updateAllUsersPaidAccountStatusInCrm,
  removeCompleteDataFromDBAndCrm,
  updateUserPaymentStatus,
  removeProspectConnectionFromUser,
  getAllRelatedPostsFromToken
};
