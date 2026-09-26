"use client";

import { createContext, useContext } from "react";
import type { MailClient } from "@/lib/domain/mail-link";

/**
 * The business's choice of mail program, handed to every email link below the
 * shell. Provided once by the internal layout, so no screen has to pass it
 * down — and a screen added later gets it without knowing it exists.
 */
const MailClientContext = createContext<MailClient>("gmail");

export function MailClientProvider({
  value,
  children,
}: {
  value: MailClient;
  children: React.ReactNode;
}) {
  return <MailClientContext.Provider value={value}>{children}</MailClientContext.Provider>;
}

export function useMailClient(): MailClient {
  return useContext(MailClientContext);
}
