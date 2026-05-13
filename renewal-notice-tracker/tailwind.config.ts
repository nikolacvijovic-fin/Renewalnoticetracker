import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#132238",
        brand: {
          50: "#f2f7f5",
          100: "#dbe8e2",
          200: "#b8d0c3",
          300: "#8db09e",
          400: "#66917c",
          500: "#497462",
          600: "#385c4e",
          700: "#2f493f",
          800: "#273b33",
          900: "#1f3029"
        },
        sand: "#f8f6ef",
        warning: "#f59e0b",
        danger: "#dc2626"
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui"]
      },
      boxShadow: {
        panel: "0 18px 50px rgba(19, 34, 56, 0.08)"
      }
    }
  },
  plugins: [require("@tailwindcss/forms")]
};

export default config;
