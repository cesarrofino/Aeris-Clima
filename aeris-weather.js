/* =========================================================================
   Aeris · api.js
   Comunicação com a Open-Meteo (previsão, geocodificação, qualidade do ar)
   e com o serviço de geocodificação inversa usado para o GPS.
   ========================================================================= */

const Api = {

  // Evita que um pedido fique "pendurado" para sempre em ligações lentas/instáveis
  async fetchWithTimeout(url, ms = 9000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
      const res = await fetch(url, { signal: controller.signal });
      return res;
    } finally {
      clearTimeout(timer);
    }
  },

  async searchCities(query, lang) {
    if (!query || query.trim().length < 2) return [];
    const url = `${CONFIG.GEOCODE_URL}?name=${encodeURIComponent(query)}&count=8&language=${lang}&format=json`;
    const res = await this.fetchWithTimeout(url);
    if (!res.ok) throw new Error('geocode_failed');
    const data = await res.json();
    if (!data.results) return [];
    return data.results.map(r => ({
      name: r.name,
      country: r.country || '',
      admin1: r.admin1 || '',
      lat: r.latitude,
      lon: r.longitude,
      timezone: r.timezone,
    }));
  },

  async reverseGeocode(lat, lon) {
    try {
      const url = `${CONFIG.REVERSE_GEOCODE_URL}?latitude=${lat}&longitude=${lon}&localityLanguage=pt`;
      const res = await this.fetchWithTimeout(url, 6000);
      if (!res.ok) throw new Error('reverse_failed');
      const data = await res.json();
      return {
        name: data.city || data.locality || data.principalSubdivision || 'Localização atual',
        country: data.countryName || '',
        lat, lon,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
    } catch (e) {
      return { name: 'Localização atual', country: '', lat, lon, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone };
    }
  },

  async getWeather(lat, lon, timezone, opts = {}) {
    const { forceFresh = false, lowData = false } = opts;
    const cacheKey = `w_${lat.toFixed(2)}_${lon.toFixed(2)}`;
    if (!forceFresh) {
      const cached = Storage.getCache(cacheKey);
      if (cached) return cached;
    }

    // Em "modo pouco dados" pedimos menos dias e menos campos horários para
    // reduzir o tamanho do pedido — mas mantemos sempre as rajadas diárias,
    // essenciais para o alerta de tempo severo/ciclone.
    const hourlyFields = lowData
      ? 'temperature_2m,weather_code,precipitation_probability'
      : 'temperature_2m,weather_code,precipitation_probability,wind_speed_10m,is_day,uv_index,visibility';

    const params = new URLSearchParams({
      latitude: lat,
      longitude: lon,
      timezone: timezone || 'auto',
      current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,pressure_msl,surface_pressure,cloud_cover',
      hourly: hourlyFields,
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max,uv_index_max,wind_speed_10m_max,wind_gusts_10m_max',
      wind_speed_unit: 'kmh',
      forecast_days: lowData ? 4 : 8,
    });
    // Alerta hiperlocal de chuva: pedimos dados a cada 15 min (fora da
    // América do Norte / Europa Central a Open-Meteo interpola a partir
    // dos dados horários, mas isso ainda dá uma contagem decrescente mais
    // suave e útil do que "só" a granularidade horária). Ignorado em modo
    // pouco dados para poupar largura de banda.
    if (!lowData) {
      params.set('minutely_15', 'precipitation,precipitation_probability,weather_code');
    }
    const url = `${CONFIG.FORECAST_URL}?${params.toString()}`;
    const res = await this.fetchWithTimeout(url);
    if (!res.ok) throw new Error('forecast_failed');
    const data = await res.json();
    Storage.setCache(cacheKey, data);
    return data;
  },

  async getAirQuality(lat, lon, forceFresh = false) {
    const cacheKey = `aq_${lat.toFixed(2)}_${lon.toFixed(2)}`;
    if (!forceFresh) {
      const cached = Storage.getCache(cacheKey);
      if (cached) return cached;
    }
    try {
      const params = new URLSearchParams({
        latitude: lat, longitude: lon,
        current: 'european_aqi',
      });
      const url = `${CONFIG.AIR_QUALITY_URL}?${params.toString()}`;
      const res = await this.fetchWithTimeout(url, 7000);
      if (!res.ok) throw new Error('aqi_failed');
      const data = await res.json();
      Storage.setCache(cacheKey, data);
      return data;
    } catch (e) {
      return null;
    }
  },

  // -------------------------------------------------------------------
  // Comparação histórica: busca temperaturas diárias dos últimos N anos
  // (arquivo ERA5) para calcular a média para esta época do ano. Uma única
  // chamada cobre todos os anos, já que o intervalo é contínuo dia-a-dia.
  // -------------------------------------------------------------------
  async getHistoricalNormals(lat, lon, opts = {}) {
    const { forceFresh = false } = opts;
    const cacheKey = `hist_${lat.toFixed(2)}_${lon.toFixed(2)}`;
    if (!forceFresh) {
      const cached = Storage.getCache(cacheKey, CONFIG.HISTORICAL_CACHE_TTL_MS);
      if (cached) return cached;
    }
    try {
      const today = new Date();
      const endDate = new Date(today);
      endDate.setDate(endDate.getDate() - 2); // o arquivo tem alguns dias de atraso
      const startDate = new Date(endDate);
      startDate.setFullYear(startDate.getFullYear() - CONFIG.HISTORICAL_YEARS);

      const fmt = (d) => d.toISOString().slice(0, 10);
      const params = new URLSearchParams({
        latitude: lat,
        longitude: lon,
        start_date: fmt(startDate),
        end_date: fmt(endDate),
        daily: 'temperature_2m_max,temperature_2m_min',
        timezone: 'auto',
      });
      const url = `${CONFIG.ARCHIVE_URL}?${params.toString()}`;
      const res = await this.fetchWithTimeout(url, 12000);
      if (!res.ok) throw new Error('archive_failed');
      const data = await res.json();
      Storage.setCache(cacheKey, data);
      return data;
    } catch (e) {
      // Sem normal histórica disponível — a comparação é apenas escondida,
      // o resto da app continua a funcionar normalmente.
      return null;
    }
  },

  getCurrentPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('no_geolocation'));
      navigator.geolocation.getCurrentPosition(
        pos => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        err => reject(err),
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60 * 1000 }
      );
    });
  }
};
