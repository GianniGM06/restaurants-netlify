/* ===== SERVICE D'AUTHENTIFICATION GITHUB ===== */
// P2.10 : token en sessionStorage (périmètre onglet, pas persisté entre sessions)

export class GitHubAuthService {
  constructor() {
    this.token = sessionStorage.getItem('github-token') || null;
    this.isAuthenticated = false;
    this.userInfo = null;
  }

  async authenticate(token) {
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
    sessionStorage.setItem('github-token', this.token);
    return userData;
  }

  logout() {
    this.token = null;
    this.userInfo = null;
    this.isAuthenticated = false;
    sessionStorage.removeItem('github-token');
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
