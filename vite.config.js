import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/* base は "./" にしてある。
   こうしておくと、GitHub Pages のどんな置き場所でも画像や部品を見失わない。 */
export default defineConfig({
  base: "./",
  plugins: [react()],
});
