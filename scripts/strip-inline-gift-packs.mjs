import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "public", "function", "Zero");

for (const cfg of [
  { file: "regular-gift-data.html", category: "regular" },
  { file: "special-gift-data.html", category: "special" },
]) {
  const fp = path.join(ROOT, cfg.file);
  let html = fs.readFileSync(fp, "utf8");
  const marker = "const packs = [";
  const scriptStart = html.lastIndexOf("<script>", html.indexOf(marker));
  const end = html.indexOf("</script>", scriptStart);
  if (scriptStart < 0 || end < 0 || !html.includes(marker)) {
    throw new Error(`script block not found in ${cfg.file}`);
  }
  const replacement = `  <script src="gift-data-page.js"></script>
  <script>
    initGiftDataPage({ category: "${cfg.category}" });
  </script>`;
  html = html.slice(0, scriptStart) + replacement + html.slice(end + "</script>".length);
  fs.writeFileSync(fp, html, "utf8");
  console.log("updated", cfg.file, "lines", html.split("\n").length);
}
