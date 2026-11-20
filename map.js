/* Včelař – Osek: skutečná mapa na úvodní stránce i v evidenci pozemků */
(() => {
  'use strict';

  const SITE = { lat: 49.7804535, lon: 13.5998565 };
  const DB_NAME = 'vcelarOsekDB';
  const DB_STORE = 'appData';
  const DB_KEY = 'vcelarOsek.data.v2';
  const maps = {};
  let parcels = [];
  let leafletLoading = false;
  let leafletReady = false;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));

  // V datech aplikace je vzdálenost do 50 uložená v kilometrech,
  // vyšší hodnoty jsou již v metrech. V kartě se vždy zobrazuje m/km.
  function formatDistance(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return '';
    if (n <= 50) {
      const metres = n * 1000;
      return metres < 1000
        ? `${Math.round(metres)} m`
        : `${(metres / 1000).toLocaleString('cs-CZ', { maximumFractionDigits: 2 })} km`;
    }
    return n < 1000
      ? `${Math.round(n)} m`
      : `${(n / 1000).toLocaleString('cs-CZ', { maximumFractionDigits: 2 })} km`;
  }

  function addStyles() {
    if (document.getElementById('vcelar-home-map-styles')) return;
    const style = document.createElement('style');
    style.id = 'vcelar-home-map-styles';
    style.textContent = `
      #homeAreaMap { width:100%; height:300px; min-height:260px; border-radius:12px; overflow:hidden; background:#e8eee6; }
      #parcelMap { width:100%; height:min(58vh,470px); min-height:300px; padding:0!important; overflow:hidden; text-align:left!important; }
      #homeAreaMap .leaflet-control-layers, #parcelMap .leaflet-control-layers {
        border:1px solid #d7b45d; border-radius:10px; box-shadow:0 2px 7px #32190033; font-size:12px;
      }
      #homeAreaMap .leaflet-control-layers-toggle, #parcelMap .leaflet-control-layers-toggle {
        width:34px; height:34px; background-size:18px 18px;
      }
      #homeAreaMap .leaflet-control-layers-expanded, #parcelMap .leaflet-control-layers-expanded {
        padding:7px 9px; max-width:190px;
      }
      #homeAreaMap .leaflet-control-layers label, #parcelMap .leaflet-control-layers label { margin:3px 0; font-size:12px; }
      #homeAreaMap .leaflet-control-attribution, #parcelMap .leaflet-control-attribution { font-size:9px; }
      .vcelar-map-status { margin:8px 0 0; padding:8px 10px; background:#f7edcf; border-radius:10px; color:#715b3e; font-size:12px; }
      .vcelar-map-legend { display:flex; flex-wrap:wrap; gap:5px 11px; margin-top:8px; color:#715b3e; font-size:11px; }
      .vcelar-map-legend span { display:inline-flex; align-items:center; gap:5px; }
      .vcelar-map-legend i { width:9px; height:9px; border-radius:50%; display:inline-block; }
      @media(max-width:700px) {
        #homeAreaMap { height:280px; min-height:250px; }
        #parcelMap { height:390px; min-height:300px; }
      }`;
    document.head.appendChild(style);
  }

  function colorFor(parcel) {
    const value = `${parcel.crop || ''} ${parcel.culture || ''}`.toLowerCase();
    if (/trval|trav|lou|pastv|ttp/.test(value)) return '#4b9655';
    if (/orn|obil|řep|repk|kuku|sluneč|brambor/.test(value)) return '#d59a24';
    if (/sad|ovo|zahr/.test(value)) return '#bd6a9b';
    if (/les/.test(value)) return '#34734a';
    return '#6688b5';
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

  function openParcel(id) {
    const button = [...document.querySelectorAll('[data-edit-parcel]')]
      .find(el => el.dataset.editParcel === String(id));
    if (button) {
      button.click();
      document.getElementById('parcelForm')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      const navButton = document.querySelector('#nav button[data-page="parcels"]');
      navButton?.click();
      setTimeout(() => {
        const next = [...document.querySelectorAll('[data-edit-parcel]')]
          .find(el => el.dataset.editParcel === String(id));
        next?.click();
        document.getElementById('parcelForm')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 250);
    }
  }

  function makeFeatureLayer(map) {
    return L.geoJSON([], {
      style: feature => {
        const c = colorFor(feature.properties || {});
        return { color: c, weight: 1.5, fillColor: c, fillOpacity: .34 };
      },
      onEachFeature: (feature, layer) => {
        const p = feature.properties || {};
        const distanceText = formatDistance(p.dist);
        const popup = `<b>${esc(p.code || 'Pozemek LPIS')}</b><br>${esc(p.crop || p.culture || 'Plodina nezjištěna')}<br>${p.area ? esc(p.area) + ' ha' : 'Výměra neuvedena'}<br>${distanceText ? esc(distanceText) + ' od stanoviště' : ''}<br><button type="button" class="btn" data-open-vcelar-parcel="${esc(p.id)}">Otevřít kartu pozemku</button>`;
        layer.bindPopup(popup);
        layer.on('popupopen', event => {
          const button = event.popup.getElement()?.querySelector('[data-open-vcelar-parcel]');
          if (button) button.addEventListener('click', () => openParcel(button.dataset.openVcelarParcel));
        });
      }
    }).addTo(map);
  }

  function addOverlays(map, parcelLayer) {
    const marker = L.marker([SITE.lat, SITE.lon]).addTo(map)
      .bindPopup('<b>Stanoviště TORENO, s.r.o.</b><br>Osek 489');
    const circles = L.layerGroup();
    [1000, 2000, 3000, 5000].forEach((metres, index) => {
      L.circle([SITE.lat, SITE.lon], {
        radius: metres,
        color: ['#477b43', '#769b55', '#a1a85a', '#b58a43'][index],
        weight: 1.5,
        fill: false,
        dashArray: '5 6'
      }).bindTooltip(`${metres / 1000} km`).addTo(circles);
    });
    circles.addTo(map);
    const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; OpenStreetMap'
    }).addTo(map);
    L.control.layers(
      { 'OpenStreetMap': osm },
      { 'Hranice pozemků LPIS': parcelLayer, 'Stanoviště a okruhy': L.layerGroup([marker, circles]) },
      { collapsed: true, position: 'topright' }
    ).addTo(map);
    return { marker, circles, osm };
  }

  function updateLayer(layer) {
    if (!layer) return;
    const features = parcels
      .filter(p => p && p.geometry && p.geometry.type)
      .map(featureFor);
    layer.clearLayers();
    layer.addData({ type: 'FeatureCollection', features });
  }

  function statusText() {
    const withGeometry = parcels.filter(p => p && p.geometry && p.geometry.type).length;
    return `Načteno ${withGeometry} pozemků s geometrií. Celkem v evidenci: ${parcels.length}.`;
  }

  function updateStatuses() {
    document.querySelectorAll('[data-vcelar-map-status]').forEach(el => {
      el.textContent = navigator.onLine
        ? statusText()
        : 'Jste offline. Uložené hranice pozemků zůstávají v telefonu; mapový podklad OpenStreetMap vyžaduje internet.';
    });
  }

  function refreshMaps() {
    Object.values(maps).forEach(item => updateLayer(item.parcels));
    updateStatuses();
  }

  function createMap(id, home) {
    const element = document.getElementById(id);
    if (!element || maps[id] || !window.L) return;
    const map = L.map(element, { preferCanvas: true, zoomControl: true }).setView([SITE.lat, SITE.lon], home ? 12 : 13);
    const parcelLayer = makeFeatureLayer(map);
    addOverlays(map, parcelLayer);
    maps[id] = { map, parcels: parcelLayer };
    updateLayer(parcelLayer);
    if (home) {
      const bounds = L.circle([SITE.lat, SITE.lon], { radius: 5000 }).getBounds();
      map.fitBounds(bounds, { padding: [8, 8] });
    } else {
      const bounds = parcelLayer.getBounds();
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [18, 18], maxZoom: 15 });
    }
    setTimeout(() => map.invalidateSize(), 250);
  }

  function prepareHomeMap() {
    const section = document.getElementById('home');
    const box = section?.querySelector('.panel .mapbox');
    if (!box) return;
    box.innerHTML = '<div id="homeAreaMap" role="application" aria-label="Mapa okolí stanoviště TORENO v Oseku"></div><div class="vcelar-map-status" data-vcelar-map-status>Načítám mapu…</div><div class="vcelar-map-legend"><span><i style="background:#4b9655"></i>TTP</span><span><i style="background:#d59a24"></i>Orná půda</span><span><i style="background:#bd6a9b"></i>Sady</span><span><i style="background:#6688b5"></i>Ostatní</span></div>';
  }

  function prepareParcelMap() {
    const box = document.getElementById('parcelMap');
    if (!box) return;
    box.innerHTML = '<div id="parcelAreaMap" style="width:100%;height:100%;min-height:300px;border-radius:12px;overflow:hidden"></div><div class="vcelar-map-status" data-vcelar-map-status>Načítám mapu pozemků…</div>';
  }

  async function readStoredParcels() {
    if (!('indexedDB' in window)) return [];
    try {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const data = await new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, 'readonly');
        const request = tx.objectStore(DB_STORE).get(DB_KEY);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
      db.close();
      return Array.isArray(data?.parcels) ? data.parcels : [];
    } catch (error) {
      console.warn('Nepodařilo se načíst uložené pozemky pro mapu:', error);
      return [];
    }
  }

  function loadLeaflet(callback) {
    if (window.L) { callback(); return; }
    if (leafletLoading) {
      const wait = () => window.L ? callback() : setTimeout(wait, 100);
      wait();
      return;
    }
    leafletLoading = true;
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(css);
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => { leafletReady = true; callback(); };
    script.onerror = () => {
      document.querySelectorAll('[data-vcelar-map-status]').forEach(el => {
        el.textContent = 'Mapovou knihovnu se nepodařilo načíst. Zkontrolujte připojení k internetu.';
      });
    };
    document.head.appendChild(script);
  }

  function initMaps() {
    addStyles();
    prepareHomeMap();
    prepareParcelMap();
    loadLeaflet(() => {
      createMap('homeAreaMap', true);
      createMap('parcelAreaMap', false);
      refreshMaps();
    });
  }

  document.addEventListener('vcelar:parcels-updated', event => {
    parcels = Array.isArray(event.detail?.parcels) ? event.detail.parcels : [];
    if (leafletReady || window.L) refreshMaps();
  });

  document.addEventListener('click', event => {
    if (event.target.closest('#nav button[data-page="home"]')) {
      setTimeout(() => {
        if (!maps.homeAreaMap) createMap('homeAreaMap', true);
        if (maps.homeAreaMap) maps.homeAreaMap.map.invalidateSize();
      }, 180);
    }
    if (event.target.closest('#nav button[data-page="parcels"]')) {
      setTimeout(() => {
        if (!maps.parcelAreaMap) createMap('parcelAreaMap', false);
        if (maps.parcelAreaMap) maps.parcelAreaMap.map.invalidateSize();
      }, 180);
    }
  });

  window.addEventListener('online', updateStatuses);
  window.addEventListener('offline', updateStatuses);

  document.addEventListener('DOMContentLoaded', async () => {
    initMaps();
    const stored = await readStoredParcels();
    if (stored.length) {
      parcels = stored;
      if (window.L) refreshMaps();
    }
  });

  if (document.readyState !== 'loading') {
    initMaps();
    readStoredParcels().then(stored => {
      if (stored.length) { parcels = stored; if (window.L) refreshMaps(); }
    });
  }
})();
