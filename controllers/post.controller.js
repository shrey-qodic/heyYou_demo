import * as Sentry from "@sentry/node";
import {
  compareAndAddPosts,
  compareAndAddProspectPosts,
  getLatestUnlikedPosts,
  getPostFeed,
  getPostsWhoseAalyticsToUpdate,
  getLastThreeMonthsPosts,
  prePostAlign,
  updatePostAnalytics,
  addHistoricalPosts,
  getLatestUnlikedPostsWithUserId,
  prePostAlignMultipleCompanies,
  resetLikesAndPostsCountToZero,
  removeDuplicatePostsWithSameUrl,
  alignUsersLikesAndAccountCrmIdData,
  getLatestPostWithAutolike,
} from "../mutations/postMutations.js";
import logGracefulMessage from "../utils/logGracefulMessage.js";
import Posts from "../mongodb/models/Posts.js";
import Users from "../mongodb/models/Users.js";

// - delete all duplicate records
const deleteAllDuplicatePosts = async (req, res) => {
  try {
    const allPosts = await Posts.find({});
    const duplicatesMap = new Map();

    allPosts.forEach((doc) => {
      if (duplicatesMap.has(doc.postUrl)) {
        const existingPosts = duplicatesMap.get(doc.postUrl);
        const oldestPost = existingPosts[0];

        if (doc.createdAt < oldestPost.createdAt) {
          // Replace the oldest post with the current post
          duplicatesMap.set(doc.postUrl, [doc]);
        }
      } else {
        duplicatesMap.set(doc.postUrl, [doc]);
      }
    });

    const filteredPosts = Array.from(duplicatesMap.values()).flat();

    const idsToDelete = allPosts
      .filter((post) => !filteredPosts.includes(post))
      .map((post) => post._id);

    // Delete duplicate records from the database
    await Posts.deleteMany({ _id: { $in: idsToDelete } });

    res.status(200).json({
      success: true,
      message: "Duplicates fetched and deleted successfully",
      data: filteredPosts,
    });
  } catch (error) {
    console.log("Error", JSON.stringify(error));
    res.status(400).json({
      success: false,
      message: "Duplicates fetch and delete failed",
      data: error.message,
    });
  } finally {
    res.end();
  }
};

// - List all duplicate records
const listAllDuplicatePosts = async (req, res) => {
  try {
    const allPosts = await Posts.find({});
    const duplicatesMap = new Map();

    allPosts.forEach((doc) => {
      if (duplicatesMap.has(doc.postUrl)) {
        duplicatesMap.get(doc.postUrl).push(doc);
      } else {
        duplicatesMap.set(doc.postUrl, [doc]);
      }
    });

    const duplicates = Array.from(duplicatesMap.values())
      .filter((posts) => posts.length > 1)
      .flat();

    res.status(200).json({
      success: true,
      message: "Duplicates fetched successfully",
      data: duplicates,
    });
  } catch (error) {
    console.log("Error", JSON.stringify(error));
    res.status(400).json({
      success: false,
      message: "Duplicates fetch failed",
      data: error.message,
    });
  } finally {
    res.end();
  }
};

//
const compareAndAddPostsController = async (req, res) => {
  try {
    //
    const {
      postUrls,
      accountId,
      userId,
      extensionVersion,
      companySize,
      region,
      isPostPage
    } = req.body;

    if (postUrls?.length < 1) {
      return res.status(200).json({
        success: true,
        message: `0 Posts added in DB successfully`,
        data: [],
      });
    }

    if (!accountId) {
      throw new Error("Provide correct account id");
    }

    if (!userId) {
      throw new Error("Provide correct user id");
    }

    const {createdPosts ,
      otherUsers} = await compareAndAddPosts(
      postUrls,
      accountId,
      userId,
      companySize,
      region,
      isPostPage
    );



    logGracefulMessage({
      status: "Success",
      message: `${createdPosts?.length || 0} Posts added in DB successfully`,
      method: `compareAndAddPostsController`,
      userId: `${userId}`,
      accountId: `${accountId}`,
      payload: req?.body,
      response: createdPosts,
      extensionVersion,
    });

    res.status(200).json({
      success: true,
      message: `${createdPosts?.length || 0} Posts added in DB successfully`,
      data: createdPosts,
      otherUsers
    });
    res.end("");
    return;

    //
  } catch (error) {
    Sentry.captureException(error);

    logGracefulMessage({
      status: "Error",
      message: `${error.message}`,
      method: `compareAndAddPostsController`,
      userId: `${req?.body?.userId}`,
      accountId: `${req?.body?.accountId}`,
      payload: req?.body,
      response: error,
      extensionVersion: req?.body?.extensionVersion,
    });

    res.status(400).json({ message: error?.message });
    res.end("");
  }
};

