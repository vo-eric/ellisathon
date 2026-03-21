import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import WebSocket from 'ws';
import type { ViteDevServer } from 'vite';
import { LobbyManager } from './lobby';
import { createRouter } from './routes';
import { createWikiProxy } from './wikiProxy';
import { handleWsConnection } from './wsHandler';

const PORT = Number(process.env.PORT) || 3000;

const clientRoot = path.join(__dirname, '..', 'client');
const clientDist = path.join(clientRoot, 'dist');
const clientIndex = path.join(clientDist, 'index.html');

async function start(): Promise<void> {
  const app = express();
  app.use(express.json());

  const manager = new LobbyManager();
  app.use('/api', createRouter(manager));
  app.use('/wiki', createWikiProxy());

  const server = http.createServer(app);

  let vite: ViteDevServer | undefined;
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer } = await import('vite');
    vite = await createServer({
      root: clientRoot,
      configFile: path.join(clientRoot, 'vite.config.ts'),
      server: {
        middlewareMode: true,
        hmr: { server },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (fs.existsSync(clientIndex)) {
    app.use(express.static(clientDist));
  } else {
    app.use(express.static(path.join(__dirname, '..', 'public')));
  }

  // noServer: shared HTTP server also handles Vite HMR WebSockets. The default
  // ws Server attaches to `upgrade` and aborts non-/ws handshakes, which breaks HMR.
  const wss = new WebSocket.Server({ noServer: true });
  wss.on('connection', (ws, req) => {
    handleWsConnection(ws, req, manager);
  });
  server.on('upgrade', (req, socket, head) => {
    const pathname = (req.url ?? '').split('?')[0];
    if (pathname === '/ws') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    }
  });

  server.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
    console.log(`WebSocket endpoint: ws://localhost:${PORT}/ws`);
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
