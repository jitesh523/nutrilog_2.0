const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const output = path.join(root, "public");
const files = [
  "index.html", "dashboard.html", "transformation.html", "styles.css", "app.js",
  "nutrition.js", "product.js", "ai-client.js", "bg-images.js", "exerciser.js", "motion.js", "particles.js", "planner.js", "stars.js",
  "offline.js", "sw.js", "upgrades-client.js", "routines-client.js", "progress.js", "manifest.webmanifest", "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png",
];
fs.mkdirSync(output, { recursive: true });
for (const file of files) {
  const destination = path.join(output, file);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(path.join(root, file), destination);
}
console.log(`Prepared ${files.length} public app assets.`);
