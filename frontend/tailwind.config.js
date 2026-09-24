/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // UMB Brand Colors (from design)
        umb: {
          yellow: "#F4A623", // Primary UMB gold/yellow
          "yellow-light": "#FFC966",
          "yellow-dark": "#E59400",
        },
        navy: "#172b4d",
        ink: "#182840",
        brand: {
          50: "#fffbeb",
          100: "#fef3c7",
          400: "#FFC966",
          500: "#F4A623", // UMB primary gold
          600: "#E59400",
          700: "#D48400",
        },
        // Semantic colors
        success: "#10b981",
        warning: "#f59e0b",
        error: "#ef4444",
        info: "#3b82f6",
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(0 0 0 / 0.04), 0 1px 3px 0 rgb(0 0 0 / 0.06)",
      },
      backgroundColor: {
        "dark-primary": "#1a1a1a",
        "dark-secondary": "#2a2a2a",
      },
      textColor: {
        "dark-primary": "#ffffff",
        "dark-secondary": "#d1d5db",
      },
    },
  },
  plugins: [],
};
