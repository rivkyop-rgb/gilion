import Image from "next/image";

/**
 * Auth shell — no sidebar, no top bar. Split screen: the brand on a dark
 * primary field, the form on white (docs/plan/01-auth-multitenancy.md §מסכים).
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-1/2 flex-col items-center justify-center gap-6 bg-primary p-12 lg:flex">
        <Image src="/brand/logo-mark.png" alt="" width={240} height={160} priority />
        <div className="text-center">
          <p className="font-serif text-4xl font-bold text-on-primary">Gilion</p>
          <p className="mt-2 text-sm text-brand-gold">ניהול פרסום בעיתון</p>
        </div>
      </aside>

      <main className="flex w-full items-center justify-center bg-surface p-6 lg:w-1/2">
        <div className="w-full max-w-sm rounded-xl border border-outline-variant bg-surface-container-lowest p-8 shadow-sm">
          {children}
        </div>
      </main>
    </div>
  );
}
