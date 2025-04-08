import { v4 as uuidv4 } from "uuid";
import Bills from "../mongodb/models/Bills.js";
import Users from "../mongodb/models/Users.js";
import Subscriptions from "../mongodb/models/SubscriptionData.js";
import Stripe from "stripe";
import Accounts from "../mongodb/models/Accounts.js";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const idGeneratorHelper = (prefix) =>
  `${prefix || "id"}_${uuidv4().slice(0, 13).replace("-", "")}`;

export const updateStripeSubscription = async (accountId, userId) => {
  try {
    const formattedAccountId = accountId.startsWith("acc_") ? accountId : "acc_" + accountId;
    const formattedUserId = userId.startsWith("usr_") ? userId : "usr_" + userId;
    // Find the subscription data
    const subscriptionData = await Subscriptions.findOne({  
      accountId: formattedAccountId,
      userId: formattedUserId
    });

    if (!subscriptionData) {
      throw new Error("Subscription not found");
    }


    const subscriptionId = subscriptionData.stripeSubscriptionId;

    // Fetch the current subscription from Stripe
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const subscriptionItem = subscription.items.data[0];

    // Increase the quantity by 1
    const updatedSubscription = await stripe.subscriptions.update(subscriptionId, {
      items: [{
        id: subscriptionItem.id,
        quantity: subscriptionItem.quantity + 1
      }],
      payment_behavior: "pending_if_incomplete",
      proration_behavior: "create_prorations",
    });

    // Create an invoice
    const invoice = await stripe.invoices.create({
      customer: subscription.customer,
      subscription: subscriptionId,
      collection_method: "charge_automatically",
    });

    const paymentResult = await stripe.invoices.pay(invoice.id);

    if (paymentResult.status === "paid") {
      const filter = {
        accountId: `acc_${accountId}`,
        userId: `usr_${userId}`,
        createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        isCanceled: false
      };
    
      const bills = await Bills.find(filter); // Fetch matching bills
    
      for (const bill of bills) {
        let totalAmount = Number(bill.totalAmount) || 0; // Convert to number safely
    
        await Bills.updateOne(
          { _id: bill._id }, // Update each bill separately
          {
            $set: { totalAmount: totalAmount + 3 }, 
            $inc: { noOfUsers: 1 }
          }
        );
      }
      return { message: "Subscription updated and payment successful", updatedSubscription };
    } else {
      throw new Error("Payment failed. Invoice status: " + paymentResult.status);
    }
  } catch (error) {
    console.error("Error updating subscription:", error);
    if (error.type === "StripeCardError") {
      throw new Error("Payment failed: Card was declined.");
    } else if (error.type === "StripeInvalidRequestError") {
      throw new Error("Invalid request to Stripe.");
    } else {
      throw new Error(error.message || "An unknown error occurred.");
    }
  }
};

export const createStripeBillRecord = async (session) => {
  const currentDate = new Date();
  const filter = { userId: session.metadata.userId, accountId: session.metadata.accountId };
  await Bills.updateMany(filter, { $set: { isCanceled: true } });

  const billData = {
    _id: idGeneratorHelper("bill"),
    createdAt: currentDate,
    userId: session.metadata.userId,
    noOfUsers: session.metadata.totalUsers,
    hash: session.subscription,
    standingOrderId: session.invoice,
    totalAmount: 3 * session.metadata.totalUsers,
    accountId: session.metadata.accountId,
  };
  const subscriptionDataPayload = {
    _id: idGeneratorHelper("subs"),
    customerId: session.customer,
    userId: session.metadata.userId,
    accountId: session.metadata.accountId,
    stripeInvoiceId: session.invoice,
    stripeSubscriptionId: session.subscription,
    status: "active",
  }
  let curUser = await Users.findById(session.metadata.userId);
  const updatedUser = await Users.findByIdAndUpdate(
    session.metadata.userId,
    { accountPlan: "Paid" },
    { new: true }
  );
  const billRec = await Bills.create(billData);
  const subscriptionData = await Subscriptions.create(subscriptionDataPayload)
  
  if (!billRec?._id && !subscriptionData?._id) {
    throw new Error("Something went wrong while creating the bill record");
  }

  return { billRec, curUser, updatedUser, subscriptionData };
};

