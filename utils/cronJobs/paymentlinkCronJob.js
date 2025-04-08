import { updatePaymentLinkForAllAdminsInCrmAndDb } from "../../mutations/userMutations.js";
import createCronJob, {
  CRON_JOB_SCHEDULES,
} from "../creeateCronJob/createCronJob.js";

const updatePaymentLinkForAllUsersCornJob = () =>
  createCronJob(CRON_JOB_SCHEDULES.EVERY_DAY_MIDNIGHT, () => {
    updatePaymentLinkForAllAdminsInCrmAndDb();
  });

export { updatePaymentLinkForAllUsersCornJob as default };
