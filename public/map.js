/* ===== MODULE CARTE — Leaflet dynamique + géolocalisation ===== */

import { escapeHtml, isSafeHttpUrl } from './ui.js';
import { calculateRating } from './rating.js';

// Leaflet et marqueurs auto-hébergés (vendor/) — plus de dépendance CDN
const LEAFLET_CSS = 'vendor/leaflet/leaflet.css';
const LEAFLET_JS  = 'vendor/leaflet/leaflet.js';

const ICON_BLUE   = 'vendor/leaflet/markers/marker-icon-2x-blue.png';
const ICON_GREEN  = 'vendor/leaflet/markers/marker-icon-2x-green.png';
const ICON_RED    = 'vendor/leaflet/markers/marker-icon-2x-red.png';
const ICON_SHADOW = 'vendor/leaflet/markers/marker-shadow.png';

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

/** Distance haversine en kilomètres (nombre brut, pour tris et calculs). */
export function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Formatage lisible : "350 m" ou "2.4 km". */
export function formatDistance(km) {
  return km >= 1 ? `${km.toFixed(1)} km` : `${(km * 1000).toFixed(0)} m`;
}

export function calculateDistance(lat1, lon1, lat2, lon2) {
  return formatDistance(distanceKm(lat1, lon1, lat2, lon2));
}

export class MapManager {
  constructor({ generateStars, showToast, onPositionChange }) {
    this.map = null;
    this.userMarker = null;
    this.userPosition = null;
    this.restaurantMarkers = [];
    this.generateStars = generateStars;
    this.showToast = showToast;
    // Notifie l'app quand la position de référence change (géoloc OU adresse saisie)
    this.onPositionChange = onPositionChange;
  }

  /** Pose/déplace la position de référence (marqueur rouge) et recentre la carte. */
  setReferencePosition(lat, lng, zoom = 14) {
    this.userPosition = { lat, lng };
    if (!this.map) return;
    if (this.userMarker) this.map.removeLayer(this.userMarker);
    this.userMarker = L.marker([lat, lng], { icon: makeIcon(ICON_RED) }).addTo(this.map);
    this.userMarker.bindPopup('<div style="min-width:150px;text-align:center"><strong>Position de référence</strong></div>');
    this.map.setView([lat, lng], zoom);
  }

  /** Centre la carte sur un restaurant et ouvre son popup. */
  focusOn(lat, lng) {
    if (!this.map) return;
    this.map.setView([lat, lng], 16);
    const marker = this.restaurantMarkers.find((mk) => {
      const p = mk.getLatLng();
      return Math.abs(p.lat - lat) < 1e-9 && Math.abs(p.lng - lng) < 1e-9;
    });
    marker?.openPopup();
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
      // Garde : testé sans notes -> pas de ligne de note dans le popup
      const rating = r.ratings ? calculateRating(r.ratings, r.winesNotTested) : null;
      const dist = this.userPosition ? calculateDistance(this.userPosition.lat, this.userPosition.lng, r.coordinates.lat, r.coordinates.lng) : null;
      const marker = L.marker([r.coordinates.lat, r.coordinates.lng], { icon: makeIcon(ICON_BLUE) }).addTo(this.map);
      marker.bindPopup(`
        <div style="min-width:250px">
          <h6><strong>${escapeHtml(r.name)}</strong></h6>
          <p class="mb-1"><span class="badge bg-primary">${escapeHtml(r.type)}</span></p>
          <p class="mb-2">${escapeHtml(r.location)}</p>
          ${dist ? `<p class="mb-2"><i class="bi bi-pin-map"></i> <strong>${dist}</strong></p>` : ''}
          ${rating !== null ? `<div class="mb-2">${this.generateStars(rating)} ${rating.toFixed(1)}/5</div>` : ''}
          ${r.comment ? `<p class="small mt-2"><em>"${escapeHtml(r.comment)}"</em></p>` : ''}
          ${isSafeHttpUrl(r.googleMapsUrl) ? `<a href="${escapeHtml(r.googleMapsUrl)}" target="_blank" rel="noopener" class="btn btn-sm btn-primary text-white w-100 mt-2"><i class="bi bi-geo-alt-fill"></i> Google Maps</a>` : ''}
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
          ${isSafeHttpUrl(r.googleMapsUrl) ? `<a href="${escapeHtml(r.googleMapsUrl)}" target="_blank" rel="noopener" class="btn btn-sm btn-success text-white w-100 mt-2"><i class="bi bi-geo-alt-fill"></i> Google Maps</a>` : ''}
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
        if (!this.map) await this.init(filteredData);
        this.setReferencePosition(lat, lng);
        this.updateMarkers(filteredData);
        this.showToast('✅ Position trouvée !', 'success');
        this.onPositionChange?.({ lat, lng }, { fromGeolocation: true });
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

}

if (typeof window !== 'undefined') {
  window.MapModule = { MapManager, loadLeaflet, calculateDistance, distanceKm, formatDistance };
}
