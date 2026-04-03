import { Router, Request, Response } from 'express';
import { LobbyManager } from './lobby';
import { getRandomArticles } from './wikipedia';

export function createRouter(manager: LobbyManager): Router {
  const router = Router();

  router.post('/lobbies', async (_req: Request, res: Response) => {
    try {
      const { start, target } = await getRandomArticles();
      const lobby = manager.createLobby(start, target);
      res.status(201).json(manager.snapshot(lobby));
    } catch (err: unknown) {
      console.error('Wikipedia fetch error:', err);
      res.status(502).json({ error: 'Failed to fetch Wikipedia articles' });
    }
  });

  router.get('/lobbies', (_req: Request, res: Response) => {
    res.json(manager.listLobbies());
  });

  router.get('/lobbies/joinable', (_req: Request, res: Response) => {
    res.json(manager.listJoinableLobbies());
  });

  router.get('/lobbies/:id', (req: Request<{ id: string }>, res: Response) => {
    const id = req.params.id as string;
    const lobby = manager.getLobby(id);
    if (!lobby) {
      res.status(404).json({ error: 'Lobby not found' });
      return;
    }
    res.json(manager.snapshot(lobby));
  });

  router.get('/wikipedia/random', async (_req: Request, res: Response) => {
    try {
      const articles = await getRandomArticles();
      res.json(articles);
    } catch {
      res.status(502).json({ error: 'Failed to fetch Wikipedia articles' });
    }
  });

  return router;
}
