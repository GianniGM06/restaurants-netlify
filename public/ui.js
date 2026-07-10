/* ===== MODULE UI — Toast, skeleton, étoiles, statut sync ===== */

export function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function showToast(message, type = 'info', duration = 3000) {
  try {
    const toast = document.createElement('div');
    toast.className = `alert alert-${type} position-fixed`;
    toast.style.cssText = 'top:20px;right:20px;z-index:9999;min-width:300px;opacity:0.9;';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.parentNode && toast.remove(), duration);
    const announcer = document.getElementById('sr-announcer');
    if (announcer) {
      announcer.textContent = '';
      requestAnimationFrame(() => { announcer.textContent = message; });
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
    statusBadge.className = 'badge bg-warning fs-6';
    statusBadge.textContent = customStatus;
  } else {
    statusBadge.className = 'badge bg-info fs-6';
    statusBadge.textContent = '⚡ Neon DB';
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
  window.UI = { escapeHtml, showToast, generateStars, showLoadingSkeleton, updateSyncStatus, setSyncWarning };
}
