import { defineConfig, presetWind4 } from "unocss";

export default defineConfig({
  presets: [
    presetWind4({
      preflights: { reset: false },
    }),
  ],
  content: {
    filesystem: ["src/**/*.{astro,svelte,html}"],
  },
  theme: {
    colors: {
      festival: {
        bg: "#171c1a",
        text: "#e9e5da",
        muted: "var(--muted)",
        line: "var(--line)",
        gold: "var(--gold)",
        panel: "var(--panel)",
      },
    },
    font: {
      sans: '\"Noto Sans KR\", sans-serif',
      serif: '\"Noto Serif KR\", serif',
    },
  },
});
