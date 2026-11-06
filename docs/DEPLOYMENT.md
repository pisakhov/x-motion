# Gallery deployment

The site is static, public, read-only, and has no accounts, write API or database. Feedback comes through X chat. Do not put secrets or private feedback in this public repository.

## Current service

- URL: https://x-motion.187.77.218.3.sslip.io
- Dokploy project: `X Motion` (`EIUi8TE-gh2_rZYow2VqR`)
- Environment: `mgkhhjCdGIp9OWKXguGSE`
- Compose: `5GLB0abcRCaLo5int_KSJ`
- Server: Eve / Vero-Hostinger, `Up1ZyDPAGkVs97jftUgyq`
- Source: public Git, `https://github.com/pisakhov/x-motion.git`, `main`, `./compose.yml`
- Service: `gallery`, internal port `8080`, HTTPS via Traefik / Let's Encrypt.
- Automatic deployment is disabled. Explicitly deploy the reviewed merge; inspect state before retrying an ambiguous request.

These are identifiers, not credentials. Use the host's preauthenticated Dokploy tooling privately; never print tokens or raw API service objects.

## Build and verify

```sh
npm ci --ignore-scripts
npx playwright install chromium
npm run check
npm run catalog -- validate
npm test
npm run test:browser
npm run build:site
npm run test:gallery
docker build -t x-motion-gallery:local .
```

The build reads `data/catalog.json`, validates digests, and copies only non-discarded assets and allowlisted public metadata to `dist/`. Feedback events never enter `dist/`. The container uses digest-pinned Node (build only) and unprivileged Nginx. No browser, npm dependencies, working frames or source examples ship in the runtime. Nginx serves byte-range MP4 requests and a `/healthz` endpoint; media IDs use immutable caching, while metadata and HTML revalidate.

After merging, queue the compose deployment through Dokploy, verify an actual deployment row reaches `done`, then verify public HTTPS health, catalog identity, media digests, byte-range responses and browser behavior:

```sh
GALLERY_URL=https://x-motion.187.77.218.3.sslip.io npm run test:gallery
curl --fail https://x-motion.187.77.218.3.sslip.io/healthz
curl -I -H 'Range: bytes=0-31' https://x-motion.187.77.218.3.sslip.io/media/XM-0001.mp4
```

Keep deployments sequential. A queued response is not proof of deployment; a healthy page is not aesthetic approval. Retain the previous reviewed commit as the rollback source and explicitly redeploy it if needed. Do not overwrite permanent-ID assets for a visual correction: publish a new linked ID instead.
