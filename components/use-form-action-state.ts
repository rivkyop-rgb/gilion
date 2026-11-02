"use client";

import { useActionState, useCallback, useRef, type FormEvent } from "react";

type Loose = {
  ok?: boolean;
  done?: boolean;
  error?: string;
  message?: string;
  errors?: Record<string, string | undefined>;
};

/** A result the user still has to act on: field errors, or a message that is not a success. */
function looksFailed(state: unknown): boolean {
  if (!state || typeof state !== "object") return false;
  const s = state as Loose;
  if (s.ok || s.done) return false;
  return Boolean(
    s.error || s.message || (s.errors && Object.values(s.errors).some((v) => Boolean(v))),
  );
}

/**
 * `useActionState` for a `<form action>` that must not lose what was typed.
 *
 * React 19 calls `form.reset()` when a form action settles — on failure too —
 * so every uncontrolled field went back to its `defaultValue` and the error
 * stood above an empty form: one wrong digit in a tax id cost the whole card.
 * The reset event is cancelable, so `onReset` cancels it when the action
 * failed, and moves focus to the first field the server marked invalid. On
 * success the reset still happens, as before.
 *
 * Usage: `const [state, action, pending, onReset] = useFormActionState(...)`,
 * then `<form action={action} onReset={onReset}>`.
 */
export function useFormActionState<S, P = FormData>(
  action: (prev: S, payload: P) => S | Promise<S>,
  initial: S,
  failed: (state: S) => boolean = looksFailed,
) {
  const lastFailed = useRef(false);
  const wrapped = useCallback(
    async (prev: S, payload: P): Promise<S> => {
      const next = await action(prev, payload);
      lastFailed.current = failed(next);
      return next;
    },
    [action, failed],
  );
  const [state, formAction, pending] = useActionState<S, P>(
    // `S` is never a promise here; React types the state as `Awaited<S>`.
    wrapped as (prev: Awaited<S>, payload: P) => Promise<S>,
    initial as Awaited<S>,
  );

  const onReset = useCallback((e: FormEvent<HTMLFormElement>) => {
    if (!lastFailed.current) return;
    e.preventDefault();
    const form = e.currentTarget;
    // After the commit that renders the errors, so aria-invalid is already on the field.
    requestAnimationFrame(() => {
      form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    });
  }, []);

  return [state, formAction, pending, onReset] as const;
}
