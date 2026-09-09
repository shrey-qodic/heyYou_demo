// You can also use CommonJS `require('@sentry/node')` instead of `import`
import * as Sentry from '@sentry/node'
import { PostHog } from 'posthog-node'
import * as dotenv from 'dotenv'

// Load env here too. This module is imported before server.js calls
// dotenv.config(), so we mirror utils/mixpanel.js and load it ourselves.
dotenv.config()

// PostHog error tracking. Caught errors already go to Sentry. We mirror them to
// PostHog so failures also carry person and session context there.
const posthog = createPostHogClient()

function createPostHogClient() {
  const apiKey = process?.env?.POSTHOG_API_KEY

  if (!apiKey) {
    // A missing key must never break production, but a dev build fails loudly
    // so the gap is noticed instead of silently dropping events.
    if (process?.env?.APP_ENV === 'dev') {
      throw new Error(
        'POSTHOG_API_KEY variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once POSTHOG_API_KEY is configured'
      )
    }
    return null
  }

  return new PostHog(apiKey, {
    host: process?.env?.POSTHOG_HOST || 'https://us.i.posthog.com',
  })
}

const getDistinctId = (req) =>
  req?.user?._id?.toString?.() ||
  req?.user?.id ||
  req?.body?.userId ||
  req?.query?.userId ||
  undefined

// Send a caught error to PostHog. Never throws, so error handling stays intact
// even when PostHog is unavailable.
const capturePostHogException = (error, req) => {
  if (!posthog) {
    return
  }

  try {
    posthog.captureException(error, getDistinctId(req))
  } catch (captureError) {
    console.log(`PostHog captureException failed: ${captureError?.message}`)
  }
}

const initializeSentry = (expressApp) => {
  // Add Enviromemnt based on stagin and production
  // we will be able to filter events like this on sentry dashboard i:e environment:"production"
  const environment =
    process?.env?.CURRENT_ENVIROMENT === 'STAGING' ? 'staging' : 'production'
  Sentry.init({
    dsn: process?.env?.SENTRY_DNS || '',
    environment,
  })

  return Sentry
}

export const getSentryWrapperForRouter = (Sentry) => {
  if (!Sentry) {
    throw new Error('Sentry is not available')
  }

  return async (router, req, res, next) => {
    try {
      if (!router) {
        throw new Error('Router is not available')
      }
      // Call the router's handler
      await router(req, res, next)
    } catch (error) {
      // Log the handled error to Sentry and PostHog
      Sentry.captureException(error)
      capturePostHogException(error, req)

      // Handle the error locally or respond to the client
      res.status(400).json({ error: 'Internal Server Error occurred' })
    }
  }
}

export const sentryMiddleware = (handler) => async (req, res, next) => {
  try {
    await handler(req, res, next)
  } catch (error) {
    // Capture the exception with Sentry and PostHog
    Sentry.captureException(error)
    capturePostHogException(error, req)

    // Forward the error to the global error handler
    next(error)
  }
}

export default initializeSentry
