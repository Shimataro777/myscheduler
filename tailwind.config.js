/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      /* 文字の種類は App.jsx のなかの GLOBAL_CSS でも同じものを指定してある。
         **片方だけ変えないこと。** 見た目がずれる */
      /* 太字は600まで。**700以上を使わないこと**（字が重く見える） */
      fontWeight: { bold: "600", semibold: "600", medium: "500" },
      fontFamily: {
        sans: ['"Noto Sans JP"', "system-ui", "sans-serif"],
        display: ['"Noto Sans JP"', "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
