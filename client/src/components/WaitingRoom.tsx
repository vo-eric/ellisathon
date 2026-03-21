import type { LobbySnapshot } from '../types';

type Props = {
  lobby: LobbySnapshot;
  myPlayerId: string | null;
  statusLine: string;
  onClaimSeat: (seatIndex: number) => void;
  onSetReady: (ready: boolean) => void;
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
  onClaimSeat,
  onSetReady,
}: Props) {
  const seats = lobby.seats ?? [];
  const seatReady = lobby.seatReady ?? [];

  const allSeatsFilled = seats.every((s) => s !== null);

  return (
    <div className='waiting-room'>
      <h2 className='waiting-room-title'>Lobby</h2>
      <p className='waiting-room-status'>{statusLine}</p>

      <div className='waiting-room-target-only'>
        <p className='waiting-room-target-label'>Goal article</p>
        <p className='waiting-room-target-name'>{lobby.targetArticle.title}</p>
        <p className='waiting-room-target-note'>
          The starting article stays hidden until everyone is seated, ready, and
          the countdown finishes.
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
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className='waiting-room-section'>
        <h3 className='waiting-room-section-title'>Seats</h3>
        <p className='waiting-room-muted waiting-room-seat-hint'>
          Claim a seat, then press <strong>Ready up</strong>. When every seat is
          filled and both players are ready, a 5-second countdown runs; then the
          start page is revealed and the race begins.
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

                {isMySeat && (
                  <button
                    type='button'
                    className={[
                      'waiting-room-ready-btn',
                      readyHere ? 'waiting-room-ready-btn--active' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => onSetReady(!readyHere)}
                  >
                    {readyHere ? 'Unready' : 'Ready up'}
                  </button>
                )}

                <span className='waiting-room-seat-label'>
                  Seat {seatIndex + 1}
                </span>
              </div>
            );
          })}
        </div>

        {allSeatsFilled && (
          <p className='waiting-room-muted waiting-room-all-seated-hint'>
            All seats filled — both players must tap <strong>Ready up</strong>{' '}
            to begin the countdown.
          </p>
        )}
      </section>
    </div>
  );
}
