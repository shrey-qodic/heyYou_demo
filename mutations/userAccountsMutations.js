import * as dotenv from "dotenv";
import { idGeneratorHelper } from "../utils/helpers.js";
import UserAccounts from "../mongodb/models/UserAccounts.js";
import Users from "../mongodb/models/Users.js";
import Accounts from "../mongodb/models/Accounts.js";

dotenv.config();

// - get ui template
const upsertLinkUserAccount = async ({ userId, userAccountToAddAndLink }) => {
  const { linkedInUrl } = userAccountToAddAndLink;
  const user = await Users.findById(userId);
  if (!user || !user?._id) {
    return {
      success: true,
      message: "User id not valid",
      data: {},
    };
  }
  let curUserAccId = null;
  let updateForlinkedUsersAccountIds = user?.linkedUsersAccountIds || [];

  try {
    let isUserAccountLinkedAlready = false;
    const prevUserAccount = await UserAccounts.findOne({ linkedInUrl });
    const newUserAccountToCreate = {
      _id: idGeneratorHelper("usr_acc"),
      ...userAccountToAddAndLink,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastPostAlignedAt: new Date(),
    };
    curUserAccId = prevUserAccount?._id || newUserAccountToCreate?._id;
    if (!prevUserAccount) {
      // create a new user account
      await UserAccounts.create(newUserAccountToCreate);
    } else {
      // link/unlink the user info
      isUserAccountLinkedAlready = user.linkedUsersAccountIds.includes(
        prevUserAccount?._id
      );
    }

    updateForlinkedUsersAccountIds = isUserAccountLinkedAlready
      ? user?.linkedUsersAccountIds?.filter((id) => id !== curUserAccId)
      : [...(user?.linkedUsersAccountIds || []), curUserAccId];

    const updatedUser = await Users.findByIdAndUpdate(
      user?._id,
      {
        linkedUsersAccountIds: updateForlinkedUsersAccountIds,
      },
      { new: true }
    );

    const linkedAccountsWithData = await UserAccounts.find({
      _id: { $in: [...updatedUser.linkedUsersAccountIds] },
    });

    if (isUserAccountLinkedAlready) {
      return {
        success: true,
        message: "User account Un-Linked with user",
        data: {
          linkedAccounts: updatedUser.linkedUsersAccountIds,
          linkedAccountsWithData,
        },
      };
    }

    return {
      success: true,
      message: "User account Linked with user",
      data: {
        linkedAccounts: updatedUser.linkedUsersAccountIds,
        linkedAccountsWithData,
      },
    };
    //
  } catch (error) {
    //
    return {
      success: false,
      message: `Failed due to ${error?.message}`,
      data: error,
    };
  }
};

