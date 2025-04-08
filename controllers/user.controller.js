import * as Sentry from "@sentry/node";
import { createAdminDomainAccount } from "../mutations/adminMutations.js";
import {
  saveLinkedInPost,
  userUpsert,
  visitAndCapturePage,
  updateUserEmail,
  updateUserProfileUrl,
  createOrRetrieveUserByProfileUrl,
  updateLastFrontendLikeForUser,
  userUninstalled,
  generateShareLink,
  addLinkInvitedUser,
  generateShareLinkById,
  getUsersImagesBySimilarAccountId,
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
  updateUsersExtensioVersion,
  updateUserById,
  checkIfEmailExists,
  getAllUsersToPayForByAccountId,
  updateNoOfContactsForAllUsers,
  createOrRetrieveUserByProfileUrlWithCompanies,
  updatePaymentLinkForAllAdminsInCrmAndDb,
  updateUsersSchemaAccordingToNewCompaniesArray,
  getAccountUrlToScrapPosts,
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
  syncUsersAccounts,
  removeCompleteDataFromDBAndCrm,
  updateUserPaymentStatus,
  removeProspectConnectionFromUser,
  getAllRelatedPostsFromToken,
} from "../mutations/userMutations.js";
import logGracefulMessage from "../utils/logGracefulMessage.js";

const getCookie = async (req, res) => {
  try {
    const { cookie, userAgent } = req.body;
    // console.log("getCookie: started", { cookie });
    if (!cookie) {
      res.status(400).json({
        success: false,
        message: "Requet went through, but we did not get the package",
        status: "no_cookie",
      });
      res.end("");
      return;
    }
    const status = await userUpsert(cookie, userAgent);

    res.status(200).json({
      success: true,
      message: "The user record has been created//updated",
      status,
    });
  } catch (error) {
    Sentry.captureException(error);
    console.log(
      JSON.stringify({
        message: "getCookie: failed",
        mainError: error,
        data: req?.body,
      })
    );
    res.status(400).json({ message: error?.message });
  }
};

const createPost = async (req, res) => {
  try {
    const { postUrl } = req.body;
    // console.log("createPost: started", { postUrl });
    if (!postUrl) {
      res.status(400).json({
        success: false,
        message: "Please provide the LinkedIn Post URL",
      });
      res.end("");
      return;
    }
    const response = await saveLinkedInPost(postUrl);
    if (response && response?.success) {
      res.status(200).json({
        success: true,
        message: response?.message,
        postId: response?.postId,
      });
    } else {
      res.status(200).json({
        success: false,
        message: response?.message,
      });
    }

    res.end("");
  } catch (error) {
    Sentry.captureException(error);
    console.log(
      JSON.stringify({
        message: "createPost: failed",
        mainError: error,
        data: req?.body,
      })
    );
    res.status(400).json({ message: error?.message });
  }
};

const viewPost = async (req, res) => {
  try {
    const data = req.body;
    let invalid_fields = [];
    // console.log("viewPost: started", { data });

    if (!("userId" in data)) {
      invalid_fields.push([{ userId: "not provided" }]);
    }

    if (!("postId" in data)) {
      invalid_fields.push([{ postId: "not provided" }]);
    }

    if (invalid_fields.length > 0) {
      console.log(
        JSON.stringify({
          message: "viewPost: failed",
          mainError: { field_errors: invalid_fields },
          data: req?.body,
        })
      );

      res.status(400).json({
        success: false,
        message: "Please provide both userId and postId",
        error: { field_errors: invalid_fields },
        photoUrl: null,
      });
      res.end("");
    }

    // Visit Page

    const viewResponse = await visitAndCapturePage(data.userId, data.postId);
    // console.log("viewPost: view page", { viewResponse });
    if (!viewResponse.success) {
      console.log(
        JSON.stringify({
          message: "viewPost: failed",
          mainError: { errorMessage: viewResponse?.message },
          data: req?.body,
        })
      );
      res.send({
        success: false,
        message: viewResponse?.message,
        photoUrl: null,
      });
      res.end();
    } else {
      // console.log("viewPost: success", {
      //   success: true,
      //   message: viewResponse?.message,
      //   photoUrl: viewResponse?.photoUrl,
      // });
      res.send({
        success: true,
        message: viewResponse?.message,
        photoUrl: viewResponse?.photoUrl,
      });
      res.end();
    }
  } catch (error) {
    Sentry.captureException(error);

    console.log(
      JSON.stringify({
        message: "viewPost: failed",
        mainError: { errorMessage: error?.message },
        data: req?.body,
      })
    );
    res
      .status(400)
      .json({ success: false, message: error?.message, photoUrl: null });
  }
};

