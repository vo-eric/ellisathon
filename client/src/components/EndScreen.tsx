import type { LobbySnapshot, MoveListNodeSnapshot } from '../types';
import { coerceArticle } from '../utils/lobbyWire';

function movesForPlayerInChain(
  chain: MoveListNodeSnapshot | null,
  playerId: string
): number {
  let n = 0;
  let cur = chain;
  while (cur) {
    if (cur.playerId === playerId) n++;
    cur = cur.next;
  }
  return n;
}

const EndScreen = ({
  lobby,
  currentPlayerId,
  onBackToLobbies,
  onViewResults,
  onReturnToLobby,
}: {
  lobby: LobbySnapshot;
  currentPlayerId: string;
  onBackToLobbies: () => void;
  onViewResults: () => void;
  onReturnToLobby: () => void;
}) => {
  const winner = lobby.players.find((p) => p.id === lobby.winnerId);
  const isCurrentPlayerWinner = winner?.id === currentPlayerId;
  const isHost = lobby.hostId === currentPlayerId;
  const numberOfMovesByWinnner = movesForPlayerInChain(
    lobby.moveChain,
    winner?.id ?? ''
  );

  return (
    <div>
      <h2>{isCurrentPlayerWinner ? 'You win!' : 'Game over.'}</h2>
      <p className='gameover-info'>
        {isCurrentPlayerWinner ? 'You' : winner?.name} reached{' '}
        {coerceArticle(lobby.targetArticle).title} in {numberOfMovesByWinnner}{' '}
        moves.
      </p>
      <div style={{ display: 'flex', gap: '12px' }}>
        <button type='button' onClick={onBackToLobbies}>
          Back to Lobbies
        </button>
        <button type='button' onClick={onViewResults}>
          View Results
        </button>
        {isHost && (
          <button
            type='button'
            className='btn-primary'
            onClick={onReturnToLobby}
          >
            Play Again
          </button>
        )}
      </div>
      {!isHost && (
        <p className='gameover-info'>
          Waiting for the host to start a new round…
        </p>
      )}
    </div>
  );
};

export default EndScreen;
