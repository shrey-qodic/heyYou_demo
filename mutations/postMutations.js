import * as dotenv from "dotenv";
import axios from "axios";
import Posts from "../mongodb/models/Posts.js";
import Accounts from "../mongodb/models/Accounts.js";
import { idGeneratorHelper } from "../utils/helpers.js";
import Likes from "../mongodb/models/Likes.js";
import { handleAutoLikeForNewPost } from "../queue/handleAutoLike.js";
import { mixpanelTrack } from "../utils/mixpanel.js";
import Users from "../mongodb/models/Users.js";
import logGracefulMessage from "../utils/logGracefulMessage.js";
import { upsertUiTemplate } from "./uitemplatesMutations.js";
import UserAccounts from "../mongodb/models/UserAccounts.js";
import HistoricalPosts from "../mongodb/models/HistoricalPosts.js";
import {
  addOrUpdateContactInCRM,
  createAccountInCRM,
  getAccountIdByName,
  updateAccountInfo,
  updateNoOfAccInCrm,
} from "../utils/zoho/zohoServices.js";
import Invites from "../mongodb/models/Invites.js";
import { syncLikesOnAccountLevel } from "./likeMutatiions.js";
import moment from "moment";
import { StatusConstant } from "../utils/constants.js";
dotenv.config();

const LINKED_IN_POST_ANALYTIC_URL = `https://www.linkedin.com/company/%COMPANY_ID%/admin/post-analytics/urn:li:activity:%POST_URL_ID%`;
const LINKED_IN_POST_PUBLISH_ANALYTIC_URL = `https://www.linkedin.com/company/%COMPANY_ID%/admin/analytics/updates/`;

// - Compare and add posts
const compareAndAddPosts = async (
  newPosts = [],
  accountId,
  userId,
  companySize,
  region,
  isPostPage
) => {

  // Get old posts, sorted by createdAt in descending order
  const oldPosts = await Posts.find({ accountId }).sort({ createdAt: -1 });

  await Accounts.updateOne(
    { _id: accountId },
    { lastPostAlignedAt: new Date() }
  );

  const currentUser = await Users.findOne({ _id: userId }).lean();

  if (!currentUser || !currentUser?._id) {
    throw new Error("User doens't exist so can't add posts in DB");
  }         

  const prevAccount = await Accounts.findOne({
    _id: accountId || currentUser?.accountId,
  });

  // Is currentuser admin
  const isCurUsereAdmin = currentUser?.role === "Admin";

  if (companySize && region && prevAccount?._id && !prevAccount?.companySize) {
    await Accounts.updateOne(
      { _id: prevAccount?._id },
      { $set: { companySize, region } }
    );
  }

  // Identify new posts to be inserted
  const postUrlsInOldPosts = new Set(oldPosts.map((post) => post.postUrl));
  if (isCurUsereAdmin) {
    // If user is admin then check & update post analytics ,
    const postUrlsInNewPosts = new Set(newPosts.map((post) => post.url));
    const postsThatAreAlreadyInDB = oldPosts.filter((post) =>
      postUrlsInNewPosts.has(post.postUrl)
    );
    // If post in db doesn't have impressions that means
    // analytics aren't scrapped for
    // here we get the posts that doesn't have analytics and will update them
    // const postThatNeedToBeUpdated = postsThatAreAlreadyInDB?.filter(
    //   (post) => !post?.impressions
    // );
    const postThatNeedToBeUpdated = [...postsThatAreAlreadyInDB];

    // - Update analytics
    const updatedPosts = await Posts.bulkWrite(
      postThatNeedToBeUpdated.map((post) => {
        const matchingNewPost = newPosts.find(
          (newPost) => newPost.postUrl === post.url
        );

        return {
          updateOne: {
            filter: { _id: post._id },
            update: {
              $set: {
                impressions: matchingNewPost?.impressions || 0,
                postTotalLikes: matchingNewPost?.postTotalLikes
                  ? Math.max(
                      Number(
                        matchingNewPost?.postTotalLikes?.replaceAll(",", "")
                      ),
                      0
                    ) || 0
                  : 0,
                reactions: matchingNewPost?.reactions || 0,
                comments: matchingNewPost?.comments || 0,
                reposts: matchingNewPost?.reposts || 0,
              },
            },
          },
        };
      })
    );
  }

  if(isPostPage && newPosts.length ){
    const firstPost = newPosts[0]
    const postData = await Posts.findOne({postUrl : firstPost.url, accountId:accountId, userId: userId  })
    if(postData){
      const data = await updatePostStatuses(firstPost, accountId)
      return {
        createdPosts : data,
        otherUsers: [],
      }
    }
  }

  const postsThatAreAlreadyInDb = oldPosts.filter((post) => {
    return newPosts?.some((newPost) => newPost?.url === post?.postUrl);
  });

  const newPostsToEnterSnap = newPosts.filter(
    (newPost) => !postUrlsInOldPosts.has(newPost.url)
  );

  let newPostsToEnter = [];

  if (oldPosts?.length < 1) {
    newPostsToEnter = newPostsToEnterSnap;
  }
  // - otherwise check for user creation and a buffer
  else {
    newPostsToEnter = newPostsToEnterSnap;
    // commenting out below code for testing purposes
    // newPostsToEnter = newPostsToEnterSnap.filter((post) => {
    //   const postCreationDate = new Date(
    //     post?.linkedInCreatedAt || post?.createdAt
    //   );
    //   const userCreationDate = new Date(currentUser?.createdAt);

    //   // Calculate the difference in milliseconds
    //   const timeDifference = postCreationDate - userCreationDate;

    //   // Convert the time difference to days
    //   const daysDifference = timeDifference / (24 * 60 * 60 * 1000);

    //   // Filter posts that are 3 days old or newer
    //   return daysDifference <= 3;
    // });
  }

  // Prepare the new post documents
  const finalPostUrls = newPostsToEnter.map((item) => ({
    _id: idGeneratorHelper("post"),
    createdAt: new Date(),
    postUrl: item.url,
    postTitle: item?.postTitle,
    postImage: item?.postImage,
    autoLikeStatus: item?.status || 0,
    postTotalLikes: item?.postTotalLikes
      ? Math.max(Number(item?.postTotalLikes?.replaceAll(",", "")), 0) || 0
      : 0,
    accountId: accountId,
    userId: userId,
    liked: item?.liked,
    likeType: item?.likeType,
    impressions: item?.impressions,
    reactions: item?.reactions,
    comments: item?.comments,
    reposts: item?.reposts,
    linkedInCreatedAt: item?.linkedInCreatedAt,
    postHashtags: item?.postHashtags,
    postMentions: item?.postMentions,
  }));

  // Insert the new posts
  const createdPosts = await Posts.insertMany(finalPostUrls);

  const totalAddedPosts = finalPostUrls?.length || 0;

  if (totalAddedPosts === 0) {
    // Assuming curUser.thisMonthsDailyLikesDate is a date string in ISO format or a Date object
    const curMonth = new Date();
    const currentMonth = curMonth.getMonth(); // 0 (January) through 11 (December)
    const currentYear = curMonth.getFullYear();

    // Parse lastLikeMonth from curUser.thisMonthsDailyLikesDate
    const postMonth = new Date(prevAccount?.thisMonthsDailyAddedPosts);
    const lastMonth = postMonth.getMonth(); // 0 (January) through 11 (December)
    const lastYear = postMonth.getFullYear();

    // Compare the current month and year with those from lastLikeMonth
    const isSameMonthYear =
      currentMonth === lastMonth && currentYear === lastYear;

    let recordToUpdate = {};

    if (isSameMonthYear) {
      recordToUpdate = {
        currentMonthPosts:
          (prevAccount?.currentMonthPosts || 0) + totalAddedPosts,
        totalPosts: (prevAccount?.totalPosts || 0) + totalAddedPosts,
      };
    } else {
      recordToUpdate = {
        currentMonthPosts: totalAddedPosts,
        totalPosts: (prevAccount?.totalPosts || 0) + totalAddedPosts,
      };
    }

    const curAccUpdate = await Accounts.findByIdAndUpdate(
      accountId,
      {
        ...recordToUpdate,
        thisMonthsDailyAddedPosts: new Date(),
      },
      { new: true }
    ).lean();

    await updateAccountInfo(curAccUpdate);
  }

  const updatedAccount = await Accounts.findOneAndUpdate(
    { _id: accountId },
    { lastPostAlignedAt: new Date() }
  );

  // -----------------------------------------------------
  // Get old likes by user
  const oldLikesByUser = await Likes.find({ userId });

  const postsThatNeedToBeLiked = finalPostUrls
    .filter((post) => post?.liked)
    .filter((checkPost) => {
      return !oldLikesByUser.some((like) => like.postId === checkPost._id);
    });

  const postLikedByUserAlready = [...postsThatNeedToBeLiked].map((item) => {
    // mixpanelTrack(`${item?.likeType || "user"}-like`, userId, {
    //   Post: item._id,
    // });
    return {
      _id: idGeneratorHelper("like"),
      userId,
      postId: item._id,
      autoLikeTimestamp: new Date(),
      likeType: item?.likeType || "user",
      createdAt: new Date(),
    };
  });

  const createdLikes = await Likes.insertMany(postLikedByUserAlready);

  // Assuming curUser.thisMonthsDailyLikesDate is a date string in ISO format or a Date object
  const curMonth = new Date();
  const currentMonth = curMonth.getMonth(); // 0 (January) through 11 (December)
  const currentYear = curMonth.getFullYear();

  // Parse lastLikeMonth from curUser.thisMonthsDailyLikesDate
  const lastLikeMonth = new Date(currentUser.thisMonthsDailyLikesDate);
  const lastMonth = lastLikeMonth.getMonth(); // 0 (January) through 11 (December)
  const lastYear = lastLikeMonth.getFullYear();

  // Compare the current month and year with those from lastLikeMonth
  const isSameMonthYear =
    currentMonth === lastMonth && currentYear === lastYear;

  let recordToUpdate = {};

  if (isSameMonthYear) {
    recordToUpdate = {
      thisMonthsDailyLikes:
        (currentUser?.thisMonthsDailyLikes || 0) + createdLikes?.length,
      totalLikes: (currentUser?.totalLikes || 0) + createdLikes?.length,
    };
  } else {
    recordToUpdate = {
      thisMonthsDailyLikes: createdLikes?.length,
      totalLikes: (currentUser?.totalLikes || 0) + createdLikes?.length,
    };
  }

  // for (const newPost of finalPostUrls) {
  // mixpanelTrack("New Post", currentUser._id, {
  //   accountId: newPost.accountId,
  //   ...newPost,
  // });
  // }

  await Users.findByIdAndUpdate(userId, {
    lastPostsAligned: new Date(),
    ...recordToUpdate,
    thisMonthsDailyLikesDate: new Date(),
  });

  let SYNC_LIKE_RES = {};

  if (createdLikes?.length > 0) {
    SYNC_LIKE_RES = await syncLikesOnAccountLevel(
      accountId,
      currentUser?._id,
      true
    );
  }

  // return [...createdPosts, ...postsThatAreAlreadyInDb];

  return {
    createdPosts,
    otherUsers: SYNC_LIKE_RES?.data?.otherUsers || [],
  };
};

