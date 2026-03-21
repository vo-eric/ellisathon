import express from 'express';
import http from 'http';
import path from 'path';
import WebSocket from 'ws';
import { LobbyManager } from './lobby';
import { createRouter } from './routes';
import { createWikiProxy } from './wikiProxy';
import { handleWsConnection } from './wsHandler';

const PORT = Number(process.env.PORT) || 3000;

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const manager = new LobbyManager();
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
