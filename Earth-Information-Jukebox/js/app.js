/*
  EARTH INFORMATION JUKEBOX
  MAIN APPLICATION CONTROLLER

  Connects:
  - NASA Night Lights video
  - Dynamic sonification
  - Live weather search
  - Spoken weather reports
  - Accessible interface controls
*/

import { NightLightsSonification } from "./sonification.js";
import { EarthVoiceGuide } from "./accessibility.js";

import {
  PROJECT_INFO,
  NASA_SOURCES,
  NIGHT_LIGHTS_MAPPING,
} from "./nasa-data.js";

/* =====================================
   APPLICATION STATE
===================================== */

const appState = {
  video: null,
  sonification: null,
  voiceGuide: null,
  initialized: false,
  videoPausedSonification: false,

  // Prevents delayed Start/Resume operations
  // from overriding a later Pause or Stop.
  sonificationOperation: 0,
  sonificationIntent: "stopped",
};

/* =====================================
   ELEMENT HELPERS
===================================== */

function getElement(id) {
  return document.getElementById(id);
}

function updateText(id, message) {
  const element = getElement(id);

  if (element) {
    element.textContent = message;
  }
}

function announce(message) {
  updateText("live-announcements", message);
  console.info("[Earth Jukebox]", message);
}

function runSafely(name, callback) {
  try {
    callback();
  } catch (error) {
    console.error(`Error initializing ${name}:`, error);
  }
}

/* =====================================
   SONIFICATION
===================================== */

function initializeSonification() {
  if (!appState.video) {
    updateText("sonification-status", "NASA video is unavailable.");
    return;
  }

  appState.sonification = new NightLightsSonification(appState.video, {
    segmentCount: 24,
    interval: 40,
    analysisWidth: 480,
  });

  updateText("sonification-status", "Sonification engine is ready.");
}

async function startSonification() {
  if (!appState.sonification || !appState.video) {
    announce("The Night Lights sonification is unavailable.");
    return;
  }

  if (
    appState.sonificationIntent === "playing" &&
    (appState.sonification.isRunning || appState.sonification.isStarting)
  ) {
    announce("Sonification is already playing.");
    return;
  }

  const operation = ++appState.sonificationOperation;

  appState.sonificationIntent = "playing";
  appState.videoPausedSonification = false;

  if (appState.video.ended) {
    appState.video.currentTime = 0;
  }

  try {
    const audioStartPromise = appState.sonification.start();

    const videoStartPromise = appState.video.paused
      ? appState.video.play()
      : Promise.resolve();

    await Promise.all([audioStartPromise, videoStartPromise]);

    // A newer Pause, Stop or Start may have happened
    // while the browser was starting the audio/video.
    if (operation !== appState.sonificationOperation) {
      if (appState.sonificationIntent !== "playing") {
        appState.sonification.stop();

        if (appState.video && !appState.video.paused) {
          appState.video.pause();
        }
      }

      return;
    }

    if (appState.sonificationIntent !== "playing") {
      return;
    }

    appState.videoPausedSonification = false;

    updateText("sonification-status", "Live Earth sonification is playing.");

    announce("Night Lights sonification started.");
  } catch (error) {
    // Ignore errors from an operation that has already
    // been replaced by a newer user action.
    if (operation !== appState.sonificationOperation) {
      return;
    }

    console.error("Sonification start error:", error);

    appState.sonificationIntent = "stopped";
    appState.sonification.stop();

    if (appState.video && !appState.video.paused) {
      appState.video.pause();
    }

    updateText(
      "sonification-status",
      "Unable to start sonification. Check browser audio permissions.",
    );

    announce("Unable to start audio. Please try again.");
  }
}

function pauseSonification() {
  if (!appState.sonification) {
    return;
  }

  ++appState.sonificationOperation;

  appState.sonificationIntent = "paused";
  appState.videoPausedSonification = false;

  appState.sonification.pause();

  if (appState.video && !appState.video.paused) {
    appState.video.pause();
  }

  updateText("sonification-status", "Sonification paused.");
  announce("Sonification paused.");
}