const newPost = async (req, res) => {
  try {
    // console.log("newPost: started", {});

    res.status(200).json({
      success: true,
      message: "Reacted successfully",
      postToLike: {
        linkedInPostUrl:
          "https://www.linkedin.com/posts/devsteve05_tanggapp-raises-25m-to-make-remittance-activity-7104762131455082496-1jU7?utm_source=share&utm_medium=member_desktop",
        author: "https://www.linkedin.com/in/devsteve05/",
        createdAt: new Date(),
      },
    });
    // res.end("");
  } catch (error) {
    Sentry.captureException(error);

    console.log(
      JSON.stringify({
        message: "newPost: failed",
        mainError: error,
        data: req?.body,
      })
    );

    res
      .status(400)
      .json({ success: false, message: error?.message, stack: error });
    res.end("");
  }
};

const reactPost = async (req, res) => {
  try {
    // console.log("reactPost: started", {});
    res.status(200).json({
      success: true,
      message: "Reacted successfully",
      postToLike: {
        linkedInPostUrl:
          "https://www.linkedin.com/posts/devsteve05_tanggapp-raises-25m-to-make-remittance-activity-7104762131455082496-1jU7?utm_source=share&utm_medium=member_desktop",
        author: "https://www.linkedin.com/in/devsteve05/",
        createdAt: new Date(),
      },
    });
  } catch (error) {
    Sentry.captureException(error);

    console.log(
      JSON.stringify({
        message: "reactPost: failed",
        mainError: error,
        data: req?.body,
      })
    );

    res
      .status(400)
      .json({ success: false, message: error?.message, stack: error });
    res.end("");
  }
};

const createAdmin = async (req, res) => {
  const data = req.body;
  try {
    const { email, adminUserId } = data;
    // console.log("createAdmin: started", { email, ...data });

    // if (!adminUserId) {
    //   throw new Error("No Admin found for this id");
    // }

    if (!email) {
      throw new Error("No email provided");
    }
    const accountCreated = await createAdminDomainAccount(data);

    logGracefulMessage({
      message: `Attempted to create Admin account: ${
        accountCreated ? "SUCCESS" : "FAILED"
      }`,
      method: "createAdmin",
      status: accountCreated ? "Success" : "Error",
      userId: "",
      accountId: ``,
    });

    res.status(200).json({
      success: !!accountCreated,
      message: `Attempted to create Admin account: ${
        accountCreated ? "SUCCESS" : "FAILED"
      }`,
    });
    res.end();
  } catch (error) {
    Sentry.captureException(error);

    logGracefulMessage({
      message: `Attempted to create Admin account Failed`,
      method: `${error?.message}`,
      status: "Error",
      userId: "",
      accountId: "",
    });

    res
      .status(400)
      .json({ success: false, message: error?.message, stack: error });
    res.end("");
  }
};

const updateUserByEmail = async (req, res) => {
  try {
    const { oldEmail, newEmail } = req.body;
    // console.log("updateUserByEmail: started", { oldEmail, newEmail });
    if (!oldEmail || !newEmail) {
      res.status(400).json({
        success: false,
        message: "Requet went through, but we did not get the package",
        status: "no_user_email",
      });
      res.end("");
      return;
    }
    const stat = await updateUserEmail({ oldEmail, newEmail });

    res.status(200).json(stat);
    res.end("");
  } catch (error) {
    Sentry.captureException(error);

    console.log(
      JSON.stringify({
        message: "updateUserByEmail: failed",
        mainError: error,
        data: req?.body,
      })
    );
    res
      .status(400)
      .json({ success: false, message: error?.message, stack: error });
    res.end("");
  }
};

const updateUserByProfileUrl = async (req, res) => {
  try {
    const { userProfileUrl, ipAddress } = req.body;

    // console.log("updateUserByProfileUrl: started", { userProfileUrl });
    if (!userProfileUrl) {
      res.status(400).json({
        success: false,
        message: "Requet went through, but we did not get the package",
        status: "no_usr_profile_url",
      });
      res.end("");
      return;
    }
    const stat = await updateUserProfileUrl({
      userProfileUrl,
      update: { ...req.body, userProfileUrl },
      ipAddress,
    });

    // console.log("user by profile stas", stat);

    res.status(200).json(stat);
    res.end("");
  } catch (error) {
    Sentry.captureException(error);

    console.log(
      JSON.stringify({
        message: "updateUserByEmail: failed",
        mainError: error,
        data: req?.body,
      })
    );
    res
      .status(400)
      .json({ success: false, message: error?.message, stack: error });
    res.end("");
  }
};

