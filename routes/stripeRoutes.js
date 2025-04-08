import express from "express";
import { stripePayment, stripeWebhook } from "../controllers/stripe.controller.js";

const stripeRouter = express.Router();

stripeRouter.post("/create-checkout-session", stripePayment);
stripeRouter.post("/webhook", express.raw({ type: "application/json" }), stripeWebhook);

export default stripeRouter;