/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        creditcoin: "#4F46E5",
        "creditcoin-dark": "#4338CA",
        success: "#10B981",
        warning: "#F59E0B",
      },
    },
  },
  plugins: [],
};
