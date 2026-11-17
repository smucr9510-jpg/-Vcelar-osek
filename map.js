/* Včelař – Osek: mapa krajiny a zdrojů včelí pastvy */
(() => {
  const SITE = { lat: 49.7804535, lon: 13.5998565 };
  const box = document.querySelector('.mapbox');
  if (!box) return;

  const fallback = () => {
    box.innerHTML = '<div style="padding:18px;text-align:center"><b>Mapa není dostupná</b><br>Připojte se k internetu. Evidence zůstává v telefonu.</div>';
  };

  const start = () => {
    if (!navigator.onLine || !window.L) return fallback();

    box.style.cssText = 'padding:0;overflow:hidden;height:min(72vh,620px);min-height:390px;text-align:left';
    box.innerHTML = '<div id="osekMap" style="height:100%;width:100%;min-height:390px"></div>';

    const map = L.map('osekMap', { preferCanvas: true }).setView([SITE.lat, SITE.lon], 13);

    const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; OpenStreetMap'
    });
    const ortho = L.tileLayer.wms('https://ags.cuzk.gov.cz/arcgis1/services/ORTOFOTO/MapServer/WMSServer', {
      layers: '0', format: 'image/png', transparent: false, version: '1.3.0',
      attribution: '&copy; ČÚZK – Ortofoto ČR', maxZoom: 20
    });
    const zabaged = L.tileLayer.wms('https://ags.cuzk.gov.cz/arcgis/services/ZABAGED_POLOHOPIS/MapServer/WMSServer', {
      layers: 'show:14,15,133,134,135,138,139,140,142,144',
      format: 'image/png', transparent: true, version: '1.3.0',
      attribution: '&copy; ČÚZK – ZABAGED', opacity: 0.88
    });

    osm.addTo(map);
    zabaged.addTo(map);

    L.marker([SITE.lat, SITE.lon]).addTo(map)
      .bindPopup('Stanoviště TORENO, s.r.o.<br>Osek 489')
      .openPopup();

    [1000, 2000, 3000, 5000].forEach((metres, i) => {
      L.circle([SITE.lat, SITE.lon], {
        radius: metres,
        color: ['#477b43', '#769b55', '#a1a85a', '#b58a43'][i],
        weight: 2, fill: false, dashArray: '6 5'
      }).addTo(map).bindTooltip((metres / 1000) + ' km');
    });

    L.control.layers(
      { 'Turistická mapa': osm, 'Ortofoto ČÚZK': ortho },
      { 'Krajinné prvky ČÚZK (ZABAGED)': zabaged },
      { collapsed: false }
    ).addTo(map);

    const legend = L.control({ position: 'bottomleft' });
    legend.onAdd = () => {
      const div = L.DomUtil.create('div', 'leaflet-control');
      div.style.cssText = 'background:#fff;padding:7px 9px;border-radius:6px;box-shadow:0 1px 5px #0004;font:12px/1.45 system-ui;max-width:220px';
      div.innerHTML = '<b>Včelí krajina – ČÚZK</b><br>Ovocný sad a zahrada · lesní porosty · louky · orná půda · liniová a bodová zeleň';
      return div;
    };
    legend.addTo(map);

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