const createOrRetrieveUserByProfileUrlController = async (req, res) => {
  try {
    const { userProfileUrl, extensionVersion } = req.body;
    if (!userProfileUrl) {
      res
        .status(400)
        .json({ success: false, message: `No user profile url provided` });
      return res.end("");
    }

    const userProfileRes = await createOrRetrieveUserByProfileUrl(req.body);

    if (userProfileRes.status !== "success") {
      throw new Error(userProfileRes.message);
    }

    logGracefulMessage({
      status: `Success`,
      message: `${userProfileRes?.message}`,
      method: `createOrRetrieveUserByProfileUrlController`,
      userId: "",
      accountId: ``,
      extensionVersion,
    });

    res.status(200).json(userProfileRes);
    return res.end("");
  } catch (error) {
    Sentry.captureException(error);
    logGracefulMessage({
      status: `Error`,
      message: `${error?.message}`,
      method: `createOrRetrieveUserByProfileUrlController`,
      userId: "",
      accountId: "",
      extensionVersion: req?.body?.extensionVersion,
    });
    res
      .status(400)
      .json({ success: false, message: error?.message, stack: error });
    res.end("");
  }
};

const createOrRetrieveUserByProfileUrlWithCompaniesController = async (
  req,
  res
) => {
  try {
    const { userProfileUrl, extensionVersion } = req.body;
    if (!userProfileUrl) {
      res
        .status(400)
        .json({ success: false, message: `No user profile url provided` });
      return res.end("");
    }

    const userProfileRes = await createOrRetrieveUserByProfileUrlWithCompanies(
      req.body
    );

    if (userProfileRes?.status !== "success") {
      throw new Error(userProfileRes.message);
    }

    logGracefulMessage({
      status: `Success`,
      message: `${userProfileRes?.message}`,
      method: `createOrRetrieveUserByProfileUrlWithCompaniesController`,
      userId: "",
      accountId: ``,
      extensionVersion,
    });

    res.status(200).json(userProfileRes);
    return res.end("");
  } catch (error) {
    if (!error?.message?.includes(`Invalid company name`)) {
      Sentry.captureException(error);
    }
    logGracefulMessage({
      status: `Error`,
      message: `${error?.message}`,
      method: `createOrRetrieveUserByProfileUrlWithCompaniesController`,
      userId: "",
      accountId: "",
      extensionVersion: req?.body?.extensionVersion,
    });
    res
      .status(400)
      .json({ success: false, message: error?.message, stack: error });
    res.end("");
  }
};

const getUserByIdController = async (req, res) => {
  try {
    const userId = req?.params?.userId;
    const response = await getUserById(userId);
    if (!response.status === "success") {
      throw new Error(response?.message);
    }
    res.status(200).json(response);
    return res.end();
  } catch (error) {
    console.log(
      JSON.stringify({
        error,
        message: `Error occured at get user by id controller`,
      })
    );
  }
};

const updateLastFrontendLikeForUserController = async (req, res) => {
  try {
    const { userId, lastFrontLike } = req.body;
    if (!userId || !lastFrontLike) {
      res.status(400).json({
        success: false,
        message: `userId and lastFrontLike  is requireed`,
        stack: error,
      });
      res.end("");
    }

    const obj = await updateLastFrontendLikeForUser(userId, lastFrontLike);
    res.status(200).json({ ...obj });
    res.end("");
  } catch (error) {
    Sentry.captureException(error);

    console.log(
      JSON.stringify({
        message: "update last frontend like: failed",
        mainError: error,
        data: req?.body,
      })
    );
    res
      .status(400)
      .json({ success: false, message: error?.message, stack: error });
    res.end("");
  }
};

const userUninstalledController = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      res.status(400).json({
        success: true,
        message: `Not a valid userId`,
      });
      res.end("");
    }

    const obj = await userUninstalled(userId);

    // Set Cache-Control header to prevent caching
    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, private"
    );

    if (obj.status === "success") {
      const responseHtml = `
      <div style="text-align: center; font-size: 25px; margin-top: 300px;font-family:sans-serif;">
        Thanks you for using <a href="http://heyou.io/">Heyou.io</a>
      </div>
    `;

      res.status(200);
      res.send(responseHtml);
      res.end("");
      return;
    }

    res.status(200).json({ ...obj });
    res.end("");
  } catch (error) {
    Sentry.captureException(error);

    console.log(
      JSON.stringify({
        message: "uninstall user: failed",
        mainError: error,
        data: req?.body,
      })
    );
    res
      .status(400)
      .json({ success: false, message: error?.message, stack: error });
    res.end("");
  }
};

const checkIfEmailExistsController = async (req, res) => {
  try {
    const { email } = req.params;

    if (!email) {
      res.status(400).json({
        success: true,
        message: `Not a valid email address`,
      });
      res.end("");
    }

    const obj = await checkIfEmailExists(email);

    res.status(200).json({ ...obj });
    res.end("");
  } catch (error) {
    Sentry.captureException(error);

    console.log(
      JSON.stringify({
        message: "uninstall user: failed",
        mainError: error,
        data: req?.body,
      })
    );
    res
      .status(400)
      .json({ success: false, message: error?.message, stack: error });
    res.end("");
  }
};

