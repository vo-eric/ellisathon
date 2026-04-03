import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { handleWikiProxy, handleWikiAssetProxy } from './wikiProxy';

type Env = {
  LOBBY_MANAGER: DurableObjectNamespace;
};

const app = new Hono<{ Bindings: Env }>();

app.use('*', cors());

app.get('/wiki/*', (c) => handleWikiProxy(c.req.raw));
app.get('/w/*', (c) => handleWikiAssetProxy(c.req.raw));

app.all('/api/*', (c) => {
  const id = c.env.LOBBY_MANAGER.idFromName('global');
  const stub = c.env.LOBBY_MANAGER.get(id);
  return stub.fetch(c.req.raw);
});

app.get('/ws', (c) => {
  const id = c.env.LOBBY_MANAGER.idFromName('global');
  const stub = c.env.LOBBY_MANAGER.get(id);
  return stub.fetch(c.req.raw);
});

export default app;
export { LobbyManagerDO } from './lobbyManagerDO';