async function resumeSonification() {
  if (!appState.sonification || !appState.video) {
    return;
  }

  if (
    appState.sonificationIntent === "playing" &&
    (appState.sonification.isRunning || appState.sonification.isStarting)
  ) {
    return;
  }

  const operation = ++appState.sonificationOperation;

  appState.sonificationIntent = "playing";

  try {
    const audioResumePromise = appState.sonification.resume();

    const videoResumePromise =
      appState.video.paused && !appState.video.ended
        ? appState.video.play()
        : Promise.resolve();

    await Promise.all([audioResumePromise, videoResumePromise]);

    if (operation !== appState.sonificationOperation) {
      if (appState.sonificationIntent !== "playing") {
        appState.sonification.stop();

        if (!appState.video.paused) {
          appState.video.pause();
        }
      }

      return;
    }

    if (appState.sonificationIntent !== "playing") {
      return;
    }

    appState.videoPausedSonification = false;

    updateText("sonification-status", "Sonification resumed.");
    announce("Sonification resumed.");
  } catch (error) {
    if (operation !== appState.sonificationOperation) {
      return;
    }

    console.error("Sonification resume error:", error);

    appState.sonificationIntent = "paused";
    appState.sonification.pause();

    updateText("sonification-status", "Unable to resume sonification.");

    announce("Unable to resume sonification.");
  }
}

function stopSonification() {
  if (!appState.sonification) {
    return;
  }

  ++appState.sonificationOperation;

  appState.sonificationIntent = "stopped";
  appState.videoPausedSonification = false;

  appState.sonification.stop();

  if (appState.video && !appState.video.paused) {
    appState.video.pause();
  }

  updateText("sonification-status", "Sonification stopped.");
  announce("Sonification stopped.");
}

/* =====================================
   VIDEO EVENTS
===================================== */

function initializeVideoEvents() {
  if (!appState.video) {
    return;
  }

  appState.video.addEventListener("play", () => {
    announce("NASA Night Lights visualization is playing.");

    if (appState.videoPausedSonification) {
      appState.videoPausedSonification = false;
      resumeSonification();
    }
  });

  appState.video.addEventListener("pause", () => {
    if (appState.video.ended) {
      return;
    }

    if (appState.sonification?.isRunning || appState.sonification?.isStarting) {
      ++appState.sonificationOperation;

      appState.sonificationIntent = "paused";
      appState.videoPausedSonification = true;

      appState.sonification.pause();

      updateText("sonification-status", "Sonification paused with the video.");
    }
  });

  appState.video.addEventListener("ended", () => {
    stopSonification();
    announce("Night Lights visualization completed.");
  });

  appState.video.addEventListener("error", () => {
    updateText(
      "sonification-status",
      "NASA video could not be loaded. Check the video file and format.",
    );

    announce("The NASA video could not be loaded.");
  });
}

/* =====================================
   EXPLORE EARTH
===================================== */

function initializeExploreEarth() {
  const grid = document.querySelector(".exploration-grid");

  if (!grid) {
    return;
  }

  const dimensions = [
    {
      icon: "🌡️",
      title: "Temperature",
      description:
        "Discover current temperatures and how heat varies across different regions of Earth.",
    },
    {
      icon: "💨",
      title: "Wind",
      description:
        "Explore wind speed, direction and movement across our planet.",
    },
    {
      icon: "💧",
      title: "Humidity",
      description:
        "Understand moisture levels in the air and changing humidity conditions.",
    },
  ];

  grid.replaceChildren();

  dimensions.forEach((dimension) => {
    const card = document.createElement("article");
    card.className = "exploration-card";

    const icon = document.createElement("span");
    icon.className = "card-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = dimension.icon;

    const heading = document.createElement("h3");
    heading.textContent = dimension.title;

    const description = document.createElement("p");
    description.textContent = dimension.description;

    card.append(icon, heading, description);
    grid.appendChild(card);
  });

  updateText(
    "explore-section-description",
    "Explore live weather information through temperature, wind and humidity.",
  );
}

/* =====================================
   LIVE WEATHER INTERFACE
===================================== */