const compareAndAddProspectPostsController = async (req, res) => {
  try {
    //
    const { postUrls, accountId, userId, extensionVersion } = req.body;

    if (postUrls?.length < 1) {
      return res.status(200).json({
        success: true,
        message: `0 Posts added in DB successfully`,
        data: [],
      });
    }

    if (!userId) {
      throw new Error("Provide correct user id");
    }

    const postsToLike = await compareAndAddProspectPosts(
      postUrls,  
      userId,
      accountId
    );


    logGracefulMessage({
      status: "Success",
      message: `${postsToLike?.length || 0} Posts added in DB successfully`,
      method: `compareAndAddProspectPostsController`,
      userId: `${userId}`,
      accountId: ``,
      payload: req?.body,
      response: postsToLike,
      extensionVersion,
    });

    res.status(200).json({
      success: true,
      message: `${postsToLike?.length || 0} Posts added in DB successfully`,
      data: postsToLike,
    });
    res.end("");
    return;

    //
  } catch (error) {
    Sentry.captureException(error);

    logGracefulMessage({
      status: "Error",
      message: `${error.message}`,
      method: `compareAndAddProspectPostsController`,
      userId: `${req?.body?.userId}`,
      accountId: ``,
      payload: req?.body,
      response: error,
      extensionVersion: req?.body?.extensionVersion,
    });

    res.status(400).json({ message: error?.message });
    res.end("");
  }
};

const getPostsWhoseAalyticsToUpdateController = async (req, res) => {
  try {
    //
    const { userId, extensionVersion } = req?.body;

    if (!userId) {
      throw new Error("Provide correct user id");
    }

    const postResult = await getPostsWhoseAalyticsToUpdate(userId);

    logGracefulMessage({
      status: "Success",
      message: ``,
      method: `getPostsWhoseAalyticsToUpdateController`,
      userId: `${userId}`,
      accountId: ``,
      payload: req?.body,
      response: postResult,
      extensionVersion,
    });

    res.status(200).json(postResult);
    res.end("");
    return;

    //
  } catch (error) {
    Sentry.captureException(error);

    logGracefulMessage({
      status: "Error",
      message: `${error.message}`,
      method: `getPostsWhoseAalyticsToUpdateController`,
      userId: `${req?.body?.userId}`,
      accountId: ``,
      payload: req?.body,
      response: error,
      extensionVersion: req?.body?.extensionVersion,
    });

    res.status(400).json({ message: error?.message });
    res.end("");
  }
};

const updatePostAnalyticsController = async (req, res) => {
  try {
    //
    const { postId, extensionVersion, userId } = req?.body;

    if (!postId) {
      throw new Error("Provide correct post id");
    }

    const postResult = await updatePostAnalytics(req?.body);

    logGracefulMessage({
      status: "Success",
      message: ``,
      method: `updatePostAnalyticsController`,
      userId: userId,
      accountId: ``,
      payload: req?.body,
      response: postResult,
      extensionVersion,
    });

    res.status(200).json(postResult);
    res.end("");
    return;

    //
  } catch (error) {
    Sentry.captureException(error);

    logGracefulMessage({
      status: "Error",
      message: `${error.message}`,
      method: `updatePostAnalyticsController`,
      userId: `${req?.body?.userId}`,
      accountId: ``,
      payload: req?.body,
      response: error,
      extensionVersion: req?.body?.extensionVersion,
    });

    res.status(400).json({ message: error?.message });
    res.end("");
  }
};

