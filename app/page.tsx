import Image from "next/image";

/**
 * Temporary token page. Its only job is to prove, visually, that the three
 * fonts load with real Hebrew glyphs, that the palette is wired, and that the
 * document flows right-to-left. Deleted in stage 01.
 */

const CORE = [
  { name: "primary", cls: "bg-primary", fg: "text-on-primary", hex: "#000613" },
  {
    name: "primary-container",
    cls: "bg-primary-container",
    fg: "text-on-primary",
    hex: "#001f3f",
  },
  { name: "secondary", cls: "bg-secondary", fg: "text-on-primary", hex: "#735c00" },
  { name: "brand-gold", cls: "bg-brand-gold", fg: "text-on-surface", hex: "#D4AF37" },
  { name: "state-active", cls: "bg-state-active", fg: "text-on-surface", hex: "#fed65b" },
  { name: "error", cls: "bg-error", fg: "text-on-primary", hex: "#ba1a1a" },
];

const SURFACES = [
  { name: "surface-container-lowest", cls: "bg-surface-container-lowest", hex: "#ffffff" },
  { name: "surface", cls: "bg-surface", hex: "#f9f9ff" },
  { name: "surface-container-low", cls: "bg-surface-container-low", hex: "#f0f3ff" },
  { name: "surface-container", cls: "bg-surface-container", hex: "#e7eeff" },
  { name: "surface-container-high", cls: "bg-surface-container-high", hex: "#dee8ff" },
  { name: "surface-container-highest", cls: "bg-surface-container-highest", hex: "#d8e3fa" },
  { name: "surface-dim", cls: "bg-surface-dim", hex: "#cfdaf1" },
];

const STATUSES = [
  { label: "שובץ", bg: "bg-status-success-bg", fg: "text-status-success-fg" },
  { label: "ממתין", bg: "bg-status-warning-bg", fg: "text-status-warning-fg" },
  { label: "חסר חומר", bg: "bg-status-error-bg", fg: "text-status-error-fg" },
  { label: "חוב פתוח", bg: "bg-status-debt-bg", fg: "text-status-debt-fg" },
  { label: "טיוטה", bg: "bg-status-neutral-bg", fg: "text-status-neutral-fg" },
];

export default function TokensPage() {
  return (
    <main className="mx-auto max-w-[1440px] p-8">
      <header className="mb-10 flex items-center gap-4">
        <Image src="/brand/mark.svg" alt="" width={48} height={48} priority />
        <div>
          <h1 className="text-[32px] leading-10 font-semibold">Gilion — דף טוקנים</h1>
          <p className="text-on-surface-variant">
            עמוד זמני לאימות ויזואלי של פונטים, צבעים וכיוון. נמחק בשלב 01.
          </p>
        </div>
      </header>

      <section className="mb-10">
        <h2 className="mb-4 text-xl font-semibold">טיפוגרפיה</h2>
        <div className="space-y-3 rounded-lg border border-outline-variant bg-surface-container-lowest p-6">
          <p className="font-serif text-5xl leading-[56px] font-bold">
            כותרת שער — Frank Ruhl Libre
          </p>
          <p className="font-serif text-[32px] leading-10 font-semibold">
            כותרת עמוד — הזמנת פרסום חדשה
          </p>
          <p className="font-sans text-xl font-semibold">כותרת כרטיס — Heebo</p>
          <p className="font-sans text-base">טקסט מורחב בגופן Heebo, ברירת המחדל של המערכת.</p>
          <p className="font-sans text-sm">טקסט ברירת מחדל 14px — טבלאות, תפריטים וטפסים.</p>
          <p className="ltr-isolate font-mono text-xs tracking-[0.05em]">
            INV-2023-081 · 130x380 mm · EDITORIAL PORTAL
          </p>
        </div>
      </section>

      <section className="mb-10">
        <h2 className="mb-4 text-xl font-semibold">צבעי ליבה</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {CORE.map((c) => (
            <div key={c.name} className={`${c.cls} ${c.fg} rounded-lg p-4`}>
              <div className="font-sans text-sm font-semibold">{c.name}</div>
              <div className="ltr-isolate font-mono text-xs">{c.hex}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-10">
        <h2 className="mb-4 text-xl font-semibold">היררכיית משטחים</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {SURFACES.map((s) => (
            <div
              key={s.name}
              className={`${s.cls} rounded-lg border border-outline-variant p-4 text-on-surface`}
            >
              <div className="font-sans text-xs font-semibold">{s.name}</div>
              <div className="ltr-isolate font-mono text-xs">{s.hex}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-10">
        <h2 className="mb-4 text-xl font-semibold">צבעי סטטוס</h2>
        <div className="flex flex-wrap gap-3">
          {STATUSES.map((s) => (
            <span
              key={s.label}
              className={`${s.bg} ${s.fg} rounded-full px-3 py-1 text-sm font-medium`}
            >
              {s.label}
            </span>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-xl font-semibold">בידוד דו־כיווני</h2>
        <p className="rounded-lg border border-outline-variant bg-surface-container-lowest p-4">
          חשבונית <span className="ltr-isolate font-mono">INV-2023-081</span> בסך{" "}
          <span className="ltr-isolate font-mono">₪45,000</span> מתאריך{" "}
          <span className="ltr-isolate font-mono">24/10/2023</span> — המספרים נשארים LTR בתוך זרימת
          RTL.
        </p>
      </section>
    </main>
  );
}
