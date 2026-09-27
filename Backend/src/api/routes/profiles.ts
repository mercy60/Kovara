import { Router, Request, Response } from "express";
import { Database } from "../../db";
import { ApiErrorResponse, ProfileResponse } from "../contracts";
import { isStellarAddress, parseStellarAddress, sendValidationError } from "../validation";

/**
 * Validates that the given string is a well-formed Stellar public key.
 *
 * Kept as a named export for existing callers, but delegates to the shared
 * validator (issue #665) so this endpoint cannot drift from the rest of the
 * API: Stellar strkeys use the base-32 alphabet `A–Z`, `2–7`, not `[A-Z0-9]`.
 */
export function isValidStellarAddress(addr: string): boolean {
  return isStellarAddress(addr);
}

export function createProfilesRouter(db: Database): Router {
  const router = Router();

  /**
   * GET /profiles/:address
   * Returns the profile for the given Stellar address.
   */
  router.get(
    "/:address",
    async (req: Request, res: Response<ProfileResponse | ApiErrorResponse>): Promise<void> => {
      const parsed = parseStellarAddress(req.params.address);
      if (!parsed.ok) {
        sendValidationError(res, parsed.issue);
        return;
      }

      const profile = await db.getProfile(parsed.value);
      if (!profile) {
        res.status(404).json({ error: "Profile not found", code: "NOT_FOUND" });
        return;
      }

      res.json(profile);
    }
  );

  return router;
}
