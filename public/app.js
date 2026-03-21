(() => {
  const screens = {
    alias: document.getElementById('screen-alias'),
    lobbies: document.getElementById('screen-lobbies'),
    waiting: document.getElementById('screen-waiting'),
    game: document.getElementById('screen-game'),
    gameover: document.getElementById('screen-gameover'),
  };

  let playerName = '';
  let playerId = null;
  let currentLobbyId = null;
  let ws = null;
  let pollTimer = null;

  let gameState = {
    startArticle: '',
    targetArticle: '',
    currentArticle: '',
    moveCount: 0,
  };

  function showScreen(name) {
    Object.values(screens).forEach((s) => s.classList.remove('active'));
    screens[name].classList.add('active');
  }

  // --- Alias form ---

  document.getElementById('alias-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('alias-input');
    const name = input.value.trim();
    if (!name) return;

    playerName = name;
    document.getElementById('player-name-display').textContent = playerName;
    showScreen('lobbies');
    refreshLobbies();
    startPolling();
  });

  // --- Lobby list ---

  async function refreshLobbies() {
    try {
      const res = await fetch('/api/lobbies/joinable');
      const lobbies = await res.json();
      renderLobbies(lobbies);
    } catch (err) {
      console.error('Failed to fetch lobbies', err);
    }
  }

  function renderLobbies(lobbies) {
    const container = document.getElementById('lobby-list');

    if (lobbies.length === 0) {
      container.innerHTML =
        '<p class="empty-state">No lobbies available. Create one!</p>';
      return;
    }

    container.innerHTML = lobbies
      .map(
        (lobby) => `
      <div class="lobby-card">
        <div class="lobby-meta">
          <div class="lobby-articles">
            <strong>${escapeHtml(
              lobby.startArticle
            )}</strong> &rarr; <strong>${escapeHtml(
          lobby.targetArticle
        )}</strong>
          </div>
          <div class="lobby-players">${lobby.players.length}/${
          lobby.maxPlayers
        } players</div>
        </div>
        <button class="btn-join" data-lobby-id="${lobby.id}">Join</button>
      </div>
    `
      )
      .join('');

    container.querySelectorAll('.btn-join').forEach((btn) => {
      btn.addEventListener('click', () => joinLobby(btn.dataset.lobbyId));
    });
  }

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(refreshLobbies, 3000);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  // --- Create lobby ---

  document
    .getElementById('btn-create-lobby')
    .addEventListener('click', async () => {
      const btn = document.getElementById('btn-create-lobby');
      btn.disabled = true;
      btn.textContent = 'Creating…';

      try {
        const res = await fetch('/api/lobbies', { method: 'POST' });
        if (!res.ok) throw new Error('Failed to create lobby');
        const lobby = await res.json();
        joinLobby(lobby.id);
      } catch (err) {
        console.error(err);
        alert('Could not create lobby. Try again.');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Create Lobby';
      }
    });

  // --- Join lobby via WebSocket ---

  function joinLobby(lobbyId) {
    stopPolling();
    currentLobbyId = lobbyId;

    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${
      location.host
    }/ws?lobbyId=${lobbyId}&playerName=${encodeURIComponent(playerName)}`;

    ws = new WebSocket(url);

    ws.addEventListener('open', () => {
      showScreen('waiting');
      document.getElementById('waiting-info').textContent =
        'Connected. Waiting for another player to join…';
    });

    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      handleServerMessage(msg);
    });

    ws.addEventListener('close', (event) => {
      if (event.code >= 4000) {
        alert(event.reason || 'Could not join lobby.');
        showScreen('lobbies');
        refreshLobbies();
        startPolling();
      }
    });
  }

  // --- Handle server messages ---

  function handleServerMessage(msg) {
    switch (msg.type) {
      case 'lobby_state':
        playerId = msg.payload.playerId;
        break;

      case 'player_joined':
        document.getElementById(
          'waiting-info'
        ).textContent = `${msg.payload.name} joined! Starting soon…`;
        break;

      case 'game_start':
        startGameUI(msg.payload);
        break;

      case 'player_left':
        document.getElementById('waiting-info').textContent =
          'Opponent disconnected.';
        break;

      case 'game_over':
        showGameOver(msg.payload);
        break;

      case 'error':
        console.error('Server error:', msg.payload.message);
        break;
    }
  }

  // --- Game UI ---

  const wikiFrame = document.getElementById('wiki-frame');

  function startGameUI(lobby) {
    gameState.startArticle = lobby.startArticle;
    gameState.targetArticle = lobby.targetArticle;
    gameState.currentArticle = lobby.startArticle;
    gameState.moveCount = 0;

    document.getElementById('game-target-article').textContent =
      lobby.targetArticle;
    updateGameBar();
    showScreen('game');

    wikiFrame.src = '/wiki/' + encodeURIComponent(lobby.startArticle);
  }

  wikiFrame.addEventListener('load', () => {
    try {
      const frameUrl = wikiFrame.contentWindow.location.pathname;
      if (!frameUrl.startsWith('/wiki/')) return;

      const rawTitle = decodeURIComponent(frameUrl.replace('/wiki/', ''));
      const title = rawTitle.replace(/_/g, ' ');

      if (title === gameState.currentArticle) return;

      gameState.currentArticle = title;
      gameState.moveCount++;
      updateGameBar();

      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'move', payload: { article: title } }));
      }
    } catch (e) {
      // cross-origin frame access — should not happen with our proxy
      console.warn('Could not read iframe URL:', e);
    }
  });

  function updateGameBar() {
    document.getElementById('game-current-article').textContent =
      gameState.currentArticle;
    document.getElementById('game-move-count').textContent = `${
      gameState.moveCount
    } move${gameState.moveCount !== 1 ? 's' : ''}`;
  }

  // --- Game over ---

  function showGameOver(payload) {
    const winner = payload.lobby.players.find((p) => p.id === payload.winnerId);
    const isMe = payload.winnerId === playerId;

    document.getElementById('gameover-title').textContent = isMe
      ? 'You Win!'
      : 'Game Over';

    const moves = payload.lobby.moves[payload.winnerId] || [];
    document.getElementById('gameover-info').innerHTML = `
      <strong>${escapeHtml(winner?.name || 'Unknown')}</strong> reached
      <strong>${escapeHtml(payload.lobby.targetArticle)}</strong>
      in <strong>${moves.length - 1}</strong> moves.
    `;

    showScreen('gameover');
  }

  document
    .getElementById('btn-back-to-lobbies')
    .addEventListener('click', () => {
      if (ws) ws.close();
      wikiFrame.src = 'about:blank';
      showScreen('lobbies');
      refreshLobbies();
      startPolling();
    });

  // --- Util ---

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
})();
