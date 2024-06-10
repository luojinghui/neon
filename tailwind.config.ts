import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic":
          "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
      },
    },
    gradientColorStopPositions: {
      80: "80%",
    },
    // colors: {
    //   blue: "#565584",
    //   "regal-blue": "#243c5a",
    // },
    // width: {
    //   "100": "100vw",
    // },
    // backgroundColor: {},
  },
  plugins: [],
};
export default config;
