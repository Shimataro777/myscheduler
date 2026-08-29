/* アイコンを作る。名前に版数（V）を入れてある。
   絵を描き替えたら V を1つ増やし、index.html と manifest-v?.json も
   同じ名前に合わせること（設定ファイル自体の名前も変える）。 */
const sharp = require("/home/claude/.npm-global/lib/node_modules/sharp");
const V = 3;

/* 深い緑の地に、白い「日」。ひびの記録なので日をそのまま形にした */
const svg = (size) => {
  const s = size;
  const r = Math.round(s * 0.22);
  /* 「日」の枠。左右は 26%〜74%、上下は 20%〜80% */
  const x = s * 0.29, y = s * 0.21, w = s * 0.42, h = s * 0.58;
  const t = Math.max(2, Math.round(s * 0.055));   // 線の太さ
  const rr = Math.round(s * 0.055);
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}">
    <rect width="${s}" height="${s}" rx="${r}" fill="#57B79B"/>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rr}"
      fill="none" stroke="#FFFFFF" stroke-width="${t}"/>
    <rect x="${x + t / 2}" y="${y + h / 2 - t / 2}" width="${w - t}" height="${t}" fill="#FFFFFF"/>
  </svg>`);
};

(async () => {
  for (const size of [192, 512]) {
    await sharp(svg(size)).resize(size, size).png().toFile(`public/icon-${size}-v${V}.png`);
  }
  /* iPhoneのホーム画面用。四隅を透明にしないこと（黒く出ることがある） */
  const s = 180;
  await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}">
    <rect width="${s}" height="${s}" fill="#57B79B"/>
    <rect x="${s * 0.29}" y="${s * 0.21}" width="${s * 0.42}" height="${s * 0.58}" rx="${s * 0.055}"
      fill="none" stroke="#FFFFFF" stroke-width="${s * 0.055}"/>
    <rect x="${s * 0.29 + s * 0.0275}" y="${s * 0.21 + s * 0.29 - s * 0.0275}" width="${s * 0.42 - s * 0.055}" height="${s * 0.055}" fill="#FFFFFF"/>
  </svg>`)).resize(s, s).png().toFile(`public/apple-touch-icon-v${V}.png`);
  await sharp(svg(64)).resize(64, 64).png().toFile("public/favicon.png");

  const { execSync } = require("child_process");
  console.log(execSync("cd public && for f in icon-*.png apple-touch-icon*.png favicon.png; do echo -n \"$f \"; done").toString());
})();
