import { Readable } from "stream";

const RELEASES_API =
  "https://api.github.com/repos/RedactoApp/Getredacto-redacto-releases/releases/latest";

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const releaseRes = await fetch(RELEASES_API, { redirect: "follow" });
    if (!releaseRes.ok) {
      return res.status(502).json({ error: "Release metadata unavailable" });
    }
    const release = await releaseRes.json();
    const asset =
      Array.isArray(release.assets) &&
      release.assets.find((a) => a && a.name && a.name.toLowerCase().endsWith(".dmg"));
    if (!asset || !asset.browser_download_url) {
      return res.status(502).json({ error: "No DMG asset found" });
    }

    const upstream = await fetch(asset.browser_download_url, { redirect: "follow" });
    if (!upstream.ok || !upstream.body) {
      return res.status(502).json({ error: "Download unavailable" });
    }

    res.setHeader("Content-Type", "application/x-apple-diskimage");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${asset.name || "Redacto-Dev-latest.dmg"}"`
    );

    const contentLength = upstream.headers.get("content-length");
    if (contentLength) {
      res.setHeader("Content-Length", contentLength);
    }

    if (req.method === "HEAD") {
      return res.status(200).end();
    }

    Readable.fromWeb(upstream.body).pipe(res);
  } catch (err) {
    console.error("Download proxy error:", err);
    return res.status(500).json({ error: "Download failed" });
  }
}
