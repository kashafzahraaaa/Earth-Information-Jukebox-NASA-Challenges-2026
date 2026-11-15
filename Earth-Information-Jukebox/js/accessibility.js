/*
  EARTH INFORMATION JUKEBOX
  LIVE WEATHER AND ACCESSIBILITY ENGINE

  Features:
  - Location search with ambiguity handling
  - Live weather data from Open-Meteo
  - Temperature, wind and humidity
  - Three-section spoken weather reports
  - Pause, resume, stop and repeat
  - Cancellation of pending weather requests
  - Protection against outdated speech events
*/

const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
const WEATHER_URL = "https://api.open-meteo.com/v1/forecast";

export class EarthVoiceGuide {
  constructor(options = {}) {
    this.onSectionChange = options.onSectionChange || (() => {});
    this.onStatusChange = options.onStatusChange || (() => {});
    this.onWeatherUpdate = options.onWeatherUpdate || (() => {});

    this.currentIndex = 0;
    this.currentUtterance = null;

    this.isSpeaking = false;
    this.isPaused = false;
    this.isStopped = true;

    this.volume = 1;
    this.rate = 1;

    this.currentWeatherReport = [];
    this.currentLocation = "";

    this.requestId = 0;
    this.activeController = null;

    this.speechSessionId = 0;

    this.speechSupported =
      typeof window !== "undefined" &&
      "speechSynthesis" in window &&
      "SpeechSynthesisUtterance" in window;

    if (!this.speechSupported) {
      this.notify("Voice guidance is not supported in this browser.");
    }
  }

  notify(message) {
    this.onStatusChange(message);
  }

