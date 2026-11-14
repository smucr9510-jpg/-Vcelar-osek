
/* Včelař – Osek: skutečná mapa stanoviště a okruhů */
(() => {
  const SITE = { lat: 49.7804535, lon: 13.5998565 };
  const box = document.querySelector('.mapbox');
  if (!box) return;

  const fallback = () => {
    box.innerHTML =
      '<div style="padding:18px;text-align:center">' +
      '<b>Mapa není dostupná</b><br>' +
      'Připojte se k internetu. Evidence zůstává v telefonu.</div>';
  };

  const start = () => {
    if (!navigator.onLine || !window.L) {
      fallback();
      return;
    }

    box.style.cssText =
      'padding:0;overflow:hidden;height:min(65vh,520px);min-height:320px';

    box.innerHTML =
      '<div id="osekMap" style="height:100%;width:100%;min-height:320px"></div>';

    const map = L.map('osekMap').setView(
      [SITE.lat, SITE.lon], 12
    );

    L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap'
      }
    ).addTo(map);

    L.marker([SITE.lat, SITE.lon])
      .addTo(map)
      .bindPopup('Stanoviště TORENO, s.r.o.<br>Osek 489')
      .openPopup();

    [1000, 2000, 3000, 5000].forEach((metres, i) => {
      L.circle([SITE.lat, SITE.lon], {
        radius: metres,
        color: ['#477b43', '#769b55', '#a1a85a', '#b58a43'][i],
        weight: 2,
        fill: false,
        dashArray: '6 5'
      }).addTo(map).bindTooltip((metres / 1000) + ' km');
    });

    setTimeout(() => map.invalidateSize(), 250);
  };

  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  document.head.appendChild(css);

  const script = document.createElement('script');
  script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
  script.onload = start;
  script.onerror = fallback;
  document.head.appendChild(script);
})();
