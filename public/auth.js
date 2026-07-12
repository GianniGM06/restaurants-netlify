/* ===== SERVICE D'AUTHENTIFICATION GITHUB =====
   Token en sessionStorage (périmètre onglet) par défaut, ou en localStorage
   si « Rester connecté » est coché (décision D3 — le CSP strict limite le
   risque d'exfiltration). */

export class GitHubAuthService {
  constructor() {
    this.token = localStorage.getItem('github-token') || sessionStorage.getItem('github-token') || null;
    this.isAuthenticated = false;
    this.userInfo = null;
  }

  /**
   * @param {string} token
   * @param {boolean} [remember] true = localStorage (persistant), false =
   *   sessionStorage ; undefined = conserver l'emplacement actuel (revalidation)
   */
  async authenticate(token, remember = undefined) {
    if (!token || !token.trim()) throw new Error('Token GitHub requis');

    const response = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `token ${token.trim()}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) {
      this.logout();
      throw new Error(response.status === 401 ? 'Token GitHub invalide' : `Erreur GitHub API: ${response.status}`);
    }

    const userData = await response.json();
    this.token = token.trim();
    this.userInfo = userData;
    this.isAuthenticated = true;

    const useLocal = remember === undefined
      ? localStorage.getItem('github-token') !== null
      : remember;
    if (useLocal) {
      localStorage.setItem('github-token', this.token);
      sessionStorage.removeItem('github-token');
    } else {
      sessionStorage.setItem('github-token', this.token);
      localStorage.removeItem('github-token');
    }
    return userData;
  }

  logout() {
    this.token = null;
    this.userInfo = null;
    this.isAuthenticated = false;
    sessionStorage.removeItem('github-token');
    localStorage.removeItem('github-token');
  }

  async checkStoredToken() {
    if (!this.token) return false;
    try {
      await this.authenticate(this.token);
      return true;
    } catch {
      this.logout();
      return false;
    }
  }
}

if (typeof window !== 'undefined') {
  window.Auth = { GitHubAuthService };
}
