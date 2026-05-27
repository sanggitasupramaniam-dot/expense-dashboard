export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const SHEET_URL = "https://script.google.com/macros/s/AKfycbyGOkmZ1vhmgMVO6KfvzuLd5l6Om2CTDA04zxfSSMu-JehF7651WKSlNNnh7GqkOfY/exec";

  try {
    const response = await fetch(`${SHEET_URL}?action=read`, { redirect: "follow" });
    const data = await response.json();

    const normalised = (data.rows || []).map(row => {
      // Fix date — strip timestamp
      let date = row.date || "";
      if (date && date.toString().includes("T")) {
        date = date.toString().split("T")[0];
      }
      if (date instanceof Date || (typeof date === "number")) {
        date = new Date(date).toISOString().split("T")[0];
      }

      // Fix amount — try every possible key variation
      const amount = parseFloat(
        row["amount_(sgd)"] || row["amount_(SGD)"] ||
        row["amount_sgd"]   || row["amount"]       ||
        row["Amount (SGD)"] || row["Amount"]       || 0
      );

      return {
        date,
        amount,
        category: row.category || row["category"] || "Other",
        card:     row.card     || row["card"]     || "",
        notes:    row.notes    || row["notes"]    || "",
      };
    });

    return res.status(200).json({ rows: normalised });
  } catch (err) {
    return res.status(500).json({ error: err.message, rows: [] });
  }
}
