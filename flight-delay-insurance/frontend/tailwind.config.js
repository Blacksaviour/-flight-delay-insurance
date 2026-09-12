/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        creditcoin: "#6366F1",
        "creditcoin-light": "#818CF8",
        "creditcoin-dark": "#4F46E5",
        success: "#10B981",
        "success-dark": "#059669",
        warning: "#F59E0B",
        danger: "#EF4444",
        info: "#3B82F6",
        surface: "#12141F",
        "surface-hover": "#171A28",
        "surface-border": "#232636",
      },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,0.4), 0 8px 24px -8px rgba(0,0,0,0.5)",
        glow: "0 0 0 1px rgba(99,102,241,0.15), 0 0 40px -8px rgba(99,102,241,0.25)",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