const getLatestUnlikedPostsController = async (req, res, next) => {
  try {
    const {
      accountId,
      userId,
      noOfPostsToFetch = 2,
      extensionVersion,
    } = req.body;
    const delayInMinutes = 60 * 1000;

    if (!accountId || !userId) {
      throw new Error("Account & userId are required");
    }

    const postsToLike = await getLatestUnlikedPosts(
      accountId,
      userId,
      noOfPostsToFetch
    );
    if (!postsToLike?.posts) {
      throw new Error("Post to like not found");
    }

    logGracefulMessage({
      status: "Success",
      message: `Posts fetched successfully`,
      method: `getLatestUnlikedPostsController`,
      userId: `${userId}`,
      accountId: `${accountId}`,
      payload: req?.body,
      response: postsToLike,
      extensionVersion,
    });

    const dataToReturn = postsToLike?.posts?.map((item, idx) => {
      return {
        post: { ...postsToLike?.account?._doc, ...item?._doc, userId },
        delay: delayInMinutes * idx,
      };
    });

    res.status(200).json({
      success: true,
      message: "Posts fetched successfully",
      data: dataToReturn,
    });
  } catch (error) {
    Sentry.captureException(error);

    logGracefulMessage({
      status: "Error",
      message: `${error.message}`,
      method: `getLatestUnlikedPostsController`,
      userId: `${req?.body?.userId}`,
      accountId: `${req?.body?.accountId}`,
      payload: req?.body,
      response: error,
      extensionVersion: req?.body?.extensionVersion,
    });

    res.status(400).json({ message: error?.message });
    res.end("");
  }
};

// -
const getLatestUnlikedPostsWithUserIdController = async (req, res, next) => {
  try {
    const { userId, noOfPostsToFetch = 6, extensionVersion } = req.body;
    const delayInMinutes = 60 * 1000;

    if (!userId) {
      throw new Error("userId are required");
    }

    const postsToLike = await getLatestUnlikedPostsWithUserId(
      userId,
      noOfPostsToFetch
    );

    if (!postsToLike?.posts) {
      throw new Error("Post to like not found");
    }

    logGracefulMessage({
      status: "Success",
      message: `Posts fetched successfully`,
      method: `getLatestUnlikedPostsWithUserIdController`,
      userId: `${userId}`,
      accountId: ``,
      payload: req?.body,
      response: postsToLike,
      extensionVersion,
    });

    const dataToReturn = postsToLike?.posts?.map((item, idx) => {
      return {
        post: { ...item?._doc, userId },
        delay: delayInMinutes * idx,
      };
    });

    res.status(200).json({
      success: true,
      message: "Posts fetched successfully",
      data: {
        posts: dataToReturn,
        likeLimitExceeded: postsToLike?.likeLimitExceeded || false,
      },
    });
  } catch (error) {
    Sentry.captureException(error);

    logGracefulMessage({
      status: "Error",
      message: `${error.message}`,
      method: `getLatestUnlikedPostsWithUserIdController`,
      userId: `${req?.body?.userId}`,
      accountId: `${req?.body?.accountId}`,
      payload: req?.body,
      response: error,
      extensionVersion: req?.body?.extensionVersion,
    });

    res.status(400).json({ message: error?.message });
    res.end("");
  }
};

const getLatestAutoLikeUnlikedPostsWithUserIdController = async (req, res, next) => {
  try {
    const { userId, noOfPostsToFetch = 6, extensionVersion } = req.body;
    const delayInMinutes = 60 * 1000;

    if (!userId) {
      throw new Error("userId are required");
    }

    const postsToLike = await getLatestPostWithAutolike(
      userId,
      noOfPostsToFetch
    );

    if (!postsToLike?.posts) {
      throw new Error("Post to like not found");
    }

    logGracefulMessage({
      status: "Success",
      message: `Posts fetched successfully`,
      method: `getLatestUnlikedPostsWithUserIdController`,
      userId: `${userId}`,
      accountId: ``,
      payload: req?.body,
      response: postsToLike,
      extensionVersion,
    });

    const dataToReturn = postsToLike?.posts?.map((item, idx) => {
      return {
        post: { ...item?._doc, userId },
        delay: delayInMinutes * idx,
      };
    });

    res.status(200).json({
      success: true,
      message: "Posts fetched successfully",
      data: {
        posts: dataToReturn,
        likeLimitExceeded: postsToLike?.likeLimitExceeded || false,
      },
    });
  } catch (error) {
    Sentry.captureException(error);

    logGracefulMessage({
      status: "Error",
      message: `${error.message}`,
      method: `getLatestUnlikedPostsWithUserIdController`,
      userId: `${req?.body?.userId}`,
      accountId: `${req?.body?.accountId}`,
      payload: req?.body,
      response: error,
      extensionVersion: req?.body?.extensionVersion,
    });

    res.status(400).json({ message: error?.message });
    res.end("");
  }
};

