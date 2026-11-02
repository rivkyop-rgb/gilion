"use client";

import { useTransition } from "react";
import { useFormActionState } from "@/components/use-form-action-state";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/states";
import type { PanelState, ResetGroup } from "@/app/(internal)/settings/business-settings-actions";
import { resetSettingAction } from "@/app/(internal)/settings/business-settings-actions";

/**
 * The frame all four admin-panel screens share (stage 11 §מסכים).
 *
 * One save button, a "saved" state, and one place where a warning can be shown
 * without blocking the save — because every rule on these screens that could
 * warn (contrast below AA, an SVG that had script stripped out of it) is
 * explicitly a warning and not a refusal, and four hand-rolled copies of that
 * distinction would drift apart.
 */
export function PanelForm({
  action,
  group,
  resetLabel,
  onReset,
  children,
}: {
  action: (prev: PanelState, formData: FormData) => Promise<PanelState>;
  group: ResetGroup;
  resetLabel: string;
  /**
   * Called after a successful reset, for a screen that keeps its own copy of
   * the values. `router.refresh()` re-renders the server tree, but a
   * `useState` initialiser runs once at mount and will not see the new props —
   * so a controlled field would keep showing the value that was just reset,
   * and the screen would disagree with the database with nothing to explain it.
   */
  onReset?: (key?: string) => void;
  children: React.ReactNode;
}) {
  const [state, formAction, pending, keepTypedOnError] = useFormActionState(action, {});
  const [resetting, startReset] = useTransition();
  const router = useRouter();

  const resetAll = () =>
    startReset(async () => {
      await resetSettingAction(group);
      onReset?.();
      router.refresh();
    });

  return (
    <form action={formAction} onReset={keepTypedOnError} className="space-y-6">
      {children}

      {/*
        EVERY refusal the action produced, and not only the top-level one.

        This frame used to render `state.message` alone, and the field errors —
        which is how a rejected FILE comes back, keyed by its input — were
        computed on the server and dropped on the floor. Uploading a PDF renamed
        to .png did exactly nothing: no error, no save, no clue. A refusal that
        never reaches the screen is indistinguishable from a dead button, and
        the person then tries the same file again. Caught by
        admin-panel-branding.spec.ts on its first run.
      */}
      {state.message && !state.ok ? <InlineError>{state.message}</InlineError> : null}

      {Object.entries(state.errors ?? {}).map(([field, message]) => (
        <InlineError key={field}>{message}</InlineError>
      ))}

      {state.warnings?.length ? (
        <ul
          data-testid="panel-warnings"
          className="space-y-2 rounded-lg bg-status-warning-bg p-4 text-sm text-status-warning-fg"
        >
          {state.warnings.map((w) => (
            <li key={w} className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>{w}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending} data-testid="panel-save">
          {pending ? "שומרת…" : "שמירה"}
        </Button>

        <Button
          type="button"
          variant="ghost"
          disabled={resetting}
          onClick={resetAll}
          data-testid="panel-reset-all"
        >
          <RotateCcw className="size-4" />
          {resetLabel}
        </Button>

        {/*
          role="status" so the message is announced, and so a test can wait for
          something that can only be true AFTER the action returned — the count
          in it is the number the SERVER stored, never one the form computed.
        */}
        {state.ok && state.message ? (
          <span
            role="status"
            data-testid="panel-saved"
            className="flex items-center gap-1 text-sm font-medium text-status-success-fg"
          >
            <Check className="size-4" />
            {state.message}
          </span>
        ) : null}
      </div>
    </form>
  );
}

/** "Back to the default" for one field, next to the field itself. */
export function ResetFieldButton({
  group,
  fieldKey,
  label,
  onReset,
}: {
  group: ResetGroup;
  fieldKey: string;
  label: string;
  /** See PanelForm's `onReset` — same reason. */
  onReset?: (key: string) => void;
}) {
  const [busy, start] = useTransition();
  const router = useRouter();

  return (
    <button
      type="button"
      disabled={busy}
      data-testid={`reset-${fieldKey}`}
      title={label}
      aria-label={label}
      onClick={() =>
        start(async () => {
          await resetSettingAction(group, fieldKey);
          onReset?.(fieldKey);
          router.refresh();
        })
      }
      className="rounded-sm p-1 text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface disabled:opacity-50"
    >
      <RotateCcw className="size-4" />
    </button>
  );
}
