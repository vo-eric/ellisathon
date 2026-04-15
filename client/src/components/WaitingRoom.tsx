import { useEffect } from 'react';
import type { LobbySnapshot } from '../types';
import { coerceArticle } from '../utils/lobbyWire';
import { TargetArticleChip } from './TargetArticleChip';
import { Minus, Plus } from 'lucide-react';

type Props = {
  lobby: LobbySnapshot;
  myPlayerId: string | null;
  statusLine: string;
  isHost: boolean;
  errorMessage: string | null;
  onClaimSeat: (seatIndex: number) => void;
  onSetReady: (ready: boolean) => void;
  onStartGame: () => void;
  onSetSeats: (count: number) => void;
  onDismissError: () => void;
};

function playerName(
  players: LobbySnapshot['players'],
  id: string | null
): string | null {
  if (!id) return null;
  return players.find((p) => p.id === id)?.name ?? null;
}

export function WaitingRoom({
  lobby,
  myPlayerId,
  statusLine,
  isHost,
  errorMessage,
  onClaimSeat,
  onSetReady,
  onStartGame,
  onSetSeats,
  onDismissError,
}: Props) {
  const seats = lobby.seats ?? [];
  const seatReady = lobby.seatReady ?? [];
  const targetTitle = coerceArticle(lobby.targetArticle).title;

  const occupiedSeats = seats.filter((s) => s !== null);
  const allSeatedReady =
    occupiedSeats.length > 0 &&
    seats.every((s, i) => s === null || seatReady[i]);

  useEffect(() => {
    if (!errorMessage) return;
    const timer = setTimeout(onDismissError, 4000);
    return () => clearTimeout(timer);
  }, [errorMessage, onDismissError]);

  return (
    <div className='waiting-room'>
      <h2 className='waiting-room-title'>Lobby</h2>
      <p className='waiting-room-status'>{statusLine}</p>

      {errorMessage && (
        <div className='waiting-room-toast' role='alert'>
          <span>{errorMessage}</span>
          <button
            type='button'
            className='waiting-room-toast-dismiss'
            onClick={onDismissError}
            aria-label='Dismiss'
          >
            &times;
          </button>
        </div>
      )}

      <div className='waiting-room-target-only'>
        <p className='waiting-room-target-label'>Goal article</p>
        <p className='waiting-room-target-name'>
          <TargetArticleChip key={lobby.id} title={targetTitle} />
        </p>
        <p className='waiting-room-target-note'>
          The starting article stays hidden until all seated players are ready
          and the host starts the game.
        </p>
      </div>

      <section className='waiting-room-section'>
        <h3 className='waiting-room-section-title'>Players in lobby</h3>
        {lobby.players.length === 0 ? (
          <p className='waiting-room-muted'>No one connected yet.</p>
        ) : (
          <ul className='waiting-room-user-list'>
            {lobby.players.map((p) => (
              <li key={p.id}>
                <span className='waiting-room-user-name'>{p.name}</span>
                {p.id === myPlayerId && (
                  <span className='waiting-room-you-badge'>you</span>
                )}
                {p.id === lobby.hostId && (
                  <span className='waiting-room-host-badge'>host</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className='waiting-room-section'>
        <div className='waiting-room-section-header'>
          <h3 className='waiting-room-section-title'>
            Seats ({occupiedSeats.length}/{seats.length})
          </h3>
          {isHost && (
            <div className='waiting-room-seat-controls'>
              <button
                type='button'
                className='waiting-room-seat-ctrl-btn'
                onClick={() => onSetSeats(seats.length - 1)}
                disabled={seats.length <= 1}
                aria-label='Remove a seat'
              >
                <Minus size={14} />
              </button>
              <button
                type='button'
                className='waiting-room-seat-ctrl-btn'
                onClick={() => onSetSeats(seats.length + 1)}
                disabled={seats.length >= 8}
                aria-label='Add a seat'
              >
                <Plus size={14} />
              </button>
            </div>
          )}
        </div>
        <p className='waiting-room-muted waiting-room-seat-hint'>
          Claim a seat, then press <strong>Ready up</strong>. Once all seated
          players are ready, the host can start the game.
        </p>
        <div className='waiting-room-seats'>
          {seats.map((occupantId, seatIndex) => {
            const name = playerName(lobby.players, occupantId);
            const isEmpty = occupantId === null;
            const canClaim =
              isEmpty &&
              myPlayerId !== null &&
              lobby.players.some((p) => p.id === myPlayerId);

            const isMySeat = occupantId !== null && occupantId === myPlayerId;
            const readyHere = seatReady[seatIndex] ?? false;

            return (
              <div
                key={seatIndex}
                className={[
                  'waiting-room-seat-column',
                  isMySeat ? 'waiting-room-seat-column--yours' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {isEmpty ? (
                  <span className='waiting-room-ready-slot' aria-hidden />
                ) : (
                  <span
                    className={[
                      'waiting-room-ready-pill',
                      readyHere
                        ? 'waiting-room-ready-pill--yes'
                        : 'waiting-room-ready-pill--no',
                    ].join(' ')}
                  >
                    {readyHere ? 'Ready' : 'Not ready'}
                  </span>
                )}

                {isEmpty ? (
                  <button
                    type='button'
                    className={[
                      'waiting-room-seat',
                      canClaim ? 'waiting-room-seat--claimable' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    disabled={!canClaim}
                    onClick={() => onClaimSeat(seatIndex)}
                  >
                    {canClaim ? 'Sit here' : 'Empty'}
                  </button>
                ) : (
                  <div
                    className='waiting-room-seat waiting-room-seat--occupied'
                    role='status'
                    aria-label={`Occupied by ${name}`}
                  >
                    <span className='waiting-room-seat-occupant-name'>
                      {name}
                    </span>
                  </div>
                )}

                <div className='waiting-room-ready-btn-slot'>
                  {!isEmpty && (
                    <button
                      type='button'
                      className={[
                        'waiting-room-ready-btn',
                        readyHere ? 'waiting-room-ready-btn--active' : '',
                        isMySeat ? '' : 'waiting-room-ready-btn--concealed',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      tabIndex={isMySeat ? 0 : -1}
                      aria-hidden={!isMySeat}
                      onClick={() => {
                        if (isMySeat) onSetReady(!readyHere);
                      }}
                    >
                      {readyHere ? 'Unready' : 'Ready up'}
                    </button>
                  )}
                </div>

                <span className='waiting-room-seat-label'>
                  Seat {seatIndex + 1}
                </span>
              </div>
            );
          })}
        </div>

        {isHost && allSeatedReady && (
          <button
            type='button'
            className='btn-primary waiting-room-start-btn'
            onClick={onStartGame}
          >
            Start Game
          </button>
        )}

        {!isHost && allSeatedReady && (
          <p className='waiting-room-muted waiting-room-all-seated-hint'>
            All seated players are ready — waiting for the host to start the
            game.
          </p>
        )}
      </section>
    </div>
  );
}
