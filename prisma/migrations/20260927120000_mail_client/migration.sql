-- Where email links open, chosen per business in the admin panel. Gmail by
-- default (the user, 27/09/2026): a compose tab with the message written.
CREATE TYPE "MailClient" AS ENUM ('gmail', 'mailto');
ALTER TABLE "Business" ADD COLUMN "mail_client" "MailClient" NOT NULL DEFAULT 'gmail';
