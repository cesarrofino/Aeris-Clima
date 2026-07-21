/* =========================================================================
   Aeris · ui.js
   Funções puras de renderização — recebem dados e atualizam o DOM.
   Nenhuma lógica de negócio ou chamadas de rede acontece aqui.
   ========================================================================= */

const UI = {

  toastTimer: null,
  showToast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('toast--show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.remove('toast--show'), 2600);
  },

  setLoadingHero() {
    document.getElementById('cityName').textContent = '—';
    document.getElementById('weatherDesc').textContent = I18N[App.state.settings.lang].loading;
  },

  setErrorHero(lang) {
    // Só mostra o estado de erro se ainda não houver nenhum dado no ecrã
    if (App.state.weatherData) return;
    document.getElementById('cityName').textContent = lang === 'en' ? 'No data' : 'Sem dados';
    document.getElementById('countryName').textContent = '';
    document.getElementById('weatherIcon').className = 'bi hero__icon bi-wifi-off';
    document.getElementById('currentTemp').textContent = '--';
    document.getElementById('weatherDesc').textContent = I18N[lang].loadError;
    document.getElementById('feelsLike').textContent = '';
  },

  renderHero(city, current, todayDaily, lang, unit) {
    const dict = I18N[lang];
    document.getElementById('cityName').textContent = city.name;
    document.getElementById('countryName').textContent = [city.admin1, city.country].filter(Boolean).join(', ') || dict.currentLocation;

    // current.time já vem no fuso horário local da cidade (formato ISO sem offset)
    const now = new Date(current.time);
    document.getElementById('localTime').textContent = current.time.slice(11, 16);
    document.getElementById('fullDate').textContent = WeatherUtils.formatDate(now, lang);

    const icon = WeatherUtils.iconFor(current.weather_code, current.is_day);
    document.getElementById('weatherIcon').className = `bi hero__icon ${icon}`;
    document.getElementById('currentTemp').textContent = WeatherUtils.formatTemp(current.temperature_2m, unit);
    document.getElementById('weatherDesc').textContent = WeatherUtils.describe(current.weather_code, lang);
    document.getElementById('feelsLike').textContent = `${WeatherUtils.formatTemp(current.apparent_temperature, unit)}°`;

    if (todayDaily) {
      document.getElementById('tempMin').textContent = `${WeatherUtils.formatTemp(todayDaily.temperature_2m_min, unit)}°`;
      document.getElementById('tempMax').textContent = `${WeatherUtils.formatTemp(todayDaily.temperature_2m_max, unit)}°`;
    }

    const favBtn = document.getElementById('btnFavToggle');
    const isFav = Storage.isFavorite(city.lat, city.lon);
    favBtn.classList.toggle('favbtn--active', isFav);
    favBtn.querySelector('i').className = isFav ? 'bi bi-star-fill' : 'bi bi-star';
  },

  renderHourly(hourly, timezone, lang, unit, nowIso) {
    const container = document.getElementById('hourlyScroll');
    container.innerHTML = '';
    const startIdx = hourly.time.findIndex(t => t >= nowIso);
    const from = startIdx >= 0 ? startIdx : 0;
    const slice = hourly.time.slice(from, from + 24);

    slice.forEach((iso, i) => {
      const idx = from + i;
      const date = new Date(iso);
      const label = i === 0 ? (lang === 'en' ? 'Now' : 'Agora') : date.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', hour12: false });
      const icon = WeatherUtils.iconFor(hourly.weather_code[idx], hourly.is_day[idx]);
      const temp = WeatherUtils.formatTemp(hourly.temperature_2m[idx], unit);
      const rain = hourly.precipitation_probability ? hourly.precipitation_probability[idx] : 0;

      const el = document.createElement('div');
      el.className = 'hour-card';
      el.innerHTML = `
        <span class="hour-card__time">${label}</span>
        <i class="bi ${icon} hour-card__icon"></i>
        <span class="hour-card__temp">${temp}°</span>
        <span class="hour-card__rain"><i class="bi bi-droplet-fill"></i>${rain}%</span>
      `;
      container.appendChild(el);
    });
  },

  renderDaily(daily, lang, unit) {
    const container = document.getElementById('dailyList');
    container.innerHTML = '';
    const dict = I18N[lang];
    const globalMax = Math.max(...daily.temperature_2m_max);
    const globalMin = Math.min(...daily.temperature_2m_min);
    const range = Math.max(globalMax - globalMin, 1);

    daily.time.forEach((iso, i) => {
      const date = new Date(iso + 'T00:00:00');
      let label;
      if (i === 0) label = dict.today;
      else if (i === 1) label = dict.tomorrow;
      else label = dict.weekdaysShort[date.getDay()];

      const icon = WeatherUtils.iconFor(daily.weather_code[i], 1);
      const min = WeatherUtils.formatTemp(daily.temperature_2m_min[i], unit);
      const max = WeatherUtils.formatTemp(daily.temperature_2m_max[i], unit);
      const rain = daily.precipitation_probability_max ? daily.precipitation_probability_max[i] : 0;

      const barLeft = ((daily.temperature_2m_min[i] - globalMin) / range) * 100;
      const barWidth = ((daily.temperature_2m_max[i] - daily.temperature_2m_min[i]) / range) * 100;

      const el = document.createElement('div');
      el.className = 'day-row';
      el.innerHTML = `
        <span class="day-row__label">${label}</span>
        <span class="day-row__rain"><i class="bi bi-droplet-fill"></i>${rain}%</span>
        <i class="bi ${icon} day-row__icon"></i>
        <span class="day-row__min">${min}°</span>
        <div class="day-row__bar"><div class="day-row__bar-fill" style="left:${barLeft}%;width:${barWidth}%"></div></div>
        <span class="day-row__max">${max}°</span>
      `;
      container.appendChild(el);
    });
  },

  renderDetails(payload) {
    const { current, today, hourlyNow, aqi, lang, unit, city, sunrise, sunset } = payload;
    const dict = I18N[lang];
    const dew = WeatherUtils.dewPoint(current.temperature_2m, current.relative_humidity_2m);
    const moon = WeatherUtils.moonPhase(new Date(current.time), lang);
    const aqiVal = aqi && aqi.current ? Math.round(aqi.current.european_aqi) : null;

    const items = [
      { icon: 'bi-droplet-half', label: dict.humidity, value: `${current.relative_humidity_2m}%`, tone: 'blue' },
      { icon: 'bi-speedometer2', label: dict.pressure, value: `${Math.round(current.pressure_msl)} hPa`, tone: 'indigo' },
      { icon: 'bi-wind', label: dict.wind, value: `${Math.round(current.wind_speed_10m)} km/h ${WeatherUtils.windDirection(current.wind_direction_10m, lang)}`, tone: 'teal' },
      { icon: 'bi-tornado', label: dict.gusts, value: `${Math.round(current.wind_gusts_10m)} km/h`, tone: 'teal' },
      { icon: 'bi-eye', label: dict.visibility, value: (hourlyNow && hourlyNow.visibility != null) ? `${(hourlyNow.visibility / 1000).toFixed(1)} km` : '—', tone: 'slate' },
      { icon: 'bi-brightness-high', label: dict.uvIndex, value: (hourlyNow && hourlyNow.uv_index != null) ? `${Math.round(hourlyNow.uv_index)} · ${WeatherUtils.uvDescriptor(hourlyNow.uv_index, lang)}` : '—', tone: 'amber' },
      { icon: 'bi-sunrise', label: dict.sunrise, value: sunrise, tone: 'gold' },
      { icon: 'bi-sunset', label: dict.sunset, value: sunset, tone: 'rose' },
      { icon: 'bi-thermometer-snow', label: dict.dewPoint, value: `${WeatherUtils.formatTemp(dew, unit)}°`, tone: 'cyan' },
      { icon: moon.icon, label: dict.moonPhase, value: moon.label, tone: 'violet' },
    ];
    if (aqiVal !== null) {
      items.push({ icon: 'bi-flower2', label: dict.airQuality, value: `${aqiVal} · ${WeatherUtils.aqiDescriptor(aqiVal, lang)}`, tone: 'green' });
    }

    const grid = document.getElementById('detailsGrid');
    grid.innerHTML = items.map(it => `
      <div class="detail-tile" data-tone="${it.tone}">
        <i class="bi ${it.icon}"></i>
        <span class="detail-tile__label">${it.label}</span>
        <span class="detail-tile__value">${it.value}</span>
      </div>
    `).join('');
  },

  applyBackgroundTheme(theme) {
    document.getElementById('sky').setAttribute('data-theme', theme);
    document.body.setAttribute('data-weather', theme);
  },

  renderFavorites(favorites, lang) {
    const grid = document.getElementById('favoritesList');
    const empty = document.getElementById('favEmpty');
    grid.innerHTML = '';
    if (!favorites.length) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    favorites.forEach(city => {
      const el = document.createElement('button');
      el.className = 'fav-card';
      el.innerHTML = `
        <div class="fav-card__info">
          <span class="fav-card__name">${city.name}</span>
          <span class="fav-card__country">${[city.admin1, city.country].filter(Boolean).join(', ')}</span>
        </div>
        <button class="fav-card__remove" aria-label="Remover" data-remove="1"><i class="bi bi-x-circle-fill"></i></button>
      `;
      el.addEventListener('click', (e) => {
        if (e.target.closest('[data-remove]')) {
          e.stopPropagation();
          Storage.removeFavorite(city.lat, city.lon);
          UI.renderFavorites(Storage.getFavorites(), lang);
          UI.showToast(I18N[lang].removedFav);
          return;
        }
        App.loadCity(city);
        App.navigateTo('home');
      });
      grid.appendChild(el);
    });
  },

  renderSuggestions(results, lang) {
    const box = document.getElementById('suggestions');
    if (!results.length) {
      box.hidden = true;
      box.innerHTML = '';
      return;
    }
    box.hidden = false;
    box.innerHTML = results.map((r, i) => `
      <button class="suggestion" data-idx="${i}">
        <i class="bi bi-geo-alt"></i>
        <span class="suggestion__name">${r.name}</span>
        <span class="suggestion__meta">${[r.admin1, r.country].filter(Boolean).join(', ')}</span>
      </button>
    `).join('');
    box.querySelectorAll('.suggestion').forEach(btn => {
      btn.addEventListener('click', () => {
        const r = results[Number(btn.dataset.idx)];
        App.selectSearchResult(r);
      });
    });
  },

  renderRecents(recents, lang) {
    const box = document.getElementById('recentList');
    if (!recents.length) {
      box.innerHTML = `<p class="empty-hint">${lang === 'en' ? 'No recent searches yet.' : 'Ainda não há pesquisas recentes.'}</p>`;
      return;
    }
    box.innerHTML = recents.map((r, i) => `
      <button class="simple-item" data-idx="${i}">
        <i class="bi bi-clock-history"></i>
        <span>${r.name}</span>
        <span class="simple-item__meta">${[r.admin1, r.country].filter(Boolean).join(', ')}</span>
        <i class="bi bi-chevron-right"></i>
      </button>
    `).join('');
    box.querySelectorAll('.simple-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const r = recents[Number(btn.dataset.idx)];
        App.selectSearchResult(r);
      });
    });
  },
};
