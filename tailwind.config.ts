import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        pine: "#25453a",
        cream: "#f6f1e7",
        card: "#fffdf8",
        coral: "#e0704a",
        sage: "#a9c4ab",
        line: "#d8cfba",
        ink: "#1c2b26",
        statut: {
          faite: "#4a8a6f",
          absent: "#c0503a",
          reportee: "#c9954a",
        },
      },
      fontFamily: {
        serif: ["var(--font-fraunces)", "serif"],
        sans: ["var(--font-work-sans)", "sans-serif"],
      },
      borderRadius: {
        xl: "16px",
        "2xl": "20px",
      },
      boxShadow: {
        card: "0 2px 10px 0 rgb(37 69 58 / 0.08)",
        sheet: "0 -4px 24px 0 rgb(37 69 58 / 0.15)",
      },
      keyframes: {
        "slide-up": {
          from: { transform: "translateY(100%)" },
          to: { transform: "translateY(0)" },
        },
      },
      animation: {
        "slide-up": "slide-up 0.22s cubic-bezier(0.32, 0.72, 0, 1)",
      },
    },
  },
  plugins: [],
};
export default config;
