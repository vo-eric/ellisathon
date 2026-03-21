# Static fallback

The UI lives in `client/` (Vite + React).

- **Local dev:** from repo root run `npm run dev` — API on `:3000`, React on `:5173` (proxied).
- **Production:** run `npm run build:all`, then `npm start` — Express serves `client/dist`.

If `client/dist` is missing, this folder is served instead (currently empty).
