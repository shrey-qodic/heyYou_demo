import * as dotenv from "dotenv";
import axios from "axios";
import Posts from "../mongodb/models/Posts.js";
import Accounts from "../mongodb/models/Accounts.js";
import { idGeneratorHelper } from "../utils/helpers.js";
import Likes from "../mongodb/models/Likes.js";
import { mixpanelTrack } from "../utils/mixpanel.js";
import logGracefulMessage from "../utils/logGracefulMessage.js";
import Users from "../mongodb/models/Users.js";
import {
  addOrUpdateContactInCRM,
  updateAccountInfo,
  updateUserCrmsCustomFields,
} from "../utils/zoho/zohoServices.js";
dotenv.config();

// - Add like
const addLike = async (likeToAdd) => {
  const prevLike = await Likes.findOne({
    userId: likeToAdd?.userId,
    postId: likeToAdd?.postId,
  });

  if (prevLike && prevLike?._id) {
    logGracefulMessage({
      status: "Success",
      method: "addLike",
      accountId: "",
      userId: likeToAdd?.userId || "",
      message: "This like is already added in DB",
    });
    return prevLike;
  }

  const likeToCreate = {
    _id: idGeneratorHelper("like"),
    ...likeToAdd,
  };

  const foundPost = await Posts.findOne({ _id: likeToAdd?.postId });
  let curAcc = null;

  if (!foundPost?._id?.includes("prospect_")) {
    curAcc = await Accounts.findById(foundPost?.accountId).lean();
  }

  // mixpanelTrack(
  //   `${likeToCreate?.likeType || "user"}-like`,
  //   likeToAdd?.userId || "",
  //   likeToAdd
  // );

  const curUser = await Users.findById(likeToAdd?.userId);

  // Assuming curUser.thisMonthsDailyLikesDate is a date string in ISO format or a Date object
  const curMonth = new Date();
  const currentMonth = curMonth.getMonth(); // 0 (January) through 11 (December)
  const currentYear = curMonth.getFullYear();

  // Parse lastLikeMonth from curUser.thisMonthsDailyLikesDate
  const lastLikeMonth = new Date(curUser.thisMonthsDailyLikesDate);
  const lastMonth = lastLikeMonth.getMonth(); // 0 (January) through 11 (December)
  const lastYear = lastLikeMonth.getFullYear();

  // Compare the current month and year with those from lastLikeMonth
  const isSameMonthYear =
    currentMonth === lastMonth && currentYear === lastYear;

  let recordToUpdate = {};

  if (isSameMonthYear) {
    recordToUpdate = {
      thisMonthsDailyLikes: (curUser?.thisMonthsDailyLikes || 0) + 1,
      totalLikes: (curUser?.totalLikes || 0) + 1,
    };
  } else {
    recordToUpdate = {
      thisMonthsDailyLikes: 1,
      totalLikes: (curUser?.totalLikes || 0) + 1,
    };
  }

  const like = await Likes.create(likeToCreate);
  let SYNC_LIKE_RES = {};

  if (like?.likeType) {
    await Users.findByIdAndUpdate(likeToAdd?.userId, {
      lastFrontLikeDate: new Date(),
      ...recordToUpdate,
      thisMonthsDailyLikesDate: new Date(),
    });

    // here user record is already updated, will only update in CRM as I am passing isGeneratedBy to true
    SYNC_LIKE_RES = await syncLikesOnAccountLevel(
      curAcc?._id,
      curUser?._id,
      true
    );
  }

  return { ...like, otherUsers: SYNC_LIKE_RES?.data?.otherUsers || [] };
};

