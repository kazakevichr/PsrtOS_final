import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { 50: "#eef4ff", 600: "#2952e3", 700: "#1e40c9" },
      },
    },
  },
  plugins: [],
};
export default config;
