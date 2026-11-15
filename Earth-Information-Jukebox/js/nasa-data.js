/*
  EARTH INFORMATION JUKEBOX
  NASA DATA SOURCES AND SONIFICATION DEFINITIONS

  Important:
  NASA provides the scientific visualization and data.
  The sound mappings below are original project design choices.
  They are not official NASA sound mappings.
*/

/* =====================================
   PROJECT INFORMATION
===================================== */

export const PROJECT_INFO = {
  name: "Earth Information Jukebox",

  tagline: "Hear the Earth. See the Earth. Understand our changing planet.",

  challenge: "NASA Space Apps Challenge 2026",

  primaryDataset:
    "NASA Earth at Night: Change in Lighting Intensity, 2012–2023",
};

/* =====================================
   NASA DATA SOURCES
===================================== */

export const NASA_SOURCES = {
  nightLights: {
    title: "Change in Lighting Intensity from 2012 to 2023",

    organization: "NASA Scientific Visualization Studio",

    url: "https://svs.gsfc.nasa.gov/5313/",

    localVideo: "nasa data/nightlights.mp4",

    description:
      "A NASA visualization showing changes in nighttime lighting between 2012 and 2023.",

    interpretation:
      "The visualization shows changes in observed nighttime lighting. It is not a direct measurement of population, wealth, or economic development.",
  },

  earthInformationCenter: {
    title: "Earth Information Center Content Database",

    organization: "NASA",

    url: "https://svs.gsfc.nasa.gov/gallery/earth-information-center/",
  },

  oceanCurrents: {
    title: "Global Sea Surface Currents and Temperature",

    organization: "NASA Scientific Visualization Studio",

    url: "https://svs.gsfc.nasa.gov/3912/#media_group_349716",
  },

  aerosols: {
    title: "GEOS Aerosols",

    organization: "NASA Scientific Visualization Studio",

    url: "https://svs.gsfc.nasa.gov/5669/",
  },

  airQuality: {
    title: "Air Quality Model Runs",

    organization: "NASA Scientific Visualization Studio",

    url: "https://svs.gsfc.nasa.gov/5533/",
  },

  oceanMovement: {
    title: "Perpetual Ocean 2: Western Boundary Currents",

    organization: "NASA Scientific Visualization Studio",

    url: "https://svs.gsfc.nasa.gov/5425/",
  },

  carbonDioxide: {
    title: "DYAMOND Global Carbon Dioxide",

    organization: "NASA Scientific Visualization Studio",

    url: "https://svs.gsfc.nasa.gov/5196/",
  },

  lightning: {
    title: "Lightning Events Detected from the ISS, 2017–2023",

    organization: "NASA Scientific Visualization Studio",

    url: "https://svs.gsfc.nasa.gov/5011/",
  },

  atmosphericRiver: {
    title: "A 3D View of an Atmospheric River",

    organization: "NASA Scientific Visualization Studio",

    url: "https://svs.gsfc.nasa.gov/4960/",
  },

  forestHeight: {
    title: "GEDI Forest Height",

    organization: "NASA Scientific Visualization Studio",

    url: "https://svs.gsfc.nasa.gov/4950/",
  },
};

/* =====================================
   NIGHT LIGHTS SONIFICATION MAPPING

   These are the project's audio design choices.

   1. Illuminated-pixel density -> Loudness
   2. Image brightness -> Pitch
   3. Horizontal position -> Stereo placement
   4. Colour category -> Timbre

   The image is scanned from left to right.
===================================== */

export const NIGHT_LIGHTS_MAPPING = {
  illuminationDensity: {
    visualFeature: "Illuminated-pixel density",

    soundFeature: "Sound loudness",

    explanation:
      "Areas containing more detected illuminated pixels produce stronger sound.",
  },

  brightness: {
    visualFeature: "Image brightness",

    soundFeature: "Sound pitch",

    explanation:
      "Image brightness influences the pitch of the generated sound.",
  },

  position: {
    visualFeature: "Horizontal image position",

    soundFeature: "Stereo placement",

    explanation:
      "The visualization is scanned from left to right, with horizontal position represented through stereo audio placement.",
  },

  increasedLighting: {
    visualFeature: "Purple",

    soundFeature: "Colour-based timbre",

    explanation:
      "Purple areas represent increased nighttime lighting and are assigned a distinct audio timbre.",
  },

  decreasedLighting: {
    visualFeature: "Orange",

    soundFeature: "Colour-based timbre",

    explanation:
      "Orange areas represent decreased nighttime lighting and are assigned a distinct audio timbre.",
  },

  littleOrNoChange: {
    visualFeature: "White",

    soundFeature: "Colour-based timbre",

    explanation:
      "White areas represent little or no change in lighting intensity and are assigned a distinct audio timbre.",
  },
};

/* =====================================
   LIVE WEATHER REPORT SECTIONS

   Weather measurements are retrieved
   dynamically through Open-Meteo.

   EXACTLY THREE SPOKEN SECTIONS:

   1. Temperature
   2. Wind
   3. Humidity

   No atmosphere, season, altitude or
   ocean sections are included.
===================================== */

export const EARTH_REPORT_SECTIONS = [
  {
    id: "temperature",

    title: "Temperature",

    introduction: "Now, temperature.",

    description:
      "The current air temperature and feels-like temperature at the requested location.",
  },

  {
    id: "wind",

    title: "Wind",

    introduction: "Now, wind.",

    description:
      "Current wind speed, wind direction and wind gust conditions at the requested location.",
  },

  {
    id: "humidity",

    title: "Humidity",

    introduction: "Finally, humidity.",

    description: "The current relative humidity at the requested location.",
  },
];