// -
const getPostFeedController = async (req, res, next) => {
  try {
    const { accountId, userId, extensionVersion } = req.body;

    if (!accountId || !userId) {
      res.status(400).json({ message: "Accountid and userId is required" });
      res.end("");
      return;
    }

    const postFeedData = await getPostFeed(accountId, userId);
    if (!postFeedData?.feed) {
      res.status(400).json({ message: "Feed not found" });
      res.end("");
      return;
    }

    logGracefulMessage({
      status: "Success",
      message: `Feed fetched successfully`,
      method: `getPostFeedController`,
      userId: `${userId}`,
      accountId: ``,
      extensionVersion: `${extensionVersion}`,
    });

    res.status(200).json({
      success: true,
      message: "Feed fetched successfully",
      data: { ...postFeedData },
    });
  } catch (error) {
    Sentry.captureException(error);

    logGracefulMessage({
      status: "Error",
      message: `${error.message}`,
      method: `getPostFeedController`,
      userId: `${req?.body?.userId}`,
      accountId: ``,
      extensionVersion: `${req?.body?.extensionVersion}`,
    });

    res.status(400).json({ message: error?.message });
    res.end("");
  }
};

const prePostAlignController = async (req, res, next) => {
  const { accountId, userId, extensionVersion } = req.body;
  try {
    if (!accountId) {
      throw new Error("Accountid is required");
    }

    if (!userId) {
      throw new Error("userId is required");
    }

    const alignPermission = await prePostAlignMultipleCompanies(
      accountId,
      userId
    );

    if (
      !alignPermission?.success &&
      alignPermission?.message?.includes("but they are already aligned")
    ) {
      logGracefulMessage({
        status: "Success",
        message: `${alignPermission?.message}`,
        method: `prePostAlignController`,
        userId: `${userId}`,
        accountId: `${accountId}`,
        extensionVersion,
      });

      res.status(200).json({ message: alignPermission?.message });
      return res.end("");
    }
    // - if its due to some other reason
    else if (!alignPermission?.success) {
      res.status(400).json({ ...alignPermission });
      return res.end("");
    }

    logGracefulMessage({
      status: "Success",
      message: `${alignPermission?.message}`,
      method: `prePostAlignController`,
      userId: `${userId}`,
      accountId: `${accountId}`,
      extensionVersion,
    });

    res.status(200).json({ ...alignPermission });
    res.end();
    return 0;
  } catch (error) {
    Sentry.captureException(error);

    logGracefulMessage({
      status: "Error",
      message: `${error.message}`,
      method: `prePostAlignController`,
      userId: `${userId}`,
      accountId: `${accountId}`,
      extensionVersion,
    });

    res.status(400).json({ message: error?.message });
    res.end("");
  }
};
const getLastThreeMonthsPostsController = async (req, res, next) => {
  const { accountId, userId, extensionVersion } = req.body;
  try {
    if (!accountId) {
      throw new Error("Accountid is required");
    }

    if (!userId) {
      throw new Error("userId is required");
    }

    const thisMonthsPostsRes = await getLastThreeMonthsPosts(accountId);

    logGracefulMessage({
      status: "Success",
      message: `${thisMonthsPostsRes?.message}`,
      method: `getLastThreeMonthsPostsController`,
      userId: `${userId}`,
      accountId: `${accountId}`,
      extensionVersion,
    });

    res.status(200).json({ ...thisMonthsPostsRes });
    res.end();
    return 0;
  } catch (error) {
    Sentry.captureException(error);

    logGracefulMessage({
      status: "Error",
      message: `${error.message}`,
      method: `getLastThreeMonthsPostsController`,
      userId: `${userId}`,
      accountId: `${accountId}`,
      extensionVersion,
    });

    res.status(400).json({ message: error?.message });
    res.end("");
  }
};


const prePostUserCrmSyncController = async (req, res, next) => {
  const { userId } = req.params;
  try {
    
    if (!userId) {
      throw new Error("userId is required");
    }

    const thisMonthsPostsRes = await alignUsersLikesAndAccountCrmIdData(userId , false)

    logGracefulMessage({
      status: "Success",
      message: `${thisMonthsPostsRes?.message}`,
      method: `getLastThreeMonthsPostsController`,
      userId: `${userId}`,
      accountId: `${accountId}`,
      extensionVersion,
    });

    res.status(200).json({ ...thisMonthsPostsRes });
    res.end();
    return 0;
  } catch (error) {
    Sentry.captureException(error);

    logGracefulMessage({
      status: "Error",
      message: `${error.message}`,
      method: `prePostUserCrmSyncController`,
      userId: `${userId}`,
      accountId: `${accountId}`,
      extensionVersion,
    });

    res.status(400).json({ message: error?.message });
    res.end("");
  }
};

