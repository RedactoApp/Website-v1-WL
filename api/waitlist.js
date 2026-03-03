// api/waitlist.js
// POST /api/waitlist — saves email to MongoDB, sends welcome email via Loops

import { MongoClient } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI;
const LOOPS_API_KEY = process.env.LOOPS_API_KEY;
const LOOPS_WAITLIST_EVENT = "waitlist_signup"; // event name you set in Loops

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

  const { email } = req.body || {};

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Valid email address required." });
  }

  const normalizedEmail = email.toLowerCase().trim();

  try {
    const db = await getDb();
    const collection = db.collection("waitlist");

    // Check for duplicate
    const existing = await collection.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(200).json({ ok: true, message: "Already on the waitlist!" });
    }

    // Save to MongoDB
    await collection.insertOne({
      email: normalizedEmail,
      source: req.headers.referer || "direct",
      createdAt: new Date(),
    });

    // Send welcome email via Loops
    if (LOOPS_API_KEY) {
      const loopsRes = await fetch("https://app.loops.so/api/v1/contacts/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${LOOPS_API_KEY}`,
        },
        body: JSON.stringify({
          email: normalizedEmail,
          source: "waitlist",
          userGroup: "waitlist",
          mailingLists: {},
        }),
      });

      // Fire the waitlist signup event to trigger your Loops email flow
      if (loopsRes.ok) {
        await fetch("https://app.loops.so/api/v1/events/send", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${LOOPS_API_KEY}`,
          },
          body: JSON.stringify({
            email: normalizedEmail,
            eventName: LOOPS_WAITLIST_EVENT,
          }),
        });
      }
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Waitlist error:", err);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
}
