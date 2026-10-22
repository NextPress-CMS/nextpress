import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./lib/**/*.{js,ts,jsx,tsx}",
    "../../packages/blocks/src/**/*.{js,ts,jsx,tsx}",
    "../../packages/ui/src/**/*.{js,ts,jsx,tsx}",
    // Scoped to plugin source only. A bare `plugins/**` glob also walks each
    // plugin's node_modules, which makes the CSS build crawl.
    "../../plugins/*/*.{js,ts,jsx,tsx}",
    "../../plugins/*/src/**/*.{js,ts,jsx,tsx}",
    "../../plugins/*/components/**/*.{js,ts,jsx,tsx}",
    "../../plugins/*/lib/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#080b18",
        "primary-light": "#0f172a",
        accent: "#6366f1",
        "accent-light": "#818cf8",
        "accent-bright": "#a5b4fc",
        cyan: "#22d3ee",
        "cyan-light": "#67e8f9",
        surface: "#0f172a",
        "surface-light": "#1e293b",
        gold: "#f59e0b",
      },
      animation: {
        "gradient-shift": "gradientShift 8s ease infinite",
        "border-rotate": "borderRotate 6s linear infinite",
        "pulse-block": "pulseBlock 2.5s ease-in-out infinite",
        "chain-flow": "chainFlow 1.5s linear infinite",
        "float-slow": "floatSlow 6s ease-in-out infinite",
        "shimmer-slide": "shimmerSlide 2.5s ease-in-out infinite",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
      },
    },
  },
  plugins: [typography],
};

export default config;
