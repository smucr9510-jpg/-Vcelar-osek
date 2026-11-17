/* Včelař – Osek: interaktivní mapa hranic pozemků LPIS */
(() => {
  'use strict';
  const SITE = { lat: 49.7804535, lon: 13.5998565 };
  let map = null;
  let parcelLayer = null;
  let markerLayer = null;
  let latestParcels = [];
  let leafletLoading = false;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  function ensureMapPanel() {
    const section = document.getElementById('parcels');
    if (!section) return null;
    let panel = document.getElementById('lpisParcelMapPanel');
    if (panel) return panel;
    const list = document.getElementById('parcelList');
    const parent = list?.parentElement;
    if (!parent) return null;
    panel = document.createElement('div');
    panel.id = 'lpisParcelMapPanel';
    panel.className = 'panel';
    panel.innerHTML = `
      <h3>Mapa pozemků podle LPIS</h3>
      <p class="muted">Hranice načtených pozemků v okolí stanoviště. Klepnutím na plochu otevřete kartu pozemku.</p>
      <div id="lpisParcelMap" style="height:min(62vh,560px);min-height:320px;width:100%;border-radius:12px;overflow:hidden;background:#e8eee6"></div>
      <div id="lpisParcelMapStatus" class="notice" aria-live="polite">Připravuji mapu…</div>
      <div class="small muted">Zelená: trvalé travní porosty · žlutá: orná půda a polní plodiny · růžová: sady a zahrady · modrá: ostatní nebo neurčené kultury</div>`;
    parent.insertBefore(panel, list);
    return panel;
  }

  function setStatus(message, warning = false) {
    const el = document.getElementById('lpisParcelMapStatus');
    if (el) {
      el.textContent = message;
      el.classList.toggle('bad', warning);
    }
  }

  function colour(parcel) {
    const value = `${parcel.crop || ''} ${parcel.culture || ''}`.toLowerCase();
    if (/trval|trav|lou|pastv|ttp/.test(value)) return '#4b9655';
    if (/orn|obil|řep|repk|kuku|sluneč|brambor/.test(value)) return '#d59a24';
    if (/sad|ovo|zahr/.test(value)) return '#bd6a9b';
    if (/les/.test(value)) return '#34734a';
    return '#6688b5';
  }

  function parcelDistance(lat, lon) {
    const r = x => x * Math.PI / 180;
    const dLat = r(lat - SITE.lat), dLon = r(lon - SITE.lon);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(r(SITE.lat)) * Math.cos(r(lat)) * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function geometryCenter(geometry) {
    const points = [];
    const walk = value => {
      if (!Array.isArray(value)) return;
      if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
        points.push(value); return;
      }
      value.forEach(walk);
    };
    if (geometry?.type === 'GeometryCollection') {
      (geometry.geometries || []).forEach(g => {
        const c = geometryCenter(g); if (c) points.push([c[1], c[0]]);
      });
    } else walk(geometry?.coordinates);
    if (!points.length) return null;
    const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
    return [(Math.min(...ys) + Math.max(...ys)) / 2, (Math.min(...xs) + Math.max(...xs)) / 2];
  }

  function openParcel(id) {
    const button = [...document.querySelectorAll('[data-edit-parcel]')]
      .find(el => el.dataset.editParcel === String(id));
    if (button) {
      button.click();
      document.getElementById('parcelForm')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function featureFor(parcel) {
    return {
      type: 'Feature',
      geometry: parcel.geometry,
      properties: {
        id: parcel.id, code: parcel.code, area: parcel.area,
        crop: parcel.crop, culture: parcel.culture, dist: parcel.dist
      }
    };
  }

  function draw(parcels) {
    latestParcels = Array.isArray(parcels) ? parcels : [];
    if (!map || !parcelLayer) return;
    const features = latestParcels.filter(p => p.geometry && p.geometry.type).map(featureFor);
    parcelLayer.clearLayers();
    parcelLayer.addData({ type: 'FeatureCollection', features });
    markerLayer.clearLayers();
    L.marker([SITE.lat, SITE.lon]).addTo(markerLayer)
      .bindPopup('<b>Stanoviště TORENO, s.r.o.</b><br>Osek 489');
    const withDistance = latestParcels.filter(p => p.geometry && !p.dist).length;
    setStatus(features.length
      ? `Na mapě je ${features.length} pozemků s uloženou geometrií. Celkem v evidenci: ${latestParcels.length}.${withDistance ? ` U ${withDistance} pozemků ještě není vypočtena vzdálenost.` : ''}`
      : `V evidenci je ${latestParcels.length} pozemků, ale žádný nemá uloženou geometrii hranic. Znovu načtěte vrstvu DPB_účinné v záložce LPIS.` , !features.length);
    if (features.length) {
      const bounds = parcelLayer.getBounds();
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [18, 18], maxZoom: 15 });
    } else map.setView([SITE.lat, SITE.lon], 13);
  }

  function init() {
    const panel = ensureMapPanel();
    if (!panel) return;
    if (!navigator.onLine) {
      setStatus('Jste offline. Hranice pozemků jsou uloženy v telefonu, ale mapový podklad se bez předem načtených mapových dlaždic nezobrazí.', true);
      return;
    }
    if (!window.L) {
      setStatus('Mapová knihovna není dostupná. Zkontrolujte připojení k internetu a obnovte stránku.', true);
      return;
    }
    if (map) { setTimeout(() => map.invalidateSize(), 100); draw(latestParcels); return; }
    const target = document.getElementById('lpisParcelMap');
    if (!target) return;
    map = L.map(target, { preferCanvas: true }).setView([SITE.lat, SITE.lon], 13);
    const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; OpenStreetMap'
    }).addTo(map);
    parcelLayer = L.geoJSON([], {
      style: feature => {
        const c = colour(feature.properties || {});
        return { color: c, weight: 2, fillColor: c, fillOpacity: .38 };
      },
      onEachFeature: (feature, layer) => {
        const p = feature.properties || {};
        const popup = `<b>${esc(p.code || 'Pozemek LPIS')}</b><br>${esc(p.crop || p.culture || 'Plodina nezjištěna')}<br>${p.area ? esc(p.area) + ' ha' : 'Výměra neuvedena'}<br>${p.dist ? esc(p.dist) + ' km od stanoviště' : ''}<br><button type="button" class="btn" data-open-lpis-parcel="${esc(p.id)}">Otevřít kartu</button>`;
        layer.bindPopup(popup);
        layer.on('popupopen', event => {
          const button = event.popup.getElement()?.querySelector('[data-open-lpis-parcel]');
          if (button) button.addEventListener('click', () => openParcel(button.dataset.openLpisParcel));
        });
      }
    }).addTo(map);
    markerLayer = L.layerGroup().addTo(map);
    [1000, 2000, 3000, 5000].forEach((metres, i) => L.circle([SITE.lat, SITE.lon], {
      radius: metres, color: ['#477b43', '#769b55', '#a1a85a', '#b58a43'][i],
      weight: 1.5, fill: false, dashArray: '5 6'
    }).addTo(map).bindTooltip(`${metres / 1000} km`));
    L.control.layers({ 'OpenStreetMap': osm },
      { 'Hranice pozemků LPIS': parcelLayer, 'Stanoviště': markerLayer },
      { collapsed: true }).addTo(map);
    setTimeout(() => map.invalidateSize(), 250);
    draw(latestParcels);
  }

  document.addEventListener('vcelar:parcels-updated', event => {
    latestParcels = event.detail?.parcels || [];
    if (map) draw(latestParcels);
  });
  document.addEventListener('click', event => {
    if (event.target.closest('#nav button[data-page="parcels"]')) {
      setTimeout(() => { init(); if (map) map.invalidateSize(); draw(latestParcels); }, 120);
    }
  });
  window.addEventListener('online', () => { if (!map) init(); });

  function loadLeaflet() {
    if (window.L) { init(); return; }
    if (leafletLoading) return;
    leafletLoading = true;
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(css);
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = init;
    script.onerror = () => setStatus('Nepodařilo se načíst mapovou knihovnu. Pozemky a jejich geometrie zůstávají uloženy v telefonu.', true);
    document.head.appendChild(script);
  }

  // App.js emits this event after rendering the locally stored parcel records.
  document.addEventListener('DOMContentLoaded', () => { ensureMapPanel(); loadLeaflet(); });
  if (document.readyState !== 'loading') { ensureMapPanel(); loadLeaflet(); }
})();
