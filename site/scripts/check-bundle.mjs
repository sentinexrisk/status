import { readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";

const assets = resolve(process.cwd(), "dist/assets");
const files = await readdir(assets);
const scripts = files.filter((file) => file.endsWith(".js"));
const sizes = await Promise.all(scripts.map(async (file) => (await stat(resolve(assets, file))).size));
const total = sizes.reduce((sum, size) => sum + size, 0);

if (total >= 100 * 1024) {
  throw new Error(`O JavaScript compilado tem ${total} bytes e excede o limite de 100 KB.`);
}

console.log(`JavaScript compilado: ${total} bytes.`);
