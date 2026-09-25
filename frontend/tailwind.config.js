/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Warm neutrals — complements sidebar #181716 in dark mode
        slate: {
          50: "#fafaf9",
          100: "#f5f5f4",
          200: "#e7e5e4",
          300: "#d6d3d1",
          400: "#a8a29e",
          500: "#78716c",
          600: "#57534e",
          700: "#3f3d3b",
          800: "#282624",
          900: "#1c1b1a",
          950: "#121110",
        },
        umb: {
          yellow: "#F4A623",
          "yellow-light": "#FFC966",
          "yellow-dark": "#E59400",
        },
        navy: "#181716",
        ink: "#182840",
        brand: {
          50: "#fffbeb",
          100: "#fef3c7",
          200: "#fde68a",
          300: "#fcd34d",
          400: "#FFC966",
          500: "#F4A623",
          600: "#E59400",
          700: "#D48400",
          800: "#b45309",
          900: "#78350f",
          950: "#451a03",
        },
        success: "#10b981",
        warning: "#f59e0b",
        error: "#ef4444",
        info: "#3b82f6",
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(0 0 0 / 0.04), 0 1px 3px 0 rgb(0 0 0 / 0.06)",
      },
      backgroundColor: {
        "dark-primary": "#121110",
        "dark-secondary": "#1c1b1a",
      },
      textColor: {
        "dark-primary": "#fafaf9",
        "dark-secondary": "#d6d3d1",
      },
    },
  },
  plugins: [],
};
