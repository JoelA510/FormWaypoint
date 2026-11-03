# Deployment

FormWaypoint ships as a **Windows desktop app**: a per-user NSIS installer built by the
**Desktop build** workflow (run it from the Actions tab; the artifact is
`FormWaypoint-windows-installer`). There is no API, no database and no server to run: the CIPL
is parsed, the carrier form filled and the Shipper's Declaration drawn on the machine, so there
is nothing to secure server-side. The one network call is the desktop's Schedule B refresh, a
fixed census.gov URL fetched in Rust.

The same app also builds as a static web site. That build is not deployed today; read the
caveat under **Hosting the web build** before putting it anywhere.

## Build the web app

```bash
npm ci
npm run build      # -> dist/
```

`dist/` contains the app, the blank carrier templates (`dist/templates/`) and the Schedule B
dataset (`dist/data/schedule-b.json`). Serve it as-is.

## Hosting the web build

The web build has no Content Security Policy yet; the desktop shell has one in
`src-tauri/tauri.conf.json`. Add a matching meta CSP, with a test, before hosting it
(remediation plan, 8.13).

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

## Desktop build

The Tauri 2 shell in `src-tauri/` wraps the same web build. It can only be built on Windows,
which is why it runs in CI (`.github/workflows/desktop.yml`, on demand) rather than locally;
`npm run desktop:dev` runs it in a window where a Rust toolchain is installed. Data stays in
IndexedDB inside the webview, kept under the bundle identifier `com.formwaypoint.app`, which
must not change or installed copies lose their saved data.
