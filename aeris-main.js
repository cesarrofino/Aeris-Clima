/* =========================================================================
   Aeris · app.js
   Controlador principal: navegação, eventos, ciclo de vida dos dados.
   ========================================================================= */

const App = {
  state: {
    settings: null,
    city: null,
    weatherData: null,
    aqiData: null,
    screen: 'home',
    refreshTimer: null,
  },

  async init() {
    try {
      this.state.settings = Storage.getSettings();
      this.applySettingsToUI();
      this.applyTheme();
      this.bindEvents();

      // Restaura o ecrã em que o utilizador estava antes de atualizar a
      // página, em vez de voltar sempre ao Início.
      const savedScreen = Storage.getLastScreen();
      if (savedScreen && savedScreen !== 'home') {
        this.navigateTo(savedScreen);
      }
    } catch (e) {
      console.error('[Aeris] Falha ao iniciar a interface:', e);
    }

    const last = Storage.getLastLocation();
    const initialCity = last || CONFIG.DEFAULT_CITY;

    try {
      await this.loadCity(initialCity, { silent: true });
    } catch (e) {
      console.error('[Aeris] Falha ao carregar dados do clima:', e);
      this.showLoadError();
    }

    try {
      if (this.state.settings.allowLocation && !last) {
        this.tryAutoLocate(true);
      }
      this.startAutoRefresh();
    } catch (e) {
      console.error('[Aeris] Falha pós-carregamento:', e);
    }
  },

  showLoadError() {
    const lang = this.state.settings.lang;
    UI.showToast(I18N[lang].loadError);
    UI.setErrorHero(lang);
  },

  // ---------------------------------------------------------------------
  // Carregamento de dados
  // ---------------------------------------------------------------------
  async loadCity(city, opts = {}) {
    this.state.city = city;
    if (!opts.silent) UI.setLoadingHero();
    const lowData = !!this.state.settings.lowData;
    const cacheKey = `w_${city.lat.toFixed(2)}_${city.lon.toFixed(2)}`;

    let weather, isOffline = false, staleTs = null;
    try {
      weather = await Api.getWeather(city.lat, city.lon, city.timezone, { forceFresh: !!opts.forceFresh, lowData });
    } catch (e) {
      // Modo offline mais forte: se o pedido falhar (sem ligação), tentamos
      // usar dados guardados mesmo que estejam fora do prazo normal de
      // cache, em vez de mostrar logo um erro.
      const stale = Storage.getCacheStale(cacheKey);
      if (!stale) throw e;
      weather = stale.data;
      isOffline = true;
      staleTs = stale.ts;
    }
    // Em modo pouco dados poupamos o pedido extra de qualidade do ar.
    let aqi = null;
    if (!lowData) {
      try { aqi = await Api.getAirQuality(city.lat, city.lon, !!opts.forceFresh); } catch (e) { aqi = null; }
    }
    // Comparação histórica — não bloqueia a app se falhar ou demorar.
    let historical = null;
    try { historical = await Api.getHistoricalNormals(city.lat, city.lon, { forceFresh: !!opts.forceFresh }); } catch (e) { historical = null; }

    this.state.weatherData = weather;
    // Injeta a visibilidade atual (vem do array horário) diretamente no
    // objeto "current", para estar disponível em todo o lado (hero, alerta
    // de nevoeiro/neblina, cartão de partilha) sem recalcular o índice.
    if (weather && weather.current && weather.hourly && weather.hourly.visibility) {
      let vIdx = weather.hourly.time.findIndex(t => t >= weather.current.time);
      if (vIdx < 0) vIdx = 0;
      weather.current.visibility = weather.hourly.visibility[vIdx];
    }
    this.state.aqiData = aqi;
    this.state.historicalData = historical;
    this.state.isOffline = isOffline;
    this.state.lastUpdated = isOffline && staleTs ? staleTs : Date.now();
    Storage.setLastLocation(city);
    this.render();
    this.updateFooterLabel();
    if (isOffline) UI.showToast(I18N[this.state.settings.lang].loadError);
  },

  // ---------------------------------------------------------------------
  // Rodapé "Atualizado há X min" + botão de atualizar manual
  // ---------------------------------------------------------------------
  updateFooterLabel() {
    const label = document.getElementById('refreshLabel');
    if (!label || !this.state.lastUpdated) return;
    const lang = this.state.settings.lang;
    const dict = I18N[lang];
    const mins = Math.floor((Date.now() - this.state.lastUpdated) / 60000);
    const btn = document.getElementById('btnRefresh');
    const icon = document.getElementById('refreshIcon');
    if (this.state.isOffline) {
      label.textContent = mins < 1 ? T(lang, 'offlineDataFromNow') : T(lang, 'offlineDataFrom', { n: mins });
      if (btn) btn.classList.add('is-offline');
      if (icon) icon.className = 'bi bi-wifi-off';
    } else {
      label.textContent = mins < 1 ? dict.updatedNow : dict.updatedAgo.replace('{n}', mins);
      if (btn) btn.classList.remove('is-offline');
      if (icon) icon.className = 'bi bi-arrow-clockwise';
    }
  },

  async manualRefresh() {
    if (!this.state.city || this.state.isRefreshing) return;
    this.state.isRefreshing = true;
    const btn = document.getElementById('btnRefresh');
    const label = document.getElementById('refreshLabel');
    const dict = I18N[this.state.settings.lang];
    btn.classList.add('is-refreshing');
    label.textContent = dict.updating;
    try {
      await this.loadCity(this.state.city, { silent: true, forceFresh: true });
      if (!this.state.isOffline) UI.showToast(dict.refreshed);
    } catch (e) {
      console.error('[Aeris] Falha ao atualizar manualmente:', e);
      UI.showToast(dict.refreshFailed);
      this.updateFooterLabel();
    } finally {
      btn.classList.remove('is-refreshing');
      this.state.isRefreshing = false;
    }
  },

  // ---------------------------------------------------------------------
  // Pull-to-refresh temático — o ícone e a cor que aparecem ao puxar são
  // sempre os do clima atual (sol, chuva, lua, neve…), nunca um spinner
  // genérico. Reutiliza manualRefresh() para a atualização em si.
  // ---------------------------------------------------------------------
  bindPullToRefresh() {
    const scroller = document.getElementById('homeScroll');
    const content = document.getElementById('homeContent');
    const pullIcon = document.getElementById('pullRefreshIcon');
    if (!scroller || !content || !pullIcon) return;

    const THRESHOLD = 62;
    const MAX_PULL = 92;
    let startY = 0, pulling = false, distance = 0;

    const currentIconClass = () => {
      const el = document.getElementById('weatherIcon');
      const cls = el && Array.from(el.classList).find(c => c.startsWith('bi-') && c !== 'bi-wifi-off');
      return cls || 'bi-cloud-sun-fill';
    };

    const settle = () => {
      content.style.transform = 'translateY(0px)';
      pullIcon.style.opacity = '0';
      pullIcon.style.transform = 'scale(0.5) rotate(0deg)';
      pullIcon.classList.remove('is-refreshing');
      distance = 0;
    };

    scroller.addEventListener('touchstart', (e) => {
      if (scroller.scrollTop > 0 || this.state.isRefreshing) { pulling = false; return; }
      pulling = true;
      startY = e.touches[0].clientY;
      content.classList.add('is-pulling');
      pullIcon.className = `bi wx-icon ${currentIconClass()}`;
    }, { passive: true });

    scroller.addEventListener('touchmove', (e) => {
      if (!pulling) return;
      const dy = e.touches[0].clientY - startY;
      if (dy <= 0) {
        distance = 0;
        content.style.transform = 'translateY(0px)';
        pullIcon.style.opacity = '0';
        return;
      }
      distance = Math.min(dy * 0.48, MAX_PULL);
      e.preventDefault();
      content.style.transform = `translateY(${distance}px)`;
      const p = Math.min(distance / THRESHOLD, 1);
      pullIcon.style.opacity = String(p);
      pullIcon.style.transform = `scale(${0.5 + p * 0.5}) rotate(${distance * 3}deg)`;
    }, { passive: false });

    scroller.addEventListener('touchend', () => {
      if (!pulling) return;
      pulling = false;
      content.classList.remove('is-pulling');
      if (distance >= THRESHOLD && !this.state.isRefreshing) {
        content.style.transform = `translateY(${THRESHOLD}px)`;
        pullIcon.style.transform = 'none';
        pullIcon.classList.add('is-refreshing');
        this.manualRefresh().finally(() => { content.classList.add('is-pulling'); requestAnimationFrame(() => { content.classList.remove('is-pulling'); settle(); }); });
      } else {
        settle();
      }
    }, { passive: true });

    scroller.addEventListener('touchcancel', () => { pulling = false; content.classList.remove('is-pulling'); settle(); }, { passive: true });
  },

  // ---------------------------------------------------------------------
  // Cartão de partilha — gera uma imagem do clima atual para partilhar
  // ou guardar, com o gradiente de céu e o ícone/cor da condição atual.
  // ---------------------------------------------------------------------
  shareGradients: {
    clear: ['#3D74F2', '#7CB4FF', '#FFCE7E'],
    cloudy: ['#5E7290', '#98A9BF', '#C9D4E2'],
    fog: ['#7C8798', '#A3AEBC', '#CDD5DE'],
    rain: ['#1B2A4D', '#2C4A72', '#4372A0'],
    'rain-night': ['#050813', '#121C34', '#1E3355'],
    storm: ['#0A0C16', '#181B2E', '#322A4A'],
    snow: ['#D3E6FA', '#E9F3FF', '#FFFFFF'],
    'snow-night': ['#081120', '#172640', '#2E4059'],
    night: ['#030712', '#0C1730', '#182B4D'],
    default: ['#4E7CF0', '#7FA8F5', '#FFC87A'],
  },

  shareIconColor(group, isDay) {
    if (group === 'clear') return isDay ? '#FFB300' : '#9C8CFF';
    if (group === 'fog') return '#A7B2C4';
    if (group === 'rain') return '#3B9EFF';
    if (group === 'snow') return '#7FD6FF';
    if (group === 'storm') return '#FFD54A';
    return '#93A6C4'; // cloudy
  },

  drawShareGlyph(ctx, group, isDay, cx, cy, r, color) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = color; ctx.strokeStyle = color;
    ctx.lineWidth = r * 0.13; ctx.lineCap = 'round';

    const cloud = (offsetY) => {
      ctx.beginPath();
      ctx.arc(-r * 0.32, offsetY, r * 0.42, Math.PI * 0.5, Math.PI * 1.55);
      ctx.arc(r * 0.06, offsetY - r * 0.22, r * 0.48, Math.PI * 1.05, Math.PI * 1.95);
      ctx.arc(r * 0.48, offsetY, r * 0.36, Math.PI * 1.45, Math.PI * 0.55);
      ctx.closePath();
      ctx.fill();
    };

    if (group === 'clear' && isDay) {
      ctx.beginPath(); ctx.arc(0, 0, r * 0.42, 0, Math.PI * 2); ctx.fill();
      for (let i = 0; i < 8; i++) {
        const a = (Math.PI * 2 / 8) * i;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.6);
        ctx.lineTo(Math.cos(a) * r * 0.86, Math.sin(a) * r * 0.86);
        ctx.stroke();
      }
    } else if (group === 'clear' && !isDay) {
      ctx.beginPath(); ctx.arc(0, 0, r * 0.46, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath(); ctx.arc(r * 0.22, -r * 0.12, r * 0.4, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    } else if (group === 'fog') {
      cloud(-r * 0.05);
      ctx.lineWidth = r * 0.08;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(-r * 0.5, r * 0.34 + i * r * 0.16);
        ctx.lineTo(r * 0.5, r * 0.34 + i * r * 0.16);
        ctx.stroke();
      }
    } else if (group === 'rain') {
      cloud(-r * 0.12);
      ctx.lineWidth = r * 0.09;
      [-0.28, 0, 0.28].forEach((dx) => {
        ctx.beginPath();
        ctx.moveTo(dx * r, r * 0.28);
        ctx.lineTo(dx * r - r * 0.08, r * 0.56);
        ctx.stroke();
      });
    } else if (group === 'snow') {
      cloud(-r * 0.12);
      [-0.28, 0, 0.28].forEach((dx) => {
        ctx.beginPath();
        ctx.arc(dx * r, r * 0.42, r * 0.05, 0, Math.PI * 2);
        ctx.fill();
      });
    } else if (group === 'storm') {
      cloud(-r * 0.14);
      ctx.beginPath();
      ctx.moveTo(r * 0.06, r * 0.12);
      ctx.lineTo(-r * 0.14, r * 0.46);
      ctx.lineTo(r * 0.02, r * 0.46);
      ctx.lineTo(-r * 0.12, r * 0.82);
      ctx.lineTo(r * 0.22, r * 0.36);
      ctx.lineTo(r * 0.04, r * 0.36);
      ctx.closePath();
      ctx.fill();
    } else {
      cloud(0);
    }
    ctx.restore();
  },

  async buildShareCardBlob() {
    const { city, weatherData, settings } = this.state;
    const current = weatherData.current;
    const daily = weatherData.daily;
    const lang = settings.lang, unit = settings.unit;

    if (document.fonts && document.fonts.ready) {
      try { await document.fonts.ready; } catch (e) { /* ignora - usa a fonte de reserva */ }
    }

    const W = 1080, H = 1350;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    const theme = WeatherUtils.themeFor(current.weather_code, current.is_day);
    const group = WeatherUtils.groupFor(current.weather_code);
    const stops = this.shareGradients[theme] || this.shareGradients.default;

    const grad = ctx.createLinearGradient(0, 0, W * 0.35, H);
    grad.addColorStop(0, stops[0]);
    grad.addColorStop(0.55, stops[1]);
    grad.addColorStop(1, stops[2]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    const glow = ctx.createRadialGradient(W * 0.82, H * 0.1, 10, W * 0.82, H * 0.1, W * 0.75);
    glow.addColorStop(0, 'rgba(255,255,255,0.25)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    const isLightBg = theme === 'snow';
    const textColor = isLightBg ? '#16263A' : '#FFFFFF';
    const subColor = isLightBg ? 'rgba(22,38,58,0.72)' : 'rgba(255,255,255,0.8)';

    ctx.textAlign = 'left';
    ctx.fillStyle = subColor;
    ctx.font = '600 32px Inter, sans-serif';
    ctx.fillText(([city.admin1, city.country].filter(Boolean).join(', ') || '').toUpperCase(), 74, 140);

    ctx.fillStyle = textColor;
    ctx.font = '800 66px Manrope, sans-serif';
    ctx.fillText(city.name, 70, 214);

    this.drawShareGlyph(ctx, group, !!current.is_day, W - 190, 300, 130, isLightBg ? textColor : '#FFFFFF');

    ctx.font = '800 300px Manrope, sans-serif';
    ctx.fillStyle = textColor;
    ctx.fillText(`${WeatherUtils.formatTemp(current.temperature_2m, unit)}°`, 60, 620);

    ctx.font = '700 44px Inter, sans-serif';
    ctx.fillStyle = subColor;
    ctx.fillText(WeatherUtils.describe(current.weather_code, lang, current.visibility), 76, 688);

    const min = WeatherUtils.formatTemp(daily.temperature_2m_min[0], unit);
    const max = WeatherUtils.formatTemp(daily.temperature_2m_max[0], unit);
    ctx.font = '700 38px Inter, sans-serif';
    ctx.fillText(`↓ ${min}°    ↑ ${max}°`, 76, 750);

    ctx.textAlign = 'left';
    ctx.font = '800 32px Manrope, sans-serif';
    ctx.fillStyle = subColor;
    ctx.fillText('AERIS', 70, H - 70);

    ctx.textAlign = 'right';
    ctx.font = '500 28px Inter, sans-serif';
    ctx.fillText(WeatherUtils.formatDate(new Date(current.time), lang), W - 70, H - 70);

    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => { blob ? resolve(blob) : reject(new Error('toBlob falhou')); }, 'image/png', 0.95);
    });
  },

  // Texto simples usado nas opções de partilha por link/mensagem
  // (WhatsApp, Telegram, X, email, copiar) — não depende da imagem.
  buildShareText() {
    const { city, weatherData, settings } = this.state;
    const current = weatherData.current;
    const lang = settings.lang, unit = settings.unit;
    const temp = WeatherUtils.formatTemp(current.temperature_2m, unit);
    const desc = WeatherUtils.describe(current.weather_code, lang, current.visibility);
    return `${city.name} · ${temp}°${unit} · ${desc} — Aeris`;
  },

  // Abre a folha de partilha com as opções de apps. A imagem do cartão
  // é gerada em segundo plano (para não bloquear a abertura da folha) e
  // fica pronta para as opções "Guardar imagem" e "Mais aplicações".
  openShareSheet() {
    const { city, weatherData, settings } = this.state;
    if (!city || !weatherData) return;
    const lang = settings.lang;

    this.state.shareBlobPromise = this.buildShareCardBlob().catch((e) => {
      console.error('[Aeris] Falha ao gerar cartão de partilha:', e);
      return null;
    });

    const moreWrap = document.getElementById('shareOptMoreWrap');
    const canNativeShare = !!(navigator.share);
    moreWrap.hidden = !canNativeShare;

    const overlay = document.getElementById('shareSheetOverlay');
    overlay.hidden = false;
    requestAnimationFrame(() => overlay.classList.add('is-open'));
  },

  closeShareSheet() {
    const overlay = document.getElementById('shareSheetOverlay');
    overlay.classList.remove('is-open');
    setTimeout(() => { overlay.hidden = true; }, 280);
  },

  async getShareFile() {
    const blob = await this.state.shareBlobPromise;
    if (!blob) return null;
    const fileName = `aeris-${this.state.city.name.toLowerCase().replace(/\s+/g, '-')}.png`;
    return new File([blob], fileName, { type: 'image/png' });
  },

  async handleShareOption(kind) {
    const { settings } = this.state;
    const lang = settings.lang;
    const text = this.buildShareText();
    const pageUrl = location.href;

    switch (kind) {
      case 'whatsapp':
        window.open(`https://wa.me/?text=${encodeURIComponent(text + ' ' + pageUrl)}`, '_blank');
        this.closeShareSheet();
        break;
      case 'facebook':
        window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}&quote=${encodeURIComponent(text)}`, '_blank');
        this.closeShareSheet();
        break;
      case 'twitter':
        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(pageUrl)}`, '_blank');
        this.closeShareSheet();
        break;
      case 'telegram':
        window.open(`https://t.me/share/url?url=${encodeURIComponent(pageUrl)}&text=${encodeURIComponent(text)}`, '_blank');
        this.closeShareSheet();
        break;
      case 'email':
        window.location.href = `mailto:?subject=${encodeURIComponent('Aeris · ' + this.state.city.name)}&body=${encodeURIComponent(text + '\n' + pageUrl)}`;
        this.closeShareSheet();
        break;
      case 'copy':
        try {
          await navigator.clipboard.writeText(`${text} ${pageUrl}`);
          UI.showToast(T(lang, 'shareCopied'));
        } catch (e) {
          UI.showToast(T(lang, 'shareError'));
        }
        this.closeShareSheet();
        break;
      case 'download': {
        UI.showToast(T(lang, 'shareGenerating'));
        const file = await this.getShareFile();
        this.closeShareSheet();
        if (!file) { UI.showToast(T(lang, 'shareError')); return; }
        const url = URL.createObjectURL(file);
        const a = document.createElement('a');
        a.href = url; a.download = file.name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        break;
      }
      case 'more': {
        UI.showToast(T(lang, 'shareGenerating'));
        const file = await this.getShareFile();
        this.closeShareSheet();
        try {
          if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: 'Aeris', text });
          } else if (navigator.share) {
            await navigator.share({ title: 'Aeris', text, url: pageUrl });
          }
        } catch (e) {
          if (e && e.name === 'AbortError') return;
          console.error('[Aeris] Falha na partilha nativa:', e);
          UI.showToast(T(lang, 'shareError'));
        }
        break;
      }
    }
  },

  render() {
    const { city, weatherData, aqiData, settings } = this.state;
    if (!city || !weatherData) return;
    const lang = settings.lang, unit = settings.unit;

    const current = weatherData.current;
    const daily = weatherData.daily;
    const hourly = weatherData.hourly;
    const todayDaily = {
      temperature_2m_min: daily.temperature_2m_min[0],
      temperature_2m_max: daily.temperature_2m_max[0],
      precipitation_probability_max: daily.precipitation_probability_max ? daily.precipitation_probability_max[0] : null,
    };

    UI.renderHero(city, current, todayDaily, lang, unit);
    UI.renderHourly(hourly, city.timezone, lang, unit, weatherData.current.time);
    UI.renderDaily(daily, lang, unit);
    try {
      UI.renderTempChart(hourly, current.time, unit);
    } catch (e) {
      // Se o gráfico falhar por qualquer motivo, não deixamos que isso
      // pare o resto da interface (hero, previsão horária, diária, etc.).
      console.error('[Aeris] Falha ao desenhar o gráfico de temperatura:', e);
    }

    const nowIso = current.time;
    let hourlyIdx = hourly.time.findIndex(t => t >= nowIso);
    if (hourlyIdx < 0) hourlyIdx = 0;
    const hourlyNow = {
      visibility: hourly.visibility ? hourly.visibility[hourlyIdx] : null,
      uv_index: hourly.uv_index ? hourly.uv_index[hourlyIdx] : 0,
    };

    const alert = WeatherUtils.severeWeatherAlert(current, daily, hourly, current.time);
    UI.renderSevereAlert(alert, lang, current.time);

    // Alerta hiperlocal de chuva ("chuva em 15 min")
    const rainInfo = WeatherUtils.rainCountdown(weatherData.minutely_15, nowIso, lang);
    this.state.rainInfo = rainInfo;
    UI.renderRainAlert(rainInfo);

    const tip = WeatherUtils.dailyTip({ current, todayDaily, hourlyNow, hourly, nowIso, rainInfo, lang });
    UI.renderDailyTip(tip, settings.dailyTips);

    // Comparação histórica ("hoje está X° acima/abaixo da média")
    const compare = WeatherUtils.compareToNormal(current.temperature_2m, this.state.historicalData, new Date(current.time));
    UI.renderHistoricalCompare(compare, city, lang, unit);

    const sunrise = new Date(daily.sunrise[0]).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', hour12: false });
    const sunset = new Date(daily.sunset[0]).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', hour12: false });

    UI.renderDetails({ current, today: todayDaily, hourlyNow, aqi: aqiData, lang, unit, city, sunrise, sunset });

    const theme = WeatherUtils.themeFor(current.weather_code, current.is_day);
    UI.applyBackgroundTheme(theme);
  },

  // ---------------------------------------------------------------------
  // Geolocalização
  // ---------------------------------------------------------------------
  async tryAutoLocate(silent = false) {
    try {
      const { lat, lon } = await Api.getCurrentPosition();
      const city = await Api.reverseGeocode(lat, lon);
      await this.loadCity(city, { silent });
    } catch (e) {
      if (!silent) UI.showToast(I18N[this.state.settings.lang].locateError);
    }
  },

  // Chamado a partir do botão "Usar localização atual" nas Definições:
  // mostra feedback imediato e, ao ter sucesso, volta ao ecrã principal.
  async locateFromSettings() {
    const lang = this.state.settings.lang;
    UI.showToast(T(lang, 'locating'));
    try {
      const { lat, lon } = await Api.getCurrentPosition();
      const city = await Api.reverseGeocode(lat, lon);
      await this.loadCity(city, { silent: true });
      this.navigateTo('home');
    } catch (e) {
      UI.showToast(T(lang, 'locateError'));
    }
  },

  // ---------------------------------------------------------------------
  // Navegação entre ecrãs
  // ---------------------------------------------------------------------
  navigateTo(screen) {
    this.state.screen = screen;
    Storage.setLastScreen(screen);
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('screen--active'));
    document.getElementById(`screen-${screen}`).classList.add('screen--active');
    document.querySelectorAll('.navbtn').forEach(b => b.classList.toggle('active', b.dataset.nav === screen));

    if (screen === 'favorites') UI.renderFavorites(Storage.getFavorites(), this.state.settings.lang);
    if (screen === 'search') UI.renderRecents(Storage.getRecents(), this.state.settings.lang);

    document.getElementById('searchWrap').classList.toggle('topbar__search--focus', false);
    document.getElementById('suggestions').hidden = true;
  },

  // ---------------------------------------------------------------------
  // Pesquisa
  // ---------------------------------------------------------------------
  searchDebounce: null,
  async onSearchInput(value) {
    document.getElementById('btnClearSearch').hidden = !value;
    clearTimeout(this.searchDebounce);
    if (!value || value.trim().length < 2) {
      UI.renderSuggestions([], this.state.settings.lang);
      return;
    }
    this.searchDebounce = setTimeout(async () => {
      try {
        const results = await Api.searchCities(value, this.state.settings.lang);
        UI.renderSuggestions(results, this.state.settings.lang);
      } catch (e) {
        UI.renderSuggestions([], this.state.settings.lang);
      }
    }, 320);
  },

  async selectSearchResult(city) {
    document.getElementById('searchInput').value = '';
    document.getElementById('btnClearSearch').hidden = true;
    UI.renderSuggestions([], this.state.settings.lang);
    Storage.addRecent(city);
    await this.loadCity(city);
    this.navigateTo('home');
  },

  // ---------------------------------------------------------------------
  // Definições
  // ---------------------------------------------------------------------
  applySettingsToUI() {
    const s = this.state.settings;
    document.getElementById('unitLabel').textContent = `°${s.unit}`;
    document.querySelectorAll('#segUnit button').forEach(b => b.classList.toggle('active', b.dataset.val === s.unit));
    document.querySelectorAll('#segTheme button').forEach(b => b.classList.toggle('active', b.dataset.val === s.theme));
    document.getElementById('toggleGeo').checked = s.allowLocation;
    document.getElementById('toggleAuto').checked = s.autoRefresh;
    document.getElementById('toggleLowData').checked = !!s.lowData;
    document.getElementById('toggleDailyTips').checked = s.dailyTips !== false;
    UI.applyTranslations(s.lang);
  },

  applyTheme() {
    const s = this.state.settings;
    let mode = s.theme;
    if (mode === 'auto') {
      const hour = new Date().getHours();
      mode = (hour >= 6 && hour < 18) ? 'light' : 'dark';
    }
    document.documentElement.setAttribute('data-mode', mode);
  },

  saveSettings(partial) {
    this.state.settings = { ...this.state.settings, ...partial };
    Storage.setSettings(this.state.settings);
    this.applySettingsToUI();
    this.applyTheme();
    this.render();
    this.updateFooterLabel();
    this.startAutoRefresh();
  },

  // ---------------------------------------------------------------------
  // Idioma (folha modal com 12 opções)
  // ---------------------------------------------------------------------
  openLangSheet() {
    UI.renderLangList(this.state.settings.lang);
    document.getElementById('langSheetOverlay').hidden = false;
    requestAnimationFrame(() => document.getElementById('langSheetOverlay').classList.add('is-open'));
  },
  closeLangSheet() {
    const overlay = document.getElementById('langSheetOverlay');
    overlay.classList.remove('is-open');
    setTimeout(() => { overlay.hidden = true; }, 280);
  },
  selectLanguage(code) {
    this.saveSettings({ lang: code });
    this.closeLangSheet();
  },

  // ---------------------------------------------------------------------
  // Acerca (folha modal)
  // ---------------------------------------------------------------------
  openAboutSheet() {
    document.getElementById('aboutSheetOverlay').hidden = false;
    requestAnimationFrame(() => document.getElementById('aboutSheetOverlay').classList.add('is-open'));
  },
  closeAboutSheet() {
    const overlay = document.getElementById('aboutSheetOverlay');
    overlay.classList.remove('is-open');
    setTimeout(() => { overlay.hidden = true; }, 280);
  },

  // ---------------------------------------------------------------------
  // Limpar cache (modo pouco dados / resolução de problemas)
  // ---------------------------------------------------------------------
  clearCache() {
    Storage.clearCache();
    UI.showToast(I18N[this.state.settings.lang].cacheCleared);
  },

  // ---------------------------------------------------------------------
  // Faz a contagem decrescente do alerta de chuva "andar" (ex.: de "chuva
  // em 15 min" para "chuva em 14 min") sem precisar de pedir dados novos
  // à rede a cada minuto — só recalcula com base no relógio local.
  // ---------------------------------------------------------------------
  tickRainAlert() {
    const weather = this.state.weatherData;
    if (!weather || !weather.minutely_15 || !weather.current) return;
    const elapsed = Date.now() - (this.state.lastUpdated || Date.now());
    const virtualNow = new Date(new Date(weather.current.time).getTime() + elapsed);
    const nowIso = virtualNow.toISOString().slice(0, 16);
    const rainInfo = WeatherUtils.rainCountdown(weather.minutely_15, nowIso, this.state.settings.lang);
    this.state.rainInfo = rainInfo;
    UI.renderRainAlert(rainInfo);
  },

  startAutoRefresh() {
    clearInterval(this.state.refreshTimer);
    clearInterval(this.state.footerLabelTimer);
    this.state.footerLabelTimer = setInterval(() => {
      this.updateFooterLabel();
      this.tickRainAlert();
    }, 30000);
    if (!this.state.settings.autoRefresh) return;
    const interval = this.state.settings.lowData ? CONFIG.AUTO_REFRESH_LOWDATA_MS : CONFIG.AUTO_REFRESH_MS;
    this.state.refreshTimer = setInterval(() => {
      if (this.state.city) this.loadCity(this.state.city, { silent: true });
    }, interval);
  },

  // ---------------------------------------------------------------------
  // Eventos
  // ---------------------------------------------------------------------
  bindEvents() {
    document.querySelectorAll('.navbtn').forEach(btn => {
      btn.addEventListener('click', () => this.navigateTo(btn.dataset.nav));
    });

    document.getElementById('btnLocate').addEventListener('click', () => this.locateFromSettings());

    document.getElementById('btnRefresh').addEventListener('click', () => this.manualRefresh());

    document.getElementById('btnUnit').addEventListener('click', () => {
      const newUnit = this.state.settings.unit === 'C' ? 'F' : 'C';
      this.saveSettings({ unit: newUnit });
    });

    const input = document.getElementById('searchInput');
    input.addEventListener('input', (e) => this.onSearchInput(e.target.value));
    input.addEventListener('focus', () => {
      if (this.state.screen !== 'home') return;
      this.navigateTo('search');
    });

    document.getElementById('btnClearSearch').addEventListener('click', () => {
      input.value = '';
      input.focus();
      document.getElementById('btnClearSearch').hidden = true;
      UI.renderSuggestions([], this.state.settings.lang);
    });

    document.getElementById('btnFavToggle').addEventListener('click', () => {
      if (!this.state.city) return;
      const added = Storage.toggleFavorite(this.state.city);
      UI.showToast(added ? I18N[this.state.settings.lang].addedFav : I18N[this.state.settings.lang].removedFav);
      this.render();
    });

    document.getElementById('btnShare').addEventListener('click', () => this.openShareSheet());
    document.getElementById('shareGrid').addEventListener('click', (e) => {
      const btn = e.target.closest('.share-opt'); if (!btn) return;
      this.handleShareOption(btn.dataset.share);
    });
    document.getElementById('shareSheetOverlay').addEventListener('click', (e) => {
      if (e.target.id === 'shareSheetOverlay') this.closeShareSheet();
    });
    this.bindPullToRefresh();

    document.getElementById('segUnit').addEventListener('click', (e) => {
      const btn = e.target.closest('button'); if (!btn) return;
      this.saveSettings({ unit: btn.dataset.val });
    });
    document.getElementById('segTheme').addEventListener('click', (e) => {
      const btn = e.target.closest('button'); if (!btn) return;
      this.saveSettings({ theme: btn.dataset.val });
    });
    document.getElementById('toggleGeo').addEventListener('change', (e) => {
      this.saveSettings({ allowLocation: e.target.checked });
    });
    document.getElementById('toggleAuto').addEventListener('change', (e) => {
      this.saveSettings({ autoRefresh: e.target.checked });
    });
    document.getElementById('toggleLowData').addEventListener('change', (e) => {
      this.saveSettings({ lowData: e.target.checked });
      if (this.state.city) this.loadCity(this.state.city, { silent: true, forceFresh: true });
    });
    document.getElementById('toggleDailyTips').addEventListener('change', (e) => {
      this.saveSettings({ dailyTips: e.target.checked });
    });

    document.getElementById('btnLangPicker').addEventListener('click', () => this.openLangSheet());
    document.getElementById('langSheetOverlay').addEventListener('click', (e) => {
      if (e.target.id === 'langSheetOverlay') this.closeLangSheet();
    });

    document.getElementById('btnAbout').addEventListener('click', () => this.openAboutSheet());
    document.getElementById('btnCloseAbout').addEventListener('click', () => this.closeAboutSheet());
    document.getElementById('aboutSheetOverlay').addEventListener('click', (e) => {
      if (e.target.id === 'aboutSheetOverlay') this.closeAboutSheet();
    });

    document.getElementById('btnClearCache').addEventListener('click', () => this.clearCache());

    document.getElementById('severeAlertDismiss').addEventListener('click', (e) => {
      e.stopPropagation();
      const banner = document.getElementById('severeAlert');
      this.state.dismissedAlert = banner.dataset.dismissKey;
      banner.hidden = true;
    });

    document.addEventListener('click', (e) => {
      const box = document.getElementById('suggestions');
      if (!box.hidden && !box.contains(e.target) && e.target !== input) {
        box.hidden = true;
      }
    });

    // Cabeçalho fixo: ao fazer scroll no ecrã principal, o nome da
    // cidade e o clima atual sobem e ficam fixos no topo; regressam ao
    // lugar de origem assim que se volta ao início do scroll.
    const homeScroll = document.getElementById('homeScroll');
    const stickyWeather = document.getElementById('stickyWeather');
    if (homeScroll && stickyWeather) {
      let stickyTicking = false;
      let stickyVisible = false;
      homeScroll.addEventListener('scroll', () => {
        if (stickyTicking) return;
        stickyTicking = true;
        requestAnimationFrame(() => {
          const top = homeScroll.scrollTop;
          if (!stickyVisible && top > 36) {
            stickyVisible = true;
            stickyWeather.classList.add('sticky-weather--visible');
          } else if (stickyVisible && top <= 4) {
            stickyVisible = false;
            stickyWeather.classList.remove('sticky-weather--visible');
          }
          stickyTicking = false;
        });
      }, { passive: true });
    }
  },
};

// Como este ficheiro carrega com "defer" (ver index.html), o evento
// "DOMContentLoaded" pode já ter disparado antes de chegarmos aqui.
// Por isso verificamos o estado atual do documento em vez de confiar
// apenas no evento.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => App.init());
} else {
  App.init();
}
