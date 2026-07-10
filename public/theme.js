/* ===== MODULE THÈME — clair / sombre, persisté, Bootstrap 5.3 natif =====
   Le thème initial est appliqué par un mini-script inline dans <head>
   (avant le premier paint, pour éviter le flash). Ce module gère le toggle. */

const STORAGE_KEY = 'theme';

function systemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function currentTheme() {
  return document.documentElement.getAttribute('data-bs-theme') || systemTheme();
}

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-bs-theme', theme);
  const icon = document.querySelector('#theme-toggle i');
  if (icon) {
    icon.className = theme === 'dark' ? 'bi bi-sun' : 'bi bi-moon';
  }
  const btn = document.getElementById('theme-toggle');
  if (btn) {
    btn.setAttribute('aria-label', theme === 'dark' ? 'Passer en thème clair' : 'Passer en thème sombre');
    btn.title = btn.getAttribute('aria-label');
  }
}

export function initTheme() {
  applyTheme(localStorage.getItem(STORAGE_KEY) || systemTheme());

  const btn = document.getElementById('theme-toggle');
  if (btn) {
    btn.addEventListener('click', () => {
      const next = currentTheme() === 'dark' ? 'light' : 'dark';
      localStorage.setItem(STORAGE_KEY, next);
      applyTheme(next);
    });
  }

  // Suivre le système tant que l'utilisateur n'a pas choisi explicitement
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      applyTheme(e.matches ? 'dark' : 'light');
    }
  });
}

if (typeof window !== 'undefined') {
  window.Theme = { initTheme, applyTheme, currentTheme };
}
