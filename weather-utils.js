/* =========================================================================
   Aeris · weather-utils.js
   Tradução de códigos meteorológicos (WMO), ícones, formatação e
   lógica de tema visual dinâmico conforme o clima.
   ========================================================================= */

const WeatherUtils = {

  // Códigos WMO (weathercode) -> { pt, en, icon (bootstrap-icons), group }
  WMO: {
    0:  { pt: 'Céu limpo', en: 'Clear sky', icon: 'bi-sun-fill', group: 'clear' },
    1:  { pt: 'Predominantemente limpo', en: 'Mainly clear', icon: 'bi-brightness-high-fill', group: 'clear' },
    2:  { pt: 'Parcialmente nublado', en: 'Partly cloudy', icon: 'bi-cloud-sun-fill', group: 'cloudy' },
    3:  { pt: 'Nublado', en: 'Overcast', icon: 'bi-clouds-fill', group: 'cloudy' },
    45: { pt: 'Nevoeiro', en: 'Fog', icon: 'bi-cloud-haze2-fill', group: 'fog' },
    48: { pt: 'Nevoeiro com geada', en: 'Depositing rime fog', icon: 'bi-cloud-haze2-fill', group: 'fog' },
    51: { pt: 'Chuvisco fraco', en: 'Light drizzle', icon: 'bi-cloud-drizzle-fill', group: 'rain' },
    53: { pt: 'Chuvisco moderado', en: 'Moderate drizzle', icon: 'bi-cloud-drizzle-fill', group: 'rain' },
    55: { pt: 'Chuvisco intenso', en: 'Dense drizzle', icon: 'bi-cloud-drizzle-fill', group: 'rain' },
    56: { pt: 'Chuvisco gelado', en: 'Freezing drizzle', icon: 'bi-cloud-drizzle-fill', group: 'rain' },
    57: { pt: 'Chuvisco gelado intenso', en: 'Dense freezing drizzle', icon: 'bi-cloud-drizzle-fill', group: 'rain' },
    61: { pt: 'Chuva fraca', en: 'Slight rain', icon: 'bi-cloud-rain-fill', group: 'rain' },
    63: { pt: 'Chuva moderada', en: 'Moderate rain', icon: 'bi-cloud-rain-heavy-fill', group: 'rain' },
    65: { pt: 'Chuva forte', en: 'Heavy rain', icon: 'bi-cloud-rain-heavy-fill', group: 'rain' },
    66: { pt: 'Chuva gelada fraca', en: 'Light freezing rain', icon: 'bi-cloud-sleet-fill', group: 'rain' },
    67: { pt: 'Chuva gelada forte', en: 'Heavy freezing rain', icon: 'bi-cloud-sleet-fill', group: 'rain' },
    71: { pt: 'Neve fraca', en: 'Slight snow fall', icon: 'bi-cloud-snow-fill', group: 'snow' },
    73: { pt: 'Neve moderada', en: 'Moderate snow fall', icon: 'bi-cloud-snow-fill', group: 'snow' },
    75: { pt: 'Neve forte', en: 'Heavy snow fall', icon: 'bi-cloud-snow-fill', group: 'snow' },
    77: { pt: 'Grãos de neve', en: 'Snow grains', icon: 'bi-cloud-snow-fill', group: 'snow' },
    80: { pt: 'Aguaceiros fracos', en: 'Slight rain showers', icon: 'bi-cloud-rain-fill', group: 'rain' },
    81: { pt: 'Aguaceiros moderados', en: 'Moderate rain showers', icon: 'bi-cloud-rain-heavy-fill', group: 'rain' },
    82: { pt: 'Aguaceiros violentos', en: 'Violent rain showers', icon: 'bi-cloud-rain-heavy-fill', group: 'storm' },
    85: { pt: 'Aguaceiros de neve fracos', en: 'Slight snow showers', icon: 'bi-cloud-snow-fill', group: 'snow' },
    86: { pt: 'Aguaceiros de neve fortes', en: 'Heavy snow showers', icon: 'bi-cloud-snow-fill', group: 'snow' },
    95: { pt: 'Trovoada', en: 'Thunderstorm', icon: 'bi-cloud-lightning-fill', group: 'storm' },
    96: { pt: 'Trovoada com granizo fraco', en: 'Thunderstorm, slight hail', icon: 'bi-cloud-lightning-rain-fill', group: 'storm' },
    99: { pt: 'Trovoada com granizo forte', en: 'Thunderstorm, heavy hail', icon: 'bi-cloud-lightning-rain-fill', group: 'storm' },
  },

  describe(code, lang) {
    const entry = this.WMO[code] || this.WMO[0];
    return entry[lang] || entry.pt;
  },
  iconFor(code, isDay) {
    const entry = this.WMO[code] || this.WMO[0];
    if (entry.group === 'clear' && !isDay) return 'bi-moon-stars-fill';
    if (entry.group === 'cloudy' && !isDay) return 'bi-cloud-moon-fill';
    return entry.icon;
  },
  groupFor(code) {
    return (this.WMO[code] || this.WMO[0]).group;
  },

  // Determina o "tema" visual: clear-day, clear-night, cloudy, rain, storm, snow, fog, night
  themeFor(code, isDay) {
    const group = this.groupFor(code);
    if (!isDay) {
      if (group === 'clear') return 'night';
      if (group === 'storm') return 'storm';
      if (group === 'rain') return 'rain-night';
      if (group === 'snow') return 'snow-night';
      return 'night';
    }
    return group; // clear | cloudy | rain | storm | snow | fog
  },

  celsiusToF(c) { return (c * 9 / 5) + 32; },
  formatTemp(celsius, unit) {
    const v = unit === 'F' ? this.celsiusToF(celsius) : celsius;
    return Math.round(v);
  },

  windDirection(deg, lang) {
    const dirsPt = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
    const idx = Math.round(deg / 22.5) % 16;
    return dirsPt[idx];
  },

  uvDescriptor(uv, lang) {
    const t = lang === 'en'
      ? [[2,'Low'],[5,'Moderate'],[7,'High'],[10,'Very high'],[Infinity,'Extreme']]
      : [[2,'Baixo'],[5,'Moderado'],[7,'Alto'],[10,'Muito alto'],[Infinity,'Extremo']];
    return t.find(([max]) => uv <= max)[1];
  },

  aqiDescriptor(aqi, lang) {
    const t = lang === 'en'
      ? [[20,'Good'],[40,'Fair'],[60,'Moderate'],[80,'Poor'],[100,'Very poor'],[Infinity,'Hazardous']]
      : [[20,'Boa'],[40,'Razoável'],[60,'Moderada'],[80,'Fraca'],[100,'Muito fraca'],[Infinity,'Perigosa']];
    return t.find(([max]) => aqi <= max)[1];
  },

  // Fase da lua simplificada, baseada em ciclo sinódico de 29.53 dias
  moonPhase(date, lang) {
    const synodic = 29.53058867;
    const known = new Date(Date.UTC(2000, 0, 6, 18, 14)); // lua nova de referência
    const days = (date.getTime() - known.getTime()) / 86400000;
    let phase = (days % synodic) / synodic;
    if (phase < 0) phase += 1;

    const phasesPt = ['Lua nova','Crescente côncava','Quarto crescente','Crescente gibosa','Lua cheia','Minguante gibosa','Quarto minguante','Minguante côncava'];
    const phasesEn = ['New moon','Waxing crescent','First quarter','Waxing gibbous','Full moon','Waning gibbous','Last quarter','Waning crescent'];
    const icons = ['bi-moon','bi-moon-stars','bi-moon-fill','bi-brightness-alt-high','bi-circle-fill','bi-brightness-alt-high','bi-moon-fill','bi-moon-stars'];
    const idx = Math.floor(phase * 8) % 8;
    return { label: (lang === 'en' ? phasesEn : phasesPt)[idx], icon: icons[idx] };
  },

  dewPoint(tempC, humidity) {
    const a = 17.27, b = 237.7;
    const alpha = ((a * tempC) / (b + tempC)) + Math.log(humidity / 100);
    return (b * alpha) / (a - alpha);
  },

  formatDate(date, lang, includeWeekday = true) {
    const dict = I18N[lang];
    const weekday = dict.weekdays[date.getDay()];
    const day = date.getDate();
    const month = dict.months[date.getMonth()];
    const joined = lang === 'en' ? `${day} ${month}` : `${day} de ${month}`;
    return includeWeekday ? `${weekday}, ${joined}` : joined;
  },

  formatHour(date) {
    return date.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', hour12: false });
  },
};
