export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const SHEET_URL = "https://script.google.com/macros/s/AKfycbyGOkmZ1vhmgMVO6KfvzuLd5l6Om2CTDA04zxfSSMu-JehF7651WKSlNNnh7GqkOfY/exec";

  try {
    const response = await fetch(`${SHEET_URL}?action=read`, { redirect: "follow" });
    const data = await response.json();

    // Normalise rows so headers map correctly
    const normalised = (data.rows || []).map(row => ({
      date:     row.date     || row["date"]                || "",
      amount:   row["amount_(sgd)"] || row.amount          || 0,
      category: row.category                               || "Other",
      card:     row.card                                   || "",
      notes:    row.notes                                  || "",
    }));

    return res.status(200).json({ rows: normalised });
  } catch (err) {
    return res.status(500).json({ error: err.message, rows: [] });
  }
}
