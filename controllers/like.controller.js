import * as Sentry from "@sentry/node";
import {
  addLike,
  syncLikesForAllAccounts,
  syncLikesForAllUsersAndAccounts,
  syncLikesInsights,
  syncLikesOnAccountLevel,
} from "../mutations/likeMutatiions.js";
import logGracefulMessage from "../utils/logGracefulMessage.js";
import { syncLikeDataForAllUsers } from "../utils/cronJobs/syncLikeDataScheduleCronJob.js";
import Users from "../mongodb/models/Users.js";

// - Add like controller
const addLikeController = async (req, res) => {
  try {
    //
    const likeToAdd = req.body;

    if (!likeToAdd || !likeToAdd.postId || !likeToAdd.userId) {
      res.status(400).json({
        success: false,
        message: "Like to add missing props",
      });
      res.end("");
      return;
    }

    const createdLike = await addLike(likeToAdd);

    logGracefulMessage({
      status: "Success",
      message: `like created successfully`,
      method: `addLikeController`,
      userId: req?.body?.userId,
      accountId: ``,
      payload: req?.body,
      response: createdLike,
      extensionVersion: likeToAdd?.extensionVersion,
    });

    res.status(200).json({
      success: true,
      message: "like created successfully",
      data: createdLike,
      otherUsers: createdLike?.otherUsers || []
    });
    res.end("");
    return;

    //
  } catch (error) {
    Sentry.captureException(error);
    logGracefulMessage({
      status: "Error",
      message: error?.message,
      method: `addLikeController`,
      userId: req?.body?.userId,
      accountId: ``,
      payload: req?.body,
      response: error,
      extensionVersion: req?.body?.extensionVersion,
    });
    res.status(400).json({ message: error?.message });
    res.end("");
  }
};

// -
const syncLikesInsightsController = async (req, res) => {
  try {
    //
    const { userId } = req.body;

    if (!userId) {
      res.status(400).json({
        success: false,
        message: "Provide correct form data",
      });
      res.end("");
      return;
    }

    const syncData = await syncLikesInsights(userId);

    if (!syncData.success) {
      throw syncData;
    }

    logGracefulMessage({
      status: "Success",
      message: `Syncedd users data successfully`,
      method: `syncLikesInsightsController`,
      userId: `${userId}`,
      accountId: ``,
      payload: req?.body,
      response: syncData,
      extensionVersion: "N/A",
    });

    res.status(200).json({
      success: true,
      message: syncData?.message,
      data: syncData?.user,
    });
    res.end("");
    return;

    //
  } catch (error) {
    Sentry.captureException(error);
    logGracefulMessage({
      status: "Error",
      message: `${error.message}`,
      method: `syncLikesInsightsController`,
      userId: `${req?.body?.userId}`,
      accountId: ``,
      payload: req?.body,
      response: error,
      extensionVersion: "N/A",
    });

    res.status(400).json({ message: error?.message });
    res.end("");
  }
};
const syncLikeDataForAllUsersController = async (req, res) => {
  try {
    const result = await syncLikeDataForAllUsers();

    if (result?.success) {
      logGracefulMessage({
        status: "Success",
        message: `Synced users data successfully`,
        method: `syncLikeDataForAllUsersController`,
        userId: `All Users`,
        accountId: `All Accounts`,
        payload: {},
        response: {},
        extensionVersion: "N/A",
      });

      res.status(200).json({
        success: true,
        message: result?.message,
        data: result?.data,
      });
      res.end("");
      return;
    }

    throw new Error(`${result?.message}`);

    //
  } catch (error) {
    Sentry.captureException(error);
    logGracefulMessage({
      status: "Error",
      message: `${error.message}`,
      method: `syncLikeDataForAllUsersController`,
      userId: `All Users`,
      accountId: `All Accounts`,
      payload: {},
      response: error,
      extensionVersion: "N/A",
    });

    res.status(400).json({ message: error?.message });
    res.end("");
  }
};

const getLatestUnlikedPostsController = async (req, res, next) => {
  const { accountId, userId, noOfPostsToFetch = 10 } = req.body;
  const delayInMinutes = 60 * 1000;

  if (!accountId || !userId) {
    res.status(400).json({ message: "Accountid and userId is required" });
    res.end("");
    return;
  }

  const postsToLike = await getLatestUnlikedPosts(
    accountId,
    userId,
    noOfPostsToFetch
  );
  if (!postsToLike?.posts) {
    res.status(400).json({ message: "Post to like not found" });
    res.end("");
    return;
  }

  res.status(200).json({
    success: true,
    message: "Posts fetched successfully",
    data: postsToLike?.posts?.map((item, idx) => {
      return {
        post: { ...postsToLike?.account?._doc, ...item?._doc, userId },
        delay: delayInMinutes * idx,
      };
    }),
  });
};

