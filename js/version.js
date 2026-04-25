/* ===================================================================
 * version.js — Source unique du numéro de version de l'application
 *
 * Pour publier une nouvelle version :
 *   1. Mettre à jour `number` et `date` ci-dessous
 *   2. Ajouter une section en haut de CHANGELOG.md
 *   3. Commit + push
 * =================================================================== */

window.FMP = window.FMP || {};

FMP.Version = {
  number: '1.3.1',
  date:   '2026-04-24',              // YYYY-MM-DD : date du build
  label:  'Version + Changelog',     // court descriptif de la version

  // URL du changelog sur GitHub — ouverte au clic sur le numéro de version
  changelogUrl: 'https://github.com/lianazel/FuelMapPrice/blob/main/CHANGELOG.md',

  /**
   * Détermine si cette version est "récente" (déployée il y a moins de N jours).
   * Sert à afficher le badge ✨ Nouveau.
   */
  isNew(days = 3) {
    const deployDate = new Date(this.date + 'T00:00:00');
    const ageDays = (Date.now() - deployDate.getTime()) / 86400000;
    return ageDays >= 0 && ageDays <= days;
  },

  /** Date de build formatée à la française. */
  formattedDate() {
    const d = new Date(this.date + 'T00:00:00');
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  },
};
