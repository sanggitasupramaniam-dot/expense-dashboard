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
      // Fix date — always return YYYY-MM-DD string in SGT
      let rawDate = row.date || "";
      let date = "";
      if (rawDate) {
        const d = new Date(rawDate);
        if (!isNaN(d)) {
          const sgt = new Date(d.getTime() + 8 * 60 * 60 * 1000);
          date = sgt.toISOString().split("T")[0];
        } else {
          date = rawDate.toString().substring(0, 10);
        }
      }

      // Fix amount — force to number
      const rawAmount =
        row["amount_(sgd)"] || row["amount_(SGD)"] ||
        row["amount_sgd"]   || row["amount"]       ||
        row["Amount (SGD)"] || row["Amount"]       || "0";
      const amount = parseFloat(String(rawAmount).replace(/[^0-9.]/g, "")) || 0;

      // Personal share — defaults to amount if not present (older rows / no split)
      const rawShare =
        row["personal_share_(sgd)"] || row["personal_share_sgd"] ||
        row["personal_share"]       || row["Personal Share (SGD)"] || "";
      const shareParsed = parseFloat(String(rawShare).replace(/[^0-9.]/g, ""));
      const personalShare = isNaN(shareParsed) || shareParsed <= 0 ? amount : shareParsed;

      return {
        date,
        amount,
        personalShare,
        category: String(row.category || row["category"] || "Other"),
        card:     String(row.card     || row["card"]     || ""),
        notes:    String(row.notes    || row["notes"]    || ""),
      };
    });

    return res.status(200).json({ rows: normalised });
  } catch (err) {
    return res.status(500).json({ error: err.message, rows: [] });
  }
}
