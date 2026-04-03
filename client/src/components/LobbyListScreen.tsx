import type { LobbySnapshot } from '../types';

interface LobbyListScreenProps {
  playerName: string;
  lobbies: LobbySnapshot[];
  creatingLobby: boolean;
  onCreateLobby: () => void;
  onJoinLobby: (lobbyId: string) => void;
}

export function LobbyListScreen({
  playerName,
  lobbies,
  creatingLobby,
  onCreateLobby,
  onJoinLobby,
}: LobbyListScreenProps) {
  return (
    <>
      <div className='topbar'>
        <span className='player-name-display'>{playerName}</span>
        <button
          type='button'
          className='btn-primary'
          onClick={onCreateLobby}
          disabled={creatingLobby}
        >
          {creatingLobby ? 'Creating…' : 'Create Lobby'}
        </button>
      </div>
      <div className='lobby-container'>
        <h2>Open Lobbies</h2>
        <div className='lobby-list'>
          {lobbies.length === 0 ? (
            <p className='empty-state'>No lobbies available. Create one!</p>
          ) : (
            lobbies.map((lobby) => (
              <div key={lobby.id} className='lobby-card'>
                <div className='lobby-meta'>
                  <div className='lobby-articles'>
                    <span className='lobby-start-hidden'>Start hidden</span>{' '}
                    &rarr; <strong>{lobby.targetArticle.title}</strong>
                  </div>
                  <div className='lobby-players'>
                    {lobby.players.length}/{lobby.maxPlayers} players
                  </div>
                </div>
                <button
                  type='button'
                  className='btn-join'
                  onClick={() => onJoinLobby(lobby.id)}
                >
                  Join
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
