import Users from "../../mongodb/models/Users.js";
import { syncLikesInsights } from "../../mutations/likeMutatiions.js";
import { addHashtagToAllPosts } from "../chatGpt/getAnswerFromGpt.js";
import createCronJob, {
  CRON_JOB_SCHEDULES,
} from "../creeateCronJob/createCronJob.js";

const addPostHashtagsCornnJob = () =>
  createCronJob(CRON_JOB_SCHEDULES.EVERY_TWO_HOURS, addHashtagToAllPosts);

export { addPostHashtagsCornnJob as default };
