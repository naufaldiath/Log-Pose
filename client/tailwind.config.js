/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      screens: {
        'xs': '475px',
      },
      colors: {
        // Midnight Brass theme
        midnight: {
          50: '#f5f5f6',
          100: '#e5e6e8',
          200: '#cdcfd3',
          300: '#abaeb5',
          400: '#82858f',
          500: '#676a74',
          600: '#585a63',
          700: '#4b4d54',
          800: '#424349',
          900: '#3a3b40',
          950: '#18181b',
        },
        brass: {
          50: '#fdf9ef',
          100: '#f9f0d6',
          200: '#f2dead',
          300: '#e9c77a',
          400: '#e0ad4d',
          500: '#d6952f',
          600: '#c07825',
          700: '#9f5b21',
          800: '#814921',
          900: '#6a3d1f',
          950: '#391e0e',
        },
        teal: {
          50: '#f0fdfa',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
          700: '#0f766e',
          800: '#115e59',
          900: '#134e4a',
          950: '#042f2e',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Monaco', 'Consolas', 'monospace'],
      },
      borderWidth: {
        '3': '3px',
      },
    },
  },
  plugins: [],
}