export const createStripeBillEveryMonth = async (session) => {
  const currentDate = new Date();
  const metadata = session.subscription_details.metadata

  // Check if a bill already exists for the given userId and accountId
  const existingBill = await Bills.findOne({
    userId: metadata.userId,
    accountId: metadata.accountId,
    hash: session.subscription
  });

  if (existingBill) {
    await Bills.findByIdAndUpdate(existingBill._id, {
      isCanceled: true,
      isStoExpired: true,
    });
  }

  const billData = {
    _id: idGeneratorHelper("bill"),
    createdAt: currentDate,
    userId: metadata.userId,
    noOfUsers: session.amount_paid / 300,
    hash: session.subscription,
    standingOrderId: session.invoice,
    totalAmount: session.amount_paid / 100,
    accountId: metadata.accountId,
  };

  const existingSubscription = await Subscriptions.findOne({
    stripeSubscriptionId: session.subscription,
  });

  let subscriptionData;

  if (existingSubscription) {
    subscriptionData = await Subscriptions.findByIdAndUpdate(
      existingSubscription._id,
      { stripeInvoiceId: session.invoice, status: "active" },
      { new: true }
    );
  } else {
    const subscriptionDataPayload = {
      _id: idGeneratorHelper("subs"),
      userId: session.metadata.userId,
      customerId: session.customer,
      accountId: session.metadata.accountId,
      stripeInvoiceId: session.invoice,
      stripeSubscriptionId: session.subscription,
      status: "active"
    };
    subscriptionData = await Subscriptions.create(subscriptionDataPayload);
  }

  let curUser = await Users.findById(metadata.userId);
  const updatedUser = await Users.findByIdAndUpdate(
    metadata.userId,
    { accountPlan: "Paid" },
    { new: true }
  );
  await Accounts.findByIdAndUpdate(
    metadata.accountId,
    { plan: "Paid" },
    { new: true }
  );

  const billRec = await Bills.create(billData);

  if (!billRec?._id || !subscriptionData?._id) {
    throw new Error("Something went wrong while creating/updating records");
  }

  return { billRec, curUser, updatedUser, subscriptionData };
};



export const handleDeleteSubscription = async (session) => {
  try {
    if (!session?.metadata) {
      console.error("Session metadata is missing");
      return;
    }
    const { userId, accountId } = session.metadata;
    const subscriptionId = session.id;

    if (!userId || !accountId) {
      console.error("Metadata is missing userId or accountId");
      return;
    }

    const subscription = await Subscriptions.findOne({ stripeSubscriptionId: subscriptionId });
    if (!subscription) {
      console.log("No active subscription found for the given ID.");
      return;
    }

    const filter = { userId, accountId };

    // Mark all bills as canceled
    await Bills.updateMany(filter, { $set: { isCanceled: true } });

    // Delete subscription
    await Subscriptions.deleteMany({ stripeSubscriptionId: subscriptionId, userId, accountId });
    // Downgrade the account to Freemium
    await Accounts.findByIdAndUpdate(accountId, { plan: "Freemium" }, { new: true });

    console.log("Subscription deleted successfully and account downgraded.");
  } catch (error) {
    console.error("Error deleting subscription:", error);
  }
};
export const updateSubscriptionOnPaymentFailed = async (session) => {
  try {
    if (!session.subscription_details?.metadata) {
      console.error("Metadata is missing in subscription_details");
      return;
    }

    const metadata = session.subscription_details.metadata;
    const subscriptionId = session.subscription;

    if (!metadata.userId || !metadata.accountId) {
      console.error("Metadata is missing userId or accountId");
      return;
    }

    const filter = { userId: metadata.userId, accountId: metadata.accountId };
    await Bills.updateMany(filter, { $set: { isCanceled: true } });

    const subscriptionFilter = { 
      stripeSubscriptionId: subscriptionId, 
      userId: metadata.userId, 
      accountId: metadata.accountId 
    };

    await Subscriptions.updateMany(subscriptionFilter, { $set: { status: "payment_failed" } });

    await Accounts.findByIdAndUpdate(
      metadata.accountId,
      { plan: "Freemium" },
      { new: true }
    );

  } catch (error) {
    console.error("Error updating subscription on payment failure:", error);
  }
};
