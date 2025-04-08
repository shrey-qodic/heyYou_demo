import { addCompanyDetailsToAllUsers } from "../../mutations/userMutations.js";
import createCronJob, {
  CRON_JOB_SCHEDULES,
} from "../creeateCronJob/createCronJob.js";

const addCompanyDetailsToAllUsersCornJob = () =>
  createCronJob(
    CRON_JOB_SCHEDULES.EVERY_DAY_MIDNIGHT,
    addCompanyDetailsToAllUsers
  );

export { addCompanyDetailsToAllUsersCornJob as default };
