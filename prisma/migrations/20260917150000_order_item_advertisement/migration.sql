-- Backlog 26: a request's lines may carry different artwork.
ALTER TABLE "AdOrderItem" ADD COLUMN "advertisement_id" TEXT;
ALTER TABLE "AdOrderItem" ADD CONSTRAINT "AdOrderItem_advertisement_id_fkey"
  FOREIGN KEY ("advertisement_id") REFERENCES "Advertisement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
