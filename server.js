import express from "express";
import * as dotenv from "dotenv";
import cors from "cors";
import cron from "node-cron";

import connectDB from "./mongodb/connect.js";
// routes
import { userRouter } from "./routes/userRoutes.js";
import { extRouter } from "./routes/extRoutes.js";
import { zohoRouter } from "./routes/zohoRoutes.js";
import { postRouter } from "./routes/postRoutes.js";
import { likeRouter } from "./routes/likeRoutes.js";
 
//
import { getScheduledLikes } from "./queue/handleAutoLike.js";
import { processRecordsWithoutZohoId } from "./utils/zoho/zohoQueue.js";
import { generateLinkRouter } from "./routes/generateLinkRoutes.js";
import { uitemplatesRouter } from "./routes/uitemplateRoutes.js";
import initializeSentry from "./config/sentryConfig.js";
import sendActiveCampaignMail from "./utils/activecampaign/sendActiveCampaignMail.js";
import { insightRouter } from "./routes/insightRoutes.js";
import { billRouter } from "./routes/billRoutes.js";
import updateAllNoOfContactsInCrm from "./utils/updateAllNoOfContactsInCrm.js";
import { updateCreateBillForUsers } from "./utils/cronJobs/extensionPaymentScheduleCronJob.js";
import { userAccountsRouter } from "./routes/userAccountsRoutes.js";
import initiateAllCornJobs from "./utils/cronJobs/initiateAllCornJobs.js";
import { extensionInstallSourceRouter } from "./routes/extensionInstallSourceRoutes.js";
import { monthlyReportRouter } from "./routes/monthlyReportRoutes.js";
import {
  addHashtagToAllPosts,
  getHashtagFromPostDescription,
} from "./utils/chatGpt/getAnswerFromGpt.js";
import { addCompanyDetailsToAllUsers } from "./mutations/userMutations.js";
import { deactivateAllStos } from "./mutations/billMutations.js";
import disableOldPosts from "./cron/updatePostStatus.js";
import stripeRouter from "./routes/stripeRoutes.js";

console.log(`SERVER LOG - TRYING TO START SERVER!`)

// ENV access
dotenv.config();

const app = express();

// Sentry error handling
const Sentry = initializeSentry(app);

app.use(cors());
app.use("/webhook", express.raw({ type: "application/json" })); 
app.use(express.json({ limit: "50mb" }));

// The request handler must be the first middleware on the app
// app.use(Sentry.Handlers.requestHandler());

// TracingHandler creates a trace for every incoming request
// app.use(Sentry.Handlers.tracingHandler());


app.use((req, res, next) => {
  req.on('error', (err) => {
    // Handling socket-specific errors like ECONNRESET (socket hang up)
    if (err.code === 'ECONNRESET') {
      console.log('Socket hang up or connection reset by client');
      // comment out below line
      // res.status(400).send('Bad Request - Connection Reset');
    } else if (err.code === 'ECONNABORTED') {
      console.log('Connection aborted by the client');
      res.status(408).send('Request Timeout');
    } else {
      console.log('Unexpected request error:', err);
      res.status(400).send('Internal Server Error');
    }
  });

  // Check buid status
  
  next();  // Proceed to the next middleware or route handler
});

// Optional fallthrough error handler
app.use(function onError(err, req, res, next) {
  // The error id is attached to `res.sentry` to be returned
  // and optionally displayed to the user for support.
  res.statusCode = 500;
  res.end(res.sentry + "\n");
});

// Global error handler middleware
app.use((err, req, res, next) => {
  // Log the error to Sentry
  Sentry.captureException(err);

  // Handle the error locally or respond to the client
  res.status(400).json({ error: "Internal Server Error" });
});

// TODO: To be removed
app.get("/", (req, res) => {
  res.send({
    message: "API | Insights",
    version: "1.1.92",
    chromeExtensionVersion: "1.1.92",
  });
  res.end();
});

