import { headers } from "next/headers";
import { resolveSite } from "@/lib/site/resolve";
import { themeManager } from "@nextpress/core/theme/theme-manager";
import { prisma } from "@nextpress/db";
import { registerDefaultThemes } from "@/lib/theme/register-themes";

// Register pre-bundled themes at module-load time so webpack bundles them.
registerDefaultThemes();

/**
 * Public site layout — wraps all (site) routes in the active theme's layout.
 *
 * Resolution:
 *   1. Resolve site from request headers
 *   2. Find active ThemeInstall for the site
 *   3. Load the theme (templates, layout, block overrides)
 *   4. Render the theme's layout component with customizations
 */
export default async function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const h = await headers();
  const site = await resolveSite(h);
  if (!site) {
    return <div className="p-8 text-center">Site not found</div>;
  }

  const theme = await themeManager.getActive(site.id);
  const ThemeLayout = theme.layout;

  // Get customizations from DB
  const install = await prisma.themeInstall.findFirst({
    where: { siteId: site.id, isActive: true },
  });
  const customizations = (install?.customizations as Record<string, unknown>) ?? {};

  return (
    <ThemeLayout customizations={customizations}>
      {children}
    </ThemeLayout>
  );
}
