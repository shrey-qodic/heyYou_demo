import Users from "../mongodb/models/Users.js";
import Likes from "../mongodb/models/Likes.js";
import Posts from "../mongodb/models/Posts.js";
import { idGeneratorHelper } from "../utils/helpers.js";
import { getRandomInterval } from "./helperFunctions.js";
import logGracefulMessage from "../utils/logGracefulMessage.js";

const ONEMINUTE = 60 * 1000; // 1 minute in milliseconds

export async function updateLikeType(userId, postId, likeType) {
  try {
    const filter = { userId, postId };
    const update = {
      likeType: likeType,
      autoLikeTimestamp: Date.now(),
    };

    const updatedDocument = await Likes.findOneAndUpdate(filter, update, {
      new: true,
    });

    if (updatedDocument) {
      console.log(
        `Updated likeType and autoLikeTimestamp for userId: ${userId}, postId: ${postId}`
      );
    } else {
      console.log(
        `No document found with userId: ${userId}, postId: ${postId}`
      );
    }
  } catch (error) {
    console.log(`Error updating likes table:`);
  }
}
export async function findScheduledLike(userId, postId) {
  try {
    const scheduledLike = await Likes.findOne({
      userId: userId,
      postId: postId,
    });
    return scheduledLike;
  } catch (error) {
    console.log(`Error finding scheduled like: ${error.message}`);
    return null;
  }
}

export async function saveScheduledLike(user, postId, now, timeParams) {
  const delay = getRandomInterval(timeParams.minDelay, timeParams.maxDelay);
  const userLikeTimestamp = new Date(
    now + timeParams.minAutoLikeStartTime + delay
  );

  const like = new Likes({
    _id: idGeneratorHelper("like"),
    userId: user._id,
    postId: postId,
    autoLikeTimestamp: userLikeTimestamp,
  });

  try {
    await like.save();
  } catch (error) {
    console.log("Error saving like:");
  }
}

export async function fetchAutoLikes(currentTimestamp) {
  const currentTime = new Date(currentTimestamp); // Convert timestamp to Date object
  const oneMinuteAgo = new Date(currentTimestamp - ONEMINUTE);

  const dueLikes = await Likes.find({
    autoLikeTimestamp: {
      $gte: oneMinuteAgo,
      $lte: currentTime,
    },
  });

  return dueLikes;
}

export async function getUsersOfAccount(accountId) {
  try {
    const users = await Users.find({ accountId: accountId });
    if (!users || users.length === 0) {
      throw new Error(`No users found for account ID ${accountId}`);
    }

    logGracefulMessage({
      status: "Success",
      accountId: accountId,
      message: `${users?.length} | Users fetched successfully`,
      userId: "",
      method: "getUsersOfAccount",
    });

    return users;
  } catch (error) {
    logGracefulMessage({
      status: "Error",
      accountId: accountId,
      message: error?.message,
      userId: "",
      method: "getUsersOfAccount",
    });

    return [];
  }
}

export async function findPostsByAccountAndTime(accountId, time) {
  try {
    const posts = await Posts.find({
      accountId: accountId,
      createdAt: { $gte: time },
    });

    logGracefulMessage({
      status: "Success",
      accountId: accountId,
      message: `${posts?.length} | Posts fetched successfully`,
      userId: "",
      method: "findPostsByAccountAndTime",
    });

    return posts;
  } catch (error) {
    logGracefulMessage({
      status: "Error",
      accountId: accountId,
      message: error?.message,
      userId: "",
      method: "findPostsByAccountAndTime",
    });
  }
}

export async function findLastPostByAccount(accountId) {
  try {
    const lastPost = await Posts.findOne({ accountId: accountId })
      .sort({ createdAt: -1 })
      .limit(1);

    logGracefulMessage({
      status: "Success",
      accountId: accountId,
      message: `${lastPost?.createdAt} | Post feetched successfully`,
      userId: "",
      method: "findLastPostByAccount",
    });

    return lastPost;
  } catch (error) {
    logGracefulMessage({
      status: "Error",
      accountId: accountId,
      message: error?.message,
      userId: "",
      method: "findLastPostByAccount",
    });
  }
}
export async function findUserById(userId) {
  try {
    const user = await Users.findOne({ _id: userId });
    logGracefulMessage({
      status: "Success",
      accountId: accountId,
      message: `${user?._id} | User fetchedd successfully`,
      userId: "",
      method: "findUserById",
    });
    return user;
  } catch (error) {
    logGracefulMessage({
      status: "Error",
      accountId: accountId,
      message: error?.message,
      userId: "",
      method: "findUserById",
    });
  }
}