function createWeatherInterface() {
  const panel = document.querySelector(".voice-guide-panel");

  if (!panel || getElement("weather-search-form")) {
    return;
  }

  const weatherSection = document.createElement("div");
  weatherSection.className = "weather-search-panel";

  const heading = document.createElement("h3");
  heading.textContent = "Ask About Current Weather";

  const description = document.createElement("p");
  description.textContent =
    "Enter a city, country or region to retrieve its current weather conditions and hear a spoken report.";

  const form = document.createElement("form");
  form.id = "weather-search-form";

  const label = document.createElement("label");
  label.htmlFor = "weather-location";
  label.textContent = "Enter a location";

  const input = document.createElement("input");
  input.type = "search";
  input.id = "weather-location";
  input.name = "location";
  input.placeholder = "For example: Islamabad, Pakistan";
  input.autocomplete = "off";
  input.required = true;
  input.setAttribute("aria-describedby", "weather-search-help");

  const help = document.createElement("p");
  help.id = "weather-search-help";
  help.textContent =
    "For a large country, enter a city or region for a more specific report.";

  const button = document.createElement("button");
  button.type = "submit";
  button.id = "search-weather";
  button.className = "primary-button";
  button.textContent = "Get Live Weather";

  const output = document.createElement("div");
  output.id = "weather-report-output";
  output.className = "weather-report-output";
  output.setAttribute("role", "region");
  output.setAttribute("aria-label", "Current weather report");
  output.setAttribute("aria-live", "polite");

  const status = document.createElement("p");
  status.id = "weather-search-status";
  status.className = "status-message";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.textContent = "Enter a location to begin.";

  form.append(label, input, help, button);
  weatherSection.append(heading, description, form, status, output);

  const introduction = panel.querySelector(".voice-guide-introduction");

  if (introduction) {
    introduction.insertAdjacentElement("afterend", weatherSection);
  } else {
    panel.prepend(weatherSection);
  }

  const reportList = panel.querySelector(".report-sequence ol");

  if (reportList) {
    reportList.replaceChildren();

    ["Temperature", "Wind", "Humidity"].forEach((name) => {
      const item = document.createElement("li");
      item.textContent = name;
      reportList.appendChild(item);
    });
  }

  const reportHeading = panel.querySelector(".report-sequence h3");

  if (reportHeading) {
    reportHeading.textContent = "Live Weather Report";
  }

  const reportDescription = panel.querySelector(".voice-guide-introduction p");

  if (reportDescription) {
    reportDescription.textContent =
      "Search for a location to hear a spoken report covering temperature, wind and humidity.";
  }

  const startButton = getElement("start-voice-report");

  if (startButton) {
    startButton.textContent = "Speak Weather Report";
  }
}

/* =====================================
   WEATHER REPORT DISPLAY
===================================== */

function displayWeatherReport(weather) {
  const output = getElement("weather-report-output");

  if (!output || !weather) {
    return;
  }

  output.replaceChildren();

  const title = document.createElement("h3");
  title.textContent = "Current Weather";

  const location = document.createElement("p");
  location.textContent = [weather.location, weather.region, weather.country]
    .filter(Boolean)
    .join(", ");

  const details = [
    ["Temperature", `${weather.temperature} °C`],
    ["Feels like", `${weather.feelsLike} °C`],
    ["Wind speed", `${weather.windSpeed} km/h`],
    ["Wind direction", weather.windDirection],
    ["Wind gusts", `${weather.windGusts} km/h`],
    ["Humidity", `${weather.humidity}%`],
    ["Cloud cover", `${weather.cloudCover}%`],
    ["Weather conditions", weather.weather],
    ["Precipitation", `${weather.precipitation} mm`],
  ];

  const list = document.createElement("dl");

  details.forEach(([name, value]) => {
    const term = document.createElement("dt");
    term.textContent = name;

    const description = document.createElement("dd");
    description.textContent = value;

    list.append(term, description);
  });

  const timestamp = document.createElement("p");
  timestamp.textContent = `Weather observation time: ${weather.time} (${weather.timezone}).`;

  output.append(title, location, list, timestamp);
}

/* =====================================
   WEATHER SEARCH
===================================== */

async function searchWeather(event) {
  event.preventDefault();

  const input = getElement("weather-location");
  const button = getElement("search-weather");
  const status = getElement("weather-search-status");

  const location = input?.value.trim();

  if (!location) {
    if (status) {
      status.textContent = "Please enter a location.";
    }
    return;
  }

  if (!appState.voiceGuide) {
    if (status) {
      status.textContent = "The weather assistant is unavailable.";
    }
    return;
  }

  if (button) {
    button.disabled = true;
    button.textContent = "Retrieving Weather...";
  }

  if (status) {
    status.textContent = `Retrieving current weather for ${location}...`;
  }

  try {
    const weather = await appState.voiceGuide.getWeather(location);

    if (!weather) {
      return;
    }

    displayWeatherReport(weather);

    if (status) {
      status.textContent = `Current weather successfully retrieved for ${weather.location}.`;
    }

    updateText(
      "current-report-section",
      `Weather report for ${weather.location}`,
    );

    announce(`Live weather report retrieved for ${weather.location}.`);

    appState.voiceGuide.startReport();
  } catch (error) {
    console.error("Weather search error:", error);

    if (status) {
      status.textContent =
        error.message || "Unable to retrieve weather information.";
    }

    announce("Unable to retrieve the requested weather information.");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Get Live Weather";
    }
  }
}

/* =====================================
   VOICE GUIDANCE
===================================== */