const bulkUpsertAndLinkProspects = async ({
  userId,
  userAccountsToAddAndLink = [],
}) => {
  try {
    const curUser = await Users.findById(userId);

    if (!curUser || !curUser?._id) {
      return {
        success: true,
        message: "UserId not valid",
        data: { userId, userAccountsToAddAndLink },
      };
    }

    let updateForlinkedUsersAccountIds = new Set(
      curUser?.linkedUsersAccountIds || []
    );

    // Filter valid accounts to link
    const validAccountsToLink = userAccountsToAddAndLink.filter(
      (account) => account?.linkedInUrl && account?.name
    );

    // Fetch all existing user accounts from the database at once
    const allPrevProspects = await UserAccounts.find({
      linkedInUrl: { $in: validAccountsToLink.map((acc) => acc.linkedInUrl) },
    }).lean();

    // Create new accounts that are not already present
    const newProspectsToCreate = validAccountsToLink.filter(
      (acc) =>
        !allPrevProspects.some(
          (prevAcc) => prevAcc.linkedInUrl === acc.linkedInUrl
        )
    );

    const newProspectsToCreateWithData = newProspectsToCreate.map((acc) => ({
      _id: idGeneratorHelper("usr_acc"),
      ...acc,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastPostAlignedAt: new Date(),
    }));

    // Insert new user accounts in bulk
    await UserAccounts.insertMany(newProspectsToCreateWithData);

    // Prepare a map of the existing prospects for fast lookup
    const prevProspectsMap = allPrevProspects.reduce((acc, prospect) => {
      acc[prospect.linkedInUrl] = prospect;
      return acc;
    }, {});

    // Iterate through all accounts and update the linked accounts list
    validAccountsToLink.forEach((curAcc) => {
      const prevAcc = prevProspectsMap[curAcc.linkedInUrl];
      const curAccId = prevAcc
        ? prevAcc._id
        : newProspectsToCreateWithData.find(
            (newAcc) => newAcc.linkedInUrl === curAcc.linkedInUrl
          )?._id;

      if (curAccId) {
        if (curAcc?.isLinked) {
          updateForlinkedUsersAccountIds.add(curAccId); // Add to linked list
        } else {
          updateForlinkedUsersAccountIds.delete(curAccId); // Remove from linked list
        }
      }
    });

    // Convert the Set back to an array for updating
    updateForlinkedUsersAccountIds = Array.from(updateForlinkedUsersAccountIds);

    // Update user with the modified linked accounts in one operation
    const updatedUser = await Users.findByIdAndUpdate(
      curUser._id,
      {
        linkedUsersAccountIds: updateForlinkedUsersAccountIds,
      },
      { new: true }
    );

    return {
      success: true,
      message: "User account Linked with user",
      data: { linkedAccounts: updatedUser.linkedUsersAccountIds },
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed due to ${error?.message}`,
      data: error,
    };
  }
};

const checkIfUserAccountAlreadyLinked = async ({ userId, userAccountUrl }) => {
  try {
    const user = await Users.findById(userId);
    const userAcc = await UserAccounts.findOne({ linkedInUrl: userAccountUrl });

    const retrievedUserCompanyId = user?.companies?.find(
      (cmp) => cmp.isPrimary === true
    )?.companyId;
    const retrievedUserCompany = await Accounts.findOne({
      _id: retrievedUserCompanyId,
    }).lean();
    const isPaidPlan = retrievedUserCompany?.plan === "Paid";

    const matchedUsersAccountIdsCountSnap = await Users.aggregate([
      // Step 1: Match the specific user to get their primary company
      {
        $match: { _id: user?._id },
      },
      // Step 2: Unwind the companies array to access individual company documents
      {
        $unwind: "$companies",
      },
      // Step 3: Match to find the primary company
      {
        $match: { "companies.isPrimary": true },
      },
      // Step 4: Lookup all users who have at least one company matching the primary companyId
      {
        $lookup: {
          from: "users", // The collection name
          let: {
            primaryCompanyId: "$companies.companyId",
          }, // Store the primary companyId
          pipeline: [
            {
              $unwind: "$companies", // Unwind the companies array for other users
            },
            {
              $match: {
                $expr: {
                  $eq: ["$$primaryCompanyId", "$companies.companyId"], // Match based on companyId
                },
              },
            },
          ],
          as: "linkedUsers",
        },
      },
      // Optional: Project fields to return
      {
        $project: {
          _id: 0,
          totalLinkedUsersAccountIds: {
            $sum: {
              $map: {
                input: "$linkedUsers",
                as: "user",
                in: {
                  $size: {
                    $ifNull: ["$$user.linkedUsersAccountIds", []],
                  },
                }, // Count each user's linkedUsersAccountIds
              },
            },
          },
        },
      },
    ]);

    const accountUsersProspectCount =
      matchedUsersAccountIdsCountSnap[0]?.totalLinkedUsersAccountIds || 0;

    if (!user?._id || !userAcc?._id) {
      return {
        success: true,
        message: `This profile isn't linked with user`,
        data: {
          isLinked: false,
          linkLimitExceeded: !isPaidPlan && accountUsersProspectCount >= 15,
        },
      };
    }

    const isAlreadyLinked = user?.linkedUsersAccountIds?.includes(userAcc?._id);

    if (!isAlreadyLinked) {
      return {
        success: true,
        message: `This profile isn't linked with user`,
        data: {
          isLinked: false,
          linkLimitExceeded: !isPaidPlan && accountUsersProspectCount >= 15,
        },
      };
    }

    return {
      success: true,
      message: `This profile is linked with user`,
      data: {
        isLinked: true,
      },
    };
  } catch (error) {
    return {
      success: false,
      message: `${error?.message}`,
      data: {
        isLinked: false,
        limitExceeded: true,
      },
    };
  }
};

export {
  upsertLinkUserAccount,
  checkIfUserAccountAlreadyLinked,
  bulkUpsertAndLinkProspects,
};
