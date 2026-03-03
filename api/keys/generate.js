// api/keys/generate.js
// POST /api/keys/generate — generates a license key and stores it in MongoDB
// Protected by ADMIN_SECRET header

import { MongoClient } from "mongodb";
import { randomBytes } from "crypto";

const MONGODB_URI = process.env.MONGODB_URI;
const ADMIN_SECRET = process.env.ADMIN_SECRET;
const MAX_ACTIVATIONS = 2; // how many Macs a single key can activate

let cachedClient = null;

async function getDb() {
  if (cachedClient) return cachedClient.db("redacto");
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  cachedClient = client;
  return client.db("redacto");
}

function generateKey() {
  const segment = () => randomBytes(2).toString("hex").toUpperCase();
  return `RDCT-${segment()}-${segment()}-${segment()}-${segment()}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Protect this endpoint
  const authHeader = req.headers["x-admin-secret"];
  if (!ADMIN_SECRET || authHeader !== ADMIN_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { email, maxActivations = MAX_ACTIVATIONS, note = "" } = req.body || {};

  if (!email) {
    return res.status(400).json({ error: "email is required" });
  }

  try {
    const db = await getDb();
    const collection = db.collection("license_keys");

    // Generate a unique key (retry on collision, though extremely unlikely)
    let key;
    let attempts = 0;
    do {
      key = generateKey();
      const exists = await collection.findOne({ key });
      if (!exists) break;
      attempts++;
    } while (attempts < 5);

    const doc = {
      key,
      email: email.toLowerCase().trim(),
      note,
      maxActivations,
      activations: [],       // { machineId, activatedAt, platform }
      revoked: false,
      createdAt: new Date(),
    };

    await collection.insertOne(doc);

    return res.status(200).json({ ok: true, key });
  } catch (err) {
    console.error("Key generation error:", err);
    return res.status(500).json({ error: "Failed to generate key" });
  }
}
