
/* Včelař – Osek | Plodiny, kvetení a orientační snůška */
(() => {
  'use strict';

  const SITE = { lat: 49.7804535, lon: 13.5998565 };
  const GEOJSON = './crops/plodiny_lpis_2026_osek_5km.geojson';
  const CACHE = 'vcelarOsek.forecast.v3';
  const RINGS = [1, 2, 3, 5];

  const RULES = [
    { re: /řepka jarní/i, label: 'Řepka jarní', from: 5, to: 6, potential: 'Vysoký' },
    { re: /řepka/i, label: 'Řepka ozimá', from: 4, to: 5, potential: 'Vysoký' },

    { re: /vojtěška/i, label: 'Vojtěška', from: 6, to: 9, potential: 'Střední až vysoký' },
    { re: /jetel/i, label: 'Jetel', from: 5, to: 8, potential: 'Střední až vysoký' },

    { re: /svazenka/i, label: 'Svazenka', from: 5, to: 9, potential: 'Vysoký' },
    { re: /hořčice|ředkev/i, label: 'Hořčice a ředkev', from: 5, to: 9, potential: 'Střední' },

    { re: /sója/i, label: 'Sója', from: 7, to: 8, potential: 'Střední až proměnlivý' },
    { re: /hrách/i, label: 'Hrách', from: 5, to: 7, potential: 'Nízký až proměnlivý' },
    { re: /bílkovinn|luskoobiln/i, label: 'Bílkovinné směsi', from: 6, to: 8, potential: 'Proměnlivý' },

    { re: /nektarodárn/i, label: 'Nektarodárná směs', from: 5, to: 9, potential: 'Proměnlivý až vysoký' },
    { re: /topol/i, label: 'Topol', from: 3, to: 4, potential: 'Především pyl' },
    { re: /konopí/i, label: 'Konopí', from: 7, to: 9, potential: 'Především pyl' },

    { re: /kukuřice/i, label: 'Kukuřice', from: 7, to: 8, potential: 'Především pyl' },
    { re: /pšenice|ječmen|oves|tritikale/i, label: 'Obilniny', from: 5, to: 7, potential: 'Velmi nízký' },
    { re: /brambor/i, label: 'Brambory', from: 6, to: 8, potential: 'Nízký až proměnlivý' },

    { re: /travní porost|trávy|trav čeledi/i, label: 'Travní porosty', from: 5, to: 9, potential: 'Nízký až proměnlivý' }
  ];

  const $ = (tag, text, cls) => {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  };

  function getCoordinates(geometry) {
    const result = [];
    if (!geometry) return result;
    const walk = value => {
      if (!Array.isArray(value)) return;
      if (typeof value[0] === 'number' && typeof value[1] === 'number') {
        result.push([value[0], value[1]]);
      } else {
        value.forEach(walk);
      }
    };
    walk(geometry.coordinates);
    return result;
  }

  function distanceKm(lat1, lon1, lat2, lon2) {
    const rad = x => x * Math.PI / 180;
    const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 +
      Math.cos(rad(lat1)) * Math.cos(rad(lat2)) *
      Math.sin(rad(lon2 - lon1) / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function getRule(name) {
    return RULES.find(rule => rule.re.test(name)) || null;
  }

  async function loadParcels() {
    const response = await fetch(GEOJSON);
    if (!response.ok) throw new Error('Data LPIS nejsou dostupná.');
    const geo = await response.json();
    const parcels = [];

    (geo.features || []).forEach(feature => {
      const p = feature.properties || {};
      const name = String(p.plodina || 'Plodina neuvedena').trim();
      const points = getCoordinates(feature.geometry);
      if (!points.length) return;

      const lon = points.reduce((s, x) => s + x[0], 0) / points.length;
      const lat = points.reduce((s, x) => s + x[1], 0) / points.length;
      const distance = distanceKm(SITE.lat, SITE.lon, lat, lon);

      if (distance > 5.15) return;

      parcels.push({
        name,
        distance,
        area: Number(p.deklarovana_vymera_ha || p.dpb_vymera_ha || 0),
        rule: getRule(name)
      });
    });

    return parcels;
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

  function summarize(parcels, radius) {
    const selected = parcels.filter(p => p.distance <= radius);
    const groups = new Map();

    selected.forEach(p => {
      if (!groups.has(p.name)) {
        groups.set(p.name, {
          name: p.name,
          parcels: 0,
          area: 0,
          nearest: p.distance,
          rule: p.rule
        });
      }
      const item = groups.get(p.name);
      item.parcels++;
      item.area += p.area;
      item.nearest = Math.min(item.nearest, p.distance);
    });

    return {
      count: selected.length,
      area: selected.reduce((s, p) => s + p.area, 0),
      crops: Array.from(groups.values()).sort((a, b) => b.area - a.area)
    };
  }
  function getPotential(parcels, radius) {
    const selected = parcels.filter(p =>
      p.distance <= radius && p.rule && p.area > 0
    );

    const weight = potential => {
      if (/vysoký/i.test(potential) && /proměnlivý/i.test(potential)) return 2.5;
      if (/vysoký/i.test(potential)) return 3;
      if (/střední/i.test(potential) && /proměnlivý/i.test(potential)) return 1.7;
      if (/střední/i.test(potential)) return 2;
      if (/proměnlivý/i.test(potential)) return 1.4;
      if (/nízký/i.test(potential)) return 0.5;
      if (/pyl/i.test(potential)) return 0.3;
      return 0.5;
    };

    const area = selected.reduce((sum, p) => sum + p.area, 0);
    const score = area
      ? selected.reduce((sum, p) =>
          sum + p.area * weight(p.rule.potential), 0) / area
      : 0;

    let level = 'Zatím nelze určit';
    if (area) {
      if (score >= 2.4) level = 'Vysoký';
      else if (score >= 1.7) level = 'Střední';
      else if (score >= 0.9) level = 'Nižší';
      else level = 'Velmi nízký';
    }

    const currentMonth = new Date().getMonth() + 1;
    const upcoming = selected
      .map(p => ({
        name: p.name,
        month: p.rule.from,
        distance: p.distance,
        area: p.area,
        months: (p.rule.from - currentMonth + 12) % 12
      }))
      .sort((a, b) => a.months - b.months || b.area - a.area);

    return {
      area,
      score,
      level,
      next: upcoming[0] || null
    };
  }
  function monthName(month) {
    return ['leden','únor','březen','duben','květen','červen',
      'červenec','srpen','září','říjen','listopad','prosinec'][month - 1];
  }

  function weatherStatus(temp, rain, wind) {
    if (temp == null || rain == null || wind == null) return 'Neúplné údaje';
    if (temp < 10) return 'Chladno – omezený let';
    if (rain >= 2) return 'Déšť může omezit let';
    if (wind >= 30) return 'Silný vítr';
    if (temp >= 15 && rain < 1 && wind < 20) return 'Příznivé podmínky pro let';
    if (temp >= 12 && wind < 25) return 'Částečně příznivé podmínky';
    return 'Proměnlivé podmínky';
  }
async function loadNdvi() {
  const response = await fetch('./data/ndvi-latest.json', {
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error('Data Sentinel-2 nejsou dostupná.');
  }

  const result = await response.json();

  if (result.status !== 'OK' || !Array.isArray(result.data)) {
    throw new Error('Data NDVI mají neočekávaný formát.');
  }

  return result;
}
  function render(target, data, offline) {
    target.replaceChildren();
    const panel = $('div', undefined, 'panel');

    panel.append(
      $('h2', '🐝 Očekávaná snůška a plodiny'),
      $('p', 'Stanoviště Osek · LPIS do 5 km', 'muted'),
      $('p', offline ? 'Poslední uložená data – offline.' : 'Data aktualizována online.'),
      $('p', 'Aktualizace: ' + new Date(data.updated).toLocaleString('cs-CZ'), 'muted')
    );
    panel.append($('h3', '🛰️ Vývoj vegetace podle Sentinel-2'));

    const ndviRings = data.ndvi && data.ndvi.rings;

    if (ndviRings) {
      RINGS.forEach(radius => {
        const items = (ndviRings[String(radius)] || [])
          .map(item => ({
            date: item.interval && item.interval.to,
            mean: item.outputs?.ndvi?.bands?.B0?.stats?.mean
          }))
          .filter(item => item.date && Number.isFinite(item.mean));

        panel.append($('h3', 'Okruh ' + radius + ' km'));

        if (!items.length) {
          panel.append($('p', 'Data pro tento okruh nejsou dostupná.', 'muted'));
          return;
        }

        const latest = items[items.length - 1];

        panel.append($('p',
          'Aktuální NDVI: ' + latest.mean.toFixed(3),
          'notice'));

        items.forEach(item => {
          const row = $('div', undefined, 'item');
          const date = new Date(item.date).toLocaleDateString('cs-CZ');
          const label = $('div',
            date + ' · NDVI ' + item.mean.toFixed(3));

          const bar = $('div');
          bar.style.height = '10px';
          bar.style.width = Math.max(0, Math.min(100, item.mean * 100)) + '%';
          bar.style.background = '#4b9b55';
          bar.style.borderRadius = '6px';

          const track = $('div');
          track.style.width = '100%';
          track.style.height = '10px';
          track.style.background = '#e5e9e5';
          track.style.borderRadius = '6px';
          track.append(bar);

          row.append(label, track);
          panel.append(row);
        });
      });

      panel.append($('p',
        'NDVI vyjadřuje zelenost a aktivitu vegetace. Nejde přímo o měření nektaru ani snůšky.',
        'muted'));
    } else {
      panel.append($('p',
        'Družicová data NDVI zatím nejsou dostupná.',
        'muted'));
    }

    panel.append($('h3', 'Přehled podle vzdálenosti'));

    RINGS.forEach(radius => {
      const s = summarize(data.parcels, radius);
      const box = $('div', undefined, 'notice');
      box.append(
        $('b', 'Okruh do ' + radius + ' km'),
        $('div', `${s.count} pozemkových záznamů · ${s.area.toFixed(1)} ha`)
      );
      panel.append(box);
    });

    panel.append($('h3', 'Všechny evidované plodiny'));

    RINGS.forEach(radius => {
      const s = summarize(data.parcels, radius);
      const section = $('details');
      section.open = radius === 5;
      section.append($('summary', `Do ${radius} km · ${s.crops.length} druhů plodin`));

      if (!s.crops.length) {
        section.append($('p', 'V tomto okruhu nebyly nalezeny záznamy.', 'muted'));
      }

      s.crops.forEach(crop => {
        const row = $('div', undefined, 'item');
        const info = $('div');
        info.append(
          $('b', crop.name),
          $('div', `${crop.parcels} záznamů · ${crop.area.toFixed(2)} ha · nejbližší střed ${crop.nearest.toFixed(1)} km`, 'muted')
        );

        if (crop.rule) {
          info.append($('div',
            `Očekávané kvetení: ${monthName(crop.rule.from)}–${monthName(crop.rule.to)} · potenciál: ${crop.rule.potential}`,
            'small'));
        } else {
          info.append($('div', 'Termín kvetení a potenciál nejsou určeny.', 'small'));
        }

        row.append(info);
        section.append(row);
      });

      panel.append(section);
    });

    panel.append($('h3', 'Co může kvést nyní'));
    const month = new Date().getMonth() + 1;
    const current = new Map();

    data.parcels.forEach(p => {
      if (!p.rule || month < p.rule.from || month > p.rule.to) return;
      if (!current.has(p.name)) current.set(p.name, { count: 0, area: 0, rule: p.rule });
      const item = current.get(p.name);
      item.count++;
      item.area += p.area;
    });

    if (!current.size) {
      panel.append($('p',
        'Podle orientačního kalendáře není nyní v evidovaných plodinách hlavní období kvetení. Rostliny mimo LPIS mohou kvést i nyní.',
        'muted'));
    } else {
      current.forEach((item, name) => {
        panel.append($('div',
          `${name} · ${item.count} záznamů · ${item.area.toFixed(1)} ha · potenciál ${item.rule.potential}`,
          'item'));
      });
    }

    panel.append($('h3', 'Počasí na dalších 7 dní'));
    const daily = data.weather && data.weather.daily;

    if (daily) {
      (daily.time || []).forEach((date, i) => {
        const temp = daily.temperature_2m_max?.[i];
        const rain = daily.precipitation_sum?.[i];
        const wind = daily.wind_speed_10m_max?.[i];
        const row = $('div', undefined, 'item');

        row.append($('div',
          `${new Date(date).toLocaleDateString('cs-CZ')} · ${temp ?? '–'} °C · déšť ${rain ?? '–'} mm · vítr ${wind ?? '–'} km/h`
        ));
        row.append($('span', weatherStatus(temp, rain, wind), 'tag'));
        panel.append(row);
      });
    }

    panel.append(
      $('p',
        'Období kvetení je orientační kalendář pro západní Čechy, nikoli aktuální pozorování.',
        'muted'),
      $('p',
        'LPIS eviduje deklarované plodiny, nikoli skutečné kvetení nebo množství nektaru. Vzdálenost je odhadnuta ze středu polygonu pozemku. Potenciál není předpovědí výnosu medu.',
        'muted')
    );

    const button = $('button', 'Aktualizovat plodiny a počasí', 'btn primary');
    button.type = 'button';
    button.addEventListener('click', () => update(target));
    panel.append(button);

    target.append(panel);
  }

  async function update(target) {
    target.replaceChildren($('div', 'Načítám pozemky LPIS a počasí…', 'panel'));

    try {
      
      const [parcels, weather, ndvi] = await Promise.all([
        loadParcels(),
        loadWeather(),
        loadNdvi().catch(error => {
          console.warn('Sentinel-2 NDVI:', error);
          return null;
        })
      ]);

      const data = {
        updated: new Date().toISOString(),
        parcels,
        weather,
        ndvi
      };


      setCache(data);
      render(target, data, false);
      return data;
    } catch (error) {
      console.warn('Předpověď snůšky:', error);
      const saved = getCache();

      if (saved) {
        render(target, saved, true);
      } else {
        target.replaceChildren($('div',
          'Předpověď není dostupná. Připojte se k internetu a zkuste to znovu.',
          'notice warn'));
      }
      return saved;
    }
  }

  function start() {
    const forage = document.getElementById('forage');
    if (!forage || document.getElementById('forecastPanel')) return;

    const target = $('div');
    target.id = 'forecastPanel';
    forage.insertBefore(target, forage.firstChild);

    const saved = getCache();
    if (saved) render(target, saved, true);
    else target.append($('div', 'Předpověď se načte při připojení k internetu.', 'notice'));

    update(target);
  }

  window.VcelarForecast = { update, getCache };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
