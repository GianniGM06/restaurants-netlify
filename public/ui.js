/* ===== MODULE UI — Toast, skeleton, étoiles, statut sync ===== */

/** Seules les URLs http(s) sont acceptées dans les liens/photos (bloque javascript: etc.). */
export function isSafeHttpUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}

export function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const TOAST_ICONS = {
  success: 'bi-check-circle-fill',
  danger: 'bi-exclamation-triangle-fill',
  warning: 'bi-exclamation-circle-fill',
  info: 'bi-info-circle-fill',
};

function toastContainer() {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.setAttribute('aria-hidden', 'true'); // annonces SR via #sr-announcer
    document.body.appendChild(container);
  }
  return container;
}

export function showToast(message, type = 'info', duration = 3500) {
  try {
    // Design sobre : on retire les emojis de tête hérités des anciens messages,
    // l'icône est portée par le type
    const text = String(message).replace(/^[\s\p{Extended_Pictographic}\u{FE0F}\u{200D}]+/u, '').trim() || String(message);

    const toast = document.createElement('div');
    toast.className = `app-toast app-toast-${type}`;
    toast.innerHTML = `<i class="bi ${TOAST_ICONS[type] || TOAST_ICONS.info}" aria-hidden="true"></i><span></span>`;
    toast.querySelector('span').textContent = text;
    toastContainer().appendChild(toast);

    setTimeout(() => {
      toast.classList.add('is-leaving');
      setTimeout(() => toast.remove(), 250);
    }, duration);

    const announcer = document.getElementById('sr-announcer');
    if (announcer) {
      announcer.textContent = '';
      requestAnimationFrame(() => { announcer.textContent = text; });
    }
  } catch {
    alert(message);
  }
}

export function generateStars(rating) {
  let html = '';
  for (let i = 1; i <= 5; i++) {
    if (i <= rating) html += '<i class="bi bi-star-fill" aria-hidden="true"></i>';
    else if (i - 0.5 <= rating) html += '<i class="bi bi-star-half" aria-hidden="true"></i>';
    else html += '<i class="bi bi-star" aria-hidden="true"></i>';
  }
  return html;
}

export function showLoadingSkeleton() {
  const card = `
    <div class="col-md-6 mb-4 skeleton-card" aria-hidden="true">
      <div class="card h-100">
        <div class="skeleton skeleton-img"></div>
        <div class="card-body">
          <div class="skeleton skeleton-title mb-2"></div>
          <div class="skeleton skeleton-text mb-1"></div>
          <div class="skeleton skeleton-text w-75"></div>
        </div>
      </div>
    </div>`;
  const grid = card.repeat(4);
  const tested = document.getElementById('tested-grid');
  const wishlist = document.getElementById('wishlist-grid');
  if (tested) tested.innerHTML = grid;
  if (wishlist) wishlist.innerHTML = grid;
}

export function updateSyncStatus(statusBadge, customStatus = null, isAuthenticated = false) {
  if (!statusBadge || isAuthenticated) return;
  if (customStatus) {
    statusBadge.className = 'badge bg-warning';
    statusBadge.textContent = customStatus;
  } else {
    statusBadge.className = 'badge bg-info';
    statusBadge.textContent = 'En ligne';
  }
}

export function setSyncWarning(statusBadge, active) {
  if (!statusBadge) return;
  if (active) {
    statusBadge.classList.add('bg-warning');
    statusBadge.classList.remove('bg-success', 'bg-info', 'bg-secondary');
  }
}

if (typeof window !== 'undefined') {
  window.UI = { escapeHtml, isSafeHttpUrl, showToast, generateStars, showLoadingSkeleton, updateSyncStatus, setSyncWarning };
}