const generateShareLinkController = async (req, res) => {
  try {
    const { userId, accountId } = req.body;

    if (!userId || !accountId) {
      res.status(400).json({
        success: false,
        message: `please enter correct form data`,
      });
      res.end("");
    }

    const obj = await generateShareLink(userId, accountId);
    res.status(200).json({ ...obj });
    res.end("");
  } catch (error) {
    Sentry.captureException(error);

    console.log(
      JSON.stringify({
        message: "uninstall user: failed",
        mainError: error,
        data: req?.body,
      })
    );
    res
      .status(400)
      .json({ success: false, message: error?.message, stack: error });
    res.end("");
  }
};

const generateShareLinkByUserIdController = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      res.status(400).json({
        success: false,
        message: `please enter valid url`,
      });
      res.end("");
    }

    const obj = await generateShareLinkById(userId);
    res.status(200).json({ ...obj });
    res.end("");
  } catch (error) {
    Sentry.captureException(error);

    console.log(
      JSON.stringify({
        message: "generate invite by id user: failed",
        mainError: error,
        data: req?.params,
      })
    );
    res
      .status(400)
      .json({ success: false, message: error?.message, stack: error });
    res.end("");
  }
};

const getUsersImagesBySimilarAccountIdController = async (req, res) => {
  try {
    const { accountId } = req.params;

    if (!accountId) {
      res.status(400).json({
        success: false,
        message: `please enter valid accountId : getUsersImagesBySimilarAccountIdController`,
      });
      res.end("");
    }

    const obj = await getUsersImagesBySimilarAccountId(accountId);
    res.status(200).json({ ...obj });
    res.end("");
  } catch (error) {
    Sentry.captureException(error);

    console.log(
      JSON.stringify({
        message: "Getting image for accountId: failed",
        mainError: error,
        data: req?.params,
      })
    );

    res
      .status(400)
      .json({ success: false, message: error?.message, stack: error });
    res.end("");
  }
};

const addLinkInvitedUserController = async (req, res) => {
  try {
    const { encryptedUserId, encryptedAccountId, ipAddress, email } = req.body;

    if (!encryptedUserId || !encryptedAccountId || !ipAddress) {
      throw new Error("Please provide required fields");
    }

    const obj = await addLinkInvitedUser(
      encryptedUserId,
      encryptedAccountId,
      ipAddress,
      email
    );

    logGracefulMessage({
      status: "Success",
      message: `${obj?.message}`,
      method: "addLinkInvitedUserController",
      userId: `usr_${encryptedUserId}`,
      accontId: `acc_${encryptedAccountId}`,
    });

    res.status(200).json({ ...obj });
    res.end("");
  } catch (error) {
    Sentry.captureException(error);
    logGracefulMessage({
      status: "Success",
      message: `${error?.message}`,
      method: "addLinkInvitedUserController",
      userId: `usr_${req?.body?.encryptedUserId}`,
      accontId: `acc_${req?.body?.encryptedAccountId}`,
    });
    res
      .status(400)
      .json({ success: false, message: error?.message, stack: error });
    res.end("");
  }
};

const emailVerificationController = async (req, res) => {
  const { userId, verificationCode } = req.body;

  if (!userId || !verificationCode) {
    return res
      .status(400)
      .send({ message: "Missing userId or verification code" });
  }

  try {
    const result = await validateEmailCode(userId, verificationCode);

    if (result.valid) {
      res.status(200).send({ message: result.message });
    } else {
      res.status(400).send({ message: result.message });
    }
  } catch (error) {
    Sentry.captureException(error);
    res.status(400).send({ message: error.message });
  }
};

const generateVerificationCodeController = async (req, res) => {
  const { userId, email } = req.body;

  if (!userId || !email) {
    return res.status(400).send({ message: "Missing userId or Email" });
  }

  try {
    const code = await generateVerificationCodeForUser(userId, email);

    res.status(200).send("Verification code has sent");
  } catch (error) {
    Sentry.captureException(error);
    res.status(400).send({ message: error.message });
  }
};

const updateUsersEmailController = async (req, res) => {
  try {
    const { userId, email } = req.body;

    if (!userId) {
      throw new Error("user id not found");
    }

    if (!email) {
      throw new Error("email not found");
    }

    const stat = await updateUsersEmail({
      userId,
      email,
    });

    logGracefulMessage({
      status: "Success",
      message: `${stat?.message}`,
      method: `updateUsersEmailController`,
      userId: `${userId}`,
      accountId: ``,
    });

    res.status(200).json(stat);
    res.end("");
  } catch (error) {
    Sentry.captureException(error);

    logGracefulMessage({
      status: "Error",
      message: `${error?.message}`,
      method: `updateUsersEmailController`,
      userId: `${req?.body?.userId}`,
      accountId: ``,
    });
    res
      .status(400)
      .json({ success: false, message: error?.message, stack: error });
    res.end("");
  }
};

