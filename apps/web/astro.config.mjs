import { defineConfig } from "astro/config";
import svelte from "@astrojs/svelte";
import UnoCSS from "@unocss/astro";
import { managedWebpAssets } from "./src/shared/images/build";

export default defineConfig({
  output: "static",
  site: process.env.PUBLIC_SITE_URL || "https://mindul-murder-mystery.duckdns.org",
  i18n: {
    locales: ["ko", "en"],
    defaultLocale: "ko",
    routing: { prefixDefaultLocale: false },
  },
  integrations: [managedWebpAssets(), svelte(), UnoCSS()],
  server: { host: "0.0.0.0", port: 5173 },
  vite: {
    server: {
      proxy: {
        "/api/lobby": { target: "http://127.0.0.1:3000", ws: true },
        "/api": "http://127.0.0.1:3000",
      },
    },
  },
});
