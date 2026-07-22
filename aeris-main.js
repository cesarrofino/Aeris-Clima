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

    // O splash é apenas um efeito de marca — nunca deve ficar bloqueado
    // à espera da rede. A app revela-se sempre, mesmo offline.
    this.revealApp();

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

  revealApp() {
    const splash = document.getElementById('splash');
    const app = document.getElementById('app');
    splash.classList.add('splash--hide');
    setTimeout(() => {
      splash.hidden = true;
      app.hidden = false;
      requestAnimationFrame(() => app.classList.add('app--visible'));
    }, 550);
  },

  // ---------------------------------------------------------------------
  // Carregamento de dados
  // ---------------------------------------------------------------------
  async loadCity(city, opts = {}) {
    this.state.city = city;
    if (!opts.silent) UI.setLoadingHero();
    const lowData = !!this.state.settings.lowData;

    const weather = await Api.getWeather(city.lat, city.lon, city.timezone, { forceFresh: !!opts.forceFresh, lowData });
    // Em modo pouco dados poupamos o pedido extra de qualidade do ar.
    const aqi = lowData ? null : await Api.getAirQuality(city.lat, city.lon, !!opts.forceFresh);

    this.state.weatherData = weather;
    this.state.aqiData = aqi;
    this.state.lastUpdated = Date.now();
    Storage.setLastLocation(city);
    this.render();
    this.updateFooterLabel();
  },

  // ---------------------------------------------------------------------
  // Rodapé "Atualizado há X min" + botão de atualizar manual
  // ---------------------------------------------------------------------
  updateFooterLabel() {
    const label = document.getElementById('refreshLabel');
    if (!label || !this.state.lastUpdated) return;
    const dict = I18N[this.state.settings.lang];
    const mins = Math.floor((Date.now() - this.state.lastUpdated) / 60000);
    label.textContent = mins < 1 ? dict.updatedNow : dict.updatedAgo.replace('{n}', mins);
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
      UI.showToast(dict.refreshed);
    } catch (e) {
      console.error('[Aeris] Falha ao atualizar manualmente:', e);
      UI.showToast(dict.refreshFailed);
      this.updateFooterLabel();
    } finally {
      btn.classList.remove('is-refreshing');
      this.state.isRefreshing = false;
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

    const alert = WeatherUtils.severeWeatherAlert(current, daily);
    UI.renderSevereAlert(alert, lang);

    const tipKey = WeatherUtils.dailyTip(current, todayDaily, hourlyNow);
    UI.renderDailyTip(tipKey, lang, settings.dailyTips);

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

  startAutoRefresh() {
    clearInterval(this.state.refreshTimer);
    clearInterval(this.state.footerLabelTimer);
    this.state.footerLabelTimer = setInterval(() => this.updateFooterLabel(), 30000);
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

    document.getElementById('btnLocate').addEventListener('click', () => this.tryAutoLocate(false));

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
