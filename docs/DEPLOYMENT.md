# Deployment

FormWaypoint is a static site. There is no API, no database, no Redis and no OCR service to
run — the CIPL is parsed and the carrier form is filled in the browser, so a build output
plus any static host is the whole deployment.

That also means there is nothing to secure server-side: shipment data never reaches a
server, because there isn't one.

## Build

```bash
npm ci
npm run build      # -> dist/
```

`dist/` contains the app, the blank carrier templates (`dist/templates/`) and the Schedule B
dataset (`dist/data/schedule-b.json`). Serve it as-is.

## Hosting

Any static host works — GitHub Pages, Netlify, Vercel, S3 + CloudFront, or a directory
behind nginx. Two requirements:

- **Serve `.pdf` and `.json` from the same origin.** The app fetches
  `templates/*.pdf` and `data/schedule-b.json` at runtime. A host that rewrites unknown
  paths to `index.html` must exclude those directories.
- **Set the base path if not hosted at the root.** Build with
  `npm run build -- --base=/subpath/`; the app reads `import.meta.env.BASE_URL` when
  fetching its assets.

### Local check of the production build

```bash
npm run preview    # http://localhost:4173
```

## Keeping Schedule B current

The commodity dataset is committed, not fetched at runtime, so a deploy pins a known
version. Refresh it when Schedule B changes — typically each January and July — and commit
the result:

```bash
node scripts/build-schedule-b.mjs --fetch
npm run check
```

The header of the running app shows which build of the dataset is loaded.

## Desktop packaging

`LocalStore` in `src/store/local-store.ts` is the seam: a Tauri build swaps the IndexedDB
implementation for a file-backed one and the rest of the app is unchanged. Nothing in the
build above needs to move first.
