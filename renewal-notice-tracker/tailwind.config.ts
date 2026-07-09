import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0F172A",
        surface: "#FFFFFF",
        brand: {
          50: "#EFF6FF",
          100: "#DBEAFE",
          200: "#BFDBFE",
          300: "#93C5FD",
          400: "#60A5FA",
          500: "#3B82F6",
          600: "#2563EB",
          700: "#1D4ED8",
          800: "#1E40AF",
          900: "#1E3A8A"
        },
        slatepaper: "#F8FAFC",
        muted: "#475569",
        line: "#E2E8F0",
        success: "#16A34A",
        warning: "#F59E0B",
        urgent: "#EA580C",
        critical: "#DC2626",
        locked: "#334155",
        automation: "#0D9488",
        danger: "#DC2626"
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui"]
      },
      boxShadow: {
        panel: "0 18px 50px rgba(15, 23, 42, 0.07)"
      }
    }
  },
  plugins: [require("@tailwindcss/forms")]
};

export default config;
