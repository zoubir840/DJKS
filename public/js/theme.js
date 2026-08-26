// Appliqué en premier, avant le reste de la page, pour éviter un flash du
// mauvais thème. Ne dépend d'aucun autre script.
(function () {
  try {
    const saved = localStorage.getItem('djks-theme');
    if (saved === 'light' || saved === 'dark') {
      document.documentElement.setAttribute('data-theme', saved);
    }
  } catch (err) {
    // localStorage indisponible (navigation privée stricte, etc.) : on
    // reste sur le thème sombre par défaut.
  }
})();
