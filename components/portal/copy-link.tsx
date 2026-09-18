"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Copies a link and says so. Falls back to selecting the text when the
 * clipboard API is refused — it is, on a plain-http address like the demo's.
 */
export function CopyLink({
  url,
  label = "העתקת הקישור",
  testId,
}: {
  url: string;
  label?: string;
  testId?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const area = document.createElement("textarea");
      area.value = url;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button type="button" variant="secondary" onClick={copy} data-testid={testId} data-url={url}>
      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      {copied ? "הועתק" : label}
    </Button>
  );
}
