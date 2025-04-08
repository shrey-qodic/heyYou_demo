import Accounts from "../mongodb/models/Accounts.js";
import Likes from "../mongodb/models/Likes.js";
import Posts from "../mongodb/models/Posts.js";
import Uitemplates from "../mongodb/models/Uitemplates.js";
import Users from "../mongodb/models/Users.js";
import { getTimeDifference, idGeneratorHelper } from "../utils/helpers.js";
import logGracefulMessage from "../utils/logGracefulMessage.js";
import {
  addOrUpdateContactInCRM,
  createAccountInCRM,
  getAccountIdByName,
  updateUsersLastSeenStatusInCrm,
} from "../utils/zoho/zohoServices.js";

const getLatestInsights = async (req, res, next) => {
  try {
    // console.log("I have called Insights API");
    // Get the optional parameter for days before (default is 0)
    const daysBefore = req?.query?.daysBefore || 0;

    // Calculate the date by subtracting the specified number of days from the current date
    const currentDate = new Date();
    currentDate.setDate(currentDate.getDate() - daysBefore);

    const accounts = await Accounts.find()
      .collation({ locale: "en" })
      .sort({ company: 1 });
    const users = await Users.find();
    const likes = await Likes.find();
    const posts = await Posts.find();

    const dataToReturn = accounts?.map((account) => {
      const currentCompanyPosts = posts
        ?.filter((post) => post?.accountId === account?._id)
        ?.filter((p) => p?.linkedInCreatedAt)
        ?.sort((a, b) => b?.linkedInCreatedAt - a?.linkedInCreatedAt)
        ?.slice(0, 3);

      const postsWithData = currentCompanyPosts?.map((post) => {
        const likesForThisPost = likes?.filter(
          (like) => like?.postId === post?._id
        );

        const totalLikesForThisPost =
          likes?.filter((like) => like?.postId === post?._id)?.length || 0;

        const usersThatLikedThisPosts = likesForThisPost?.map((like) => {
          const curUser = users?.find((user) => user.id === like?.userId);
          return {
            dbId: curUser?._id,
            email: curUser?.email || "N/A",
            likeType: `${like?.likeType}`,
            name: `${curUser?.firstName} ${curUser?.lastName}`,
            likedAt: new Date(like?.createdAt)?.toString()?.split("GMT")[0],
            timeTook: getTimeDifference(
              new Date(post?.createdAt),
              new Date(like?.createdAt)
            )?.preciseString,
          };
        });

        return {
          dbId: post?._id,
          url: post?.postUrl,
          title: `${post?.postTitle?.trim()?.slice(0, 40)} ...`,
          createdAt: new Date(post?.createdAt)?.toString()?.split("GMT")[0],
          noOfLikes:
            likes?.filter(
              (like) => like?.postId === post?._id && like.likeType !== "user"
            )?.length || 0,
          totalLikes: totalLikesForThisPost,
          likedBy: usersThatLikedThisPosts,
          impressions: post?.impressions,
          reactions: post?.reactions,
          comments: post?.comments,
          reposts: post?.reposts,
        };
      });

      const activeUsersArr = users?.filter(
        (user) =>
          user.companies.some((c) => c?.companyId === account?._id) &&
          user?.onBoardingComplete
      );

      return {
        dbId: account?._id,
        company: account?.company,
        companyUrl: `${account?.officialLinkedInCompanyUrl}posts/?feedView=all&viewAsMember=true`,
        totalusers:
          users?.filter((user) =>
            user.companies.some((c) => c.companyId === account?._id)
          )?.length || 0,
        activeUsers: {
          count: activeUsersArr?.length,
          users: activeUsersArr?.map((user) => {
            return {
              dbId: `${user?._id}`,
              name: `${user?.firstName} ${user?.lastName}`,
              email: `${user?.email}`,
              lastSeen: `${user?.lastSeen}`,
            };
          }),
        },
        invitedUsers:
          users?.filter(
            (user) =>
              user.companies.some((c) => c.companyId === account?._id) &&
              user?.invite &&
              !user?.onBoardingComplete
          )?.length || 0,
        latestThreePosts: postsWithData,
      };
    });

    logGracefulMessage({
      status: `Success`,
      method: `getLatestInsights`,
      accountId: ``,
      message: `Successfully got data for ${currentDate.toDateString()}`,
      userId: ``,
    });

    const finalDt = dataToReturn?.filter((item) => item?.totalusers > 0);

    res.status(200).json({
      success: true,
      message: `Successfully got data for ${currentDate.toDateString()}`,
      data: finalDt,
    });
    res.end("");
  } catch (error) {
    logGracefulMessage({
      status: `Error`,
      method: `getLatestInsights`,
      accountId: ``,
      message: `${error?.message}`,
      userId: ``,
    });
    res.status(400).json({
      success: false,
      message: `${error?.message}`,
      data: {},
    });
    res.end("");
  }
};

const extensionPing = async (req, res, next) => {
  const {
    userId,
    accountId,
    extensionVersion,
    description = "unknown",
  } = req.body;

  const curUser = await Users.findById(userId);



  try {
    if (!curUser || !curUser?._id) {
      res.status(200).json({
        success: true,
        message: `Extension version ${extensionVersion} is running and userId provided is not valid`,
        data: {},
      });
      return res.end("");
    }

    curUser.lastSeen = new Date();

    // if (curUser?._id && curUser?.crmId) {
    //   await updateUsersLastSeenStatusInCrm(curUser);
    // }
    await curUser.save();

    logGracefulMessage({
      status: `Success`,
      method: `extensionPing`,
      accountId: `${accountId || curUser?._id}`,
      message: `Extension version ${extensionVersion} is running for ${
        curUser?.firstName
      } ${curUser?.lastName} | Event:${description?.replaceAll(
        "undefined",
        curUser?._id
      )}`,
      userId: `${userId}`,
      extensionVersion: `${extensionVersion}`,
    });

    let reloadExtension =
      curUser?.latestBgExtensionVersion &&
      curUser?.latestBgExtensionVersion !== extensionVersion;

    res.status(200).json({
      success: true,
      message: `Extension version ${extensionVersion} is running for ${curUser?.firstName} ${curUser?.lastName}`,
      data: {
        reloadExtension,
        prevVersion: extensionVersion,
        currentVersion: curUser?.latestBgExtensionVersion,
      },
    });
    res.end("");
  } catch (error) {
    logGracefulMessage({
      status: `Error`,
      method: `extensionPing`,
      accountId: `${accountId}`,
      message: `${error?.message}`,
      userId: `${userId}`,
      extensionVersion: `${extensionVersion}`,
    });
    res.status(400).json({
      success: false,
      message: `${error?.message}`,
      data: {
        reloadExtension: false,
      },
    });
    res.end("");
  }
};

export { getLatestInsights, extensionPing };
