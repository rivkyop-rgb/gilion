"use client";

import { ErrorState, ForbiddenState } from "@/components/states";
import { FORBIDDEN_DIGEST } from "@/lib/auth/rbac";

/**
 * requireAccess throws ForbiddenError, and this boundary decides which of the
 * two screens the user gets.
 *
 * The match is on `digest`, not on `name` or `message`. A production build
 * strips both on their way to the client — `next dev` keeps them, which is why
 * matching on the name worked locally and silently degraded to the generic
 * "something went wrong" screen (and a 500 in the log) once built. `digest` is
 * forwarded verbatim, so it is the only field that means the same thing in
 * both. The name check stays as a second chance, not as the primary one.
 */
export default function InternalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  if (error.digest === FORBIDDEN_DIGEST || error.name === "ForbiddenError") {
    return <ForbiddenState />;
  }
  return <ErrorState retry={reset} />;
}
