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

  async getWeather(lat, lon, timezone, forceFresh = false) {
    const cacheKey = `w_${lat.toFixed(2)}_${lon.toFixed(2)}`;
    if (!forceFresh) {
      const cached = Storage.getCache(cacheKey);
      if (cached) return cached;
    }

    const params = new URLSearchParams({
      latitude: lat,
      longitude: lon,
      timezone: timezone || 'auto',
      current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,pressure_msl,surface_pressure,cloud_cover',
      hourly: 'temperature_2m,weather_code,precipitation_probability,wind_speed_10m,is_day,uv_index,visibility',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max,uv_index_max,wind_speed_10m_max',
      wind_speed_unit: 'kmh',
      forecast_days: 8,
    });
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