async function updatePostStatuses(postData, accountId) {
    const updatedPost = await Posts.findOneAndUpdate(
      { postUrl: postData.url, accountId: accountId },
      { autoLikeStatus: postData.status },
      { new: true }
    );
  return updatedPost;
}



const compareAndAddProspectPosts = async (
  newPosts = [],
  userId,
  prospectId
) => {
  // Get old posts, sorted by createdAt in descending order
  const oldPosts = await Posts.find({ accountId: prospectId }).sort({
    createdAt: -1,
  });

  const currentUser = await Users.findOne({ _id: userId });

  if (!currentUser || !currentUser?._id) {
    throw new Error("User doens't exist so can't add posts in DB");
  }

  // Identify new posts to be inserted
  const postUrlsInOldPosts = new Set(oldPosts.map((post) => post.postUrl));

  const newPostsToEnterSnap = newPosts.filter(
    (newPost) => !postUrlsInOldPosts.has(newPost.url)
  );

  let newPostsToEnter = newPostsToEnterSnap;

  // Prepare the new post documents
  const finalPostUrls = newPostsToEnter.map((item) => ({
    _id: idGeneratorHelper("prospect_post"),
    createdAt: new Date(),
    postUrl: item.url,
    postTitle: item?.postTitle,
    postImage: item?.postImage,
    postTotalLikes: item?.postTotalLikes
      ? Math.max(Number(item?.postTotalLikes?.replaceAll(",", "")), 0) || 0
      : 0,
    accountId: prospectId,
    liked: item?.liked,
    likeType: item?.likeType,
    linkedInCreatedAt: item?.linkedInCreatedAt,
  }));

  // Insert the new posts
  const createdPosts = await Posts.insertMany(finalPostUrls);

  // for (const newPost of finalPostUrls) {
  //   mixpanelTrack("New Post", currentUser?._id, {
  //     accountId: newPost.accountId,
  //     ...newPost,
  //   });
  // }

  const updateUserLastPostAligningVar = await Users.findByIdAndUpdate(userId, {
    lastProspectScrappedDate: new Date(),
  });

  const lastProspectAlignedUpdate = await UserAccounts.findByIdAndUpdate(
    prospectId,
    {
      lastPostAlignedAt: new Date(),
    }
  );

  return createdPosts;
};

// - Get latest two unliked posts
const getLatestUnlikedPosts = async (accountId, userId, noOfPostsToFetch) => {
  try {
    // Fetch all posts for the given account and sort by createdAt in descending order
    const allPosts = await Posts.find({ accountId, _id: /^post_/ }).sort({
      createdAt: -1,
    });
    const account = await Accounts.findById(accountId);
    const currentUser = await Users.findById(userId);

    // Fetch likes for the given user
    const likes = await Likes.find({ userId });

    // Filter out posts that have been liked by the user
    let postsThatArentLiked = allPosts.filter(
      (post) =>
        !likes.some(
          (like) => like.postId === post._id && like.likeType !== undefined
        )
    );

    const postToLikeInCaseNoPostToLikeFound = postsThatArentLiked[0];

    postsThatArentLiked = postsThatArentLiked.filter((post) => {
      const postLinkedInCreatedAt = new Date(
        post?.linkedInCreatedAt || post?.createdAt
      ).setHours(0, 0, 0, 0);

      const currentUserCreatedAt = new Date(currentUser?.createdAt).setHours(
        0,
        0,
        0,
        0
      );

      // Check if the post creation date is after the user's creation date or on the same day
      return postLinkedInCreatedAt >= currentUserCreatedAt;
    });

    // Sort unliked posts by createdAt in descending order
    // postsThatArentLiked.sort((a, b) => b.createdAt - a.createdAt);
    postsThatArentLiked.sort((a, b) => {
      // Check if linkedInCreatedAt is undefined
      if (
        a.linkedInCreatedAt === undefined &&
        b.linkedInCreatedAt === undefined
      ) {
        // If both are undefined, compare using createdAt
        return b.createdAt - a.createdAt;
      } else if (a.linkedInCreatedAt === undefined) {
        // If only a.linkedInCreatedAt is undefined, prioritize b
        return 1;
      } else if (b.linkedInCreatedAt === undefined) {
        // If only b.linkedInCreatedAt is undefined, prioritize a
        return -1;
      } else {
        // Compare using linkedInCreatedAt for both
        return b.linkedInCreatedAt - a.linkedInCreatedAt;
      }
    });

    // Log the unliked posts
    // console.log("Unliked posts are ", postsThatArentLiked);

    // Return the first two unliked posts
    let pref = postsThatArentLiked.slice(0, noOfPostsToFetch);

    // - Prospect posts like feature!
    const linkedProspects = currentUser?.linkedUsersAccountIds;
    const allProspectPosts = await Posts.find({
      accountId: { $in: linkedProspects },
      _id: /^prospect_post_/,
    }).sort({
      createdAt: -1,
    });

    let prospectPostsThatArentLiked = allProspectPosts.filter(
      (post) =>
        !likes.some(
          (like) => like.postId === post._id && like.likeType !== undefined
        )
    );

    prospectPostsThatArentLiked.sort((a, b) => {
      // Check if linkedInCreatedAt is undefined
      if (
        a.linkedInCreatedAt === undefined &&
        b.linkedInCreatedAt === undefined
      ) {
        // If both are undefined, compare using createdAt
        return b.createdAt - a.createdAt;
      } else if (a.linkedInCreatedAt === undefined) {
        // If only a.linkedInCreatedAt is undefined, prioritize b
        return 1;
      } else if (b.linkedInCreatedAt === undefined) {
        // If only b.linkedInCreatedAt is undefined, prioritize a
        return -1;
      } else {
        // Compare using linkedInCreatedAt for both
        return b.linkedInCreatedAt - a.linkedInCreatedAt;
      }
    });

    prospectPostsThatArentLiked = prospectPostsThatArentLiked.slice(0, 2);

    if (pref?.length < 1) {
      pref = [postToLikeInCaseNoPostToLikeFound];
    }

    return {
      posts: [...pref, ...prospectPostsThatArentLiked],
      account,
    };
  } catch (error) {
    // Handle errors
    throw error;
  }
};

