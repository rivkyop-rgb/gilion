import Link from "next/link";
import { Button } from "@/components/ui/button";

/** The portal's own 404 — the global one links to the staff dashboard. */
export default function RequestNotFound() {
  return (
    <div
      data-testid="portal-not-found"
      className="rounded-xl border border-outline-variant bg-surface-container-lowest p-8 text-center"
    >
      <h1 className="mb-2 font-serif text-2xl font-semibold">הבקשה לא נמצאה</h1>
      <p className="mb-6 text-sm text-on-surface-variant">ייתכן שהקישור שגוי.</p>
      <Button asChild variant="secondary">
        <Link href="/portal">לבקשות שלי</Link>
      </Button>
    </div>
  );
}
