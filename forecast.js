
/* Včelař – Osek | Orientační předpověď snůšky */
(() => {
  'use strict';

  const SITE = { lat: 49.7804535, lon: 13.5998565 };
  const GEOJSON = './crops/plodiny_lpis_2026_osek_5km.geojson';
  const CACHE = 'vcelarOsek.forecast.v2';

  const FLOWERING = [
    { match: /řepka/i, name: 'Řepka', months: [4, 5] },
    { match: /ovocn|jabloň|třešeň|švestk/i, name: 'Ovocné stromy', months: [4, 5] },
    { match: /vrba/i, name: 'Vrba', months: [3, 4] },
    { match: /akát|trnovník/i, name: 'Akát', months: [5, 6] },
    { match: /jetel|vojtěška/i, name: 'Jetel a vojtěška', months: [5, 6, 7, 8] },
    { match: /svazenka/i, name: 'Svazenka', months: [5, 6, 7, 8] },
    { match: /hořčice/i, name: 'Hořčice', months: [6, 7, 8] },
    { match: /slunečnice/i, name: 'Slunečnice', months: [7, 8, 9] },
    { match: /pohanka/i, name: 'Pohanka', months: [7, 8] },
    { match: /lípa/i, name: 'Lípa', months: [6, 7] }
  ];

  const el = (tag, text, cls) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (cls) node.className = cls;
    return node;
  };

  function getCache() {
    try {
      return JSON.parse(localStorage.getItem(CACHE) || 'null');
    } catch (_) {
      return null;
    }
  }

  function setCache(data) {
    try {
      localStorage.setItem(CACHE, JSON.stringify(data));
    } catch (_) {}
  }

  async function loadCrops() {
    const response = await fetch(GEOJSON);
    if (!response.ok) throw new Error('Data LPIS nejsou dostupná.');
    const geo = await response.json();
    const groups = new Map();

    (geo.features || []).forEach(feature => {
      const p = feature.properties || {};
      const crop = String(p.plodina || '').trim();
      if (!crop) return;

      if (!groups.has(crop)) {
        groups.set(crop, { name: crop, parcels: 0, area: 0 });
      }

      const item = groups.get(crop);
      item.parcels += 1;
      item.area += Number(p.deklarovana_vymera_ha || p.dpb_vymera_ha || 0);
    });

    return Array.from(groups.values())
      .sort((a, b) => b.area - a.area);
  }

  async function loadWeather() {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.search = new URLSearchParams({
      latitude: SITE.lat,
      longitude: SITE.lon,
      daily: 'temperature_2m_max,precipitation_sum,wind_speed_10m_max',
      forecast_days: '7',
      timezone: 'Europe/Prague'
    });

    const response = await fetch(url);
    if (!response.ok) throw new Error('Počasí není dostupné.');
    return response.json();
  }

  function render(target, data, offline) {
    target.replaceChildren();

    const panel = el('div', undefined, 'panel');
    panel.append(
      el('h2', '🐝 Očekávaná snůška'),
      el('p', 'Stanoviště Osek · okruh LPIS do 5 km', 'muted'),
      el('p', offline
        ? 'Zobrazeny poslední uložené údaje – offline.'
        : 'Údaje byly právě aktualizovány.')
    );

    panel.append(el('h3', 'Plodiny v okolí'));

    const list = el('div');
    const month = new Date().getMonth() + 1;

    const flowering = data.crops.filter(crop => {
      const rule = FLOWERING.find(item => item.match.test(crop.name));
      return rule && rule.months.includes(month);
    });

    if (flowering.length) {
      flowering.forEach(crop => {
        const row = el('div', undefined, 'item');
        const info = el('div');
        info.append(
          el('b', crop.name),
          el('div',
            `${crop.parcels} pozemků · ${crop.area.toFixed(2)} ha`,
            'muted')
        );
        row.append(info);
        list.append(row);
      });
    } else {
      list.append(el('p',
        'Pro aktuální měsíc nebyla v evidenci nalezena plodina s nastaveným obdobím kvetení.',
        'muted'));
    }

    panel.append(list);
    panel.append(el('h3', 'Počasí na dalších 7 dní'));

    if (data.weather && data.weather.daily) {
      const daily = data.weather.daily;
      (daily.time || []).forEach((date, i) => {
        const temp = daily.temperature_2m_max?.[i];
        const rain = daily.precipitation_sum?.[i];
        const wind = daily.wind_speed_10m_max?.[i];

        let status = 'Proměnlivé podmínky';
        if (temp >= 15 && rain < 2 && wind < 25) {
          status = 'Příznivější podmínky pro let včel';
        } else if (rain >= 2) {
          status = 'Déšť může omezit let';
        } else if (wind >= 25) {
          status = 'Silnější vítr může omezit let';
        } else if (temp < 12) {
          status = 'Chladno – omezený let';
        }

        const row = el('div', undefined, 'item');
        row.append(el('div',
          `${new Date(date).toLocaleDateString('cs-CZ')} · ${temp ?? '–'} °C · déšť ${rain ?? '–'} mm · vítr ${wind ?? '–'} km/h`));
        row.append(el('span', status, 'tag'));
        panel.append(row);
      });
    }

    panel.append(
      el('p',
        'Poslední aktualizace: ' +
        new Date(data.updated).toLocaleString('cs-CZ'),
        'muted'),
      el('p',
        'Přehled je orientační. LPIS eviduje plodiny, nikoli skutečné kvetení nebo tvorbu nektaru. Stav je nutné ověřit v terénu.',
        'muted')
    );

    const button = el('button', 'Aktualizovat předpověď', 'btn primary');
    button.type = 'button';
    button.addEventListener('click', () => update(target));
    panel.append(button);

    target.append(panel);
  }

  async function update(target) {
    target.replaceChildren(el('div', 'Načítám plodiny a počasí…', 'panel'));

    try {
      const [crops, weather] = await Promise.all([
        loadCrops(),
        loadWeather()
      ]);

      const data = {
        updated: new Date().toISOString(),
        crops,
        weather
      };

      setCache(data);
      render(target, data, false);
      return data;
    } catch (error) {
      const saved = getCache();
      if (saved) {
        render(target, saved, true);
      } else {
        target.replaceChildren(
          el('div',
            'Předpověď není dostupná. Připojte se k internetu a zkuste aktualizaci znovu.',
            'notice warn')
        );
      }
      return saved;
    }
  }

  function start() {
    const forage = document.getElementById('forage');
    if (!forage || document.getElementById('forecastPanel')) return;

    const target = el('div');
    target.id = 'forecastPanel';
    forage.insertBefore(target, forage.firstChild);

    const saved = getCache();
    if (saved) render(target, saved, true);
    else target.append(el('div', 'Předpověď se načte při připojení k internetu.', 'notice'));

    update(target);
  }

  window.VcelarForecast = { update, getCache };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
