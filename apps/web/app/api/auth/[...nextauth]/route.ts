/**
 * Auth.js HTTP handler.
 * Handles all /api/auth/* routes: signin, signout, callback, session, csrf.
 */
import { handlers } from "@/lib/auth/config";
export const { GET, POST } = handlers;
