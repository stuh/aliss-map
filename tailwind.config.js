/** @type {import('tailwindcss').Config} */
const defaultTheme = require("tailwindcss/defaultTheme");

module.exports = {
  content: ["./dist/**/*.{html,js}"],
  theme: {
    colors: {
      // primary colours
      white: "#fff",
      offwhite: '#f0f4f9',
      yellow: '#fdd522',
      alissblue: '#1e7abd',
      darkblue: '#004785',
      grey: '#4b5b68',
      lightgrey: '#F7F7F9',
      almostblack: '#212121',
      red: '#af1a04',
      teal: '#27bac0',
      // secondary colours
      lightpink: '#e8b9cd',
      pink: '#bd0050',
      lightgreen: '#bed698',
      green: '#68a309',
      lightteal: '#7fada3',
      tealgreen: '#2f796a',
      lightorange: '#e58d67',
      orange: '#d9490a',
    },
    extend: {
      fontFamily: {
        body: [
          'sofia-pro',
          ...defaultTheme.fontFamily.sans,
        ],
        heading: [
          'sofia-pro',
          ...defaultTheme.fontFamily.sans,
        ],
      }
    },
  },
  plugins: [],
}