// This is for getting posts to like from multiple companies
const getLatestUnlikedPostsWithUserId = async (
  userId,
  noOfPostsToFetch = 6
) => {
  try {
    // Get user
    const currentUser = await Users.findById(userId);

    // Get usesrs companyies
    const companiesIds = currentUser?.companies?.map((c) => c?.companyId) || [];
    const retrievedUserCompanyId = currentUser?.companies?.find(
      (cmp) => cmp.isPrimary === true
    )?.companyId;
    const retrievedUserCompany = await Accounts.findOne({
      _id: retrievedUserCompanyId,
    }).lean();
    const isPaidPlan = retrievedUserCompany?.plan === "Paid";

    /**
     * So Relation goes like this.
     * Users have a primary company
     * Companies have posts
     * User likes the posts, Likes that has postId & userId.
     *
     * So this is what I'm gonna do.
     * 1. I will aggregate on the current user match with his ID.
     * 2. Now I need to find what is his primrary company, to do that I will do project,
     *    in the project I will say primaryCompany and find the primary company by
     *    $arrayElementAt that has a filter stage where I say input is companies, name it as company and a condition
     *    with $cond now the cond will be my assumed company that has isPrimary true.😶‍🌫️
     * 3. Now I need to to find posts with this primaryCompany I extracted above. using lookup from posts table
     *    using accountId as field in posts table and primaryCompany.companyId as local field.
     * 4. Saperate each post to a new document.
     * 5. Now I Can query for all those posts documents, I will look in likes table where localField be our spread posts ID
     *    and foriegn field will be the field in likes collection that is postId.
     * 6. Now I can group them by null Id, and just count the elements in array using $size operator. size of likes that I lookedup
     * 7. Now Will project the results according to my needs. One more thing if our result array is null or empty return 0
     */

    const likeAggregationResults = await Users.aggregate([
      { $match: { _id: currentUser?._id } },
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

    if (primCompaniesTotalLikes >= 30 && !isPaidPlan) {
      return {
        likeLimitExceeded: true,
        posts: [],
      };
    }

    // Fetch likes for the given user
    const likes = await Likes.find({ userId });

    const allPosts = await Posts.find({
      accountId: { $in: companiesIds },
      _id: /^post_/,
      likeType: { $ne: "AutoLike" },
    }).sort({
      createdAt: -1,
    });

    let postsThatArentLiked = allPosts.filter(
      (post) =>
        !likes.some(
          (like) => like.postId === post._id && like.likeType !== undefined
        )
    );

    const postToLikeInCaseNoPostToLikeFound = postsThatArentLiked[0];

    postsThatArentLiked = postsThatArentLiked.filter((post) => {
      const postLinkedInCreatedAt = new Date(
        post?.linkedInCreatedAt || post?.createdAt
      ).setHours(0, 0, 0, 0);

      const currentUserCreatedAt = new Date(currentUser?.createdAt).setHours(
        0,
        0,
        0,
        0
      );

      // Check if the post creation date is after the user's creation date or on the same day
      return postLinkedInCreatedAt >= currentUserCreatedAt;
    });

    // Sort unliked posts by createdAt in descending order
    // postsThatArentLiked.sort((a, b) => b.createdAt - a.createdAt);
    postsThatArentLiked.sort((a, b) => {
      // Check if linkedInCreatedAt is undefined
      if (
        a.linkedInCreatedAt === undefined &&
        b.linkedInCreatedAt === undefined
      ) {
        // If both are undefined, compare using createdAt
        return b.createdAt - a.createdAt;
      } else if (a.linkedInCreatedAt === undefined) {
        // If only a.linkedInCreatedAt is undefined, prioritize b
        return 1;
      } else if (b.linkedInCreatedAt === undefined) {
        // If only b.linkedInCreatedAt is undefined, prioritize a
        return -1;
      } else {
        // Compare using linkedInCreatedAt for both
        return b.linkedInCreatedAt - a.linkedInCreatedAt;
      }
    });

    // Log the unliked posts
    // console.log("Unliked posts are ", postsThatArentLiked);

    // Return the first two unliked posts
    let pref = postsThatArentLiked.slice(0, noOfPostsToFetch);

    // - Prospect posts like feature!
    const linkedProspects = currentUser?.linkedUsersAccountIds;
    const allProspectPosts = await Posts.find({
      accountId: { $in: linkedProspects },
      _id: /^prospect_post_/,
    }).sort({
      createdAt: -1,
    });

    let prospectPostsThatArentLiked = allProspectPosts.filter(
      (post) =>
        !likes.some(
          (like) => like.postId === post._id && like.likeType !== undefined
        )
    );

    prospectPostsThatArentLiked.sort((a, b) => {
      // Check if linkedInCreatedAt is undefined
      if (
        a.linkedInCreatedAt === undefined &&
        b.linkedInCreatedAt === undefined
      ) {
        // If both are undefined, compare using createdAt
        return b.createdAt - a.createdAt;
      } else if (a.linkedInCreatedAt === undefined) {
        // If only a.linkedInCreatedAt is undefined, prioritize b
        return 1;
      } else if (b.linkedInCreatedAt === undefined) {
        // If only b.linkedInCreatedAt is undefined, prioritize a
        return -1;
      } else {
        // Compare using linkedInCreatedAt for both
        return b.linkedInCreatedAt - a.linkedInCreatedAt;
      }
    });

    prospectPostsThatArentLiked = prospectPostsThatArentLiked.slice(0, 2);

    if (pref?.length < 1) {
      pref = [postToLikeInCaseNoPostToLikeFound];
    }

    return {
      posts: [...pref, ...prospectPostsThatArentLiked],
    };
  } catch (error) {
    // Handle errors
    throw error;
  }
};

// This is for getting post with likeType : Autolike
const getLatestPostWithAutolike = async (
  userId,
  noOfPostsToFetch = 6
) => {
  try {
    // Get user
    const currentUser = await Users.findById(userId);

    // Get usesrs companyies
    const companiesIds = currentUser?.companies?.map((c) => c?.companyId) || [];
    const retrievedUserCompanyId = currentUser?.companies?.find(
      (cmp) => cmp.isPrimary === true
    )?.companyId;
    const retrievedUserCompany = await Accounts.findOne({
      _id: retrievedUserCompanyId,
    }).lean();
    const isPaidPlan = retrievedUserCompany?.plan === "Paid";

    const likeAggregationResults = await Users.aggregate([
      { $match: { _id: currentUser?._id } },
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

    if (primCompaniesTotalLikes >= 30 && !isPaidPlan) {
      return {
        likeLimitExceeded: true,
        posts: [],
      };
    }

    // Fetch likes for the given user
    const likes = await Likes.find({ userId });

    const allPosts = await Posts.find({
      accountId: { $in: companiesIds },
      _id: /^post_/,
      likeType: "AutoLike",
      autoLikeStatus: StatusConstant.Enabled
    }).sort({
      createdAt: -1,
    });

    let postsThatArentLiked = allPosts.filter(
      (post) =>
        !likes.some(
          (like) => like.postId === post._id && like.likeType !== undefined
        )
    );

    postsThatArentLiked = postsThatArentLiked.filter((post) => {
      const postUpdatedAt = new Date(post?.updatedAt || post?.createdAt);
      const today = new Date();
      const differenceInDays = (today - postUpdatedAt) / (1000 * 60 * 60 * 24);
      return differenceInDays < 7;
    });

    // Sort unliked posts by createdAt in descending order
    // postsThatArentLiked.sort((a, b) => b.createdAt - a.createdAt);
    postsThatArentLiked.sort((a, b) => {
      // Check if linkedInCreatedAt is undefined
      if (
        a.linkedInCreatedAt === undefined &&
        b.linkedInCreatedAt === undefined
      ) {
        // If both are undefined, compare using createdAt
        return b.createdAt - a.createdAt;
      } else if (a.linkedInCreatedAt === undefined) {
        // If only a.linkedInCreatedAt is undefined, prioritize b
        return 1;
      } else if (b.linkedInCreatedAt === undefined) {
        // If only b.linkedInCreatedAt is undefined, prioritize a
        return -1;
      } else {
        // Compare using linkedInCreatedAt for both
        return b.linkedInCreatedAt - a.linkedInCreatedAt;
      }
    });

    let pref = postsThatArentLiked.slice(0, noOfPostsToFetch);

    return {
      posts: [...pref],
    };
  } catch (error) {
    // Handle errors
    throw error;
  }
};

// - GET post feed
const getPostFeed = async (accountId, userId) => {
  try {
    const curUser = await Users.findById(userId);
    // Fetch all posts for the given account and sort by createdAt in descending order

    let allPosts = [];
    let account = {};
    const userCompaniesIds = curUser?.companies?.map((c) => c?.companyId) || [];

    if (curUser?.companies?.length > 0) {
      allPosts = await Posts.find({
        accountId: { $in: userCompaniesIds },
      }).sort({ createdAt: -1 });

      account = await Accounts.findById(
        curUser?.companies?.find((c) => c.isPrimary)?.companyId
      );
    } else {
      allPosts = await Posts.find({
        accountId: curUser?.accountId || accountId,
      }).sort({ createdAt: -1 });
      account = await Accounts.findById(accountId);
    }

    // Fetch likes for the given user
    const likes = await Likes.find({ userId });

    const likeAggPipeline = [
      // Step 1: Lookup to join the Likes with Posts collection
      {
        $lookup: {
          from: "posts", // The collection to join with (posts)
          localField: "postId", // Field from Likes collection
          foreignField: "_id", // Field from Posts collection
          as: "postDetails", // Alias for the resulting joined data
        },
      },
      // Step 2: Unwind the postDetails array to make the data accessible
      {
        $unwind: "$postDetails",
      },
      // Step 3: Match the accountIds you are interested in
      {
        $match: {
          "postDetails.accountId": {
            $in: [...userCompaniesIds],
          }, // Filter by the accountIds array
        },
      },
      {
        $count: "likeCount", // This step counts all the likes that match the filter
      },
    ];

    const likeCountAgg = await Likes.aggregate(likeAggPipeline);

    const totalCompanyLike =
      likeCountAgg.length > 0 ? likeCountAgg[0].likeCount : 0;
    const totalProspectLikes = Math.abs(totalCompanyLike - likes?.length);

    // Filter out posts that have been liked by the user
    const postFeed = allPosts.map((post) => {
      return {
        ...post._doc,
        isLiked: likes.some(
          (like) => like.postId === post._id && like?.likeType
        ),
      };
    });

    // Return the first three
    // .slice(0, 3); No need to slice posts now

    const feedToShow = postFeed?.filter((item) => item?.isLiked)?.slice(0, 5);

    const feed = feedToShow.sort((a, b) => {
      // Check if linkedInCreatedAt is undefined
      if (
        a.linkedInCreatedAt === undefined &&
        b.linkedInCreatedAt === undefined
      ) {
        // If both are undefined, compare using createdAt
        return b.createdAt - a.createdAt;
      } else if (a.linkedInCreatedAt === undefined) {
        // If only a.linkedInCreatedAt is undefined, prioritize b
        return 1;
      } else if (b.linkedInCreatedAt === undefined) {
        // If only b.linkedInCreatedAt is undefined, prioritize a
        return -1;
      } else {
        // Compare using linkedInCreatedAt for both
        return b.linkedInCreatedAt - a.linkedInCreatedAt;
      }
    });

    logGracefulMessage({
      status: "Success",
      accountId,
      userId,
      message: `Successfuly got feed to show`,
      method: `getPostFeed`,
    });

    return {
      feed,
      account,
      totalCompanyLike,
      totalProspectLikes,
    };
  } catch (error) {
    // Handle errors
    logGracefulMessage({
      status: "Error",
      accountId,
      userId,
      message: `${error?.message}`,
      method: `getPostFeed`,
    });
  }
};
//
const prePostAlign = async (accountId, userId) => {
  let shouldClearCache = false;
  try {
    const hoursToCheckSnap = await upsertUiTemplate({});
    const hoursToCheck = hoursToCheckSnap?.data?.postAlignBufferTime || 1;
    const userAccPostDelaySnap = hoursToCheckSnap?.data?.userAccPostDelay || 24;
    const postHourDelay = hoursToCheck * 60 * 60 * 1000;
    const userAccPostDelay = userAccPostDelaySnap * 60 * 60 * 1000;
    // Fetch all posts for the given account and sort by createdAt in descending order
    const account = await Accounts.findById(accountId);
    const curUser = await Users.findById(userId);

    const isUserPostAlignNull = !curUser?.lastProspectScrappedDate;

    if (!account) {
      shouldClearCache = true;
      throw new Error(`Account not found`);
    }

    if (!curUser) {
      shouldClearCache = true;
      throw new Error(`User not found`);
    }

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago

    const allCurUsersLinkedProspects = await UserAccounts.find({
      $or: [
        { startedAligningAt: { $eq: null } }, // startedAligningAt is null
        { startedAligningAt: { $lt: fiveMinutesAgo } }, // startedAligningAt is more than 5 minutes ago
      ],
      _id: { $in: curUser?.linkedUsersAccountIds },
    }).sort({ lastPostAlignedAt: 1 });

    let userAccPostToAlign = allCurUsersLinkedProspects[0];

    if (!userAccPostToAlign?._id) {
      const allProspectPosts = await UserAccounts.find({
        $or: [
          { startedAligningAt: { $eq: null } }, // startedAligningAt is null
          { startedAligningAt: { $lt: fiveMinutesAgo } }, // startedAligningAt is more than 5 minutes ago
        ],
      }).sort({ lastPostAlignedAt: 1 });

      userAccPostToAlign = allProspectPosts[0];
    }

    const currentTime = new Date();

    const lastProfileSyncDate = curUser?.lastProfileSyncDate
      ? new Date(curUser.lastProfileSyncDate)
      : null;

    const isSyncedBeforeToday =
      !lastProfileSyncDate || lastProfileSyncDate < currentTime;

    if (!account?.lastPostAlignedAt) {
      await UserAccounts?.findByIdAndUpdate(userAccPostToAlign?._id, {
        startedAligningAt: new Date(),
      });
      return {
        success: true,
        alighPosts: true,
        alignUserPost: userAccPostToAlign,
        isHistoricalPostsScrapped: account?.isHistoricalPostsScrapped,
        alignUsersCompanyAndTitle: isSyncedBeforeToday,
        message: `[${curUser?.firstName} ${curUser?.lastName} | ${curUser?._id}]  started aligning post for account [${account?.company} | ${account?._id}]`,
      };
    }

    const lastPostAlignedAt = new Date(account.lastPostAlignedAt);
    const lastUserPostAlignedAt = new Date(curUser?.lastProspectScrappedDate);

    // Check if 1 hour or more has passed since last post alignment
    const timeDifference = currentTime - lastPostAlignedAt;
    const timeDifferenceUserProspects = currentTime - lastUserPostAlignedAt;

    if (timeDifference >= postHourDelay) {
      await UserAccounts?.findByIdAndUpdate(userAccPostToAlign?._id, {
        startedAligningAt: new Date(),
      });
      return {
        success: true,
        alighPosts: true,
        isHistoricalPostsScrapped: account?.isHistoricalPostsScrapped,
        alignUserPost:
          isUserPostAlignNull || timeDifferenceUserProspects >= userAccPostDelay
            ? userAccPostToAlign
            : null,
        alignUsersCompanyAndTitle: isSyncedBeforeToday,
        message: `[${curUser?.firstName} ${curUser?.lastName} | ${curUser?._id}]  started aligning post for account [${account?.company} | ${account?._id}]`,
      };
    }

    if (isSyncedBeforeToday) {
      return {
        success: true,
        alighPosts: false,
        isHistoricalPostsScrapped: account?.isHistoricalPostsScrapped,
        alignUserPost: null,
        alignUsersCompanyAndTitle: isSyncedBeforeToday,
        message: `[${curUser?.firstName} ${curUser?.lastName} | ${curUser?._id}]  started aligning post for account [${account?.company} | ${account?._id}] but they are already aligned`,
      };
    }

    throw new Error(
      `[${curUser?.firstName} ${curUser?.lastName} | ${curUser?._id}] started aligning posts for account [${account?.company} | ${account?._id}]  but they are already aligned`
    );
  } catch (error) {
    return {
      success: false,
      alighPosts: false,
      alignUserPost: null,
      isHistoricalPostsScrapped: true,
      alignUsersCompanyAndTitle: false,
      shouldClearCache,
      message: `${error.message}`,
    };
  }
};

const alignUsersLikesAndAccountCrmIdData = async (
  userId,
  isInitiatedByCurUser = false
) => {
  try {
    const curUser = await Users.findById(userId).lean();
    const primAcc = curUser?.companies?.find((cmp) => cmp?.isPrimary === true);
    const primAccData = await Accounts.findById(primAcc?.companyId);

    let FINAL_PAYLOAD_FOR_CRM = isInitiatedByCurUser
      ? { uninstalledAt: null, uninstallReason: null }
      : {};

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

        FINAL_PAYLOAD_FOR_CRM = {
          ...FINAL_PAYLOAD_FOR_CRM,
          organization: createdAccInCrm?.id,
        };
      } else {
        await Accounts.findByIdAndUpdate(
          primAccData?._id,
          {
            crmId: foundCrmAccId,
          },
          { new: true }
        );

        FINAL_PAYLOAD_FOR_CRM = {
          ...FINAL_PAYLOAD_FOR_CRM,
          organization: foundCrmAccId,
        };
      }
    }

    // ---------------- Sync users likes levels START --------------------------------
    // ---------------- Also Sync Users Contact number --------------------------------
    if (primAccData?._id) {
      const curAccountUsers = await Users.find({
        companies: {
          $elemMatch: {
            companyId: primAccData?._id,
          },
        },
      }).lean();

      const noOfActualContacts =
        curAccountUsers?.filter((usr) => usr.status === "completed")?.length ||
        1;

      const currentMonthLikesAccountLevel =
        primAccData?.totalLikesForThisMonth || 0;

      const lifetimeLikeseAccountLevel = primAccData?.totalLikes || 0;

      const pendingInviteByLinksCount = await Invites.find({
        invitee_company_id: primAccData?._id,
        installed: null,
      }).count();

      const pendingInvitedUsersByEmailCount = await Users.find({
        companies: {
          $elemMatch: {
            companyId: primAccData?._id,
          },
        },
        invite: true,
        status: "pending",
      }).count();

      const totalInviteCount =
        pendingInvitedUsersByEmailCount + pendingInviteByLinksCount;

      const userDbUpdat = isInitiatedByCurUser
        ? { uninstalledAt: null, uninstallReason: null }
        : {};

      const updatedUsr = await Users.findByIdAndUpdate(
        curUser?._id,
        {
          noOfContactsInAccount: noOfActualContacts,
          lifetimeLikesAccountLevel: lifetimeLikeseAccountLevel,
          currentMonthLikesAccountLevel: currentMonthLikesAccountLevel,
          pendingInvitedUsers: totalInviteCount > 0,
          ...userDbUpdat,
          lastSeen: new Date(),
        },
        { returnDocument: "after" }
      );

      FINAL_PAYLOAD_FOR_CRM = {
        ...updatedUsr,
        ...FINAL_PAYLOAD_FOR_CRM,
      };

      await addOrUpdateContactInCRM(FINAL_PAYLOAD_FOR_CRM, false);

      if (isInitiatedByCurUser) {
        const updatedAcc = await Accounts.findByIdAndUpdate(
          curUserPrimCompany?._id,
          {
            noOfSignUps: curAccountUsers?.length || 1,
            noOfContacts: noOfActualContacts,
          },
          { returnDocument: "after" }
        );

        if (updatedAcc?.crmId) {
          await updateNoOfAccInCrm(
            updatedAcc?.crmId,
            updatedAcc.noOfContacts,
            updatedAcc.noOfSignUps
          );
        }
      }

      const otherUsersDat = curAccountUsers?.filter(
        (usr) => usr._id !== curUser._id
      );

      return {
        otherUsers: otherUsersDat?.map((usr) => usr?._id),
      };
    }

    // ---------------- Sync users likes levels END ----------------------------------
  } catch (error) {
    return {};
  }
};

const prePostAlignMultipleCompanies = async (accountId, userId) => {
  let shouldClearCache = false;
  try {
    const hoursToCheckSnap = await upsertUiTemplate({});
    const hoursToCheck = hoursToCheckSnap?.data?.postAlignBufferTime || 1;
    const userAccPostDelaySnap = hoursToCheckSnap?.data?.userAccPostDelay || 24;
    const postHourDelay = hoursToCheck * 60 * 60 * 1000;
    const userAccPostDelay = userAccPostDelaySnap * 60 * 60 * 1000;
    const userProfileSyncDelay = 24 * 60 * 60 * 1000;
    const curUser = await Users.findById(userId).lean();

    const curUsersPrimCmp = curUser?.companies?.find(
      (cmp) => cmp?.isPrimary === true
    );
    const prevPostAlignedDate = new Date(curUser?.lastPostsAligned);

    const currentDate = new Date();

    // Calculate the time difference in milliseconds
    const alignedTimeDiff = currentDate - prevPostAlignedDate;

    // Check if the userProfileSyncDelay has passed
    const isProfileSync =
      !curUser?.lastPostsAligned || alignedTimeDiff >= userProfileSyncDelay;

    const companyWhosePostAlignedIsBeforeOtherCompanies =
      await Accounts.findOne({
        _id: curUsersPrimCmp?.companyId,
      });

    // ---------------- Sync users likes levels START --------------------------------
    // ---------------- Also Sync Users Contact number --------------------------------
    const alignmentRes = await alignUsersLikesAndAccountCrmIdData(
      curUser?._id,
      true
    );
    // ---------------- Sync users likes levels END ----------------------------------

    const isUserPostAlignNull = !curUser?.lastProspectScrappedDate;

    if (!curUser) {
      shouldClearCache = true;
      throw new Error(`User not found`);
    }

    const hourAgo = new Date(Date.now() - 60 * 60 * 1000); // 60 mins ago

    const allCurUsersLinkedProspects = await UserAccounts.findOne({
      $or: [
        { startedAligningAt: { $eq: null } }, // startedAligningAt is null
        { startedAligningAt: { $lt: hourAgo } }, // startedAligningAt is more than 5 minutes ago
      ],
      _id: { $in: curUser?.linkedUsersAccountIds },
    })
      .sort({ startedAligningAt: 1 })
      .lean();

    const randomUserProspect = await UserAccounts.findOne({
      _id: { $in: curUser?.linkedUsersAccountIds },
    })
      .sort({ startedAligningAt: 1 })
      .lean();

    let userAccPostToAlign = allCurUsersLinkedProspects?._id
      ? allCurUsersLinkedProspects
      : randomUserProspect;

    const currentTime = new Date();

    const lastProfileSyncDate = curUser?.lastProfileSyncDate
      ? new Date(curUser.lastProfileSyncDate)
      : null;

    const isSyncedBeforeToday =
      !lastProfileSyncDate || lastProfileSyncDate < currentTime;

    if (!companyWhosePostAlignedIsBeforeOtherCompanies?.lastPostAlignedAt) {
      await UserAccounts?.findByIdAndUpdate(userAccPostToAlign?._id, {
        startedAligningAt: new Date(),
      });
      return {
        success: true,
        alighPosts: true,
        isProfileSync: isProfileSync,
        alignUserPost: userAccPostToAlign,
        isHistoricalPostsScrapped:
          companyWhosePostAlignedIsBeforeOtherCompanies?.isHistoricalPostsScrapped,
        alignCompany: {
          officialLinkedInCompanyUrl:
            companyWhosePostAlignedIsBeforeOtherCompanies.officialLinkedInCompanyUrl,
          id: companyWhosePostAlignedIsBeforeOtherCompanies?._id,
          isPrimaryCompany:
            companyWhosePostAlignedIsBeforeOtherCompanies.isPrimary,
        },
        alignUsersCompanyAndTitle: isSyncedBeforeToday,
        mainUserCompanyUrl:
          curUser?.companies?.find((cmp) => cmp.isPrimary === true)
            ?.officialLinkedInCompanyUrl || "",
        message: `[${curUser?.firstName} ${curUser?.lastName} | ${curUser?._id}]  started aligning post for account [${companyWhosePostAlignedIsBeforeOtherCompanies?.company} | ${companyWhosePostAlignedIsBeforeOtherCompanies?._id}]`,
        otherUsers: alignmentRes?.otherUsers || [],
      };
    }

    const lastPostAlignedAt = new Date(
      companyWhosePostAlignedIsBeforeOtherCompanies.lastPostAlignedAt
    );
    const lastUserPostAlignedAt = new Date(curUser?.lastProspectScrappedDate);

    // Check if 1 hour or more has passed since last post alignment
    const timeDifference = currentTime - lastPostAlignedAt;
    const timeDifferenceUserProspects = currentTime - lastUserPostAlignedAt;

    if (timeDifference >= postHourDelay) {
      await UserAccounts?.findByIdAndUpdate(userAccPostToAlign?._id, {
        startedAligningAt: new Date(),
      });
      return {
        success: true,
        alighPosts: true,
        isProfileSync: isProfileSync,
        isHistoricalPostsScrapped:
          companyWhosePostAlignedIsBeforeOtherCompanies?.isHistoricalPostsScrapped,
        alignUserPost:
          isUserPostAlignNull || timeDifferenceUserProspects >= userAccPostDelay
            ? userAccPostToAlign
            : null,
        alignCompany: {
          officialLinkedInCompanyUrl:
            companyWhosePostAlignedIsBeforeOtherCompanies.officialLinkedInCompanyUrl,
          id: companyWhosePostAlignedIsBeforeOtherCompanies?._id,
          isPrimaryCompany:
            companyWhosePostAlignedIsBeforeOtherCompanies.isPrimary,
        },
        alignUsersCompanyAndTitle: isSyncedBeforeToday,
        mainUserCompanyUrl:
          curUser?.companies?.find((cmp) => cmp.isPrimary === true)
            ?.officialLinkedInCompanyUrl || "",
        message: `[${curUser?.firstName} ${curUser?.lastName} | ${curUser?._id}]  started aligning post for account [${companyWhosePostAlignedIsBeforeOtherCompanies?.company} | ${companyWhosePostAlignedIsBeforeOtherCompanies?._id}]`,
        otherUsers: alignmentRes?.otherUsers || [],
      };
    }

    if (isSyncedBeforeToday) {
      return {
        success: true,
        alighPosts: false,
        isProfileSync: isProfileSync,
        alignCompany: {
          officialLinkedInCompanyUrl:
            companyWhosePostAlignedIsBeforeOtherCompanies.officialLinkedInCompanyUrl,
          id: companyWhosePostAlignedIsBeforeOtherCompanies?._id,
          isPrimaryCompany:
            companyWhosePostAlignedIsBeforeOtherCompanies.isPrimary,
        },
        isHistoricalPostsScrapped:
          companyWhosePostAlignedIsBeforeOtherCompanies?.isHistoricalPostsScrapped,
        alignUserPost: userAccPostToAlign,
        alignUsersCompanyAndTitle: isSyncedBeforeToday,
        mainUserCompanyUrl:
          curUser?.companies?.find((cmp) => cmp.isPrimary === true)
            ?.officialLinkedInCompanyUrl || "",
        message: `[${curUser?.firstName} ${curUser?.lastName} | ${curUser?._id}]  started aligning post for account [${companyWhosePostAlignedIsBeforeOtherCompanies?.company} | ${companyWhosePostAlignedIsBeforeOtherCompanies?._id}] but they are already aligned`,
        otherUsers: alignmentRes?.otherUsers || [],
      };
    }

    throw new Error(
      `[${curUser?.firstName} ${curUser?.lastName} | ${curUser?._id}] started aligning posts for account [${companyWhosePostAlignedIsBeforeOtherCompanies?.company} | ${companyWhosePostAlignedIsBeforeOtherCompanies?._id}]  but they are already aligned`
    );
  } catch (error) {
    return {
      success: false,
      alighPosts: false,
      isProfileSync: false,
      alignUserPost: null,
      isHistoricalPostsScrapped: true,
      alignUsersCompanyAndTitle: false,
      shouldClearCache,
      message: `${error.message}`,
    };
  }
};

const getPostsWhoseAalyticsToUpdates = async (userId, companyId) => {
  try {
    let curretLinkedInCompayId = null;
    const user = await Users.findById(userId);

    if (!user?.accountId) {
      throw new Error("User not valid");
    }

    const account = await Accounts.findById(user?.accountId);

    if (!account?._id) {
      throw new Error("User not valid");
    }

    if (!account?.linkedInCompanyId) {
      if (!companyId) {
        throw new Error(
          "LinkedIn account id not found and isn't prvided either"
        );
      }
      await Accounts.findByIdAndUpdate(account?._id, {
        linkedInCompanyId: companyId,
      });
      curretLinkedInCompayId = companyId;
    }

    curretLinkedInCompayId = account?.linkedInCompanyId;

    if (!curretLinkedInCompayId) {
      throw new Error("LinkedIn account id not found and isn't prvided either");
    }

    // ----------------------------------------------------------------
    // const latestSixtyPosts = await Posts.find({ accountId: account?._id })
    //   .sort({ createdAt: -1 })
    //   .limit(60);

    const currentDate = new Date();
    const fifteenDaysAgo = new Date(currentDate);
    fifteenDaysAgo.setDate(currentDate.getDate() - 15);

    const thirtyDaysAgo = new Date(currentDate);
    thirtyDaysAgo.setDate(currentDate.getDate() - 30);

    const result = await Posts.aggregate([
      { $match: { accountId: account?._id } },
      { $sort: { createdAt: -1 } },
      { $limit: 60 },
      {
        $facet: {
          fifteenDaysOldPosts: [
            {
              $match: {
                createdAt: { $lte: currentDate, $gte: fifteenDaysAgo },
              },
            },
            {
              $project: {
                _id: 0,
                createdAt: 1,
                postUrl: 1,
              },
            },
          ],
          sixteenToThirtyDaysOldPosts: [
            {
              $match: {
                createdAt: { $lt: fifteenDaysAgo, $gte: thirtyDaysAgo },
              },
            },
            {
              $project: {
                _id: 0,
                createdAt: 1 /* add other fields if needed */,
                postUrl: 1,
              },
            },
          ],
          moreThanThirtyDaysOldPosts: [
            { $match: { createdAt: { $lt: thirtyDaysAgo } } },
            {
              $project: {
                _id: 0,
                createdAt: 1 /* add other fields if needed */,
                postUrl: 1,
              },
            },
          ],
        },
      },
    ]);

    const fifteenDaysOldPosts = result[0]?.fifteenDaysOldPosts?.map((post) => {
      const postId = post?.postUrl?.split("activity:")[1];
      return {
        ...post,
        postUrl: `${LINKED_IN_POST_ANALYTIC_URL.replaceAll(
          "%COMPANY_ID%",
          curretLinkedInCompayId
        ).replaceAll("%POST_URL_ID%", postId)}`,
      };
    });
    const sixteenToThirtyDaysOldPosts =
      result[0]?.sixteenToThirtyDaysOldPosts?.map((post) => {
        const postId = post?.postUrl?.split("activity:")[1];
        return {
          ...post,
          postUrl: `${LINKED_IN_POST_ANALYTIC_URL.replaceAll(
            "%COMPANY_ID%",
            curretLinkedInCompayId
          ).replaceAll("%POST_URL_ID%", postId)}`,
        };
      });
    const moreThanThirtyDaysOldPosts =
      result[0]?.moreThanThirtyDaysOldPosts?.map((post) => {
        const postId = post?.postUrl?.split("activity:")[1];
        return {
          ...post,
          postUrl: `${LINKED_IN_POST_ANALYTIC_URL.replaceAll(
            "%COMPANY_ID%",
            curretLinkedInCompayId
          ).replaceAll("%POST_URL_ID%", postId)}`,
        };
      });

    return {
      success: true,
      message: `Posts for analytics to update fetched `,
      data: {
        fifteenDaysOldPosts,
        sixteenToThirtyDaysOldPosts,
        moreThanThirtyDaysOldPosts,
      },
    };
  } catch (error) {
    return {
      success: false,
      message: `${error?.message}`,
      data: error,
    };
  }
};
const getPostsWhoseAalyticsToUpdate = async (userId) => {
  try {
    const LINKED_IN_POST_ANALYTIC_URL = `https://www.linkedin.com/company/%COMPANY_ID%/admin/post-analytics/urn:li:activity:%POST_URL_ID%`;

    const user = await Users.findById(userId);

    const curUserAccId = user?.companies?.find(
      (cmp) => cmp.isPrimary
    )?.companyId;

    if (!curUserAccId) {
      throw new Error("Company not valid");
    }

    const currentDate = new Date();
    currentDate.setHours(0, 0, 0, 0); // Set hours, minutes, seconds, and milliseconds to 0

    const lastInsightsSyncDate = user?.lastLikeInsightsSyncDate
      ? new Date(user.lastLikeInsightsSyncDate)
      : null;
    if (lastInsightsSyncDate) {
      lastInsightsSyncDate.setHours(0, 0, 0, 0); // Set hours, minutes, seconds, and milliseconds to 0
    }

    const isScrappedTodayOrFuture = lastInsightsSyncDate
      ? lastInsightsSyncDate >= currentDate
      : false;

    const account = await Accounts.findById(curUserAccId);

    if (!account?._id) {
      throw new Error("User not valid");
    }

    const curretLinkedInCompayId =
      account?.officialLinkedInCompanyUrl?.split("/")[4];

    if (!curretLinkedInCompayId) {
      throw new Error("LinkedIn account id not found and isn't prvided either");
    }

    // ----------------------------------------------------------------
    // const latestSixtyPosts = await Posts.find({ accountId: account?._id })
    //   .sort({ createdAt: -1 })
    //   .limit(60);

    // Calculate the start of the current week (Sunday)
    // const startOfWeek = new Date();
    // startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());

    // // Calculate the end of the current week (Saturday)
    // const endOfWeek = new Date();
    // endOfWeek.setDate(startOfWeek.getDate() + 6);

    // // Calculate the start of the current month
    // const startOfMonth = new Date(
    //   currentDate.getFullYear(),
    //   currentDate.getMonth(),
    //   1
    // );

    // // Calculate the end of the current month
    // const endOfMonth = new Date(
    //   currentDate.getFullYear(),
    //   currentDate.getMonth() + 1,
    //   0
    // );

    // const fifteenDaysAgo = new Date(currentDate);
    // fifteenDaysAgo.setDate(currentDate.getDate() - 15);

    // const thirtyDaysAgo = new Date(currentDate);
    // thirtyDaysAgo.setDate(currentDate.getDate() - 30);

    // const fifteenDaysOldPostsSnap = await Posts.find({
    //   accountId: account?._id,
    //   createdAt: { $lte: currentDate, $gte: fifteenDaysAgo },
    //   $or: [
    //     { lastAnnalyticsAligned: null },
    //     {
    //       lastAnnalyticsAligned: {
    //         $not: { $lt: currentDate },
    //       },
    //     },
    //   ],
    // })
    //   .sort({ createdAt: -1 })
    //   .limit(14);

    // const sixteenToThirtyDaysOldPostsSnap = await Posts.find({
    //   accountId: account?._id,
    //   createdAt: { $lt: fifteenDaysAgo, $gte: thirtyDaysAgo },

    //   $or: [
    //     { lastAnnalyticsAligned: null },
    //     {
    //       lastAnnalyticsAligned: {
    //         $not: { $gte: startOfWeek, $lte: endOfWeek },
    //       },
    //     },
    //   ],
    // })
    //   .sort({ createdAt: -1 })
    //   .limit(4);

    // const moreThanThirtyDaysOldPostsSnap = await Posts.find({
    //   accountId: account?._id,
    //   createdAt: { $lt: thirtyDaysAgo },
    //   $or: [
    //     { lastAnnalyticsAligned: null },
    //     {
    //       lastAnnalyticsAligned: {
    //         $not: {
    //           $gte: startOfMonth,
    //           $lte: endOfMonth,
    //         },
    //       },
    //     },
    //   ],
    // })
    //   .sort({ createdAt: -1 })
    //   .limit(2);

    // const fifteenDaysOldPosts = fifteenDaysOldPostsSnap
    //   ?.filter((post) => {
    //     const postId = post?.postUrl?.split("activity:")[1];
    //     return postId !== "undefined" && postId;
    //   })
    //   ?.map((post) => {
    //     const postId = post?.postUrl?.split("activity:")[1];
    //     return {
    //       ...post?._doc,
    //       analyticsUrl: `${LINKED_IN_POST_ANALYTIC_URL.replaceAll(
    //         "%COMPANY_ID%",
    //         curretLinkedInCompayId
    //       ).replaceAll("%POST_URL_ID%", postId)}`,
    //     };
    //   });
    // const sixteenToThirtyDaysOldPosts = sixteenToThirtyDaysOldPostsSnap?.map(
    //   (post) => {
    //     const postId = post?.postUrl?.split("activity:")[1];
    //     return {
    //       ...post?._doc,
    //       analyticsUrl: `${LINKED_IN_POST_ANALYTIC_URL.replaceAll(
    //         "%COMPANY_ID%",
    //         curretLinkedInCompayId
    //       ).replaceAll("%POST_URL_ID%", postId)}`,
    //     };
    //   }
    // );
    // const moreThanThirtyDaysOldPosts = moreThanThirtyDaysOldPostsSnap?.map(
    //   (post) => {
    //     const postId = post?.postUrl?.split("activity:")[1];
    //     return {
    //       ...post?._doc,
    //       analyticsUrl: `${LINKED_IN_POST_ANALYTIC_URL.replaceAll(
    //         "%COMPANY_ID%",
    //         curretLinkedInCompayId
    //       ).replaceAll("%POST_URL_ID%", postId)}`,
    //     };
    //   }
    // );

    const latestTenPostsDoc = await Posts.find({ accountId: account?._id })
      .sort({ createdAt: -1 })
      .limit(10)
      .select("_id createdAt postUrl accountId linkedInCreatedAt")
      .lean();

    const latestTenPostsWithAnalytics = latestTenPostsDoc.map((pst) => {
      const postId = pst?.postUrl?.split("activity:")[1];
      return {
        ...pst,
        analyticsUrl: `${LINKED_IN_POST_ANALYTIC_URL.replaceAll(
          "%COMPANY_ID%",
          curretLinkedInCompayId
        ).replaceAll("%POST_URL_ID%", postId)}`,
      };
    });

    // data: {
    //   fifteenDaysOldPosts,
    //   sixteenToThirtyDaysOldPosts,
    //   moreThanThirtyDaysOldPosts,
    // },

    return {
      success: true,
      message: `Posts for analytics to update fetched `,
      isScrappedAlready: isScrappedTodayOrFuture,
      data: [...latestTenPostsWithAnalytics],
    };
  } catch (error) {
    return {
      success: false,
      message: `${error?.message}`,
      isScrappedAlready: true,
      data: error,
    };
  }
};

const updatePostAnalytics = async ({ userId, postId, ...rest }) => {
  try {
    const curPost = await Posts.findById(postId);

    const curCompany = await Accounts.findById(curPost?.accountId);

    const analyticsDifference = {
      impressions:
        (rest?.impressions || 0) * 1 - (curPost?.impressions || 0) * 1,
      reactions: (rest?.reactions || 0) * 1 - (curPost?.reactions || 0) * 1,
      comments: (rest?.comments || 0) * 1 - (curPost?.comments || 0) * 1,
      reposts: (rest?.reposts || 0) * 1 - (curPost?.reposts || 0) * 1,
    };

    const postToUpdate = await Posts?.findByIdAndUpdate(
      postId,
      {
        impressions: rest?.impressions,
        reactions: rest?.reactions,
        comments: rest?.comments,
        reposts: rest?.reposts,
        lastAnnalyticsAligned: new Date(),
      },
      { new: true }
    );

    // await mixpanelTrack(`Post Analytics Updated - ${postId}`, userId, {
    //   ...analyticsDifference,
    //   companyName: curCompany?.company,
    //   postUrl: curPost?.postUrl,
    //   postTitle: curPost?.postTitle,
    // });

    const postAalyticsDiff = {
      ...analyticsDifference,
      companyName: curCompany?.company,
      postId,
      postUrl: curPost?.postUrl,
      postTitle: curPost?.postTitle,
    };

    return {
      success: true,
      message: `Post analytics updated successfully `,
      data: postToUpdate,
      postAalyticsDiff,
    };
  } catch (error) {
    return {
      success: false,
      message: `${error?.message}`,
      data: error,
    };
  }
};

const getLastThreeMonthsPosts = async (accountId) => {
  try {
    // Get the current date
    const currentDate = moment();

    // Function to get posts for a specific date range
    const getPostsForDateRange = async (startDate, endDate) => {
      return await Posts.find({
        accountId: accountId,
        linkedInCreatedAt: {
          $gte: startDate.toDate(),
          $lte: endDate.toDate(),
        },
      })
        .sort({ linkedInCreatedAt: -1 })
        .lean();
    };

    // Get company Info
    const companyInfo = await Accounts.findById(accountId);

    // Get LinkedIn companyId from the URL
    const currentLinkedInCompanyId =
      companyInfo?.officialLinkedInCompanyUrl?.split("/")[4];

    let lastThreeMonthsPosts = [];
    let startDate = currentDate.clone();

    // Check for posts in each 30-day interval up to 3 months
    for (let i = 0; i < 3; i++) {
      const endDate = startDate.clone();
      startDate = startDate.subtract(30, 'days');

      lastThreeMonthsPosts = await getPostsForDateRange(startDate, endDate);

      // Break if posts are found for the current interval
      if (lastThreeMonthsPosts.length > 0) {
        break;
      }
    }

    // Map and format the posts
    const finalPosts =
      lastThreeMonthsPosts?.map((post) => {
        const postId = post?.postUrl?.split("activity:")[1]; // Extract post ID from the URL
        return {
          ...post, // Clone the post data
          potAnalyticUrl: `${LINKED_IN_POST_ANALYTIC_URL.replaceAll(
            "%COMPANY_ID%",
            currentLinkedInCompanyId
          ).replaceAll("%POST_URL_ID%", postId)}`, // Add the analytics URL
        };
      }) || []; // Limit to the latest 10 posts

    return {
      success: true,
      message: `Posts for month ${currentDate.toLocaleString("en-us", {
        month: "long",
        year: "numeric",
      })} retrieved successfully`,
      data: finalPosts,
      analyticUpdateUrl: LINKED_IN_POST_PUBLISH_ANALYTIC_URL.replaceAll(
        "%COMPANY_ID%",
        currentLinkedInCompanyId
      ),
    };
  } catch (error) {
    return {
      success: false,
      message: `${error?.message}`,
      data: error,
    };
  }
};

const addHistoricalPosts = async (postIds = [], userId, accountId) => {
  try {
    const historicalDataToAdd = {
      _id: idGeneratorHelper("hst_post"),
      accountId: accountId,
      addedByUser: userId,
      historicalPostIds: postIds,
    };

    const addedHistoricalPosts = await HistoricalPosts.create(
      historicalDataToAdd
    );

    await Accounts?.findByIdAndUpdate(accountId, {
      isHistoricalPostsScrapped: true,
    });

    return {
      success: true,
      message: `Historical data added successfully`,
      data: addedHistoricalPosts,
    };
  } catch (error) {
    return {
      success: false,
      message: `${error?.message}`,
      data: error,
    };
  }
};

const resetLikesAndPostsCountToZero = async () => {
  try {
    const allUsers = await Users.find({}).lean();
    const allAccounts = await Accounts.find({}).lean();

    for (const user of allUsers) {
      const curUserLikes = await Likes.find({ userId: user._id }).lean();
      const currentMonthLikes = curUserLikes.filter((like) => {
        const likeDate = new Date(like?.autoLikeTimestamp || like?.createdAt); // Assuming each like has a 'date' property
        const curDate = new Date();

        return (
          likeDate.getFullYear() === curDate.getFullYear() &&
          likeDate.getMonth() === curDate.getMonth()
        );
      });

      const updatedUser = await Users.findByIdAndUpdate(
        user?._id,
        {
          totalLikes: curUserLikes?.length || 0,
          thisMonthsDailyLikes: currentMonthLikes?.length || 0,
        },
        { new: true }
      );

      await addOrUpdateContactInCRM(updatedUser, false);
    }

    for (const acc of allAccounts) {
      const curAllPosts = await Posts.find({ accountId: acc?._id }).lean();

      const curMonthPosts = curAllPosts.filter((post) => {
        const postDate = new Date(post?.createdAt);
        const curDate = new Date();

        return (
          postDate.getFullYear() === curDate.getFullYear() &&
          postDate.getMonth() === curDate.getMonth()
        );
      });

      const updatedAccc = await Accounts.findByIdAndUpdate(
        acc?._id,
        {
          totalPosts: curAllPosts?.length || 0,
          currentMonthPosts: curMonthPosts?.length || 0,
        },
        { new: true }
      );

      await updateAccountInfo(updatedAccc, false);
    }

    return {
      success: true,
      message: `Likes & Posts Sync started success`,
      data: {},
    };
  } catch (error) {
    return {
      success: false,
      message: `${error?.message}`,
      data: error,
    };
  }
};

const removeDuplicatePostsWithSameUrl = async () => {
  try {
    const duplicatePostsAgg = await Posts.aggregate([
      {
        $group: {
          _id: "$postUrl",
          count: { $sum: 1 },
          docs: { $push: "$_id" },
        },
      },
      { $match: { count: { $gt: 1 } } },
    ]);

    duplicatePostsAgg.forEach(function (group) {
      // 2. For each group, delete all documents except the first
      group.docs.slice(1).forEach(function (docId) {
        Posts.deleteOne({ _id: docId });
      });
    });

    return {
      success: true,
      message: `Post link duplication started successfully`,
      data: {},
    };
  } catch (error) {
    return {
      success: false,
      message: `Likes & Posts Sync started false`,
      data: {},
    };
  }
};

export {
  compareAndAddPosts,
  getLatestUnlikedPosts,
  getPostFeed,
  prePostAlign,
  compareAndAddProspectPosts,
  getPostsWhoseAalyticsToUpdate,
  updatePostAnalytics,
  getLastThreeMonthsPosts,
  addHistoricalPosts,
  getLatestUnlikedPostsWithUserId,
  prePostAlignMultipleCompanies,
  resetLikesAndPostsCountToZero,
  removeDuplicatePostsWithSameUrl,
  alignUsersLikesAndAccountCrmIdData,
  getLatestPostWithAutolike
};
