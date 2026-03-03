// api/keys/validate.js
// POST /api/keys/validate — validates a license key against a machine fingerprint
// Called by the macOS app on every launch

import { MongoClient } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI;

let cachedClient = null;

async function getDb() {
  if (cachedClient) return cachedClient.db("redacto");
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  cachedClient = client;
  return client.db("redacto");
}

// Response status codes your app should handle:
//   valid          — key is active, machine is authorised
//   already_active — this machine already activated this key (allow launch)
//   revoked        — key has been manually revoked (block launch)
//   seats_exceeded — too many activations (prompt user to deactivate another machine)
//   not_found      — key doesn't exist (show "Invalid key" error)

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { key, machineId, platform = "macOS" } = req.body || {};

  if (!key || !machineId) {
    return res.status(400).json({ error: "key and machineId are required" });
  }

  try {
    const db = await getDb();
    const collection = db.collection("license_keys");

    const doc = await collection.findOne({ key: key.trim().toUpperCase() });

    if (!doc) {
      return res.status(404).json({ status: "not_found", error: "License key not found." });
    }

    if (doc.revoked) {
      return res.status(403).json({ status: "revoked", error: "This license key has been revoked." });
    }

    // Check if this machine is already activated
    const existingActivation = doc.activations.find((a) => a.machineId === machineId);
    if (existingActivation) {
      // Update last seen
      await collection.updateOne(
        { key: doc.key, "activations.machineId": machineId },
        { $set: { "activations.$.lastSeenAt": new Date() } }
      );
      return res.status(200).json({ status: "already_active", email: doc.email });
    }

    // Check seat limit
    if (doc.activations.length >= doc.maxActivations) {
      return res.status(403).json({
        status: "seats_exceeded",
        error: `This key is already activated on ${doc.maxActivations} machine(s). Deactivate one to continue.`,
        activations: doc.activations.map((a) => ({
          machineId: a.machineId,
          activatedAt: a.activatedAt,
          platform: a.platform,
        })),
      });
    }

    // New activation — bind this machine
    await collection.updateOne(
      { key: doc.key },
      {
        $push: {
          activations: {
            machineId,
            platform,
            activatedAt: new Date(),
            lastSeenAt: new Date(),
          },
        },
      }
    );

    return res.status(200).json({ status: "valid", email: doc.email });
  } catch (err) {
    console.error("Key validation error:", err);
    return res.status(500).json({ error: "Validation failed. Please try again." });
  }
}