const clearUserDataController = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      Sentry.captureException(`User id not found in clearUserDataController`);
      res.status(400).json({
        success: false,
        message: "Requet went through, but we did not get the package",
        status: "user id not found",
      });
      res.end("");
      return;
    }

    const stat = await clearUsersData({ userId });

    res.status(200).json(stat);
    res.end("");
  } catch (error) {
    Sentry.captureException(error);

    console.log(
      JSON.stringify({
        message: "clearUserDataController: failed",
        mainError: error,
        data: req?.params,
      })
    );
    res
      .status(400)
      .json({ success: false, message: error?.message, stack: error });
    res.end("");
  }
};

const clearUserDataByEmailController = async (req, res) => {
  try {
    const { userEmail } = req.params;

    if (!userEmail) {
      Sentry.captureException(
        `User email not found in clearUserDataByEmailController`
      );
      res.status(400).json({
        success: false,
        message: "Requet went through, but we did not get the package",
        status: "user email  not found in clearUserDataByEmailController",
      });
      res.end("");
      return;
    }

    const stat = await clearUsersDataByEmail({ userEmail });

    res.status(200).json(stat);
    res.end("");
  } catch (error) {
    Sentry.captureException(error);

    console.log(
      JSON.stringify({
        message: "clearUserDataController: failed",
        mainError: error,
        data: req?.params,
      })
    );
    res
      .status(400)
      .json({ success: false, message: error?.message, stack: error });
    res.end("");
  }
};
const clearUserDataByEmailWithAccountController = async (req, res) => {
  try {
    const { userEmail, deleteAccount } = req.body;

    if (!userEmail) {
      Sentry.captureException(
        `User email not found in clearUserDataByEmailWithAccountController`
      );
      res.status(400).json({
        success: false,
        message: "Requet went through, but we did not get the package",
        status:
          "user email  not found in clearUserDataByEmailWithAccountController",
      });
      res.end("");
      return;
    }

    const stat = await clearUserDataWithAccounts({ userEmail, deleteAccount });

    res.status(200).json(stat);
    res.end("");
  } catch (error) {
    Sentry.captureException(error);

    console.log(
      JSON.stringify({
        message: "clearUserDaataByEmailWithAccountController: failed",
        mainError: error,
        data: req?.body,
      })
    );
    res
      .status(400)
      .json({ success: false, message: error?.message, stack: error });
    res.end("");
  }
};

const validateAndSendOtpController = async (req, res) => {
  try {
    const { userEmail } = req.params;

    if (!userEmail) {
      Sentry.captureException(
        `User email not found in validateAndSendOtpController`
      );
      res.status(400).json({
        success: false,
        message: "Requet went through, but we did not get the package",
        status: "user email  not found in validateAndSendOtpController",
      });
      res.end("");
      return;
    }

    const stat = await validateAndSendOtp({ userEmail });

    res.status(200).json(stat);
    res.end("");
  } catch (error) {
    Sentry.captureException(error);

    res
      .status(400)
      .json({ success: false, message: error?.message, stack: error });
    res.end("");
  }
};

const validateOtpController = async (req, res) => {
  try {
    const { otp, email } = req.body;

    if (!otp || !email) {
      Sentry.captureException(
        `User email or otp not found in validateOtpController`
      );
      res.status(400).json({
        success: false,
        message: `OTP not valid for ${email}`,
        status: "user email  not found in validateAndSendOtpController",
      });
      res.end("");
      return;
    }

    const stat = await validateOtp({ otp, email });

    res.status(200).json(stat);
    res.end("");
  } catch (error) {
    Sentry.captureException(error);
    // console.log("validateOtpController: failed", {
    //   errorMessage: error?.message,
    // });
    console.log(
      JSON.stringify({
        message: "validateOtpController: failed",
        mainError: error,
        data: req?.body,
      })
    );
    res.status(400).json({
      success: false,
      message: `Sorry something went wrong!`,
      stack: error,
    });
    res.end("");
  }
};

const verifyTokenController = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      Sentry.captureException(
        `Token to verify not found in verifyTokenController`
      );
      res.status(400).json({
        success: false,
        message: "Requet went through, but we did not get the package",
        status: "user email  not found in verifyTokenController",
      });
      res.end("");
      return;
    }

    const stat = await verifyToken({ token });

    if (stat.status === "failed") {
      throw new Error(`Invalid Token`);
    }

    res.status(200).json(stat);
    res.end("");
  } catch (error) {
    Sentry.captureException(error);

    console.log(
      JSON.stringify({
        message: "verifyTokenController: failed",
        mainError: error,
        data: req?.body,
      })
    );
    res
      .status(400)
      .json({ success: false, message: error?.message, stack: error });
    res.end("");
  }
};

