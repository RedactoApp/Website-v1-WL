// api/waitlist.js
// POST /api/waitlist — saves email to MongoDB, sends welcome email via Loops

import { MongoClient } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI;
const LOOPS_API_KEY = process.env.LOOPS_API_KEY;
const LOOPS_WAITLIST_EVENT = "waitlist_signup"; // event name you set in Loops
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 5;

const DISALLOWED_DOMAINS = new Set([
  "example.com",
  "example.org",
  "example.net",
  "test.com",
  "mailinator.com",
  "guerrillamail.com",
  "10minutemail.com",
  "tempmail.com",
]);

let cachedClient = null;
let indexEnsured = false;
const rateLimitByIp = new Map();

async function getDb() {
  if (cachedClient) return cachedClient.db("redacto");
  if (!MONGODB_URI) throw new Error("Missing MONGODB_URI");
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  cachedClient = client;
  return client.db("redacto");
}

function getClientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length) return xff.split(",")[0].trim();
  return req.headers["x-real-ip"] || req.socket?.remoteAddress || "unknown";
}

function isRateLimited(map, key, limit, windowMs) {
  const now = Date.now();
  const bucket = map.get(key) || [];
  const fresh = bucket.filter((ts) => now - ts < windowMs);
  fresh.push(now);
  map.set(key, fresh);
  return fresh.length > limit;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.length && origin && !ALLOWED_ORIGINS.includes(origin)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const { email, company } = req.body || {};

  if (company) {
    return res.status(400).json({ error: "Invalid submission." });
  }

  if (!email || typeof email !== "string" || email.length > 254 || !/^\S+@\S+\.\S+$/.test(email)) {
    return res.status(400).json({ error: "Valid email address required." });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const domain = normalizedEmail.split("@")[1] || "";
  if (DISALLOWED_DOMAINS.has(domain)) {
    return res.status(400).json({ error: "Please use a real email address." });
  }

  const ip = getClientIp(req);
  if (isRateLimited(rateLimitByIp, ip, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)) {
    return res.status(429).json({ error: "Too many requests. Please wait and try again." });
  }

  try {
    const db = await getDb();
    const collection = db.collection("waitlist");

    if (!indexEnsured) {
      await collection.createIndex({ email: 1 }, { unique: true });
      indexEnsured = true;
    }

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

    return res.status(200).json({ ok: true, message: "You're on the list! Check your email for a confirmation." });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(200).json({ ok: true, message: "Already on the waitlist!" });
    }
    console.error("Waitlist error:", err);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
}
