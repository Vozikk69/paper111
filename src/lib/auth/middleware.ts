import { createMiddleware } from "@tanstack/react-start";

/**
 * Auth middleware for server functions.
 * Provides context.userId from the database session cookie.
 */
export const authMiddleware = createMiddleware({ type: "function" })
  .client(async ({ next }) => {
    return next({ sendContext: { bearerToken: undefined as string | undefined } });
  })
  .server(async ({ next }) => {
    const { requireUserId } = await import("./verify.server");
    const userId = await requireUserId();
    return next({ context: { userId } });
  });
