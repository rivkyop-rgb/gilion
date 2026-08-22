import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
  {
    variants: {
      tone: {
        success: "bg-status-success-bg text-status-success-fg",
        warning: "bg-status-warning-bg text-status-warning-fg",
        error: "bg-status-error-bg text-status-error-fg",
        debt: "bg-status-debt-bg text-status-debt-fg",
        neutral: "bg-status-neutral-bg text-status-neutral-fg",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function Badge({
  className,
  tone,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
