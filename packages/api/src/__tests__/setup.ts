/**
 * Test setup for packages/api (tRPC router tests).
 * Reuses core test setup + adds tRPC caller factory.
 */

// Auth helpers come from the DB-free helpers module. Router tests that need a
// real database should import testPrisma/cleanDatabase from core setup
// directly, so DB-free tests run without DATABASE_URL.
export { mockAuth, mockEditorAuth, mockContributorAuth } from "../../../core/src/__tests__/helpers";

import { appRouter } from "../root";
import { createCallerFactory } from "../trpc";
import type { AuthContext } from "@nextpress/core/auth/auth-types";

const createCaller = createCallerFactory(appRouter);

/** Create a typed tRPC caller with a mock auth context */
export function createTestCaller(auth: AuthContext) {
  return createCaller({
    session: auth.user,
    auth,
  });
}
