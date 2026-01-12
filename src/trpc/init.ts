// import { auth } from "@/lib/auth";
// import { initTRPC, TRPCError } from "@trpc/server";
// import { headers } from "next/headers";
// import { cache } from "react";
// import superjson from "superjson";
// export const createTRPCContext = cache(async () => {
//   /**
//    * @see: https://trpc.io/docs/server/context
//    */
//   return { userId: "user_123" };
// });
// // Avoid exporting the entire t-object
// // since it's not very descriptive.
// // For instance, the use of a t variable
// // is common in i18n libraries.
// const t = initTRPC.create({
//   /**
//    * @see https://trpc.io/docs/server/data-transformers
//    */
//   transformer: superjson,
// });

// // Base router and procedure helpers
// export const createTRPCRouter = t.router;
// export const createCallerFactory = t.createCallerFactory;
// export const baseProcedure = t.procedure;
// export const protectedProcedure = baseProcedure.use(async ({ ctx, next }) => {
//   const session = await auth.api.getSession({
//     headers: await headers(),
//   });
//   if (!session) {
//     throw new TRPCError({
//       code: "UNAUTHORIZED",
//       message: "Unauthorized",
//     });
//   }
//   return next({ ctx: { ...ctx, auth: session } });
// });

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { initTRPC, TRPCError } from "@trpc/server";
import { headers } from "next/headers";
import { cache } from "react";
import superjson from "superjson";

/**
 * 1. BETTER CONTEXT
 * We fetch the session here so it's ready for any procedure that needs it.
 * We use React 'cache' to ensure we only fetch the session once per request.
 */
export const createTRPCContext = cache(async () => {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  return {
    prisma,
    session,
  };
});

/**
 * 2. INITIALIZATION
 * We pass the type of our Context to tRPC so we get perfect Auto-complete.
 */
const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
});

export const createTRPCRouter = t.router;
export const baseProcedure = t.procedure;

/**
 * 3. BETTER PROTECTED PROCEDURE
 * Now this middleware is much cleaner because the session is already in the 'ctx'.
 */
export const protectedProcedure = baseProcedure.use(async ({ ctx, next }) => {
  // If no session was found in the context, block the request
  if (!ctx.session || !ctx.session.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be logged in to access this resource",
    });
  }

  // Pass the valid session forward
  return next({
    ctx: {
      ...ctx,
      auth: ctx.session, // TypeScript now knows session is NOT null
    },
  });
});