const getAllRelatedUsersFromTokenController = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      Sentry.captureException(
        `Token to verify not found in getAllRelatedUsersFromTokenController`
      );
      res.status(400).json({
        success: false,
        message: "Requet went through, but we did not get the package",
        status:
          "user email  not found in getAllRelatedUsersFromTokenController",
      });
      res.end("");
      return;
    }

    const stat = await getAllRelatedUsersFromToken({ token });

    res.status(200).json(stat);
    res.end("");
  } catch (error) {
    Sentry.captureException(error);

    console.log(
      JSON.stringify({
        message: "getAllRelatedUsersFromTokenController: failed",
        mainError: error,
        data: req?.body,
      })
    );
    res
      .status(400)
      .json({ success: false, message: error?.message, stack: error });
    res.end("");
  }
};

const getAllRelatedPostsFromTokenController = async (req, res) => {
  try {
    const { token, page, rowsPerPage } = req.body;

    if (!token) {
      Sentry.captureException(
        `Token to verify not found in getAllRelatedPostsFromTokenController`
      );
      res.status(400).json({
        success: false,
        message: "Requet went through, but we did not get the package",
        status:
          "user email  not found in getAllRelatedPostsFromTokenController",
      });
      res.end("");
      return;
    }

    const postsData = await getAllRelatedPostsFromToken({ token, page, rowsPerPage });

    res.status(200).json(postsData);
    res.end("");
  } catch (error) {
    Sentry.captureException(error);

    console.log(
      JSON.stringify({
        message: "getAllRelatedPostsFromTokenController: failed",
        mainError: error,
        data: req?.body,
      })
    );
    res
      .status(400)
      .json({ success: false, message: error?.message, stack: error });
    res.end("");
  }
};
const getAllUsersToPayFor = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      res.status(400).json({
        success: false,
        message: "Invalid token getAllUsersToPayFor",
        status: "Invalid token getAllUsersToPayFor",
      });
      res.end("");
      return;
    }

    const stat = await getAllUsersToPayForFromToken({ token });

    res.status(200).json(stat);
    res.end("");
  } catch (error) {
    Sentry.captureException(error);

    res
      .status(400)
      .json({ success: false, message: error?.message, stack: error });
    res.end("");
  }
};

const removeProspectConnectionFromUserController = async (req, res) => {
  try {
    const { userId, prospectId, token } = req.body;

    if (!userId || !prospectId || !token) {
      res.status(400).json({
        success: false,
        message: "Invalid token removeProspectConnectionFromUser",
        status: "Invalid token removeProspectConnectionFromUser",
      });
      res.end("");
      return;
    }

    const stat = await removeProspectConnectionFromUser(
      userId,
      prospectId,
      token
    );

    res.status(200).json(stat);
    res.end("");
  } catch (error) {
    Sentry.captureException(error);

    res
      .status(400)
      .json({ success: false, message: error?.message, stack: error });
    res.end("");
  }
};

const getAllUsersToPayForByAccountIdController = async (req, res) => {
  try {
    const { accountId } = req.params;

    if (!accountId) {
      res.status(400).json({
        success: false,
        message:
          "AccountId not found for getAllUsersToPayForByAccountIdController",
        status:
          "AccountId not found for getAllUsersToPayForByAccountIdController",
      });
      res.end("");
      return;
    }

    const stat = await getAllUsersToPayForByAccountId(accountId);

    res.status(200).json(stat);
    res.end("");
  } catch (error) {
    Sentry.captureException(error);

    res
      .status(400)
      .json({ success: false, message: error?.message, stack: error });
    res.end("");
  }
};

const updateUserPaymentStatusController = async (req, res) => {
  try {
    const { userId } = req.params;
    const { adminEnabled } = req.body;

    if (!userId || adminEnabled === undefined) {
      res.status(400).json({
        success: false,
        message: "Provide correct form data , no userId and adminEnabled found",
        status: "Provide correct form data , no userId and adminEnabled found",
      });
      res.end("");
      return;
    }

    const stat = await updateUserPaymentStatus(userId, adminEnabled);

    res.status(200).json(stat);
    res.end("");
  } catch (error) {
    Sentry.captureException(error);

    res
      .status(400)
      .json({ success: false, message: error?.message, stack: error });
    res.end("");
  }
};

const updateNoOfContactsForAllUsersController = async (req, res) => {
  try {
    updateNoOfContactsForAllUsers();

    res.status(200).json({
      success: true,
      message: `I have started to sync no of contacts for all users`,
    });
    res.end("");
  } catch (error) {
    Sentry.captureException(error);

    res
      .status(400)
      .json({ success: false, message: error?.message, stack: error });
    res.end("");
  }
};

