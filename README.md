# Wiki Speedrun (hackathon)

## Dev (recommended)

Runs the Express + WebSocket API on **:3000** and the Vite + React app on **:5173** (with proxy to the API/wiki/WebSocket).

```bash
npm install
npm install --prefix client
npm run dev
```

Open **http://localhost:5173**. In dev mode, a **Move chain** sidebar shows the linked list of moves as JSON (for debugging / future viz).

## Production

```bash
npm run build:all
npm start
```

Open **http://localhost:3000** (serves `client/dist` when built).

## Scripts

| Script               | Description                        |
| -------------------- | ---------------------------------- |
| `npm run dev`        | Server + client together           |
| `npm run dev:server` | API only (`:3000`)                 |
| `npm run dev:client` | React only (`:5173`)               |
| `npm run build:all`  | Server `tsc` + client `vite build` |
