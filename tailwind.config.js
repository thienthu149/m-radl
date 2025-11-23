/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // --- ADDED CUSTOM ANIMATION ---
      animation: {
        'float-fade': 'float-fade 2s ease-out forwards', // 2 seconds duration
      },
      keyframes: {
        'float-fade': {
          '0%': { 
            transform: 'translateY(0) scale(1)', 
            opacity: '1' 
          },
          '20%': { 
            opacity: '1' 
          }, // Hold full opacity briefly
          '100%': { 
            transform: 'translateY(-100px) scale(1.2)', // Move 100px up and slightly scale
            opacity: '0' 
          },
        }
      },
      // ----------------------------
    },
  },
  plugins: [],
}