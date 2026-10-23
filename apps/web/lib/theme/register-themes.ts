import { registerTheme } from "@nextpress/core/theme/theme-manager";
import {
  themeManifestSchema,
  type LoadedTheme,
  type TemplateComponent,
} from "@nextpress/core/theme/theme-types";

// ── Default theme imports ──

import DefaultThemeLayout from "@nextpress/default/layout";
import DefaultHomeTemplate from "@nextpress/default/templates/home";
import DefaultArchiveTemplate from "@nextpress/default/templates/archive";
import DefaultSingleTemplate from "@nextpress/default/templates/single";
import DefaultPageTemplate from "@nextpress/default/templates/page";
import DefaultSearchTemplate from "@nextpress/default/templates/search";
import DefaultNotFoundTemplate from "@nextpress/default/templates/404";
import DefaultParagraphBlock from "@nextpress/default/blocks/paragraph";
import defaultManifestRaw from "@nextpress/default/theme.json";

// ── Twenty Twenty-Six theme imports ──

import TwentyTwentySixLayout from "@nextpress/twentytwentysix/layout";
import TwentyTwentySixHomeTemplate from "@nextpress/twentytwentysix/templates/home";
import TwentyTwentySixArchiveTemplate from "@nextpress/twentytwentysix/templates/archive";
import TwentyTwentySixSingleTemplate from "@nextpress/twentytwentysix/templates/single";
import TwentyTwentySixPageTemplate from "@nextpress/twentytwentysix/templates/page";
import TwentyTwentySixSearchTemplate from "@nextpress/twentytwentysix/templates/search";
import TwentyTwentySixNotFoundTemplate from "@nextpress/twentytwentysix/templates/404";
import TwentyTwentySixIndexTemplate from "@nextpress/twentytwentysix/templates/index";
import TwentyTwentySixParagraphBlock from "@nextpress/twentytwentysix/blocks/paragraph";
import TwentyTwentySixHeadingBlock from "@nextpress/twentytwentysix/blocks/heading";
import twentyTwentySixManifestRaw from "@nextpress/twentytwentysix/theme.json";

// ── Registration guard (idempotent) ──

let registered = false;

/**
 * Register pre-built themes with the theme manager.
 *
 * This MUST be called once at server startup to make themes available
 * to the bundler. Without this, webpack cannot bundle theme files from
 * outside `apps/web` via dynamic `import()`.
 *
 * Idempotent — safe to call multiple times.
 */
export function registerDefaultThemes(): void {
  if (registered) return;
  registered = true;

  // ── Default theme ──

  const defaultManifest = themeManifestSchema.parse(defaultManifestRaw);

  const defaultTemplates = new Map<string, TemplateComponent>();
  defaultTemplates.set("home", DefaultHomeTemplate);
  defaultTemplates.set("archive", DefaultArchiveTemplate);
  defaultTemplates.set("single", DefaultSingleTemplate);
  defaultTemplates.set("page", DefaultPageTemplate);
  defaultTemplates.set("search", DefaultSearchTemplate);
  defaultTemplates.set("404", DefaultNotFoundTemplate);

  const defaultBlockOverrides = new Map<string, any>();
  defaultBlockOverrides.set("core/paragraph", DefaultParagraphBlock);

  const defaultTheme: LoadedTheme = {
    manifest: defaultManifest,
    templates: defaultTemplates,
    layout: DefaultThemeLayout,
    blockOverrides: defaultBlockOverrides,
    cssPath: "styles/theme.css",
  };

  registerTheme("default", defaultTheme);

  // ── Twenty Twenty-Six theme ──

  const twentyTwentySixManifest = themeManifestSchema.parse(twentyTwentySixManifestRaw);

  const twentyTwentySixTemplates = new Map<string, TemplateComponent>();
  twentyTwentySixTemplates.set("home", TwentyTwentySixHomeTemplate);
  twentyTwentySixTemplates.set("archive", TwentyTwentySixArchiveTemplate);
  twentyTwentySixTemplates.set("single", TwentyTwentySixSingleTemplate);
  twentyTwentySixTemplates.set("page", TwentyTwentySixPageTemplate);
  twentyTwentySixTemplates.set("search", TwentyTwentySixSearchTemplate);
  twentyTwentySixTemplates.set("404", TwentyTwentySixNotFoundTemplate);
  twentyTwentySixTemplates.set("index", TwentyTwentySixIndexTemplate);

  const twentyTwentySixBlockOverrides = new Map<string, any>();
  twentyTwentySixBlockOverrides.set("core/paragraph", TwentyTwentySixParagraphBlock);
  twentyTwentySixBlockOverrides.set("core/heading", TwentyTwentySixHeadingBlock);

  const twentyTwentySixTheme: LoadedTheme = {
    manifest: twentyTwentySixManifest,
    templates: twentyTwentySixTemplates,
    layout: TwentyTwentySixLayout,
    blockOverrides: twentyTwentySixBlockOverrides,
    cssPath: "styles/theme.css",
  };

  registerTheme("twentytwentysix", twentyTwentySixTheme);
}