const syncLikesOnAccountLevelController = async (req, res) => {
  try {
    const { accountId } = req.params;

    // const result = await syncLikesOnAccountLevel(accountId);

    if (result?.success) {
      logGracefulMessage({
        status: "Success",
        message: `Synced users data successfully`,
        method: `syncLikesOnAccountLevelController`,
        userId: `All Users`,
        accountId: `All Accounts`,
        payload: {},
        response: {},
        extensionVersion: "N/A",
      });

      res.status(200).json({
        success: true,
        message: result?.message,
        data: result?.data,
      });
      res.end("");
      return;
    }

    throw new Error(`${result?.message}`);

    //
  } catch (error) {
    Sentry.captureException(error);
    logGracefulMessage({
      status: "Error",
      message: `${error.message}`,
      method: `syncLikesOnAccountLevelController`,
      userId: `All Users`,
      accountId: `All Accounts`,
      payload: {},
      response: error,
      extensionVersion: "N/A",
    });

    res.status(400).json({ message: error?.message });
    res.end("");
  }
};

const syncLikesAndPostCountController = async (req, res) => {
  try {
    const { userId } = req.params;

    if(!userId || !accountId) {
      throw new Error(`Provide correct form data, Userid is required`)
    }

   const curUser = await Users.findById(userId);

   if(!curUser?._id) {
    throw new Error(`Provide correct form data, Invalid userId`)
   }

   const primAcc = curUser?.companies(cmp => cmp?.isPrimary === true);

   if(!primAcc?.companyId) {
    throw new Error(`Provide correct form data, Invalid associated account`)
   }

   const result = await syncLikesOnAccountLevel( primAcc?.companyId, userId , false)

    // const result = await syncLikesOnAccountLevel(accountId);

    if (result?.success) {
      logGracefulMessage({
        status: "Success",
        message: `Synced users data successfully`,
        method: `syncLikesAndPostCountController`,
        userId: `All Users`,
        accountId: `All Accounts`,
        payload: {},
        response: {},
        extensionVersion: "N/A",
      });

      res.status(200).json({
        success: true,
        message: result?.message,
        data: result?.data,
      });
      res.end("");
      return;
    }

    throw new Error(`${result?.message}`);

    //
  } catch (error) {
    Sentry.captureException(error);
    logGracefulMessage({
      status: "Error",
      message: `${error.message}`,
      method: `syncLikesAndPostCountController`,
      userId: `All Users`,
      accountId: `All Accounts`,
      payload: {},
      response: error,
      extensionVersion: "N/A",
    });

    res.status(400).json({ message: error?.message });
    res.end("");
  }
};

const syncLikesForAllAccountsController = async (req, res) => {
  try {
    const result = syncLikesForAllAccounts();

    res.status(200).json({
      success: true,
      message: result?.message || "Success",
      data: result?.data || {},
    });
    res.end("");
    return;

    //
  } catch (error) {
    Sentry.captureException(error);
    logGracefulMessage({
      status: "Error",
      message: `${error.message}`,
      method: `syncLikesForAllAccountsController`,
      userId: `All Users`,
      accountId: `All Accounts`,
      payload: {},
      response: error,
      extensionVersion: "N/A",
    });

    res.status(400).json({ message: error?.message });
    res.end("");
  }
};
const syncLikesForAllUsersAccountsController = async (req, res) => {
  try {
    const result = syncLikesForAllUsersAndAccounts();

    res.status(200).json({
      success: true,
      message: result?.message || "Success",
      data: result?.data || {},
    });
    res.end("");
    return;

    //
  } catch (error) {
    Sentry.captureException(error);
    logGracefulMessage({
      status: "Error",
      message: `${error.message}`,
      method: `syncLikesForAllAccountsController`,
      userId: `All Users`,
      accountId: `All Accounts`,
      payload: {},
      response: error,
      extensionVersion: "N/A",
    });

    res.status(400).json({ message: error?.message });
    res.end("");
  }
};

export {
  addLikeController,
  syncLikesInsightsController,
  syncLikeDataForAllUsersController,
  syncLikesOnAccountLevelController,
  syncLikesForAllAccountsController,
  syncLikesForAllUsersAccountsController,
  syncLikesAndPostCountController
};
