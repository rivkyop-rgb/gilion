"use client";

import { useActionState, useRef } from "react";
import { FileUp, Loader2 } from "lucide-react";

import { AD_ACCEPT_ATTRIBUTE } from "@/lib/domain/ad-file";
import { Button } from "@/components/ui/button";
import { uploadToPublicationAction, type PortalUploadState } from "@/app/(portal)/portal/actions";

/** One button per publication waiting for artwork (backlog 24). */
export function PublicationUpload({ publicationId }: { publicationId: string }) {
  const form = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [state, action, pending] = useActionState<PortalUploadState, FormData>(
    uploadToPublicationAction.bind(null, publicationId),
    {},
  );

  return (
    <form ref={form} action={action} className="flex flex-col items-end gap-1">
      <input
        ref={input}
        type="file"
        name="file"
        accept={AD_ACCEPT_ATTRIBUTE}
        className="sr-only"
        data-testid={`publication-file-${publicationId}`}
        onChange={() => form.current?.requestSubmit()}
      />
      <Button
        type="button"
        size="sm"
        disabled={pending}
        onClick={() => input.current?.click()}
        data-testid={`publication-upload-${publicationId}`}
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />}
        {pending ? "מעלה…" : "העלאת מודעה"}
      </Button>
      {state.message ? (
        <p role="alert" data-testid="field-error" className="max-w-64 text-xs text-error">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
