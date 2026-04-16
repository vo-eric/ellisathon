import { useMemo, useState } from 'react';
import { AliasScreen } from './components/AliasScreen';
import { LobbyListScreen } from './components/LobbyListScreen';
import { WaitingRoom } from './components/WaitingRoom';
import ResultsPage, { SEAT_COLORS } from './components/ResultsPage';
import { GameScreen } from './components/GameScreen';
import EndScreen from './components/EndScreen';
import { moveChainToResultsPaths } from './utils/resultsPaths';
import { useLobbySocket } from './hooks/useLobbySocket';
import { useWikiNavigation } from './hooks/useWikiNavigation';

export default function App() {
  const [aliasInput, setAliasInput] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [myPlayerId, setMyPlayerId] = useState('');

  const {
    screen,
    setScreen,
    lobbies,
    creatingLobby,
    waiting,
    match,
    lobbyError,
    joinLobby,
    createLobby,
    backToLobbies,
    claimSeat,
    setReady,
    startGame,
    setSeats,
    kickSeat,
    dismissLobbyError,
    sendMove,
    setIframeSrc,
  } = useLobbySocket({
    playerName,
    myPlayerId,
    onResetNavigation: () => resetRefs(),
    onPlayerIdFromServer: setMyPlayerId,
  });

  const isPlaying = match.status === 'playing';

  const { wikiRef, onWikiFrameLoad, resetRefs } = useWikiNavigation({
    isPlaying,
    startTitle: isPlaying ? match.startTitle : '',
    targetTitle: isPlaying ? match.targetTitle : '',
    sendMove,
    onIframeSrcChange: setIframeSrc,
  });

  const onAliasSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = aliasInput.trim();
    if (!name) return;
    setPlayerName(name);
    setScreen('lobbies');
    setMyPlayerId(crypto.randomUUID());
  };

  const showMoveSidebar = screen === 'game';
  const layoutClass = [
    'app-layout',
    showMoveSidebar ? 'app-layout--with-sidebar' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const finishedMatch = match.status === 'finished' ? match : null;
  const resultsPaths = useMemo(
    () =>
      finishedMatch
        ? moveChainToResultsPaths(
            finishedMatch.moveChain,
            finishedMatch.lobby,
            finishedMatch.startedAtMs
          )
        : moveChainToResultsPaths(null, null, null),
    [finishedMatch]
  );

  return (
    <div className={layoutClass}>
      <div className='app-main'>
        {/* ── Cover / alias screen ── */}
        <div
          className={`screen screen-alias ${
            screen === 'alias' ? 'active' : ''
          }`}
        >
          <AliasScreen
            aliasInput={aliasInput}
            onAliasInputChange={setAliasInput}
            onSubmit={onAliasSubmit}
          />
        </div>

        {/* ── Lobbies screen ── */}
        <div className={`screen ${screen === 'lobbies' ? 'active' : ''}`}>
          <LobbyListScreen
            playerName={playerName}
            lobbies={lobbies}
            creatingLobby={creatingLobby}
            onCreateLobby={createLobby}
            onJoinLobby={joinLobby}
          />
        </div>

        {/* ── Waiting room screen ── */}
        <div
          className={`screen screen-waiting ${
            screen === 'waiting' ? 'active' : ''
          }`}
        >
          {waiting?.countdownSeconds != null && (
            <div className='countdown-overlay' role='status' aria-live='polite'>
              <div className='countdown-overlay-inner'>
                <p className='countdown-overlay-label'>Starting in</p>
                <div className='countdown-overlay-number'>
                  {waiting.countdownSeconds}
                </div>
                <p className='countdown-overlay-sub'>
                  The start article will be revealed next
                </p>
              </div>
            </div>
          )}
          <div className='card waiting-room-card'>
            {waiting?.lobby ? (
              <WaitingRoom
                lobby={waiting.lobby}
                myPlayerId={myPlayerId}
                statusLine={waiting.info}
                isHost={myPlayerId === waiting.lobby.hostId}
                errorMessage={lobbyError}
                onClaimSeat={claimSeat}
                onSetReady={setReady}
                onStartGame={startGame}
                onSetSeats={setSeats}
                onKickSeat={kickSeat}
                onDismissError={dismissLobbyError}
              />
            ) : (
              <>
                <h2>Connecting…</h2>
                <p className='waiting-info'>{waiting?.info}</p>
                <div className='loader' />
              </>
            )}
          </div>
        </div>

        {/* ── Game screen ── */}
        {screen === 'game' && match.status === 'playing' && (
          <div className='screen active screen-game'>
            <GameScreen
              myPlayerId={myPlayerId}
              players={match.seats
                .map((playerId, seatIndex) => {
                  if (!playerId) return null;
                  const player = match.players.find((p) => p.id === playerId);
                  if (!player) return null;
                  const moves = match.playerMoves.get(playerId) ?? [];
                  const finished = moves.some((m) => m.end);
                  return {
                    id: player.id,
                    name: player.name,
                    color: SEAT_COLORS[seatIndex] ?? '#ccc',
                    moves,
                    finished,
                  };
                })
                .filter((p): p is NonNullable<typeof p> => p !== null)}
              startArticle={match.startTitle}
              targetArticle={match.targetTitle}
              iframeSrc={match.iframeSrc}
              onWikiFrameLoad={onWikiFrameLoad}
              wikiRef={wikiRef}
            />
          </div>
        )}

        {/* ── Game over screen ── */}
        <div
          className={`screen screen-gameover ${
            screen === 'gameover' ? 'active' : ''
          }`}
        >
          <div className='card'>
            {match.status === 'finished' && (
              <EndScreen
                lobby={match.lobby}
                currentPlayerId={myPlayerId}
                onBackToLobbies={backToLobbies}
                onViewResults={() => setScreen('results')}
              />
            )}
          </div>
        </div>

        {/* ── Results / replay screen ── */}
        {screen === 'results' && (
          <div className='screen active screen-results'>
            <ResultsPage paths={[resultsPaths.p1, resultsPaths.p2]} />
          </div>
        )}
      </div>
    </div>
  );
}
