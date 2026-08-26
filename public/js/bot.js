(function () {
  const consoleEl = document.getElementById('log-console');
  if (!consoleEl) return;

  const botId = consoleEl.dataset.botId;
  const statusLabel = document.getElementById('status-label');
  const indicator = document.getElementById('live-indicator');

  const STATUS_TEXT = {
    online: 'En ligne',
    starting: 'Démarrage…',
    stopped: 'Arrêté',
    error: 'Erreur',
  };

  function appendLog(entry) {
    const line = document.createElement('div');
    line.className = 'log-line log-' + entry.level;
    const time = document.createElement('span');
    time.className = 'log-time';
    time.textContent = new Date(entry.ts).toLocaleTimeString('fr-FR');
    line.appendChild(time);
    line.appendChild(document.createTextNode(entry.message));
    consoleEl.appendChild(line);
    // On limite le nombre de lignes affichées côté client.
    while (consoleEl.children.length > 300) consoleEl.removeChild(consoleEl.firstChild);
    consoleEl.scrollTop = consoleEl.scrollHeight;
  }

  function setStatus(status) {
    document.querySelectorAll('.status-dot').forEach((el) => {
      el.className = 'status-dot status-' + status;
    });
    if (statusLabel) {
      statusLabel.className = 'status-label status-label-' + status;
      statusLabel.textContent = STATUS_TEXT[status] || status;
    }
    const startBtn = document.querySelector('form[action$="/start"] button');
    const stopBtn = document.querySelector('form[action$="/stop"] button');
    if (startBtn) startBtn.disabled = status === 'online' || status === 'starting';
    if (stopBtn) stopBtn.disabled = status === 'stopped';
  }

  function connect() {
    const source = new EventSource('/bots/' + botId + '/stream');
    source.addEventListener('log', (e) => appendLog(JSON.parse(e.data)));
    source.addEventListener('status', (e) => {
      const data = JSON.parse(e.data);
      setStatus(data.status);
    });
    source.onopen = () => { if (indicator) indicator.style.opacity = '1'; };
    source.onerror = () => {
      if (indicator) indicator.style.opacity = '0.25';
      // EventSource se reconnecte automatiquement ; rien à faire de plus ici.
    };
  }

  connect();
})();
