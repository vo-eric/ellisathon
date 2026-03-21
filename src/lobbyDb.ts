import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

const DB_FILE = path.join(process.cwd(), 'data', 'lobbies.sqlite');

/** One row per chain node (same fields as `MoveListNodeSnapshot`, plus optional player). */
export type MoveRow = {
  lobbyid: string;
  step: number;
  article: string;
  url: string;
  end: boolean;
  playerid: string | null;
  createdat: number;
};

/** Best-effort SQLite history; methods no-op if the DB never opened. */
export type LobbyPersistence = {
  insertLobbyRow: (row: {
    id: string;
    startarticle: string;
    targetarticle: string;
    playercount: number;
    createdat: number;
  }) => void;
  insertMoveRow: (row: MoveRow) => void;
  finalizeLobbyRow: (args: {
    id: string;
    finishedat: number;
    winningplayer: string;
    playersJson: string;
  }) => void;
};

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS lobbies (
      id TEXT PRIMARY KEY,
      players TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'waiting',
      startarticle TEXT NOT NULL,
      targetarticle TEXT NOT NULL,
      playercount INTEGER NOT NULL DEFAULT 2,
      createdat INTEGER NOT NULL,
      finishedat INTEGER,
      winningplayer TEXT
    );

    CREATE TABLE IF NOT EXISTS moves (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lobbyid TEXT NOT NULL REFERENCES lobbies (id),
      step INTEGER NOT NULL,
      article TEXT NOT NULL,
      url TEXT NOT NULL,
      reachedtarget INTEGER NOT NULL,
      playerid TEXT,
      createdat INTEGER NOT NULL
    );
  `);
  migrateMovesTable(db);
}

/** Older DBs only had lobbyid + createdat; add columns in place. */
function migrateMovesTable(db: Database.Database): void {
  const cols = db.prepare(`PRAGMA table_info(moves)`).all() as { name: string }[];
  if (cols.some((c) => c.name === 'step')) return;
  try {
    db.exec(`
      ALTER TABLE moves ADD COLUMN step INTEGER;
      ALTER TABLE moves ADD COLUMN article TEXT;
      ALTER TABLE moves ADD COLUMN url TEXT;
      ALTER TABLE moves ADD COLUMN reachedtarget INTEGER;
      ALTER TABLE moves ADD COLUMN playerid TEXT;
    `);
  } catch (err) {
    console.error('[lobbyDb] migrateMovesTable:', err);
  }
}

/** In-memory-only games when you do not pass a real DB-backed persistence. */
export function noopLobbyPersistence(): LobbyPersistence {
  return {
    insertLobbyRow: () => {},
    insertMoveRow: (_row: MoveRow) => {},
    finalizeLobbyRow: () => {},
  };
}

/** Open SQLite and return persistence helpers. On failure, logs and returns no-ops. */
export function createLobbyPersistence(): LobbyPersistence {
  try {
    fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
    const db = new Database(DB_FILE);
    initSchema(db);

    const insLobby = db.prepare(`
      INSERT INTO lobbies (
        id, players, startarticle, targetarticle, playercount, createdat
      ) VALUES (
        @id, '[]', @startarticle, @targetarticle, @playercount, @createdat
      )
    `);

    const insMove = db.prepare(`
      INSERT INTO moves (
        lobbyid, step, article, url, reachedtarget, playerid, createdat
      ) VALUES (
        @lobbyid, @step, @article, @url, @reachedtarget, @playerid, @createdat
      )
    `);

    const fin = db.prepare(`
      UPDATE lobbies SET
        status = 'finished',
        finishedat = @finishedat,
        winningplayer = @winningplayer,
        players = @playersJson
      WHERE id = @id
    `);

    const run = <T>(label: string, fn: () => T): void => {
      try {
        fn();
      } catch (err) {
        console.error(`[lobbyDb] ${label}:`, err);
      }
    };

    return {
      insertLobbyRow: (row) =>
        run('insertLobbyRow', () => insLobby.run(row)),
      insertMoveRow: (row) =>
        run('insertMoveRow', () =>
          insMove.run({
            lobbyid: row.lobbyid,
            step: row.step,
            article: row.article,
            url: row.url,
            reachedtarget: row.end ? 1 : 0,
            playerid: row.playerid,
            createdat: row.createdat,
          })
        ),
      finalizeLobbyRow: (args) =>
        run('finalizeLobbyRow', () => fin.run(args)),
    };
  } catch (err) {
    console.error('[lobbyDb] could not open database:', err);
    return noopLobbyPersistence();
  }
}