  normalizeLocation(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  async searchLocation(locationName, signal) {
    const query = String(locationName || "").trim();

    if (!query) {
      throw new Error("Please enter a city, country or region.");
    }

    const url = new URL(GEOCODING_URL);

    url.search = new URLSearchParams({
      name: query,
      count: "10",
      language: "en",
      format: "json",
    });

    const response = await fetch(url, { signal });

    if (!response.ok) {
      throw new Error("Unable to search for this location.");
    }

    const data = await response.json();

    if (!data.results || data.results.length === 0) {
      throw new Error(
        "Location not found. Please check the spelling or try a nearby city.",
      );
    }

    return data.results;
  }

  selectLocation(query, results) {
    const queryParts = query
      .split(",")
      .map((part) => this.normalizeLocation(part))
      .filter(Boolean);

    const scoredResults = results.map((location) => {
      const name = this.normalizeLocation(location.name);
      const region = this.normalizeLocation(location.admin1);
      const country = this.normalizeLocation(location.country);
      const district = this.normalizeLocation(location.admin2);

      let score = 0;

      if (queryParts.includes(name)) {
        score += 100;
      } else if (queryParts.some((part) => name.startsWith(part))) {
        score += 70;
      }

      if (region && queryParts.includes(region)) score += 40;
      if (country && queryParts.includes(country)) score += 60;
      if (district && queryParts.includes(district)) score += 30;

      for (const part of queryParts) {
        if (
          part &&
          part !== name &&
          (region === part || country === part || district === part)
        ) {
          score += 15;
        }
      }

      return { location, score };
    });

    scoredResults.sort((a, b) => b.score - a.score);

    const best = scoredResults[0];

    if (!best) {
      throw new Error("No matching location was found.");
    }

    const equallyRanked = scoredResults.filter(
      (item) => item.score === best.score,
    );

    if (equallyRanked.length > 1) {
      const distinctPlaces = new Set(
        equallyRanked.map(({ location }) =>
          [location.name, location.admin1, location.country]
            .filter(Boolean)
            .join("|"),
        ),
      );

      if (distinctPlaces.size > 1) {
        throw new Error(
          "Multiple locations match your search. Please enter the city and country, for example: London, United Kingdom.",
        );
      }
    }

    return best.location;
  }

  getWeatherDescription(code) {
    const descriptions = {
      0: "Clear sky and sunny conditions",
      1: "Mainly clear conditions",
      2: "Partly cloudy conditions",
      3: "Overcast and cloudy conditions",
      45: "Foggy conditions",
      48: "Depositing rime fog",
      51: "Light drizzle",
      53: "Moderate drizzle",
      55: "Dense drizzle",
      56: "Light freezing drizzle",
      57: "Dense freezing drizzle",
      61: "Light rain",
      63: "Moderate rain",
      65: "Heavy rain",
      66: "Light freezing rain",
      67: "Heavy freezing rain",
      71: "Light snowfall",
      73: "Moderate snowfall",
      75: "Heavy snowfall",
      77: "Snow grains",
      80: "Light rain showers",
      81: "Moderate rain showers",
      82: "Violent rain showers",
      85: "Light snow showers",
      86: "Heavy snow showers",
      95: "Thunderstorms",
      96: "Thunderstorms with light hail",
      99: "Thunderstorms with heavy hail",
    };

    return descriptions[Number(code)] || "Weather conditions unavailable";
  }

  getWindDirection(degrees) {
    if (
      degrees === null ||
      degrees === undefined ||
      !Number.isFinite(Number(degrees))
    ) {
      return "direction unavailable";
    }

    const directions = [
      "North",
      "North-northeast",
      "Northeast",
      "East-northeast",
      "East",
      "East-southeast",
      "Southeast",
      "South-southeast",
      "South",
      "South-southwest",
      "Southwest",
      "West-southwest",
      "West",
      "West-northwest",
      "Northwest",
      "North-northwest",
    ];

    const normalized = ((Number(degrees) % 360) + 360) % 360;

    return directions[Math.round(normalized / 22.5) % 16];
  }

  async getWeather(location) {
    const query = String(location || "").trim();

    if (!query) {
      throw new Error("Please enter a location.");
    }

    // Invalidate older searches and abort their network requests.
    const requestId = ++this.requestId;

    if (this.activeController) {
      this.activeController.abort();
      this.activeController = null;
    }

    // Stop previous speech without invalidating this new request.
    this.stop({
      invalidateRequest: false,
      notify: false,
    });

    const controller = new AbortController();
    this.activeController = controller;

    this.notify(`Searching for ${query}...`);

    try {
      const locations = await this.searchLocation(query, controller.signal);

      if (requestId !== this.requestId) return null;

      const selectedLocation = this.selectLocation(query, locations);

      const weatherUrl = new URL(WEATHER_URL);

      weatherUrl.search = new URLSearchParams({
        latitude: String(selectedLocation.latitude),
        longitude: String(selectedLocation.longitude),
        current:
          "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,snowfall,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m",
        timezone: "auto",
        forecast_days: "1",
      });

      const response = await fetch(weatherUrl, {
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error("Unable to retrieve live weather data.");
      }

      const data = await response.json();

      if (requestId !== this.requestId) return null;

      if (!data.current) {
        throw new Error("Current weather data is unavailable.");
      }

      const current = data.current;

      const requiredValues = [
        current.temperature_2m,
        current.relative_humidity_2m,
        current.apparent_temperature,
        current.wind_speed_10m,
        current.wind_direction_10m,
        current.wind_gusts_10m,
      ];

      if (
        requiredValues.some(
          (value) =>
            value === null ||
            value === undefined ||
            !Number.isFinite(Number(value)),
        )
      ) {
        throw new Error("Some required weather measurements are unavailable.");
      }

      const report = {
        location: selectedLocation.name,
        country: selectedLocation.country || "",
        region: selectedLocation.admin1 || "",

        latitude: selectedLocation.latitude,
        longitude: selectedLocation.longitude,

        temperature: current.temperature_2m,
        feelsLike: current.apparent_temperature,
        humidity: current.relative_humidity_2m,

        windSpeed: current.wind_speed_10m,
        windDirection: this.getWindDirection(current.wind_direction_10m),
        windGusts: current.wind_gusts_10m,

        cloudCover: current.cloud_cover,
        precipitation: current.precipitation,
        rain: current.rain,
        showers: current.showers,
        snowfall: current.snowfall,

        weatherCode: current.weather_code,
        weather: this.getWeatherDescription(current.weather_code),

        isDay: current.is_day === 1,
        time: current.time,
        timezone: data.timezone,
      };

      if (requestId !== this.requestId) return null;

      this.currentLocation = [report.location, report.region, report.country]
        .filter(Boolean)
        .join(", ");

      this.currentWeatherReport = this.buildReport(report);
      this.currentIndex = 0;

      this.onWeatherUpdate(report);

      this.notify(`Live weather retrieved for ${this.currentLocation}.`);

      return report;
    } catch (error) {
      if (requestId !== this.requestId || error.name === "AbortError") {
        return null;
      }

      this.notify(error.message || "Weather retrieval failed.");

      throw error;
    } finally {
      if (this.activeController === controller) {
        this.activeController = null;
      }
    }
  }

  buildReport(weather) {
    const temperatureText =
      `The temperature in ${this.currentLocation} is ` +
      `${weather.temperature} degrees Celsius. ` +
      `It feels like ${weather.feelsLike} degrees Celsius.`;

    const windText =
      `Wind speed is ${weather.windSpeed} kilometres per hour, ` +
      `coming from the ${weather.windDirection}. ` +
      `Wind gusts are ${weather.windGusts} kilometres per hour.`;

    const humidityText = `Relative humidity is ${weather.humidity} percent.`;

    return [
      { title: "Temperature", text: temperatureText },
      { title: "Wind", text: windText },
      { title: "Humidity", text: humidityText },
    ];
  }

  startReport() {
    if (!this.currentWeatherReport.length) {
      this.notify(
        "Please search for a location to retrieve its live weather first.",
      );
      return;
    }

    if (!this.speechSupported) {
      this.notify("Your browser does not support spoken guidance.");
      return;
    }

    this.speechSessionId++;

    window.speechSynthesis.cancel();

    this.currentIndex = 0;
    this.isStopped = false;
    this.isPaused = false;
    this.isSpeaking = false;

    this.speakCurrentSection();
  }

  speakCurrentSection() {
    if (this.isStopped || !this.speechSupported) return;

    if (this.currentIndex >= this.currentWeatherReport.length) {
      this.isSpeaking = false;
      this.isPaused = false;
      this.isStopped = true;
      this.currentUtterance = null;

      this.notify("Your live weather report is complete.");
      return;
    }

    const sessionId = this.speechSessionId;
    const section = this.currentWeatherReport[this.currentIndex];

    const utterance = new SpeechSynthesisUtterance(
      `Now, ${section.title}. ${section.text}`,
    );

    utterance.volume = this.volume;
    utterance.rate = this.rate;

    this.currentUtterance = utterance;
    this.isSpeaking = true;
    this.isPaused = false;

    this.onSectionChange({
      title: section.title,
      index: this.currentIndex,
      total: this.currentWeatherReport.length,
    });

    this.notify(`Speaking: ${section.title}`);

    utterance.onend = () => {
      if (
        sessionId !== this.speechSessionId ||
        this.currentUtterance !== utterance ||
        this.isStopped
      )
        return;

      this.currentUtterance = null;
      this.isSpeaking = false;
      this.currentIndex++;

      this.speakCurrentSection();
    };

    utterance.onerror = (event) => {
      if (
        sessionId !== this.speechSessionId ||
        this.currentUtterance !== utterance ||
        this.isStopped
      )
        return;

      this.currentUtterance = null;
      this.isSpeaking = false;

      if (event.error !== "canceled" && event.error !== "interrupted") {
        this.notify("An error occurred during voice guidance.");
      }
    };

    window.speechSynthesis.speak(utterance);
  }

  pause() {
    if (!this.speechSupported || !this.isSpeaking || this.isPaused) {
      return;
    }

    window.speechSynthesis.pause();

    this.isPaused = true;

    this.notify("Voice guidance paused.");
  }

  resume() {
    if (!this.speechSupported || !this.isPaused || this.isStopped) {
      return;
    }

    window.speechSynthesis.resume();

    this.isPaused = false;

    this.notify("Voice guidance resumed.");
  }

  stop(options = {}) {
    const invalidateRequest = options.invalidateRequest !== false;
    const shouldNotify = options.notify !== false;

    if (invalidateRequest) {
      this.requestId++;

      if (this.activeController) {
        this.activeController.abort();
        this.activeController = null;
      }
    }

    this.speechSessionId++;

    if (this.speechSupported) {
      window.speechSynthesis.cancel();
    }

    this.currentUtterance = null;
    this.isSpeaking = false;
    this.isPaused = false;
    this.isStopped = true;

    if (shouldNotify) {
      this.notify("Voice guidance stopped.");
    }
  }

  repeatCurrentSection() {
    if (!this.speechSupported || this.currentWeatherReport.length === 0) {
      return;
    }

    if (this.currentIndex >= this.currentWeatherReport.length) {
      this.currentIndex = this.currentWeatherReport.length - 1;
    }

    this.speechSessionId++;

    window.speechSynthesis.cancel();

    this.isStopped = false;
    this.isPaused = false;
    this.isSpeaking = false;

    this.speakCurrentSection();
  }

  setVolume(value) {
    const volume = Number(value);

    if (!Number.isFinite(volume)) return;

    this.volume = Math.min(1, Math.max(0, volume));
  }

  setRate(value) {
    const rate = Number(value);

    if (!Number.isFinite(rate)) return;

    this.rate = Math.min(2, Math.max(0.5, rate));
  }

  getStatus() {
    return {
      speaking: this.isSpeaking,
      paused: this.isPaused,
      stopped: this.isStopped,
      currentSection: this.currentIndex,
      totalSections: this.currentWeatherReport.length,
      location: this.currentLocation,
      volume: this.volume,
      rate: this.rate,
    };
  }
}
