import { updateNoOfContactsForAllUsers } from "../../mutations/userMutations.js";
import createCronJob, {
  CRON_JOB_SCHEDULES,
} from "../creeateCronJob/createCronJob.js";

const syncNoOfContactsForAllUsersCronJob = () =>
  createCronJob(CRON_JOB_SCHEDULES.EVERY_TWO_HOURS, () => {
    updateNoOfContactsForAllUsers();
  });

export { syncNoOfContactsForAllUsersCronJob as default };
