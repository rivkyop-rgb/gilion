"use client";

import { useActionState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InlineError } from "@/components/states";
import { createTemplateAction, type FormState } from "../../../actions";

export function NewTemplateForm({ newspaperId }: { newspaperId: string }) {
  const bound = createTemplateAction.bind(null, newspaperId);
  const [state, action, pending] = useActionState<FormState, FormData>(bound, {});

  return (
    <form action={action} className="flex max-w-md items-start gap-2">
      <div className="flex-1">
        <Input
          name="name"
          placeholder="שם תבנית חדשה — למשל: מהדורת שישי"
          data-testid="new-template-name"
        />
        {state.errors?.name ? <InlineError>{state.errors.name}</InlineError> : null}
        {state.message ? <InlineError>{state.message}</InlineError> : null}
      </div>
      <Button type="submit" disabled={pending} data-testid="create-template">
        <Plus className="size-4" />
        תבנית חדשה
      </Button>
    </form>
  );
}
