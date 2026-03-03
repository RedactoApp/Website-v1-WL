// api/keys/deactivate.js
// POST /api/keys/deactivate — removes a machine activation OR revokes an entire key
// Protected by ADMIN_SECRET header

import { MongoClient } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI;
const ADMIN_SECRET = process.env.ADMIN_SECRET;

let cachedClient = null;

async function getDb() {
  if (cachedClient) return cachedClient.db("redacto");
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  cachedClient = client;
  return client.db("redacto");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const authHeader = req.headers["x-admin-secret"];
  if (!ADMIN_SECRET || authHeader !== ADMIN_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { key, machineId, revokeAll = false } = req.body || {};

  if (!key) {
    return res.status(400).json({ error: "key is required" });
  }

  try {
    const db = await getDb();
    const collection = db.collection("license_keys");

    const doc = await collection.findOne({ key: key.trim().toUpperCase() });
    if (!doc) {
      return res.status(404).json({ error: "Key not found" });
    }

    if (revokeAll) {
      // Revoke entire key — app will block on next launch
      await collection.updateOne({ key: doc.key }, { $set: { revoked: true } });
      return res.status(200).json({ ok: true, message: "Key revoked. App will block on next launch." });
    }

    if (machineId) {
      // Remove a specific machine activation (frees up a seat)
      await collection.updateOne(
        { key: doc.key },
        { $pull: { activations: { machineId } } }
      );
      return res.status(200).json({ ok: true, message: "Machine deactivated. Seat is now free." });
    }

    return res.status(400).json({ error: "Provide machineId to deactivate a seat, or revokeAll: true to revoke the key." });
  } catch (err) {
    console.error("Deactivation error:", err);
    return res.status(500).json({ error: "Deactivation failed" });
  }
}
