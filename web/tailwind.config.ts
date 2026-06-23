import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0b0f1a",
        panel: "#141a2a",
        accent: "#6ea8fe",
      },
    },
  },
  plugins: [],
};

export default config;
