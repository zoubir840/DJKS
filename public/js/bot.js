(function () {
  // --- Formulaire de commande : affiche les champs "embed" si pertinent ---
  const typeSelect = document.getElementById('response-type-select');
  const embedFields = document.getElementById('embed-fields');
  if (typeSelect && embedFields) {
    const sync = () => { embedFields.style.display = typeSelect.value === 'embed' ? 'grid' : 'none'; };
    typeSelect.addEventListener('change', sync);
    sync();
  }

  // --- Console de logs en direct + statut + serveurs (Server-Sent Events) ---
  const consoleEl = document.getElementById('log-console');
  if (!consoleEl) return;

  const botId = consoleEl.dataset.botId;
  const statusLabel = document.getElementById('status-label');
  const indicator = document.getElementById('live-indicator');
  const guildList = document.getElementById('guild-list');
  const guildEmpty = document.getElementById('guild-empty');
  const guildCounts = [document.getElementById('guild-count'), document.getElementById('guild-count-2')].filter(Boolean);

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

  function renderGuilds(guilds) {
    if (!guildList) return;
    guildCounts.forEach((el) => { el.textContent = guilds.length; });
    guildList.innerHTML = '';
    if (!guilds.length) {
      if (guildEmpty) guildEmpty.style.display = 'block';
      return;
    }
    if (guildEmpty) guildEmpty.style.display = 'none';
    guilds.forEach((g) => {
      const li = document.createElement('li');
      li.className = 'guild-item';
      const img = document.createElement('img');
      img.src = g.iconUrl || 'https://cdn.discordapp.com/embed/avatars/0.png';
      img.alt = '';
      const name = document.createElement('span');
      name.className = 'guild-name';
      name.textContent = g.name;
      const members = document.createElement('span');
      members.className = 'guild-members';
      members.textContent = g.memberCount + ' membre(s)';
      li.append(img, name, members);
      guildList.appendChild(li);
    });
  }

  function connect() {
    const source = new EventSource('/bots/' + botId + '/stream');
    source.addEventListener('log', (e) => appendLog(JSON.parse(e.data)));
    source.addEventListener('status', (e) => setStatus(JSON.parse(e.data).status));
    source.addEventListener('guilds', (e) => renderGuilds(JSON.parse(e.data).guilds));
    source.onopen = () => { if (indicator) indicator.style.opacity = '1'; };
    source.onerror = () => {
      if (indicator) indicator.style.opacity = '0.25';
      // EventSource se reconnecte automatiquement ; rien à faire de plus ici.
    };
  }

  connect();
})();
