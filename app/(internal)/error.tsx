"use client";

import { ErrorState, ForbiddenState } from "@/components/states";

/**
 * requireAccess throws ForbiddenError. Next serialises the error across the
 * server/client boundary, so the name is matched rather than the instance.
 */
export default function InternalError({ error, reset }: { error: Error; reset: () => void }) {
  if (error.name === "ForbiddenError" || error.message.includes("lacks")) {
    return <ForbiddenState />;
  }
  return <ErrorState retry={reset} />;
}
