import Stripe from 'stripe'
import {
  createStripeBillEveryMonth,
  createStripeBillRecord,
  handleDeleteSubscription,
  updateSubscriptionOnPaymentFailed,
} from '../mutations/stripeMutations.js'
import Accounts from '../mongodb/models/Accounts.js'
import {
  addOrUpdateContactInCRM,
  updateAccountInfo,
} from '../utils/zoho/zohoServices.js'
import Subscriptions from '../mongodb/models/SubscriptionData.js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

const stripePayment = async (req, res) => {
  try {
    const {
      amount,
      accountName,
      costPerUser,
      totalUsers,
      billingPeriod,
      accountId,
      userId,
    } = req.body.data
    console.log('totalUsers:', totalUsers)

    // Check if there is a past due or payment_failed subscription
    const existingSubscription = await Subscriptions.findOne({
      accountId,
      userId,
    })

    let session

    if (existingSubscription) {
      console.log(
        'Existing failed subscription found:',
        existingSubscription.stripeSubscriptionId
      )
      const subscription = await stripe.subscriptions.retrieve(
        existingSubscription.stripeSubscriptionId
      )

      if (subscription.latest_invoice) {
        session = await stripe.billingPortal.sessions.create({
          customer: subscription.customer,
          return_url: process.env.PAYMENT_CANCEL_URL,
        })
      } else {
        return res
          .status(400)
          .json({ error: 'No invoice found for past-due subscription.' })
      }
    } else {
      // 🔹 If no past-due subscription exists, create a new subscription checkout session
      if (!amount || amount * 100 < 50) {
        console.log('invalid amout')
        return res
          .status(400)
          .json({ error: 'Invalid amount. Minimum is $0.50 (50 cents)' })
      }
      session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'subscription',
        success_url: process.env.PAYMENT_SUCCESS_URL,
        cancel_url: process.env.PAYMENT_CANCEL_URL,
        line_items: [
          {
            price: process.env.STRIPE_PRODUCT_ID, // Replace with your Stripe price ID
            quantity: parseInt(totalUsers, 10),
          },
        ],
        metadata: {
          accountName: accountName || 'Unknown',
          costPerUser: costPerUser ? costPerUser.toString() : '0',
          totalUsers: totalUsers ? totalUsers.toString() : '1',
          billingPeriod: billingPeriod || 'monthly',
          accountId,
          userId,
        },
      })
    }

    console.log('🔹 Checkout session created:', session.id)
    res.json({ url: session.url })
  } catch (error) {
    console.error('Stripe Checkout Error:', error)
    res.status(500).json({ error: error.message })
  }
}

const stripeWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature']
  let event

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    )
    console.log('Stripe Webhook Received:', event.type)
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message)
    return res.status(400).send(`Webhook Error: ${err.message}`)
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object

      if (session.subscription && session.payment_status === 'paid') {
        try {
          const { billRec, curUser, updatedUser, subscriptionData } =
            await createStripeBillRecord(session)

          const updatedAccount = await Accounts.findByIdAndUpdate(
            session.metadata.accountId,
            { plan: 'Paid' },
            { new: true }
          )

          console.log('Subscription Data:', subscriptionData)

          await Promise.all([
            addOrUpdateContactInCRM(updatedUser, false),
            addOrUpdateContactInCRM(curUser, false),
            updateAccountInfo(updatedAccount),
            stripe.subscriptions.update(session.subscription, {
              metadata: session.metadata,
            }),
          ])

          console.log('Metadata added to subscription:', session.subscription)
        } catch (error) {
          console.error('Error processing payment:', error)
        }
      }
      break
    }

    case 'customer.subscription.created': {
      break
    }

    case 'invoice.payment_failed': {
      const session = event.data.object
      const billingReason = session.billing_reason
      const metadata = session.subscription_details.metadata
      if (billingReason == 'subscription_cycle') {
        try {
          await updateSubscriptionOnPaymentFailed(session)
        } catch (error) {
          console.error('Error handling subscription deletion:', error)
        }
        break
      }
      break
    }

    case 'invoice.payment_succeeded': {
      const session = event.data.object
      const billingReason = session.billing_reason
      if (billingReason == 'subscription_cycle') {
        try {
          const { billRec, curUser, updatedUser, subscriptionData } =
            await createStripeBillEveryMonth(session)
        } catch (error) {
          console.log('error', error)
        }
      }
      break
    }

    case 'customer.subscription.updated': {
      // console.log("Subscription event received:", event.type, event.data.object);
      const session = event.data.object
      const cancellationDetails = session?.cancellation_details
      if (cancellationDetails.reason == 'cancellation_requested') {
        try {
          await handleDeleteSubscription(event.data.object)
        } catch (error) {
          console.error('Error handling subscription deletion:', error)
        }
      }

      // const subscriptionId = session.id
      // const metaData = session.metadata
      break
    }

    case 'customer.subscription.deleted': {
      try {
        await handleDeleteSubscription(event.data.object)
      } catch (error) {
        console.error('Error handling subscription deletion:', error)
      }
      break
    }

    default:
      console.log(`Unhandled event type: ${event.type}`)
  }

  res.json({ received: true })
}

export { stripePayment, stripeWebhook }