const updateUsersExtensioVersionController = async (req, res) => {
  try {
    const { userId, newExtensionVersion } = req.body;

    if (!userId) {
      res.status(400).json({
        success: false,
        message: `UserId "${userId}" is not provided`,
      });
      return res.end("");
    }

    if (!newExtensionVersion) {
      throw new Error(`newExtensionVersion ${newExtensionVersion} not found`);
    }

    const stat = await updateUsersExtensioVersion(userId, newExtensionVersion);

    logGracefulMessage({
      status: "Success",
      accountId: ``,
      userId: `${userId}`,
      message: `${stat?.message}`,
      method: `updateUsersExtensioVersionController`,
    });

    res.status(200).json(stat);
    res.end("");
  } catch (error) {
    Sentry.captureException(error);

    logGracefulMessage({
      status: "Error",
      accountId: ``,
      userId: `${req?.body?.userId}`,
      message: `${error?.message}`,
      method: `updateUsersExtensioVersionController`,
    });

    res
      .status(400)
      .json({ success: false, message: error?.message, stack: error });
    res.end("");
  }
};

const updateUserByIdController = async (req, res) => {
  try {
    const { userId } = req.params;
    const update = req.body;

    if (!userId) {
      res.status(400).json({
        success: false,
        message: "User id is required",
        status: "Error",
      });
      res.end("");
      return;
    }

    const updatedUser = await updateUserById(userId, update);

    res.status(200).json(updatedUser);
    res.end("");
  } catch (error) {
    Sentry.captureException(error);

    console.log(
      JSON.stringify({
        message: "updateUserByEmail: failed",
        mainError: error,
        data: req?.body,
      })
    );
    res
      .status(400)
      .json({ success: false, message: error?.message, stack: error });
    res.end("");
  }
};

const deleteProspectsWithUserIdController = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      res.status(400).json({
        success: false,
        message: "User id is required",
        status: "Error",
      });
      res.end("");
      return;
    }

    const updatedUser = await deleteUsersProspectsWithUserId(userId);

    res.status(200).json(updatedUser);
    res.end("");
  } catch (error) {
    Sentry.captureException(error);

    console.log(
      JSON.stringify({
        message: "deleteProspectsWithUserIdController: failed",
        mainError: error,
        data: req?.body,
      })
    );
    res
      .status(400)
      .json({ success: false, message: error?.message, stack: error });
    res.end("");
  }
};

const deleteUserProspectsOfUninstalledUsersController = async (req, res) => {
  try {
    const updatedUser = await deleteUserProspectsOfUninstalledUsers();

    res.status(200).json(updatedUser);
    res.end("");
  } catch (error) {
    Sentry.captureException(error);

    console.log(
      JSON.stringify({
        message: "deleteUserProspectsOfUninstalledUsersController: failed",
        mainError: error,
        data: req?.body,
      })
    );
    res
      .status(400)
      .json({ success: false, message: error?.message, stack: error });
    res.end("");
  }
};

const updatePaymentLinkForAllAdminsInCrmAndDbController = async (req, res) => {
  try {
    const finalRes = updatePaymentLinkForAllAdminsInCrmAndDb();
    res.status(200).json({ ...finalRes });
  } catch (error) {
    Sentry.captureException(error);

    res
      .status(400)
      .json({ success: false, message: error?.message, stack: error });
    res.end("");
  }
};

const updateUsersSchemaAccordingToNewCompaniesArrayController = async (
  req,
  res
) => {
  try {
    const finalRes = await updateUsersSchemaAccordingToNewCompaniesArray();
    res.status(200).json({ ...finalRes });
  } catch (error) {
    Sentry.captureException(error);

    res
      .status(400)
      .json({ success: false, message: error?.message, stack: error });
    res.end("");
  }
};

const getAccountUrlToScrapPostsController = async (req, res) => {
  try {
    const userId = req.params.userId;
    const finalRes = await getAccountUrlToScrapPosts(userId);
    res.status(200).json({ ...finalRes });
  } catch (error) {
    Sentry.captureException(error);

    res
      .status(400)
      .json({ success: false, message: error?.message, stack: error });
    res.end("");
  }
};

const addInviterNameForAllUsersController = async (req, res) => {
  try {
    addInviterNameForAllUsers();
    res.status(200).json({ message: "API call done" });
  } catch (error) {
    Sentry.captureException(error);

    res
      .status(400)
      .json({ success: false, message: error?.message, stack: error });
    res.end("");
  }
};

const getUserFromProfileUrlController = async (req, res) => {
  try {
    const { userProfileUrl } = req.body;
    const profileRes = await getUserFromProfileUrl(userProfileUrl);
    if (!profileRes.success) {
      res
        .status(400)
        .json({ success: false, message: `User profile not found` });
      return res.end("");
    }
    res.status(200).json(profileRes);
  } catch (error) {
    Sentry.captureException(error);

    res
      .status(400)
      .json({ success: false, message: error?.message, stack: error });
    res.end("");
  }
};

