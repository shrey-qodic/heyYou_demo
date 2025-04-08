import cron from "node-cron";

const CRON_JOB_SCHEDULES = {
  FIRST_OF_EVERY_MONTH_MIDNIGHT: "0 0 1 * *",
  EVERY_FIVE_MINUTES: "*/5 * * * *",
  EVERY_TWO_MINUTES: "*/2 * * * *",
  EVERY_TWO_HOURS: "*/120 * * * *",
  EVERY_DAY_MIDNIGHT: "0 0 * * *",
};

const createCronJob = (
  cornJobSchedule = CRON_JOB_SCHEDULES.FIRST_OF_EVERY_MONTH_MIDNIGHT,
  methodToCall = () => {}
) => {
  const myCronJob = cron.schedule(cornJobSchedule, () => {
    methodToCall();
  });
  return myCronJob;
};

export { createCronJob as default, CRON_JOB_SCHEDULES };
