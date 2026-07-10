/* ===== MODULE CARTE — Leaflet dynamique + géolocalisation ===== */

import { escapeHtml } from './ui.js';

const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS  = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

const ICON_BLUE  = 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png';
const ICON_GREEN = 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png';
const ICON_RED   = 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png';
const ICON_SHADOW = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png';

const ICON_SIZE = [25, 41];
const ICON_ANCHOR = [12, 41];
const POPUP_ANCHOR = [1, -34];
const SHADOW_SIZE = [41, 41];

export function makeIcon(url) {
  return L.icon({ iconUrl: url, shadowUrl: ICON_SHADOW, iconSize: ICON_SIZE, iconAnchor: ICON_ANCHOR, popupAnchor: POPUP_ANCHOR, shadowSize: SHADOW_SIZE });
}

export async function loadLeaflet() {
  if (window.L) return;
  await new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = LEAFLET_CSS;
    document.head.appendChild(link);

    const script = document.createElement('script');
    script.src = LEAFLET_JS;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

export function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return dist >= 1 ? `${dist.toFixed(1)} km` : `${(dist * 1000).toFixed(0)} m`;
}

export class MapManager {
  constructor({ generateStars, showToast }) {
    this.map = null;
    this.userMarker = null;
    this.userPosition = null;
    this.restaurantMarkers = [];
    this.generateStars = generateStars;
    this.showToast = showToast;
  }

  async init(filteredData) {
    if (this.map) {
      this.updateMarkers(filteredData);
      return;
    }
    try {
      await loadLeaflet();
    } catch {
      this.showToast('❌ Impossible de charger la carte Leaflet', 'danger');
      return;
    }
    this.map = L.map('map').setView([48.8566, 2.3522], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(this.map);
    this.updateMarkers(filteredData);
  }

  updateMarkers(filteredData) {
    if (!this.map) return;
    this.restaurantMarkers.forEach(m => this.map.removeLayer(m));
    this.restaurantMarkers = [];

    filteredData.tested.forEach(r => {
      if (!r.coordinates) return;
      const rating = this._calcRating(r);
      const dist = this.userPosition ? calculateDistance(this.userPosition.lat, this.userPosition.lng, r.coordinates.lat, r.coordinates.lng) : null;
      const marker = L.marker([r.coordinates.lat, r.coordinates.lng], { icon: makeIcon(ICON_BLUE) }).addTo(this.map);
      marker.bindPopup(`
        <div style="min-width:250px">
          <h6><strong>${escapeHtml(r.name)}</strong></h6>
          <p class="mb-1"><span class="badge bg-primary">${escapeHtml(r.type)}</span></p>
          <p class="mb-2">${escapeHtml(r.location)}</p>
          ${dist ? `<p class="mb-2"><i class="bi bi-pin-map"></i> <strong>${dist}</strong></p>` : ''}
          <div class="mb-2">${this.generateStars(rating)} ${rating.toFixed(1)}/5</div>
          ${r.comment ? `<p class="small mt-2"><em>"${escapeHtml(r.comment)}"</em></p>` : ''}
          ${r.googleMapsUrl ? `<a href="${escapeHtml(r.googleMapsUrl)}" target="_blank" rel="noopener" class="btn btn-sm btn-primary text-white w-100 mt-2"><i class="bi bi-geo-alt-fill"></i> Google Maps</a>` : ''}
        </div>`);
      this.restaurantMarkers.push(marker);
    });

    filteredData.wishlist.forEach(r => {
      if (!r.coordinates) return;
      const dist = this.userPosition ? calculateDistance(this.userPosition.lat, this.userPosition.lng, r.coordinates.lat, r.coordinates.lng) : null;
      const marker = L.marker([r.coordinates.lat, r.coordinates.lng], { icon: makeIcon(ICON_GREEN) }).addTo(this.map);
      marker.bindPopup(`
        <div style="min-width:250px">
          <h6><strong>${escapeHtml(r.name)}</strong></h6>
          <p class="mb-1"><span class="badge bg-success">${escapeHtml(r.type)}</span></p>
          <p class="mb-2">${escapeHtml(r.location)}</p>
          ${dist ? `<p class="mb-2"><i class="bi bi-pin-map"></i> <strong>${dist}</strong></p>` : ''}
          <div class="alert alert-info mb-2 py-2">❤️ <strong>À tester</strong>${r.reason ? `<br><small>${escapeHtml(r.reason)}</small>` : ''}</div>
          ${r.googleMapsUrl ? `<a href="${escapeHtml(r.googleMapsUrl)}" target="_blank" rel="noopener" class="btn btn-sm btn-success text-white w-100 mt-2"><i class="bi bi-geo-alt-fill"></i> Google Maps</a>` : ''}
        </div>`);
      this.restaurantMarkers.push(marker);
    });
  }

  activateGeolocation(filteredData) {
    if (!navigator.geolocation) {
      this.showToast('❌ Géolocalisation non supportée par votre navigateur', 'danger');
      return;
    }
    this.showToast('📍 Localisation en cours...', 'info');
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude: lat, longitude: lng } = position.coords;
        this.userPosition = { lat, lng };
        if (!this.map) await this.init(filteredData);
        if (this.userMarker) this.map.removeLayer(this.userMarker);
        this.userMarker = L.marker([lat, lng], { icon: makeIcon(ICON_RED) }).addTo(this.map);
        this.userMarker.bindPopup('<div style="min-width:150px;text-align:center"><strong>📍 Vous êtes ici</strong></div>');
        this.map.setView([lat, lng], 14);
        this.updateMarkers(filteredData);
        this.showToast('✅ Position trouvée !', 'success');
      },
      (error) => {
        const msgs = {
          1: '❌ Veuillez autoriser l\'accès à votre position dans les paramètres du navigateur',
          2: '❌ Position indisponible - vérifiez que le GPS/WiFi est activé',
          3: '❌ Délai dépassé pour obtenir votre position',
        };
        this.showToast(msgs[error.code] || '❌ Impossible d\'obtenir votre position', 'danger');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }

  _calcRating(r) {
    const { plats, vins, accueil, lieu } = r.ratings;
    if (r.winesNotTested || vins === null) return (plats * 2 + accueil * 1.5 + lieu) / 4.5;
    return (plats * 2 + vins * 1.5 + accueil * 1.5 + lieu) / 6;
  }
}

if (typeof window !== 'undefined') {
  window.MapModule = { MapManager, loadLeaflet, calculateDistance };
}
