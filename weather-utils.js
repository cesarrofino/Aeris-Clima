/* =========================================================================
   Aeris · weather-utils.js
   Tradução de códigos meteorológicos (WMO), ícones, formatação e
   lógica de tema visual dinâmico conforme o clima.
   ========================================================================= */

const WeatherUtils = {

  // Códigos WMO (weathercode) -> { pt, en, icon (bootstrap-icons), group }
  WMO: {
    0:  { pt: 'Céu limpo', en: 'Clear sky', es: 'Cielo despejado', fr: 'Ciel dégagé', de: 'Klarer Himmel', it: 'Cielo sereno', zh: '晴朗', ar: 'سماء صافية', sw: 'Anga safi', ru: 'Ясно', hi: 'साफ़ आसमान', ja: '快晴', icon: 'bi-sun-fill', group: 'clear' },
    1:  { pt: 'Predominantemente limpo', en: 'Mainly clear', es: 'Mayormente despejado', fr: 'Plutôt dégagé', de: 'Überwiegend klar', it: 'Prevalentemente sereno', zh: '大部晴朗', ar: 'صافٍ في الغالب', sw: 'Angavu zaidi', ru: 'Преимущественно ясно', hi: 'अधिकतर साफ़', ja: 'ほぼ晴れ', icon: 'bi-brightness-high-fill', group: 'clear' },
    2:  { pt: 'Parcialmente nublado', en: 'Partly cloudy', es: 'Parcialmente nublado', fr: 'Partiellement nuageux', de: 'Teilweise bewölkt', it: 'Parzialmente nuvoloso', zh: '局部多云', ar: 'غائم جزئيًا', sw: 'Mawingu kiasi', ru: 'Переменная облачность', hi: 'आंशिक रूप से बादल', ja: '一部曇り', icon: 'bi-cloud-sun-fill', group: 'cloudy' },
    3:  { pt: 'Nublado', en: 'Overcast', es: 'Cubierto', fr: 'Couvert', de: 'Bedeckt', it: 'Coperto', zh: '阴天', ar: 'غائم تمامًا', sw: 'Mawingu mazito', ru: 'Пасмурно', hi: 'घने बादल', ja: '曇り', icon: 'bi-clouds-fill', group: 'cloudy' },
    45: { pt: 'Nevoeiro', en: 'Fog', es: 'Niebla', fr: 'Brouillard', de: 'Nebel', it: 'Nebbia', zh: '雾', ar: 'ضباب', sw: 'Ukungu', ru: 'Туман', hi: 'कोहरा', ja: '霧', icon: 'bi-cloud-haze2-fill', group: 'fog' },
    48: { pt: 'Nevoeiro com geada', en: 'Depositing rime fog', es: 'Niebla con escarcha', fr: 'Brouillard givrant', de: 'Reifnebel', it: 'Nebbia con brina', zh: '雾凇', ar: 'ضباب متجمد', sw: 'Ukungu wa baridi', ru: 'Изморозный туман', hi: 'पाला जमाने वाला कोहरा', ja: '樹氷霧', icon: 'bi-cloud-haze2-fill', group: 'fog' },
    51: { pt: 'Chuvisco fraco', en: 'Light drizzle', es: 'Llovizna ligera', fr: 'Bruine légère', de: 'Leichter Nieselregen', it: 'Pioviggine leggera', zh: '小毛毛雨', ar: 'رذاذ خفيف', sw: 'Manyunyu hafifu', ru: 'Слабая морось', hi: 'हल्की बूंदाबांदी', ja: '弱い霧雨', icon: 'bi-cloud-drizzle-fill', group: 'rain' },
    53: { pt: 'Chuvisco moderado', en: 'Moderate drizzle', es: 'Llovizna moderada', fr: 'Bruine modérée', de: 'Mäßiger Nieselregen', it: 'Pioviggine moderata', zh: '中等毛毛雨', ar: 'رذاذ معتدل', sw: 'Manyunyu ya wastani', ru: 'Умеренная морось', hi: 'मध्यम बूंदाबांदी', ja: '中程度の霧雨', icon: 'bi-cloud-drizzle-fill', group: 'rain' },
    55: { pt: 'Chuvisco intenso', en: 'Dense drizzle', es: 'Llovizna intensa', fr: 'Bruine dense', de: 'Starker Nieselregen', it: 'Pioviggine intensa', zh: '大毛毛雨', ar: 'رذاذ كثيف', sw: 'Manyunyu makali', ru: 'Сильная морось', hi: 'घनी बूंदाबांदी', ja: '強い霧雨', icon: 'bi-cloud-drizzle-fill', group: 'rain' },
    56: { pt: 'Chuvisco gelado', en: 'Freezing drizzle', es: 'Llovizna helada', fr: 'Bruine verglaçante', de: 'Gefrierender Nieselregen', it: 'Pioviggine gelata', zh: '冻毛毛雨', ar: 'رذاذ متجمد', sw: 'Manyunyu ya barafu', ru: 'Ледяная морось', hi: 'जमने वाली बूंदाबांदी', ja: '着氷性の霧雨', icon: 'bi-cloud-drizzle-fill', group: 'rain' },
    57: { pt: 'Chuvisco gelado intenso', en: 'Dense freezing drizzle', es: 'Llovizna helada intensa', fr: 'Bruine verglaçante dense', de: 'Starker gefrierender Nieselregen', it: 'Pioviggine gelata intensa', zh: '强冻毛毛雨', ar: 'رذاذ متجمد كثيف', sw: 'Manyunyu makali ya barafu', ru: 'Сильная ледяная морось', hi: 'घनी जमने वाली बूंदाबांदी', ja: '強い着氷性の霧雨', icon: 'bi-cloud-drizzle-fill', group: 'rain' },
    61: { pt: 'Chuva fraca', en: 'Slight rain', es: 'Lluvia ligera', fr: 'Pluie légère', de: 'Leichter Regen', it: 'Pioggia leggera', zh: '小雨', ar: 'مطر خفيف', sw: 'Mvua nyepesi', ru: 'Небольшой дождь', hi: 'हल्की बारिश', ja: '弱い雨', icon: 'bi-cloud-rain-fill', group: 'rain' },
    63: { pt: 'Chuva moderada', en: 'Moderate rain', es: 'Lluvia moderada', fr: 'Pluie modérée', de: 'Mäßiger Regen', it: 'Pioggia moderata', zh: '中雨', ar: 'مطر معتدل', sw: 'Mvua ya wastani', ru: 'Умеренный дождь', hi: 'मध्यम बारिश', ja: '中程度の雨', icon: 'bi-cloud-rain-heavy-fill', group: 'rain' },
    65: { pt: 'Chuva forte', en: 'Heavy rain', es: 'Lluvia intensa', fr: 'Forte pluie', de: 'Starker Regen', it: 'Pioggia forte', zh: '大雨', ar: 'مطر غزير', sw: 'Mvua kubwa', ru: 'Сильный дождь', hi: 'भारी बारिश', ja: '強い雨', icon: 'bi-cloud-rain-heavy-fill', group: 'rain' },
    66: { pt: 'Chuva gelada fraca', en: 'Light freezing rain', es: 'Lluvia helada ligera', fr: 'Pluie verglaçante légère', de: 'Leichter gefrierender Regen', it: 'Pioggia gelata leggera', zh: '小冻雨', ar: 'مطر متجمد خفيف', sw: 'Mvua nyepesi ya barafu', ru: 'Небольшой ледяной дождь', hi: 'हल्की जमने वाली बारिश', ja: '弱い着氷性の雨', icon: 'bi-cloud-sleet-fill', group: 'rain' },
    67: { pt: 'Chuva gelada forte', en: 'Heavy freezing rain', es: 'Lluvia helada intensa', fr: 'Pluie verglaçante forte', de: 'Starker gefrierender Regen', it: 'Pioggia gelata forte', zh: '大冻雨', ar: 'مطر متجمد غزير', sw: 'Mvua kubwa ya barafu', ru: 'Сильный ледяной дождь', hi: 'भारी जमने वाली बारिश', ja: '強い着氷性の雨', icon: 'bi-cloud-sleet-fill', group: 'rain' },
    71: { pt: 'Neve fraca', en: 'Slight snow fall', es: 'Nevada ligera', fr: 'Neige légère', de: 'Leichter Schneefall', it: 'Nevicata leggera', zh: '小雪', ar: 'تساقط ثلج خفيف', sw: 'Theluji nyepesi', ru: 'Небольшой снег', hi: 'हल्की बर्फबारी', ja: '弱い雪', icon: 'bi-cloud-snow-fill', group: 'snow' },
    73: { pt: 'Neve moderada', en: 'Moderate snow fall', es: 'Nevada moderada', fr: 'Neige modérée', de: 'Mäßiger Schneefall', it: 'Nevicata moderata', zh: '中雪', ar: 'تساقط ثلج معتدل', sw: 'Theluji ya wastani', ru: 'Умеренный снег', hi: 'मध्यम बर्फबारी', ja: '中程度の雪', icon: 'bi-cloud-snow-fill', group: 'snow' },
    75: { pt: 'Neve forte', en: 'Heavy snow fall', es: 'Nevada intensa', fr: 'Forte neige', de: 'Starker Schneefall', it: 'Nevicata forte', zh: '大雪', ar: 'تساقط ثلج غزير', sw: 'Theluji kubwa', ru: 'Сильный снег', hi: 'भारी बर्फबारी', ja: '強い雪', icon: 'bi-cloud-snow-fill', group: 'snow' },
    77: { pt: 'Grãos de neve', en: 'Snow grains', es: 'Granos de nieve', fr: 'Grains de neige', de: 'Schneegriesel', it: 'Granelli di neve', zh: '米雪', ar: 'حبيبات ثلجية', sw: 'Chembechembe za theluji', ru: 'Снежная крупа', hi: 'बर्फ के कण', ja: '細氷', icon: 'bi-cloud-snow-fill', group: 'snow' },
    80: { pt: 'Aguaceiros fracos', en: 'Slight rain showers', es: 'Chubascos ligeros', fr: 'Averses légères', de: 'Leichte Regenschauer', it: 'Rovesci leggeri', zh: '小阵雨', ar: 'زخات مطر خفيفة', sw: 'Manyunyu ya mvua hafifu', ru: 'Небольшие ливни', hi: 'हल्की बौछारें', ja: '弱いにわか雨', icon: 'bi-cloud-rain-fill', group: 'rain' },
    81: { pt: 'Aguaceiros moderados', en: 'Moderate rain showers', es: 'Chubascos moderados', fr: 'Averses modérées', de: 'Mäßige Regenschauer', it: 'Rovesci moderati', zh: '中阵雨', ar: 'زخات مطر معتدلة', sw: 'Manyunyu ya mvua ya wastani', ru: 'Умеренные ливни', hi: 'मध्यम बौछारें', ja: '中程度のにわか雨', icon: 'bi-cloud-rain-heavy-fill', group: 'rain' },
    82: { pt: 'Aguaceiros violentos', en: 'Violent rain showers', es: 'Chubascos violentos', fr: 'Averses violentes', de: 'Heftige Regenschauer', it: 'Rovesci violenti', zh: '强阵雨', ar: 'زخات مطر عنيفة', sw: 'Manyunyu ya mvua makali', ru: 'Сильные ливни', hi: 'तेज़ बौछारें', ja: '激しいにわか雨', icon: 'bi-cloud-rain-heavy-fill', group: 'storm' },
    85: { pt: 'Aguaceiros de neve fracos', en: 'Slight snow showers', es: 'Chubascos de nieve ligeros', fr: 'Averses de neige légères', de: 'Leichte Schneeschauer', it: 'Rovesci di neve leggeri', zh: '小阵雪', ar: 'زخات ثلج خفيفة', sw: 'Manyunyu ya theluji hafifu', ru: 'Небольшие снегопады', hi: 'हल्की बर्फ़ की बौछारें', ja: '弱いにわか雪', icon: 'bi-cloud-snow-fill', group: 'snow' },
    86: { pt: 'Aguaceiros de neve fortes', en: 'Heavy snow showers', es: 'Chubascos de nieve intensos', fr: 'Averses de neige fortes', de: 'Starke Schneeschauer', it: 'Rovesci di neve forti', zh: '大阵雪', ar: 'زخات ثلج غزيرة', sw: 'Manyunyu ya theluji makali', ru: 'Сильные снегопады', hi: 'भारी बर्फ़ की बौछारें', ja: '強いにわか雪', icon: 'bi-cloud-snow-fill', group: 'snow' },
    95: { pt: 'Trovoada', en: 'Thunderstorm', es: 'Tormenta eléctrica', fr: 'Orage', de: 'Gewitter', it: 'Temporale', zh: '雷暴', ar: 'عاصفة رعدية', sw: 'Dhoruba ya radi', ru: 'Гроза', hi: 'आंधी-तूफान', ja: '雷雨', icon: 'bi-cloud-lightning-fill', group: 'storm' },
    96: { pt: 'Trovoada com granizo fraco', en: 'Thunderstorm, slight hail', es: 'Tormenta con granizo ligero', fr: 'Orage avec grêle légère', de: 'Gewitter mit leichtem Hagel', it: 'Temporale con grandine leggera', zh: '雷暴伴小冰雹', ar: 'عاصفة رعدية مع برد خفيف', sw: 'Dhoruba ya radi na mvua ya mawe hafifu', ru: 'Гроза с небольшим градом', hi: 'आंधी-तूफान के साथ हल्के ओले', ja: '雷雨（弱いひょう）', icon: 'bi-cloud-lightning-rain-fill', group: 'storm' },
    99: { pt: 'Trovoada com granizo forte', en: 'Thunderstorm, heavy hail', es: 'Tormenta con granizo intenso', fr: 'Orage avec grêle forte', de: 'Gewitter mit starkem Hagel', it: 'Temporale con grandine forte', zh: '雷暴伴大冰雹', ar: 'عاصفة رعدية مع برد كثيف', sw: 'Dhoruba ya radi na mvua ya mawe kubwa', ru: 'Гроза с сильным градом', hi: 'आंधी-तूफान के साथ भारी ओले', ja: '雷雨（強いひょう）', icon: 'bi-cloud-lightning-rain-fill', group: 'storm' },
  },

  describe(code, lang) {
    const entry = this.WMO[code] || this.WMO[0];
    return entry[lang] || entry.en || entry.pt;
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
    const dict = I18N[lang] || I18N.pt;
    const t = [[2, dict.uvLow], [5, dict.uvModerate], [7, dict.uvHigh], [10, dict.uvVeryHigh], [Infinity, dict.uvExtreme]];
    return t.find(([max]) => uv <= max)[1];
  },

  aqiDescriptor(aqi, lang) {
    const dict = I18N[lang] || I18N.pt;
    const t = [[20, dict.aqiGood], [40, dict.aqiFair], [60, dict.aqiModerate], [80, dict.aqiPoor], [100, dict.aqiVeryPoor], [Infinity, dict.aqiHazardous]];
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
    const dict = I18N[lang] || I18N.pt;
    const weekday = dict.weekdays[date.getDay()];
    const day = date.getDate();
    const month = dict.months[date.getMonth()];
    let joined;
    if (lang === 'zh' || lang === 'ja') {
      joined = `${month}${day}日`; // ex: 7月21日 — o nome do mês já inclui "月"
    } else if (lang === 'pt' || lang === 'es') {
      joined = `${day} de ${month}`;
    } else {
      joined = `${day} ${month}`;
    }
    return includeWeekday ? `${weekday}, ${joined}` : joined;
  },

  formatHour(date) {
    return date.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', hour12: false });
  },

  // -------------------------------------------------------------------
  // Alerta de tempo severo / ciclone
  // -------------------------------------------------------------------
  // Baseado em limiares de rajadas de vento (aproximando a escala
  // Saffir-Simpson para força de ciclone) e em códigos de trovoada/chuva
  // intensa nos próximos dias. A Open-Meteo não fornece nomes de ciclones
  // nem avisos oficiais das autoridades — isto é uma estimativa a partir
  // dos dados meteorológicos brutos, não um aviso oficial do INAM ou
  // equivalente. É pensado como um sinal de atenção extra, não substitui
  // fontes oficiais.
  severeWeatherAlert(current, daily) {
    if (!daily || !daily.wind_gusts_10m_max) return null;
    const gustsToday = current.wind_gusts_10m || 0;
    const nextDaysGusts = daily.wind_gusts_10m_max.slice(0, 3);
    const maxGusts = Math.max(gustsToday, ...nextDaysGusts);

    const stormSoon = (daily.weather_code || []).slice(0, 2).some(c => [95, 96, 99].includes(c));
    const heavyRainSoon = (daily.precipitation_probability_max || []).slice(0, 2).some(p => p >= 80)
      && (daily.weather_code || []).slice(0, 2).some(c => this.groupFor(c) === 'rain');

    if (maxGusts >= CONFIG.ALERT_CYCLONE_GUSTS) {
      return { level: 'severe', key: 'alertCyclone', icon: 'bi-tornado', gusts: Math.round(maxGusts) };
    }
    if (maxGusts >= CONFIG.ALERT_SEVERE_GUSTS) {
      return { level: 'severe', key: 'alertSevereWind', icon: 'bi-wind', gusts: Math.round(maxGusts) };
    }
    if (maxGusts >= CONFIG.ALERT_STRONG_GUSTS) {
      return { level: 'warning', key: 'alertStrongWind', icon: 'bi-wind', gusts: Math.round(maxGusts) };
    }
    if (stormSoon) {
      return { level: 'warning', key: 'alertStorm', icon: 'bi-cloud-lightning-fill', gusts: null };
    }
    if (heavyRainSoon) {
      return { level: 'watch', key: 'alertHeavyRain', icon: 'bi-cloud-rain-heavy-fill', gusts: null };
    }
    return null;
  },

  // -------------------------------------------------------------------
  // Dica diária simples com base nas condições atuais/do dia
  // -------------------------------------------------------------------
  dailyTip(current, todayDaily, hourlyNow) {
    const uv = hourlyNow ? hourlyNow.uv_index : 0;
    const rainProb = todayDaily.precipitation_probability_max;
    const group = this.groupFor(current.weather_code);
    if (group === 'rain' || group === 'storm' || (rainProb != null && rainProb >= 55)) return 'tipUmbrella';
    if (uv >= 7) return 'tipSunscreen';
    if ((current.wind_gusts_10m || 0) >= 45) return 'tipWindy';
    if (current.temperature_2m <= 14) return 'tipCold';
    return 'tipPleasant';
  },
};
