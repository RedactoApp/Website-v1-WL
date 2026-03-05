# Latest DMG Download Flow (Reference)

This document captures how we were handling a "latest DMG" download without
forcing users to leave the website. Keep this for future re-enablement.

## Goals
- Users click "Download for macOS" and stay on the website.
- The DMG served is always the latest GitHub Release asset.
- No hard-coded DMG filename required.

## Recommended Approach
Use a Vercel API route that:
1. Calls GitHub Releases API to fetch the latest release.
2. Picks the first asset ending in `.dmg`.
3. Streams the asset to the user with `Content-Disposition: attachment`.

### Endpoint (example)
`/api/download`

### GitHub Releases API
```
https://api.github.com/repos/RedactoApp/Getredacto-redacto-releases/releases/latest
```

### Why this works
- Releases are stable.
- Users get the latest DMG even when version names change.
- The browser starts download without navigating away if triggered via iframe.

## Frontend (example)
- Button links to `/api/download`.
- JS intercepts click and loads the link in a hidden iframe:
```
const btn = document.getElementById("download-btn");
btn.addEventListener("click", (e) => {
  e.preventDefault();
  const iframe = document.createElement("iframe");
  iframe.style.display = "none";
  iframe.src = btn.getAttribute("href");
  document.body.appendChild(iframe);
  setTimeout(() => iframe.remove(), 60000);
});
```

## Notes
- This approach depends on GitHub Releases being public.
- If DMGs become large, consider a dedicated file host or S3.