function initializeVoiceGuide() {
  if (!("speechSynthesis" in window)) {
    updateText(
      "voice-status",
      "Voice guidance is not supported by this browser.",
    );
    return;
  }

  // The voice status is already a live region.
  // Avoid a second live announcement for the same section.
  getElement("current-report-section")?.removeAttribute("aria-live");

  appState.voiceGuide = new EarthVoiceGuide({
    onSectionChange: (section) => {
      updateText("current-report-section", section.title);
    },

    onStatusChange: (message) => {
      // voice-status has role="status" in the HTML.
      // Do not announce the same message again globally.
      updateText("voice-status", message);
    },

    onWeatherUpdate: (weather) => {
      displayWeatherReport(weather);
    },
  });

  createWeatherInterface();

  getElement("weather-search-form")?.addEventListener("submit", searchWeather);
}

function startVoiceReport() {
  appState.voiceGuide?.startReport();
}

function pauseVoiceReport() {
  appState.voiceGuide?.pause();
}

function resumeVoiceReport() {
  appState.voiceGuide?.resume();
}

function stopVoiceReport() {
  appState.voiceGuide?.stop();
}

function repeatVoiceReport() {
  appState.voiceGuide?.repeatCurrentSection();
}

/* =====================================
   INTERFACE CONTROLS
===================================== */

function connectButton(id, callback) {
  const button = getElement(id);

  if (button) {
    button.addEventListener("click", callback);
  }
}

function initializeControls() {
  connectButton("start-sonification", startSonification);
  connectButton("pause-sonification", pauseSonification);
  connectButton("resume-sonification", resumeSonification);
  connectButton("stop-sonification", stopSonification);

  connectButton("start-voice-report", startVoiceReport);
  connectButton("pause-voice-report", pauseVoiceReport);
  connectButton("resume-voice-report", resumeVoiceReport);
  connectButton("stop-voice-report", stopVoiceReport);
  connectButton("repeat-voice-report", repeatVoiceReport);

  getElement("sonification-volume")?.addEventListener("input", (event) => {
    appState.sonification?.setVolume(Number(event.target.value));
  });

  getElement("voice-volume")?.addEventListener("input", (event) => {
    appState.voiceGuide?.setVolume(Number(event.target.value));
  });

  getElement("voice-speed")?.addEventListener("input", (event) => {
    appState.voiceGuide?.setRate(Number(event.target.value));
  });
}

/* =====================================
   PROJECT INFORMATION
===================================== */

function displayProjectInformation() {
  updateText("project-name", PROJECT_INFO?.name || "Earth Information Jukebox");

  updateText(
    "project-tagline",
    PROJECT_INFO?.tagline || "Hear the Earth. See the Earth.",
  );
}

function displaySourceInformation() {
  const source = NASA_SOURCES?.nightLights;

  const sourceLink = getElement("night-lights-source");

  if (sourceLink && source?.url) {
    sourceLink.href = source.url;
    sourceLink.textContent = source.title || "View NASA Source";
  }

  const mappingElement = getElement("sound-mapping-description");

  if (mappingElement && NIGHT_LIGHTS_MAPPING) {
    const explanations = Object.values(NIGHT_LIGHTS_MAPPING)
      .map((item) => item.explanation)
      .filter(Boolean);

    if (explanations.length > 0) {
      mappingElement.textContent = explanations.join(" ");
    }
  }
}

/* =====================================
   PUBLIC APPLICATION API
===================================== */

window.EarthJukebox = {
  startSonification,
  pauseSonification,
  resumeSonification,
  stopSonification,

  startVoiceReport,
  pauseVoiceReport,
  resumeVoiceReport,
  stopVoiceReport,
  repeatVoiceReport,

  searchWeather: (location) => appState.voiceGuide?.getWeather(location),

  getState() {
    return {
      initialized: appState.initialized,
      sonificationIntent: appState.sonificationIntent,
      sonification: appState.sonification?.getStatus?.() || null,
      voiceGuide: appState.voiceGuide?.getStatus?.() || null,
    };
  },
};

/* =====================================
   APPLICATION INITIALIZATION
===================================== */

function initializeApplication() {
  if (appState.initialized) {
    return;
  }

  appState.video = getElement("night-lights-video");

  runSafely("sonification", initializeSonification);
  runSafely("voice guidance", initializeVoiceGuide);
  runSafely("video events", initializeVideoEvents);
  runSafely("interface controls", initializeControls);
  runSafely("Explore Earth", initializeExploreEarth);
  runSafely("project information", displayProjectInformation);
  runSafely("NASA source information", displaySourceInformation);

  appState.initialized = true;

  console.info("Earth Information Jukebox initialized.");

  announce("Earth Information Jukebox is ready.");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeApplication, {
    once: true,
  });
} else {
  initializeApplication();
}