app.get("/sendTestOptEmail", async (req, res) => {
  const resSnap = await sendActiveCampaignMail();
  res.send({ message: "OTP Email sending email working", status: resSnap });
  res.end();
});

app.get("/updateAllNoOfContactsInCrm", async (req, res) => {
  const returnData = await updateAllNoOfContactsInCrm();
  res.send(returnData);
  res.end();
});

app.get("/updatePaymentsCronJob", async (req, res) => {
  const returnData = await updateCreateBillForUsers();
  res.send({ message: "Update Bill for everyone is working fine!" });
  res.end();
});

app.get("/updateUsersCompanyNameAndOwner", async (req, res) => {
  const returnData = await addCompanyDetailsToAllUsers();
  res.send({ message: "Update Company Name and Owner of all users" });
  res.end();
});

app.get("/gpt/getHashtagsFromPostDescription", async (req, res) => {
  // res.send({ messge: `API - Coming soon!` });
  // return res.end();
  const postDesc = `
  At the end of the day, from both sides, success is measured on whether or not goals were achieved or if both parties moved closer to their goals, and to what extent. This will be the main factor that will impact how successful a partnership is judged to be.
There are many different metrics that can be used when evaluating the performance of a partnership. This will depend on what goals you set to achieve together in the first place.
The most common metrics are usually revenue generated for each side, growth/scale signals over time such as an increase in pipeline, customer adoption, satisfaction, and growth (whether NDR, CSAT, or other). 
It is key to track and focus on these metrics on an ongoing basis and not wait for an EBR or end-of-year review.
  `;
  const resArr = await addHashtagToAllPosts();
  res.send(resArr);
  // const resArr = await getHashtagFromPostDescription(postDesc);
  // res.send({ message: "Got GPT-response", data: resArr });
  res.end();
});

// Check if sentry is working fine
app.get("/debug-sentry", (req, res) => {
  try {
    throw new Error("Sentry Error check !");
  } catch (error) {
    Sentry.captureException(error);

    // Handle the error locally or respond to the client
    res.status(400).json({ error: "Internal Server Error" });
  }
});

// API to throw sentry side errors
app.post("/throwSentryError", (req, res) => {
  try {
    const { userId, message } = req.body;
    console.log(`Message is ${message}`);
    throw new Error(`${message} For user with ID ${userId}`);
  } catch (error) {
    Sentry.captureException(error);

    // Handle the error locally or respond to the client
    res.status(200).json({ error: "Internal Server Error" });
  }
});

//
app.get("/makeStosInactive", deactivateAllStos);

// Routes
app.use("/api/v1/user", userRouter);
app.use("/", stripeRouter);
app.use("/api/v1/ext", extRouter);
app.use("/api/v1/zoho", zohoRouter);
app.use("/api/v1/post", postRouter);
app.use("/api/v1/likes", likeRouter);
app.use("/api/v1/bill", billRouter);
app.use("/api/v1/useraccounts", userAccountsRouter);
app.use("/api/v1/extSource", extensionInstallSourceRouter);
app.use("/api/v1/monthlyReport", monthlyReportRouter);
app.use("/api/v1", generateLinkRouter);
app.use("/api/v1", uitemplatesRouter);
app.use("/api/v1", insightRouter);

// The error handler must be registered before any other error middleware and after all controllers
// app.use(Sentry.Handlers.errorHandler());

let port = process.env.PORT || 8080;

// Run cron jon every midnight to disbaled posts older than 7 days
cron.schedule("0 0 * * *", disableOldPosts);

const startServer = async () => {
  try {
    connectDB(process.env.MONGODB_URL);
    // - we don't need this so commenting this for now
    // getScheduledLikes();
    // processRecordsWithoutZohoId();
    // Add comment to check deployment

    app.listen(port, () => {
      console.log(`Server started on port http://localhost:${port}`);
      // - Initiate all corn jobs when server is UP!
      // - checking if it works
      initiateAllCornJobs();
    });
  } catch (error) {
    console.log(JSON.stringify(error));
  }
};

// Start server
startServer();
