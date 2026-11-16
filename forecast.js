
/* Včelař – Osek
   Modul orientační předpovědi snůšky
   Verze 1.0
*/

(function () {
  'use strict';

  const SITE = {
    name: 'Stanoviště Osek',
    lat: 49.7804535,
    lon: 13.5998565
  };

  const CACHE_KEY = 'vcelarOsek.forecast.v1';
  const CROPS_URL = './crops/plodiny_lpis_2026_osek_5km.geojson';

  const CROP_RULES = [
    { words: ['řepka', 'repka'], name: 'Řepka', months: [4, 5] },
    { words: ['ovocný', 'sad', 'jabloň', 'třešeň', 'švestka'], name: 'Ovocné stromy', months: [4, 5] },
    { words: ['akát', 'trnovník'], name: 'Akát', months: [5, 6] },
    { words: ['jetel', 'vojtěška'], name: 'Jetel a vojtěška', months: [5, 6, 7, 8] },
    { words: ['svazenka'], name: 'Svazenka', months: [5, 6, 7, 8] },
    { words: ['hořčice', 'horcice'], name: 'Hořčice', months: [6, 7, 8] },
    { words: ['slunečnice'], name: 'Slunečnice', months: [7, 8, 9] },
    { words: ['pohanka'], name: 'Pohanka', months: [7, 8] }
  ];

  function findCrop(name) {
    const value = String(name || '').toLowerCase();
    return CROP_RULES.find(rule =>
      rule.words.some(word => value.includes(word))
    );
  }

  async function loadCrops() {
    const response = await fetch(CROPS_URL);
    if (!response.ok) throw new Error('Soubor LPIS se nepodařilo načíst.');

    const geojson = await response.json();
    const features = Array.isArray(geojson.features)
      ? geojson.features
      : [];

    const found = {};

    features.forEach(feature => {
      const properties = feature.properties || {};
      const cropText = Object.values(properties)
        .filter(value => typeof value === 'string')
        .join(' ');

      const rule = findCrop(cropText);
      if (!rule) return;

      if (!found[rule.name]) {
        found[rule.name] = {
          name: rule.name,
          parcels: 0,
          months: rule.months
        };
      }

      found[rule.name].parcels++;
    });

    return Object.values(found);
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
    if (!response.ok) throw new Error('Počasí není právě dostupné.');

    return response.json();
  }

  function makeForecast(crops, weather) {
    const daily = weather.daily || {};
    const dates = daily.time || [];

    const days = dates.map((date, index) => {
      const temperature = daily.temperature_2m_max?.[index];
      const rain = daily.precipitation_sum?.[index];
      const wind = daily.wind_speed_10m_max?.[index];

      let conditions = 'Proměnlivé podmínky';
      if (temperature >= 15 && rain < 2 && wind < 25) {
        conditions = 'Příznivé počasí pro let včel';
      } else if (rain >= 2) {
        conditions = 'Déšť může omezovat let';
      } else if (wind >= 25) {
        conditions = 'Vítr může omezovat let';
      } else if (temperature < 12) {
        conditions = 'Chladno – omezený let';
      }

      return {
        date,
        temperature,
        rain,
        wind,
        conditions
      };
    });

    const month = new Date().getMonth() + 1;
    const flowering = crops.filter(crop =>
      crop.months.includes(month)
    );

    return {
      updated: new Date().toISOString(),
      site: SITE,
      crops,
      flowering,
      days
    };
  }

  function saveForecast(data) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    } catch (error) {
      console.warn('Předpověď se nepodařilo uložit offline.', error);
    }
  }

  function getSavedForecast() {
    try {
      const saved = localStorage.getItem(CACHE_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch (error) {
      return null;
    }
  }

  function showForecast(target, data, offline) {
    if (!target) return;

    const dateText = new Date(data.updated).toLocaleString('cs-CZ');

    const cropHtml = data.flowering.length
      ? data.flowering.map(crop =>
          `<li>${crop.name} – ${crop.parcels} evidovaných pozemků</li>`
        ).join('')
      : '<li>V tomto období nebyla nalezena odpovídající plodina.</li>';

    const daysHtml = data.days.map(day => `
      <tr>
        <td>${new Date(day.date).toLocaleDateString('cs-CZ')}</td>
        <td>${day.temperature ?? '–'} °C</td>
        <td>${day.rain ?? '–'} mm</td>
        <td>${day.wind ?? '–'} km/h</td>
        <td>${day.conditions}</td>
      </tr>
    `).join('');

    target.innerHTML = `
      <section class="forecast-panel">
        <h2>🐝 Očekávaná včelí snůška</h2>
        <p><strong>${SITE.name}</strong></p>
        <p>Aktualizace: ${dateText}</p>
        <p>${offline ? 'Zobrazená uložená data – offline režim.' : 'Aktuální data.'}</p>

        <h3>Možné zdroje snůšky</h3>
        <ul>${cropHtml}</ul>

        <h3>Počasí na dalších 7 dní</h3>
        <div style="overflow-x:auto">
          <table>
            <thead>
              <tr>
                <th>Den</th><th>Teplota</th><th>Déšť</th>
                <th>Vítr</th><th>Podmínky</th>
              </tr>
            </thead>
            <tbody>${daysHtml}</tbody>
          </table>
        </div>

        <p><small>
          Jde o orientační přehled. Evidence plodin a počasí
          sama o sobě nepotvrzuje skutečnou tvorbu nektaru.
          Rozkvět je nutné ověřit přímo v přírodě.
        </small></p>
      </section>
    `;
  }

  async function update(target) {
    try {
      const [crops, weather] = await Promise.all([
        loadCrops(),
        loadWeather()
      ]);

      const data = makeForecast(crops, weather);
      saveForecast(data);
      showForecast(target, data, false);

      return data;
    } catch (error) {
      console.warn('Aktualizace předpovědi:', error);

      const saved = getSavedForecast();
      if (saved) {
        showForecast(target, saved, true);
      } else if (target) {
        target.textContent =
          'Předpověď zatím není dostupná. Zkontrolujte připojení k internetu.';
      }

      return saved;
    }
  }

  window.VcelarForecast = {
    update,
    getSavedForecast
  };

})();
