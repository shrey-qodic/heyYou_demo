import { updatePaymentLinkForAllAdminsInCrmAndDb } from "../../mutations/userMutations.js";
import createCronJob, {
  CRON_JOB_SCHEDULES,
} from "../creeateCronJob/createCronJob.js";
import { paymentMethodWorkerExecution } from "../workerThreads/extensionPaymentUpdateForAllUsers.js";

async function longTask() {
  console.log(`Task started`);

  for (let index = 1; index > 0; index++) {
    console.log(`INdex incremented to `, index);
  }
}

const testCronJob = () =>
  createCronJob(CRON_JOB_SCHEDULES.EVERY_TWO_MINUTES, () => {
    paymentMethodWorkerExecution();
  });

export { testCronJob as default };
