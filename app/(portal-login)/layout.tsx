import { loadLoginBrand } from "@/lib/data/business-settings";
import { cssVariables } from "@/lib/domain/theme-tokens";

/**
 * The portal's sign-in wears the portal's shape, not the staff login's split
 * screen: one centred card, like everything a customer sees after it.
 */
export default async function PortalLoginLayout({ children }: { children: React.ReactNode }) {
  const brand = await loadLoginBrand();
  return (
    <div
      className="flex min-h-screen items-center justify-center bg-surface p-6"
      style={cssVariables(brand.colors)}
    >
      <div className="w-full max-w-md rounded-xl border border-outline-variant bg-surface-container-lowest p-8 shadow-elevation-1">
        {children}
      </div>
    </div>
  );
}