const syncLikesInsights = async (userId) => {
  try {
    const currentUser = await Users.findById(userId);

    if (currentUser?.role !== "Admin") {
      throw new Error(`Request not valid for user ${userId}`);
    }

    const lastLikeSyncDate = new Date(currentUser?.lastLikeInsightsSyncDate);
    const currentDate = new Date();

    const thisMonthName = currentDate.toLocaleString("en-US", {
      month: "long",
    });

    const lastLikeYear = lastLikeSyncDate.getFullYear();

    const tempDat = new Date();
    // Set the date to the first day of the current month
    tempDat.setDate(1);

    // Move to the previous month by subtracting 1 from the current month
    tempDat.setMonth(tempDat.getMonth() - 1);
    const lastLikeMonth = tempDat.toLocaleString("en-US", {
      month: "long",
    });
    // const lastLikeMonth = lastLikeSyncDate.getMonth();

    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth();

    const startOfMonth = new Date(currentYear, currentMonth, 1);
    const endOfMonth = new Date(currentYear, currentMonth + 1, 0);
    //
    const startOfLastMonth = new Date(currentYear, currentMonth - 1, 1);
    const endOfLastMonth = new Date(currentYear, currentMonth - 1 + 1, 0);

    const isBeforeCurrentMonth =
      lastLikeYear < currentYear ||
      (lastLikeYear === currentYear && lastLikeMonth < currentMonth);

    if (!isBeforeCurrentMonth && currentUser?.lastLikeInsightsSyncDate) {
      // - commenting this part for testing purposes
      // throw new Error(`This months likes record is already synced`);
    }

    // here we won't need to check for year becasue the timestamp of 2024 > 2001 etc
    const thisMonthLikesSnap = await Likes.find({
      userId,
      createdAt: { $gte: startOfMonth, $lt: endOfMonth },
    });

    const lastMonthsLikesSnap = await Likes.find({
      userId,
      createdAt: { $gte: startOfLastMonth, $lt: endOfLastMonth },
    });

    const thisMonthLikes = thisMonthLikesSnap?.length || 0;
    // const lastMonthLikes = currentUser?.thisMonthLikes || 0;
    const lastMonthLikes = lastMonthsLikesSnap?.length || 0;
    const mainDevider = thisMonthLikes < 1 ? 1 : thisMonthLikes;

    const userUpdates = {
      thisMonthLikes,
      lastMonthLikes,
      thisMonthName,
      lastMonthName: lastLikeMonth,
      // lastMonthName: currentUser?.thisMonthName,
      percentageChange: `${Math.round(
        ((thisMonthLikes - lastMonthLikes) / mainDevider) * 100
      )}`,
      lastLikeInsightsSyncDate: currentDate,
    };

    // TODO: Update users CRM  with the above things
    if (currentUser?.crmId) {
      //
      const crmUpdateRes = await updateUserCrmsCustomFields(
        currentUser?.crmId,
        userUpdates
      );

      if (!crmUpdateRes?.success) {
        throw crmUpdateRes;
      }
    }

    // Update user with the latest like insights
    const updatedUser = await Users.findByIdAndUpdate(
      currentUser?._id,
      userUpdates
    );

    logGracefulMessage({
      status: "Success",
      method: "syncLikesInsights",
      accountId: `${updatedUser?.accountId}`,
      userId: `${updatedUser?._id}`,
      message: "Updated user with the latest like insights",
    });

    return {
      success: true,
      message: `Updated user with the latest like insights`,
      user: updatedUser,
    };
  } catch (error) {
    logGracefulMessage({
      status: "Error",
      method: "syncLikesInsights",
      accountId: ``,
      userId: `${userId}`,
      message: `${error?.message}`,
    });
    return {
      success: false,
      message: `${error?.message}`,
      user: error,
    };
  }
};

