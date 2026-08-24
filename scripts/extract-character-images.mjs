import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const DATA = path.join(ROOT, "src", "data", "custom_characters.json");
const PUB = path.join(ROOT, "public", "static", "img", "ninja");

const json = JSON.parse(fs.readFileSync(DATA, "utf8"));
const chars = Array.isArray(json) ? json : json.characters;
if (!Array.isArray(chars)) {
  console.error("Formato inesperado: array de personagens não encontrado.");
  process.exit(1);
}

const used = new Set();
let written = 0;
let replaced = 0;
let extractedBytes = 0;

const slug = (s) =>
  String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const extOf = (mime) => {
  if (mime.includes("webp")) return "webp";
  if (mime.includes("png")) return "png";
  if (mime.includes("gif")) return "gif";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("svg")) return "svg";
  return "bin";
};

function extractDataUri(str, folder, baseName) {
  const m = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(str);
  if (!m) return null;
  const ext = extOf(m[1]);
  let file = `${baseName}.${ext}`;
  let i = 2;
  while (used.has(`${folder}/${file}`)) {
    file = `${baseName}-${i++}.${ext}`;
  }
  used.add(`${folder}/${file}`);
  const dir = path.join(PUB, folder);
  fs.mkdirSync(dir, { recursive: true });
  const buf = Buffer.from(m[2].replace(/\s/g, ""), "base64");
  fs.writeFileSync(path.join(dir, file), buf);
  extractedBytes += buf.length;
  written++;
  return `/static/img/ninja/${folder}/${file}`;
}

for (const ch of chars) {
  const folder = ch.folder || slug(ch.name || `char-${written}`);
  for (const key of Object.keys(ch)) {
    const v = ch[key];
    if (typeof v === "string" && v.startsWith("data:image/")) {
      const url = extractDataUri(v, folder, "portrait");
      if (url) {
        ch[key] = url;
        replaced++;
      }
    } else if ((key === "skills" || key === "skins") && Array.isArray(v)) {
      v.forEach((sk) => {
        for (const k2 of Object.keys(sk)) {
          const v2 = sk[k2];
          if (typeof v2 === "string" && v2.startsWith("data:image/")) {
            const url = extractDataUri(v2, folder, `${key === "skins" ? "skin" : "skill"}-${slug(sk.name || "unnamed")}`);
            if (url) {
              sk[k2] = url;
              replaced++;
            }
          }
        }
      });
    }
  }
}

fs.writeFileSync(DATA, JSON.stringify(chars, null, 2));

console.log(`Arquivos gravados : ${written}`);
console.log(`Campos trocados   : ${replaced}`);
console.log(`Extraído          : ${(extractedBytes / 1048576).toFixed(1)} MB`);
console.log(
  `JSON final        : ${(fs.statSync(DATA).size / 1048576).toFixed(2)} MB`
);
