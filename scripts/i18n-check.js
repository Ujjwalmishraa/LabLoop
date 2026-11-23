// i18n check
//  1. Fails if client/src/i18n/hi.json and en.json don't have exactly the same keys.
//  2. Warns about user-facing text hard-coded in JSX under client/src/pages and client/src/components
//     (JSX text, and string literals in label/placeholder/title/aria-label/alt attributes).
//     Brand names, codes, numbers and symbols are allowed.
// Usage: node scripts/i18n-check.js [--strict]   (--strict also fails on warnings)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as espree from "espree";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const strict = process.argv.includes("--strict");
let failed = false;

// ---------- 1. key parity ----------
const read = (f) => JSON.parse(fs.readFileSync(path.join(root, "client/src/i18n", f), "utf8"));
const hi = read("hi.json");
const en = read("en.json");
const onlyHi = Object.keys(hi).filter((k) => !(k in en));
const onlyEn = Object.keys(en).filter((k) => !(k in hi));
if (onlyHi.length || onlyEn.length) {
  failed = true;
  if (onlyHi.length) console.error(`✗ keys only in hi.json (${onlyHi.length}):\n  ${onlyHi.join("\n  ")}`);
  if (onlyEn.length) console.error(`✗ keys only in en.json (${onlyEn.length}):\n  ${onlyEn.join("\n  ")}`);
} else {
  console.log(`✓ hi.json and en.json have the same ${Object.keys(hi).length} keys`);
}
// English strings must not contain Devanagari, and vice versa the Hindi file should be mostly Devanagari.
const devanagari = /[\u0900-\u097F]/;
const enWithHindi = Object.entries(en).filter(([, v]) => devanagari.test(v));
if (enWithHindi.length) {
  failed = true;
  console.error(`✗ en.json values containing Devanagari:\n  ${enWithHindi.map(([k]) => k).join("\n  ")}`);
}

// ---------- 2. hard-coded strings ----------
// Text that is fine to leave untranslated: brand, codes, units, symbols, numbers.
const ALLOWED = [
  /^LabLoop$/,
  /^Lab$/, // part of "Lab" + "Loop" wordmark split
  /^Loop$/,
  /^NS\d*$/,
  /^₹/,
  /^(OTP|PDF|JPG|PNG|UPI|ID|GPS|OSM|km|min|OK|B2B|CSV)$/,
  /^[A-Z]{2,5}\d*$/, // codes like CBC, NS123
  /^(Email|Password|WhatsApp|Google Maps|OpenStreetMap|Leaflet|English|हिंदी|Siwan, Bihar)$/,
  /^[\dX]{6,}$/, // phone placeholder like 98XXXXXXXX
  /^Login ID: Password:$/, // copy-to-clipboard text, kept the same in every language
  /^[\p{N}\p{P}\p{S}\s]*$/u, // numbers, punctuation and symbols only
  /^[a-z]+(\.[\w-]+)+$/, // an i18n key passed to t() later, e.g. "portal.lab"
];
const ATTRS = new Set(["label", "placeholder", "title", "aria-label", "alt", "text", "empty", "hint", "subtitle"]);
const isUserText = (s) => {
  const v = s.replace(/\s+/g, " ").trim();
  if (!v) return false;
  if (!/\p{L}/u.test(v)) return false; // any letters, Latin or Devanagari
  return !ALLOWED.some((re) => re.test(v));
};

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.jsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

const warnings = [];
const files = [...walk(path.join(root, "client/src/pages")), ...walk(path.join(root, "client/src/components"))];
for (const file of files) {
  const src = fs.readFileSync(file, "utf8");
  let ast;
  try {
    ast = espree.parse(src, { ecmaVersion: 2023, sourceType: "module", ecmaFeatures: { jsx: true }, loc: true });
  } catch (e) {
    console.error(`✗ could not parse ${file}: ${e.message}`);
    failed = true;
    continue;
  }
  const rel = path.relative(root, file);
  const report = (node, text) => warnings.push(`${rel}:${node.loc.start.line}  "${text.replace(/\s+/g, " ").trim().slice(0, 70)}"`);
  (function visit(node) {
    if (!node || typeof node.type !== "string") return;
    if (node.type === "JSXText" && isUserText(node.value)) report(node, node.value);
    if (node.type === "JSXAttribute" && ATTRS.has(node.name?.name)) {
      const v = node.value;
      if (v?.type === "Literal" && typeof v.value === "string" && isUserText(v.value)) report(v, v.value);
      if (v?.type === "JSXExpressionContainer" && v.expression.type === "Literal" && typeof v.expression.value === "string" && isUserText(v.expression.value))
        report(v, v.expression.value);
      if (v?.type === "JSXExpressionContainer" && v.expression.type === "TemplateLiteral") {
        const raw = v.expression.quasis.map((q) => q.value.cooked).join(" ");
        if (isUserText(raw)) report(v, raw);
      }
    }
    // String literals rendered directly as JSX children: {"text"} or {cond ? "a" : "b"}
    if ((node.type === "JSXElement" || node.type === "JSXFragment") && node.children) {
      for (const c of node.children) {
        if (c.type !== "JSXExpressionContainer" || !c.expression) continue;
        const e = c.expression;
        const lits = e.type === "Literal" ? [e] : e.type === "ConditionalExpression" ? [e.consequent, e.alternate] : e.type === "LogicalExpression" ? [e.right] : [];
        for (const l of lits) if (l?.type === "Literal" && typeof l.value === "string" && isUserText(l.value)) report(l, l.value);
      }
    }
    // Labels in option/tab arrays: { label: "Text" }, and messages: setMsg("Text"), confirm("Text")
    if (node.type === "Property" && ["label", "title", "sub", "hint", "text", "placeholder", "empty", "desc"].includes(node.key?.name) && node.value?.type === "Literal" && typeof node.value.value === "string" && isUserText(node.value.value))
      report(node.value, node.value.value);
    if (node.type === "CallExpression") {
      const name = node.callee?.name || node.callee?.property?.name || "";
      if (/^(set(Msg|Ok|Err|Error|Note|Notice|Info|Toast|Done|Flash)|confirm|alert|prompt)$/.test(name))
        for (const a of node.arguments) if (a.type === "Literal" && typeof a.value === "string" && isUserText(a.value)) report(a, a.value);
    }
    for (const key of Object.keys(node)) {
      if (key === "parent" || key === "loc" || key === "range") continue;
      const child = node[key];
      if (Array.isArray(child)) child.forEach(visit);
      else if (child && typeof child === "object") visit(child);
    }
  })(ast);
}

if (warnings.length) {
  console.warn(`⚠ ${warnings.length} possible hard-coded user-facing strings (use t("...")):`);
  for (const w of warnings) console.warn("  " + w);
  if (strict) failed = true;
} else {
  console.log("✓ no hard-coded user-facing strings found");
}

process.exit(failed ? 1 : 0);
