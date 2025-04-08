import Users from "../../mongodb/models/Users.js";
import { syncLikesInsights } from "../../mutations/likeMutatiions.js";
import createCronJob, {
  CRON_JOB_SCHEDULES,
} from "../creeateCronJob/createCronJob.js";

const syncLikeDataForAllUsers = async () => {
  console.log("I will start syncync user likes insights for CRON JOB");
  try {
    const usersToSync = await Users.find({ onBoardingComplete: true }, "_id");

    const syncedUsers = await Promise.all(
      usersToSync.map(async (user) => {
        if (user?._id) {
          return await syncLikesInsights(user._id);
        }
      })
    );
    return {
      success: true,
      message: `All user likes synced`,
      data: syncedUsers,
    };
  } catch (error) {
    return {
      success: false,
      message: `${error?.message || "something went wrong!"}`,
    };
  }
};

const syncLikeDataScheduleCronJob = () =>
  createCronJob(
    CRON_JOB_SCHEDULES.FIRST_OF_EVERY_MONTH_MIDNIGHT,
    syncLikeDataForAllUsers
  );

export { syncLikeDataScheduleCronJob as default, syncLikeDataForAllUsers };
