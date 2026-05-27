export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const SHEET_URL = "https://script.google.com/macros/s/AKfycbyGOkmZ1vhmgMVO6KfvzuLd5l6Om2CTDA04zxfSSMu-JehF7651WKSlNNnh7GqkOfY/exec";

  try {
    const url = `${SHEET_URL}?action=read`;
    const response = await fetch(url, { redirect: "follow" });
    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message, rows: [] });
  }
}