const addCrmUrlToUsersController = async (req, res) => {
  try {
    addCrmUrlToUsers();

    res.status(200).json({
      success: true,
      message: `Initiated adding users crmurl success`,
    });
  } catch (error) {
    Sentry.captureException(error);

    res
      .status(400)
      .json({ success: false, message: error?.message, stack: error });
    res.end("");
  }
};

const synAllAccountsCrmIdController = async (req, res) => {
  try {
    synAllAccountsCrmId();

    res.status(200).json({
      success: true,
      message: `Sync crmId started`,
    });
  } catch (error) {
    Sentry.captureException(error);

    res
      .status(400)
      .json({ success: false, message: error?.message, stack: error });
    res.end("");
  }
};
const removeCompleteDataFromDBAndCrmController = async (req, res) => {
  try {
    const userId = req.params.userId;
    const result = await removeCompleteDataFromDBAndCrm(userId);

    res.status(200).json({
      success: true,
      message: `Sync crmId started`,
      data: result,
    });
  } catch (error) {
    Sentry.captureException(error);

    res
      .status(400)
      .json({ success: false, message: error?.message, stack: error });
    res.end("");
  }
};

const syncAllUsersAdminStatusController = async (req, res) => {
  try {
    syncAllUsersAdminStatus();

    res.status(200).json({
      success: true,
      message: `Admin statuss sync started`,
    });
  } catch (error) {
    Sentry.captureException(error);

    res
      .status(400)
      .json({ success: false, message: error?.message, stack: error });
    res.end("");
  }
};

const syncAllEndUsersInviterNameController = async (req, res) => {
  try {
    syncAllEndUsersInviterName();

    res.status(200).json({
      success: true,
      message: `Inviter Name sync started`,
    });
  } catch (error) {
    Sentry.captureException(error);

    res
      .status(400)
      .json({ success: false, message: error?.message, stack: error });
    res.end("");
  }
};

const syncAccountPaidStatus = async (req, res) => {
  try {
    updateAllUsersPaidAccountStatusInCrm();

    res.status(200).json({
      success: true,
      message: `Sync paid status started`,
    });
  } catch (error) {
    Sentry.captureException(error);

    res
      .status(400)
      .json({ success: false, message: error?.message, stack: error });
    res.end("");
  }
};

const syncUsersAccountsInCrmController = async (req, res) => {
  try {
    syncUsersAccounts();

    res.status(200).json({
      success: true,
      message: `Users Accounts Syncing started`,
    });
  } catch (error) {
    Sentry.captureException(error);

    res
      .status(400)
      .json({ success: false, message: error?.message, stack: error });
    res.end("");
  }
};

export {
  updatePaymentLinkForAllAdminsInCrmAndDbController,
  syncUsersAccountsInCrmController,
  syncAllUsersAdminStatusController,
  getCookie,
  createPost,
  viewPost,
  newPost,
  reactPost,
  createAdmin,
  updateUserByEmail,
  createOrRetrieveUserByProfileUrlController,
  updateUserByProfileUrl,
  updateLastFrontendLikeForUserController,
  userUninstalledController,
  generateShareLinkController,
  addLinkInvitedUserController,
  generateShareLinkByUserIdController,
  getUsersImagesBySimilarAccountIdController,
  emailVerificationController,
  generateVerificationCodeController,
  updateUsersEmailController,
  clearUserDataController,
  clearUserDataByEmailController,
  validateAndSendOtpController,
  validateOtpController,
  verifyTokenController,
  getAllRelatedUsersFromTokenController,
  clearUserDataByEmailWithAccountController,
  getAllUsersToPayFor,
  updateUsersExtensioVersionController,
  updateUserByIdController,
  checkIfEmailExistsController,
  getAllUsersToPayForByAccountIdController,
  updateNoOfContactsForAllUsersController,
  createOrRetrieveUserByProfileUrlWithCompaniesController,
  updateUsersSchemaAccordingToNewCompaniesArrayController,
  getAccountUrlToScrapPostsController,
  getUserByIdController,
  addInviterNameForAllUsersController,
  deleteProspectsWithUserIdController,
  deleteUserProspectsOfUninstalledUsersController,
  getUserFromProfileUrlController,
  addCrmUrlToUsersController,
  synAllAccountsCrmIdController,
  syncAllEndUsersInviterNameController,
  syncAccountPaidStatus,
  removeCompleteDataFromDBAndCrmController,
  updateUserPaymentStatusController,
  removeProspectConnectionFromUserController,
  getAllRelatedPostsFromTokenController
};
