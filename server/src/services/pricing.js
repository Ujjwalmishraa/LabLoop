// All money is whole rupees.

// B2B price = what we pay the lab: walk-in rate minus the lab's commission to us.
export function computeB2b(walkInPrice, commissionPercent) {
  return Math.round(walkInPrice * (1 - commissionPercent / 100));
}

// Fill listingPrice / b2bPrice defaults for a LabTest-shaped object.
export function withPriceDefaults(test, lab) {
  const listingPrice = test.listingPrice ?? test.walkInPrice;
  const b2bOverridden = test.b2bPrice !== undefined && test.b2bPrice !== null;
  const b2bPrice = b2bOverridden ? test.b2bPrice : computeB2b(test.walkInPrice, lab.commissionPercent);
  return { ...test, listingPrice, b2bPrice, b2bOverridden };
}

// Price a booking from DB test documents only. Never from anything the client sent.
// collectionPoint "clinic" uses the lab's clinicPickupFee instead of the home collectionFee;
// the "free above" threshold applies to both.
export function priceBooking(lab, tests, collectionPoint = "home") {
  const items = tests.map((t) => ({ test: t._id, name: t.name, listingPrice: t.listingPrice, b2bPrice: t.b2bPrice }));
  const testTotal = items.reduce((s, i) => s + i.listingPrice, 0);
  const fee = collectionPoint === "clinic" ? (lab.clinicPickupFee ?? 0) : lab.collectionFee;
  const collectionFee = testTotal >= lab.freeCollectionAbove ? 0 : fee;
  const total = testTotal + collectionFee;
  const labPayout = items.reduce((s, i) => s + i.b2bPrice, 0);
  return { items, testTotal, collectionFee, total, labPayout, platformMargin: total - labPayout };
}

// "CBC = 400" lines, or CSV "name,price[,category,sampleType,fasting]" with an optional header row.
export function parseTestList(text) {
  const rows = [];
  const errors = [];
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  lines.forEach((line, i) => {
    let name, price, category, sampleType, fasting;
    if (line.includes("=")) {
      const idx = line.lastIndexOf("=");
      name = line.slice(0, idx).trim();
      price = line.slice(idx + 1).trim().replace(/[₹,\s]/g, "");
    } else if (line.includes(",")) {
      const cells = splitCsv(line);
      if (i === 0 && /name/i.test(cells[0]) && /price|rate/i.test(cells[1] || "")) return; // header
      [name, price, category, sampleType, fasting] = cells;
      price = String(price || "").replace(/[₹\s]/g, "");
    } else {
      errors.push({ line: i + 1, text: line, message: "Format 'Naam = Rate' hona chahiye" });
      return;
    }
    const n = Number(price);
    if (!name || !Number.isFinite(n) || n <= 0 || n > 100000) {
      errors.push({ line: i + 1, text: line, message: "Naam ya rate sahi nahi" });
      return;
    }
    rows.push({
      name: name.slice(0, 120),
      walkInPrice: Math.round(n),
      ...(category ? { category } : {}),
      ...(sampleType ? { sampleType: sampleType.toLowerCase() } : {}),
      ...(fasting ? { fastingRequired: /^(y|yes|true|1|haan)$/i.test(fasting) } : {}),
    });
  });
  return { rows, errors };
}

function splitCsv(line) {
  const out = [];
  let cur = "";
  let q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === "," && !q) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}
