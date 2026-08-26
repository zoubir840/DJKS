(function () {
  const csrfToken = document.body.dataset.csrf || '';

  // --- Formulaire de commande : affiche les champs "embed" si pertinent ---
  const typeSelect = document.getElementById('response-type-select');
  const embedFields = document.getElementById('embed-fields');
  if (typeSelect && embedFields) {
    const sync = () => { embedFields.style.display = typeSelect.value === 'embed' ? 'grid' : 'none'; };
    typeSelect.addEventListener('change', sync);
    sync();
  }

  // --- Générateur de commande par IA ---
  const genBtn = document.getElementById('ai-generate-btn');
  const genInput = document.getElementById('ai-generate-input');
  const genStatus = document.getElementById('ai-generate-status');
  if (genBtn && genInput) {
    const botIdForGen = document.getElementById('log-console')?.dataset.botId;
    genBtn.addEventListener('click', async () => {
      const description = genInput.value.trim();
      if (!description) {
        genStatus.textContent = 'Décris la commande que tu veux avant de générer.';
        return;
      }
      genBtn.disabled = true;
      genBtn.textContent = 'Génération…';
      genStatus.textContent = "L'IA réfléchit à ta commande…";
      try {
        const res = await fetch(`/bots/${botIdForGen}/commands/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description, _csrf: csrfToken }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Échec de la génération.');

        document.getElementById('command-type-select').value = data.type;
        document.getElementById('command-trigger-input').value = data.trigger;
        document.getElementById('command-cooldown-input').value = data.cooldown_seconds || 0;
        document.getElementById('command-description-input').value = data.description || '';
        document.getElementById('response-type-select').value = data.response_type;
        document.getElementById('command-embed-title-input').value = data.embed_title || '';
        document.getElementById('command-embed-color-input').value = data.embed_color || '#5865F2';
        document.getElementById('command-response-input').value = data.response || '';
        if (typeSelect) typeSelect.dispatchEvent(new Event('change'));

        genStatus.textContent = '✅ Commande générée ! Vérifie les champs ci-dessous puis clique sur "Ajouter la commande".';
        document.getElementById('command-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch (err) {
        genStatus.textContent = '❌ ' + err.message;
      } finally {
        genBtn.disabled = false;
        genBtn.textContent = 'Générer';
      }
    });
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