const addHistoricalPostsController = async (req, res, next) => {
  const { userId, extensionVersion, postIds } = req.body;
  try {
    if (!userId) {
      throw new Error("userId is required");
    }

    const curUser = await Users.findById(userId);

    if (!curUser?._id) {
      throw new Error("User not valid");
    }

    const accountId = curUser?.companies?.find((c) => c?.isPrimary)?.companyId;

    const addedHistoricalPostRes = await addHistoricalPosts(
      postIds,
      userId,
      accountId
    );

    logGracefulMessage({
      status: "Success",
      message: `${addedHistoricalPostRes?.message}`,
      method: `addHistoricalPostsController`,
      userId: `${userId}`,
      accountId: `${accountId}`,
      extensionVersion,
    });

    res.status(200).json({ ...addedHistoricalPostRes });
    res.end();
    return 0;
  } catch (error) {
    Sentry.captureException(error);

    logGracefulMessage({
      status: "Error",
      message: `${error.message}`,
      method: `addHistoricalPostsController`,
      userId: `${userId}`,
      accountId: ``,
      extensionVersion,
    });

    res.status(400).json({ message: error?.message });
    res.end("");
  }
};

const resetLikesAndPostsCountToZeroController = async (req, res, next) => {
  try {
    const resetPostLikeCount = resetLikesAndPostsCountToZero();

    logGracefulMessage({
      status: "Success",
      message: `Sync started for post and like stuff`,
      method: `resetLikesAndPostsCountToZeroController`,
    });

    res.status(200).json({ ...resetPostLikeCount });
    res.end();
    return 0;
  } catch (error) {
    Sentry.captureException(error);

    logGracefulMessage({
      status: "Error",
      message: `${error.message}`,
      method: `resetLikesAndPostsCountToZeroController`,
    });

    res.status(400).json({ message: error?.message });
    res.end("");
  }
};

const removeDuplicatePostsWithSameUrlController = async (req, res, next) => {
  try {
    const resetPostLikeCount = removeDuplicatePostsWithSameUrl();

    logGracefulMessage({
      status: "Success",
      message: `removeDuplicatePostsWithSameUrl started`,
      method: `removeDuplicatePostsWithSameUrlController`,
    });

    res
      .status(200)
      .json({ success: true, message: `Started removing duplicate posts` });
    res.end();
    return 0;
  } catch (error) {
    Sentry.captureException(error);

    logGracefulMessage({
      status: "Error",
      message: `${error.message}`,
      method: `removeDuplicatePostsWithSameUrlController`,
    });

    res.status(400).json({ message: error?.message });
    res.end("");
  }
};
const checkPostStatus = async (req, res, next) => {
  try {
    const { postLink, accountId } = req.body;
    const postData = await Posts.findOne({ postUrl: postLink, accountId: accountId})
    logGracefulMessage({
      status: "Success",
      message: `Post status fetched successfully`,
      method: "getPostStatusController"
    });

    res
      .status(200)
      .json({ success: true, postData});
    res.end();
    return 0;
  } catch (error) {
    Sentry.captureException(error);

    logGracefulMessage({
      status: "Error",
      message: `${error.message}`,
      method: `getPostStatusController`,
    });

    res.status(400).json({ message: error?.message });
    res.end("");
  }
};

export {
  compareAndAddPostsController,
  compareAndAddProspectPostsController,
  getLatestUnlikedPostsController,
  getPostFeedController,
  prePostAlignController,
  listAllDuplicatePosts,
  getPostsWhoseAalyticsToUpdateController,
  updatePostAnalyticsController,
  getLastThreeMonthsPostsController,
  addHistoricalPostsController,
  getLatestUnlikedPostsWithUserIdController,
  resetLikesAndPostsCountToZeroController,
  removeDuplicatePostsWithSameUrlController,
  prePostUserCrmSyncController,
  checkPostStatus,
  getLatestAutoLikeUnlikedPostsWithUserIdController
};
