/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        nubi: {
          background: "#0f172a",
          accent: "#38bdf8",
          accentDark: "#0ea5e9",
        },
      },
    },
  },
  plugins: [],
};
