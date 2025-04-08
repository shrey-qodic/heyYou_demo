// You can also use CommonJS `require('@sentry/node')` instead of `import`
import * as Sentry from '@sentry/node'

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
      // Log the handled error to Sentry
      Sentry.captureException(error)

      // Handle the error locally or respond to the client
      res.status(400).json({ error: 'Internal Server Error occurred' })
    }
  }
}

export const sentryMiddleware = (handler) => async (req, res, next) => {
  try {
    await handler(req, res, next)
  } catch (error) {
    // Capture the exception with Sentry
    Sentry.captureException(error)

    // Forward the error to the global error handler
    next(error)
  }
}

export default initializeSentry