const syncLikesOnAccountLevel = async (
  accountId,
  userId,
  isGeneratedByUser = false
) => {
  try {
    if (!userId) {
      throw new Error(`Provide correct form data!`);
    }
    const curUser = await Users.findById(userId).lean();
    const curAccount = await Accounts.findOne({ _id: accountId });
    const today = new Date();
    const curStartMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    if (!curAccount?._id) {
      throw new Error(`Request not valid for user ${accountId}`);
    }

    const postsForCurCompanyAgg = await Posts.aggregate([
      {
        $match: {
          accountId: curAccount?._id,
        },
      },

      {
        $lookup: {
          from: "likes",
          localField: "_id", // Post ID
          foreignField: "postId", // Likes referencing post ID
          as: "likes",
        },
      },

      {
        $unwind: {
          path: "$likes",
          preserveNullAndEmptyArrays: true, // Keeps posts without likes
        },
      },

      {
        $group: {
          _id: null,
          totalLikesCount: {
            $sum: { $cond: ["$likes", 1, 0] },
          },
          currentMonthLikesCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    {
                      $gte: ["$likes.createdAt", curStartMonth.getTime()],
                    },
                    {
                      $lte: ["$likes.createdAt", today.getTime()],
                    },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },

      {
        $project: {
          _id: 0,
          totalLikesCount: 1,
          currentMonthLikesCount: 1,
        },
      },
    ]);

    //////////////////////////////////////////////////////////////////////////

    const accountLevelPostData = await Posts.aggregate([
      {
        $match: {
          accountId: curAccount?._id,
        },
      },

      {
        $facet: {
          totalPosts: [{ $count: "count" }],
          monthlyPosts: [
            {
              $match: {
                createdAt: {
                  $gte: curStartMonth,
                  $lt: today,
                },
              },
            },
            { $count: "count" }, // Counts posts for the specified month
          ],
        },
      },

      {
        $project: {
          totalPosts: {
            $ifNull: [
              {
                $arrayElemAt: ["$totalPosts.count", 0],
              },
              0,
            ],
          },
          currentMonthPosts: {
            $ifNull: [
              {
                $arrayElemAt: ["$monthlyPosts.count", 0],
              },
              0,
            ],
          },
        },
      },
    ]);

    if (isGeneratedByUser) {
      const updatedAcc = await Accounts.findByIdAndUpdate(
        curAccount?._id,
        {
          totalLikes: postsForCurCompanyAgg[0]?.totalLikesCount * 1 || 0,
          totalLikesForThisMonth:
            postsForCurCompanyAgg[0]?.currentMonthLikesCount * 1 || 0,
          totalPosts: accountLevelPostData[0]?.totalPosts * 1 || 0,
          currentMonthPosts:
            accountLevelPostData[0]?.currentMonthPosts * 1 || 0,
        },
        { new: true }
      ).lean();

      await updateAccountInfo(updatedAcc);
    }

    const curAccUsers = await Users.find({
      companies: {
        $elemMatch: {
          companyId: curAccount?._id,
        },
      },
    }).lean();

    const otherUsers = curAccUsers?.filter((usr) => usr._id !== curUser._id);

    if (isGeneratedByUser) {
      await addOrUpdateContactInCRM(curUser, false);

      return {
        success: true,
        message: `Synced data for account level likes`,
        data: {
          accountId: curAccount?._id,
          otherUsers,
        },
      };
    }

    const updatedUser = await Users.findByIdAndUpdate(
      curUser._id,
      {
        lifetimeLikesAccountLevel:
          postsForCurCompanyAgg[0]?.totalLikesCount * 1 || 0,
        currentMonthLikesAccountLevel:
          postsForCurCompanyAgg[0]?.currentMonthLikesCount * 1 || 0,
      },
      { new: true }
    ).lean();

    await addOrUpdateContactInCRM(updatedUser, false);

    logGracefulMessage({
      status: "Success",
      method: "syncLikesOnAccountLevel",
      accountId: `${accountId}`,
      userId: ``,
      message: "Synced data for account level likes",
    });

    return {
      success: true,
      message: `Synced data for account level likes`,
      data: {
        accountId: curAccount?._id,
        otherUsers,
      },
    };
  } catch (error) {
    logGracefulMessage({
      status: "Error",
      method: "syncLikesOnAccountLevel",
      accountId: `${accountId}`,
      userId: ``,
      message: `${error?.message}`,
    });
    return {
      success: false,
      message: `${error?.message}`,
      data: error,
    };
  }
};

const syncLikesForAllAccounts = async () => {
  try {
    const allAccounts = await Accounts.find({
      crmId: { $ne: null, $exists: true },
    }).lean();

    // for (const acc of allAccounts) {
    //   await syncLikesOnAccountLevel(acc?._id);
    // }

    logGracefulMessage({
      status: "Success",
      method: "syncLikesForAllAccounts",
      accountId: ``,
      userId: ``,
      message: "Synced data for account level likes",
    });

    return {
      success: true,
      message: `Synced data for account level likes`,
      data: {},
    };
  } catch (error) {
    logGracefulMessage({
      status: "Error",
      method: "syncLikesForAllAccounts",
      accountId: ``,
      userId: ``,
      message: `${error?.message}`,
    });
    return {
      success: false,
      message: `${error?.message}`,
      data: error,
    };
  }
};

const syncLikesForAllUsersAndAccounts = async () => {
  try {
    const allUsers = await Users.find({
      crmId: { $ne: null, $exists: true },
    }).lean();

    const today = new Date();
    const curStartMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    for (const curUser of allUsers) {
      //
      // Assuming curUser.thisMonthsDailyLikesDate is a date string in ISO format or a Date object
      const curMonth = new Date();
      const currentMonth = curMonth.getMonth(); // 0 (January) through 11 (December)
      const currentYear = curMonth.getFullYear();

      // Parse lastLikeMonth from curUser.thisMonthsDailyLikesDate
      const lastLikeMonth = new Date(curUser.thisMonthsDailyLikesDate);
      const lastMonth = lastLikeMonth.getMonth(); // 0 (January) through 11 (December)
      const lastYear = lastLikeMonth.getFullYear();

      // Compare the current month and year with those from lastLikeMonth
      const isSameMonthYear =
        currentMonth === lastMonth && currentYear === lastYear;

      const curUsersPrimAcc = curUser?.companies?.find((cmp) => cmp?.isPrimary);

      const AGGREGATE_STAGES = [
        {
          $match: {
            accountId: curUsersPrimAcc?.companyId, // Filter posts by accountId
          },
        },
        {
          $lookup: {
            from: "likes", // Join with likes collection
            localField: "_id", // Post ID
            foreignField: "postId", // Likes referencing post ID
            as: "likes", // Alias for the joined array
          },
        },
        {
          $match: {
            "likes.userId": "usr_a31247b21cd3", // Filter likes by userId
          },
        },
        {
          $group: {
            _id: null, // Group all documents into one (aggregated result)
            totalLikesCount: {
              $sum: {
                $cond: [
                  { $gt: [{ $size: "$likes" }, 0] }, // If the post has likes
                  1, // Add 1 for each post with likes
                  0, // Otherwise, add 0
                ],
              },
            },
            currentMonthLikesCount: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      {
                        $gte: ["$likes.createdAt", curStartMonth.getTime()],
                      }, // Timestamp check
                      {
                        $lte: ["$likes.createdAt", today.getTime()],
                      }, // Timestamp check
                    ],
                  },
                  1, // Add 1 for each like in the current month
                  0, // Otherwise, add 0
                ],
              },
            },
          },
        },
        {
          $project: {
            _id: 0, // Exclude the _id field from the final result
            totalLikesCount: 1, // Include totalLikesCount
            currentMonthLikesCount: 1, // Include currentMonthLikesCount
          },
        },
      ];

      const curUserPostsLikesAgg = await Posts.aggregate(AGGREGATE_STAGES);

      const updatedUser = await Users.findByIdAndUpdate(
        curUser?._id,
        {
          thisMonthsDailyLikes:
            (curUserPostsLikesAgg[0]?.currentMonthLikesCount || 0) * 1,
          totalLikes: (curUserPostsLikesAgg[0]?.totalLikesCount || 0) * 1,
          thisMonthsDailyLikesDate: new Date(),
        },
        { new: true }
      );

      await addOrUpdateContactInCRM(updatedUser, false);
    }

    await syncLikesForAllAccounts();

    logGracefulMessage({
      status: "Success",
      method: "syncLikesForAllUsersAndAccounts",
      accountId: ``,
      userId: ``,
      message: "Synced data for account & userlevel likes",
    });

    return {
      success: true,
      message: `Synced data for account & user level likes`,
      data: {},
    };
  } catch (error) {
    logGracefulMessage({
      status: "Error",
      method: "syncLikesForAllUsersAndAccounts",
      accountId: ``,
      userId: ``,
      message: `${error?.message}`,
    });
    return {
      success: false,
      message: `${error?.message}`,
      data: error,
    };
  }
};

//
export {
  addLike,
  syncLikesInsights,
  syncLikesOnAccountLevel,
  syncLikesForAllAccounts,
  syncLikesForAllUsersAndAccounts,
};
