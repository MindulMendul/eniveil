import { defineConfig } from "astro/config";
import svelte from "@astrojs/svelte";

export default defineConfig({
  output: "static",
  integrations: [svelte()],
  server: { host: "0.0.0.0", port: 5173 },
  vite: {
    server: {
      proxy: {
        "/api": "http://127.0.0.1:3000",
        "/ws": { target: "ws://127.0.0.1:3000", ws: true },
      },
    },
  },
});
