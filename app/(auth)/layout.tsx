import { loadLoginBrand } from "@/lib/data/business-settings";
import { textFor } from "@/lib/domain/business-settings";
import { cssVariables } from "@/lib/domain/theme-tokens";
import { BrandMark } from "@/components/brand/brand-mark";

/**
 * Auth shell — no sidebar, no top bar. Split screen: the brand on a dark
 * primary field, the form on white (docs/plan/01-auth-multitenancy.md §מסכים).
 *
 * The branding here is a special case and the comment on `loadLoginBrand`
 * explains it: nobody has signed in yet, so there is no tenant, and "whose
 * logo" only has an answer when the installation holds one business.
 */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const brand = await loadLoginBrand();

  return (
    <div className="flex min-h-screen" style={cssVariables(brand.colors)}>
      <aside className="hidden w-1/2 flex-col items-center justify-center gap-6 bg-primary p-12 lg:flex">
        <BrandMark slot="logo_full" keys={brand} width={240} height={160} className="max-h-40" />
        <div className="text-center">
          <p
            data-testid="login-brand-name"
            className="font-serif text-4xl font-bold text-on-primary"
          >
            {brand.displayName || "Gilion"}
          </p>
          <p data-testid="login-subtitle" className="mt-2 text-sm text-brand-gold">
            {textFor("login_subtitle", brand.texts)}
          </p>
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
