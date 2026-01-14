// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

if (process.env.NODE_ENV !== "development") {

  Sentry.init({
    dsn: "https://ba5ce6d52947fbc8c41ec13ece402195@o4510703407005696.ingest.us.sentry.io/4510703408185344",
    integrations: [
      // Add the Vercel AI SDK integration to sentry.server.config.ts
      Sentry.vercelAIIntegration({
        recordInputs: true,
        recordOutputs: true,
      }),
    ],
  
    // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
    tracesSampleRate: 1,
  
    // Enable logs to be sent to Sentry
    enableLogs: true,
  
    // Enable sending user PII (Personally Identifiable Information)
    // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
    sendDefaultPii: true,
  });
}
