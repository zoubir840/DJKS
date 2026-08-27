// Logique partagée sur toutes les pages : bascule de thème clair/sombre.
(function () {
  const toggle = document.getElementById('theme-toggle');
  if (!toggle) return;

  function current() {
    return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  }

  function syncIcon() {
    toggle.textContent = current() === 'light' ? '☀️' : '🌙';
  }

  toggle.addEventListener('click', () => {
    const next = current() === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('djks-theme', next);
    } catch (err) {
      // localStorage indisponible : le choix ne sera pas mémorisé, tant pis.
    }
    syncIcon();
  });

  syncIcon();
})();
