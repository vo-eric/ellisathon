import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import WebSocket from 'ws';
import { createLobbyPersistence } from './lobbyDb';
import { LobbyManager } from './lobby';
import { createRouter } from './routes';
import { createWikiProxy } from './wikiProxy';
import { handleWsConnection } from './wsHandler';

const PORT = Number(process.env.PORT) || 3000;

const app = express();
app.use(express.json());

const clientDist = path.join(__dirname, '..', 'client', 'dist');
const clientIndex = path.join(clientDist, 'index.html');
if (fs.existsSync(clientIndex)) {
  app.use(express.static(clientDist));
} else {
  app.use(express.static(path.join(__dirname, '..', 'public')));
}

const manager = new LobbyManager(createLobbyPersistence());
app.use('/api', createRouter(manager));
app.use('/wiki', createWikiProxy());

const server = http.createServer(app);

const wss = new WebSocket.Server({ server, path: '/ws' });
wss.on('connection', (ws, req) => {
  handleWsConnection(ws, req, manager);
});

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT}/ws`);
});
