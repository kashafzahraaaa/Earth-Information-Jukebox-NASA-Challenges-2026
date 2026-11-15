/*
  EARTH INFORMATION JUKEBOX
  NASA NIGHT LIGHTS SONIFICATION ENGINE

  Dynamic, non-speech sonification generated from actual
  NASA Night Lights video frames.

  SOUND MAPPING:
  1. Illuminated-pixel density -> loudness.
  2. Brightness of illuminated pixels -> pitch.
  3. Horizontal position -> stereo pan.
  4. Purple regions -> triangle tone, one octave higher.
  5. Orange regions -> soft sawtooth tone, one octave lower.
  6. White/yellow and other eligible neutral regions -> sine tone.
  7. Dark regions -> silence.

  These are project-designed mappings, not NASA measurements.

  Compatible with app.js:
  start(), pause(), resume(), stop(), setVolume(), getStatus()
  isRunning property.
*/

export const SONIFICATION_DEFAULTS = {
  segmentCount: 24,

  // Used as a fallback when video-frame callbacks
  // are not supported by the browser.
  interval: 40,

  // A smaller analysis frame reduces processing cost.
  analysisWidth: 480,

  // Analyse the central map band, excluding title/header
  // and lower legend.
  analysisRegion: {
    x0: 0.02,
    y0: 0.12,
    x1: 0.98,
    y1: 0.86,
  },

  // Keep empty until exact overlay coordinates
  // have been verified from the actual video frame.
  maskRegions: [],

  litThreshold: 48,
  minSaturation: 0.075,
  neutralWhiteThreshold: 205,

  minDensity: 0.0004,
  densityFloor: 0.0015,
  densityCeil: 0.12,

  brightnessMin: 40,
  brightnessMax: 150,
  brightnessGamma: 0.8,

  baseFrequency: 196,
  scaleDegrees: 11,

  purpleOctave: 2,
  orangeOctave: 0.5,

  volume: 0.25,
  debug: false,
};

const PENTATONIC = [0, 2, 4, 7, 9];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/* =====================================
   COLOUR CLASSIFICATION

   0 = Neutral
   1 = Purple
   2 = Orange
===================================== */

function classifyColor(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const difference = max - min;

  if (max === 0 || difference === 0) {
    return 0;
  }

  const saturation = difference / max;

  let hue;

  if (max === r) {
    hue = ((g - b) / difference) % 6;
  } else if (max === g) {
    hue = (b - r) / difference + 2;
  } else {
    hue = (r - g) / difference + 4;
  }

  hue *= 60;

  if (hue < 0) {
    hue += 360;
  }

  // Purple regions.
  if (hue >= 235 && hue <= 340 && saturation >= 0.14) {
    return 1;
  }

  // Orange regions only.
  if (hue >= 8 && hue <= 35 && saturation >= 0.38) {
    return 2;
  }

  // White, yellow and other eligible colours
  // are treated as neutral.
  return 0;
}

/* =====================================
   VIDEO FRAME ANALYSIS
===================================== */

export function analyzeFrame(data, width, height, segmentCount, options = {}) {
  const settings = {
    ...SONIFICATION_DEFAULTS,
    ...options,
  };

  const counts = new Uint32Array(segmentCount);
  const purple = new Uint32Array(segmentCount);
  const orange = new Uint32Array(segmentCount);

  const histograms = new Uint32Array(segmentCount * 256);
  const columns = new Uint32Array(segmentCount);

  const segmentOfX = new Uint16Array(width);

  const region = settings.analysisRegion || {
    x0: 0,
    y0: 0,
    x1: 1,
    y1: 1,
  };

  const startX = clamp(Math.floor(region.x0 * width), 0, width - 1);

  const endX = clamp(Math.ceil(region.x1 * width), startX + 1, width);

  const startY = clamp(Math.floor(region.y0 * height), 0, height - 1);

  const endY = clamp(Math.ceil(region.y1 * height), startY + 1, height);

  const regionWidth = endX - startX;
  const regionHeight = endY - startY;

  for (let x = startX; x < endX; x++) {
    const segment = Math.min(
      segmentCount - 1,
      Math.floor(((x - startX) * segmentCount) / regionWidth),
    );

    segmentOfX[x] = segment;
    columns[segment]++;
  }

  const masks = (settings.maskRegions || []).map((mask) => ({
    x0: Math.floor(mask.x0 * width),
    x1: Math.ceil(mask.x1 * width),
    y0: Math.floor(mask.y0 * height),
    y1: Math.ceil(mask.y1 * height),
  }));

  for (let y = startY; y < endY; y++) {
    const rowStart = y * width * 4;

    for (let x = startX; x < endX; x++) {
      const pixelIndex = rowStart + x * 4;

      const red = data[pixelIndex];
      const green = data[pixelIndex + 1];
      const blue = data[pixelIndex + 2];

      const luma = (54 * red + 183 * green + 19 * blue) >> 8;

      // Dark regions produce silence.
      if (luma <= settings.litThreshold) {
        continue;
      }

      let masked = false;

      for (const mask of masks) {
        if (x >= mask.x0 && x < mask.x1 && y >= mask.y0 && y < mask.y1) {
          masked = true;
          break;
        }
      }

      if (masked) {
        continue;
      }

      const max = Math.max(red, green, blue);
      const min = Math.min(red, green, blue);

      const saturation = max === 0 ? 0 : (max - min) / max;

      // Reject low-saturation grey background pixels.
      // Retain bright neutral and yellow illumination.
      if (
        saturation < settings.minSaturation &&
        luma < settings.neutralWhiteThreshold
      ) {
        continue;
      }

      const segment = segmentOfX[x];

      counts[segment]++;
      histograms[segment * 256 + luma]++;

      const colour = classifyColor(red, green, blue);

      if (colour === 1) {
        purple[segment]++;
      } else if (colour === 2) {
        orange[segment]++;
      }
    }
  }

  const results = [];

  for (let segment = 0; segment < segmentCount; segment++) {
    const litPixels = counts[segment];

    const totalPixels = columns[segment] * regionHeight;

    let brightness = 0;

    // Calculate the 90th percentile of illuminated brightness.
    if (litPixels > 0) {
      const target = litPixels * 0.9;
      let accumulated = 0;

      for (let value = 0; value < 256; value++) {
        accumulated += histograms[segment * 256 + value];

        if (accumulated >= target) {
          brightness = value;
          break;
        }
      }
    }

    results.push({
      density: totalPixels ? litPixels / totalPixels : 0,

      brightness,

      purpleShare: litPixels ? purple[segment] / litPixels : 0,

      orangeShare: litPixels ? orange[segment] / litPixels : 0,

      litPixels,
    });
  }

  return results;
}

/* =====================================
   PITCH CALCULATION
===================================== */

function frequencyForDegree(degree, baseFrequency) {
  const octave = Math.floor(degree / PENTATONIC.length);

  const step = PENTATONIC[degree % PENTATONIC.length];

  return baseFrequency * Math.pow(2, (12 * octave + step) / 12);
}

/* =====================================
   SOUND FEATURE MAPPING
===================================== */

export function buildVoices(feature, index, segmentCount, options = {}) {
  const settings = {
    ...SONIFICATION_DEFAULTS,
    ...options,
  };

  if (
    !feature ||
    feature.litPixels < 3 ||
    feature.density < settings.minDensity
  ) {
    return [];
  }

  const loudness = clamp(
    Math.log1p(feature.density / settings.densityFloor) /
      Math.log1p(settings.densityCeil / settings.densityFloor),
    0,
    1,
  );

  const level = 0.15 + 0.85 * loudness;

  const brightnessNorm = clamp(
    (feature.brightness - settings.brightnessMin) /
      (settings.brightnessMax - settings.brightnessMin),
    0,
    1,
  );

  const degree = Math.round(
    Math.pow(brightnessNorm, settings.brightnessGamma) *
      (settings.scaleDegrees - 1),
  );

  const baseFrequency = frequencyForDegree(degree, settings.baseFrequency);

  const pan = clamp(((index + 0.5) / segmentCount) * 2 - 1, -1, 1) * 0.9;

  const purpleShare = feature.purpleShare;
  const orangeShare = feature.orangeShare;

  const neutralShare = Math.max(0, 1 - purpleShare - orangeShare);

  const voices = [];

  if (neutralShare >= 0.15) {
    voices.push({
      kind: "neutral",
      type: "sine",
      frequency: baseFrequency,
      gain: level * neutralShare,
      pan,
    });
  }

  if (purpleShare >= 0.15) {
    voices.push({
      kind: "purple",
      type: "triangle",
      frequency: baseFrequency * settings.purpleOctave,
      gain: level * purpleShare,
      pan,
    });
  }

  if (orangeShare >= 0.15) {
    voices.push({
      kind: "orange",
      type: "sawtooth",
      frequency: baseFrequency * settings.orangeOctave,
      gain: level * orangeShare * 0.6,
      pan,
      lowpass: 1200,
    });
  }

  return voices;
}

/* =====================================
   NIGHT LIGHTS SONIFICATION ENGINE
===================================== */

export class NightLightsSonification {
  constructor(videoElement, options = {}) {
    if (!videoElement) {
      throw new Error("A NASA video element is required.");
    }

    this.video = videoElement;

    this.options = {
      ...SONIFICATION_DEFAULTS,
      ...options,
    };

    this.segmentCount = Math.max(4, Math.floor(this.options.segmentCount));

    this.interval = Math.max(20, Number(this.options.interval) || 40);

    this.volume = clamp(Number(this.options.volume), 0, 1);

    this.audioContext = null;
    this.masterGain = null;

    this.canvas = document.createElement("canvas");

    this.canvasContext = this.canvas.getContext("2d", {
      willReadFrequently: true,
    });

    if (!this.canvasContext) {
      throw new Error("Unable to create video analysis canvas.");
    }

    this.timer = null;
    this.frameCallbackId = null;

    this.isRunning = false;
    this.isStarting = false;
    this.isPaused = false;

    this.cursor = 0;
    this.scanPosition = 0;

    // Invalidates pending asynchronous start/resume operations.
    this.generation = 0;

    this.activeNodes = new Set();

    this.lastFrequency = null;
    this.lastIntensity = null;

    this.lastVideoTime = -1;
    this.stalledTicks = 0;

    this.lastTick = null;
    this.cachedFeatures = null;
    this.analysisError = null;

    this.lastFrameStatus = "Waiting for video frame";

    this.debug =
      this.options.debug === true ||
      (typeof window !== "undefined" && window.EARTH_JUKEBOX_DEBUG === true);
  }

  /* =====================================
     AUDIO INITIALIZATION
  ===================================== */

  ensureAudio() {
    if (this.audioContext) {
      return;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;

    if (!AudioContextClass) {
      throw new Error("Web Audio API is not supported.");
    }

    this.audioContext = new AudioContextClass();

    this.masterGain = this.audioContext.createGain();

    this.masterGain.gain.value = this.volume;

    const compressor = this.audioContext.createDynamicsCompressor();

    this.masterGain.connect(compressor);
    compressor.connect(this.audioContext.destination);

    this.canvasContext.imageSmoothingEnabled = true;

    this.canvasContext.imageSmoothingQuality = "high";
  }

  /* =====================================
     FRAME-SYNCHRONIZED SCHEDULING

     Prefer requestVideoFrameCallback so each
     segment is analysed from a current video frame.

     Fall back to a timer on older browsers.
  ===================================== */

  startTimer() {
    this.clearTimer();

    if (typeof this.video.requestVideoFrameCallback === "function") {
      this.scheduleVideoFrame();
      return;
    }

    this.timer = window.setInterval(() => this.tick(), this.interval);
  }

  scheduleVideoFrame() {
    if (
      !this.isRunning ||
      this.frameCallbackId !== null ||
      typeof this.video.requestVideoFrameCallback !== "function"
    ) {
      return;
    }

    this.frameCallbackId = this.video.requestVideoFrameCallback(() => {
      this.frameCallbackId = null;

      if (!this.isRunning) {
        return;
      }

      this.tick();

      if (this.isRunning) {
        this.scheduleVideoFrame();
      }
    });
  }

  clearTimer() {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }

    if (
      this.frameCallbackId !== null &&
      typeof this.video.cancelVideoFrameCallback === "function"
    ) {
      this.video.cancelVideoFrameCallback(this.frameCallbackId);
      this.frameCallbackId = null;
    }
  }

  /* =====================================
     ACTIVE SOUND CLEANUP
  ===================================== */

  stopActiveNotes() {
    for (const node of this.activeNodes) {
      const { oscillator, envelope, filter, panner } = node;

      try {
        oscillator.onended = null;
        oscillator.stop();
      } catch (error) {
        // The oscillator may already have stopped.
      }

      try {
        oscillator.disconnect();
      } catch (error) {}

      try {
        envelope.disconnect();
      } catch (error) {}

      if (filter) {
        try {
          filter.disconnect();
        } catch (error) {}
      }

      if (panner) {
        try {
          panner.disconnect();
        } catch (error) {}
      }
    }

    this.activeNodes.clear();
  }

  /* =====================================
     START
  ===================================== */

  async start() {
    if (this.isRunning || this.isStarting) {
      return;
    }

    this.isStarting = true;

    const currentGeneration = ++this.generation;

    try {
      this.ensureAudio();

      await this.audioContext.resume();

      // Stop or Pause may have been pressed
      // while the audio context was resuming.
      if (currentGeneration !== this.generation) {
        return;
      }

      if (this.audioContext.state !== "running") {
        throw new Error("Audio context could not be started.");
      }

      this.stopActiveNotes();

      this.cursor = 0;
      this.scanPosition = 0;

      this.cachedFeatures = null;
      this.analysisError = null;
      this.lastTick = null;

      this.lastVideoTime = -1;
      this.stalledTicks = 0;

      this.isRunning = true;
      this.isPaused = false;

      this.lastFrameStatus = "Analysing NASA video";

      this.startTimer();
    } catch (error) {
      if (currentGeneration === this.generation) {
        this.isRunning = false;

        this.lastFrameStatus = "Audio initialization failed";

        throw error;
      }
    } finally {
      if (currentGeneration === this.generation) {
        this.isStarting = false;
      }
    }
  }

  /* =====================================
     PAUSE
  ===================================== */

  pause() {
    if (!this.isRunning && !this.isStarting) {
      return;
    }

    // Invalidate pending asynchronous operations.
    this.generation++;

    this.isRunning = false;
    this.isStarting = false;
    this.isPaused = true;

    this.clearTimer();
    this.stopActiveNotes();

    if (this.audioContext && this.audioContext.state !== "closed") {
      this.audioContext.suspend().catch((error) => {
        console.error("Audio pause error:", error);
      });
    }

    this.lastFrameStatus = "Sonification paused";
  }

  /* =====================================
     RESUME
  ===================================== */

  async resume() {
    if (this.isRunning || this.isStarting) {
      return;
    }

    if (!this.audioContext) {
      return this.start();
    }

    const currentGeneration = this.generation;

    this.isStarting = true;

    try {
      await this.audioContext.resume();

      // Prevent a pending resume from overriding
      // a later Stop or Pause operation.
      if (currentGeneration !== this.generation) {
        return;
      }

      if (this.audioContext.state !== "running") {
        throw new Error("Audio context could not be resumed.");
      }

      this.isRunning = true;
      this.isPaused = false;

      this.lastFrameStatus = "Sonification resumed";

      this.startTimer();
    } catch (error) {
      if (currentGeneration === this.generation) {
        this.lastFrameStatus = "Audio resume failed";

        throw error;
      }
    } finally {
      if (currentGeneration === this.generation) {
        this.isStarting = false;
      }
    }
  }

  /* =====================================
     STOP
  ===================================== */

  stop() {
    // Invalidates pending start/resume operations.
    this.generation++;

    this.clearTimer();

    this.isRunning = false;
    this.isStarting = false;
    this.isPaused = false;

    this.stopActiveNotes();

    this.cursor = 0;
    this.scanPosition = 0;

    this.cachedFeatures = null;

    this.lastFrequency = null;
    this.lastIntensity = null;

    this.lastTick = null;

    this.lastFrameStatus = "Sonification stopped";
  }

  /* =====================================
     VOLUME CONTROL
  ===================================== */

  setVolume(value) {
    let newVolume = Number(value);

    if (!Number.isFinite(newVolume)) {
      return;
    }

    if (newVolume > 1) {
      newVolume /= 100;
    }

    this.volume = clamp(newVolume, 0, 1);

    if (this.masterGain && this.audioContext) {
      this.masterGain.gain.setTargetAtTime(
        this.volume,
        this.audioContext.currentTime,
        0.02,
      );
    }
  }

  /* =====================================
     ANALYSE CURRENT VIDEO FRAME
  ===================================== */

  analyseCurrentFrame() {
    const video = this.video;

    if (
      !video ||
      video.readyState < 2 ||
      !video.videoWidth ||
      !video.videoHeight
    ) {
      this.lastFrameStatus = "Waiting for video frame";

      return null;
    }

    const width = this.options.analysisWidth;

    const height = Math.max(
      1,
      Math.round((width * video.videoHeight) / video.videoWidth),
    );

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;

      this.canvasContext.imageSmoothingEnabled = true;

      this.canvasContext.imageSmoothingQuality = "high";
    }

    this.canvasContext.drawImage(video, 0, 0, width, height);

    const image = this.canvasContext.getImageData(0, 0, width, height);

    return analyzeFrame(
      image.data,
      width,
      height,
      this.segmentCount,
      this.options,
    );
  }

  /* =====================================
     ANALYSIS ERROR HANDLING
  ===================================== */

  reportAnalysisError(error) {
    if (this.analysisError) {
      return;
    }

    this.analysisError = error.message || String(error);

    this.lastFrameStatus = "Video analysis error";

    console.error("[Sonification] Video frame analysis failed:", error);

    this.clearTimer();
    this.stopActiveNotes();

    this.isRunning = false;
    this.isStarting = false;
    this.isPaused = false;

    this.generation++;

    if (typeof this.options.onError === "function") {
      this.options.onError(error);
    }
  }

  /* =====================================
     MAIN ANALYSIS LOOP

     Each segment is analysed from a fresh
     video frame rather than reusing the same
     frame for an entire 24-segment scan.

     This improves synchronization with the
     moving NASA visualization.
  ===================================== */

  tick() {
    if (!this.isRunning) {
      return;
    }

    const video = this.video;

    if (
      video.paused ||
      video.ended ||
      video.readyState < 2 ||
      !video.videoWidth
    ) {
      return;
    }

    if (video.currentTime === this.lastVideoTime) {
      this.stalledTicks++;
    } else {
      this.stalledTicks = 0;
      this.lastVideoTime = video.currentTime;
    }

    let features;

    try {
      // Analyse the current frame on every tick.
      // Do not reuse a frame captured at the start
      // of the previous 24-segment cycle.
      features = this.analyseCurrentFrame();
    } catch (error) {
      this.reportAnalysisError(error);
      return;
    }

    if (!features || features.length === 0) {
      return;
    }

    this.cachedFeatures = features;

    const index = this.cursor;
    const feature = features[index];

    this.cursor = (this.cursor + 1) % this.segmentCount;

    this.scanPosition = this.cursor;

    const voices = buildVoices(feature, index, this.segmentCount, this.options);

    voices.forEach((voice) => {
      this.playVoice(voice);
    });

    this.lastTick = {
      videoTime: Number(video.currentTime.toFixed(3)),

      segment: index,
      feature,
      voices,

      litSegments: features.filter(
        (item) => item.density >= this.options.minDensity,
      ).length,
    };

    this.lastFrameStatus =
      voices.length > 0
        ? "Current video frame analysed and sound generated"
        : "Current segment contains no detectable lights";

    if (this.debug) {
      console.debug("[Sonification]", this.lastTick);
    }
  }

  /* =====================================
     SOUND GENERATION
  ===================================== */

  playVoice(voice) {
    const context = this.audioContext;

    if (!context || !this.masterGain || context.state !== "running") {
      return;
    }

    const now = context.currentTime;

    // Short overlapping notes.
    // The duration follows the video-frame cadence
    // where requestVideoFrameCallback is supported.
    const duration = Math.max(0.06, (this.interval / 1000) * 1.5);

    const peak = Math.max(0.0002, 0.2 * voice.gain);

    const oscillator = context.createOscillator();

    const envelope = context.createGain();

    oscillator.type = voice.type;

    oscillator.frequency.setValueAtTime(voice.frequency, now);

    envelope.gain.setValueAtTime(0.0001, now);

    envelope.gain.exponentialRampToValueAtTime(peak, now + 0.01);

    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    let tail = oscillator;

    let filter = null;
    let panner = null;

    if (voice.lowpass) {
      filter = context.createBiquadFilter();

      filter.type = "lowpass";
      filter.frequency.value = voice.lowpass;

      tail.connect(filter);
      tail = filter;
    }

    tail.connect(envelope);
    tail = envelope;

    if (typeof context.createStereoPanner === "function") {
      panner = context.createStereoPanner();

      panner.pan.setValueAtTime(voice.pan, now);

      tail.connect(panner);
      tail = panner;
    }

    tail.connect(this.masterGain);

    const activeNode = {
      oscillator,
      envelope,
      filter,
      panner,
    };

    this.activeNodes.add(activeNode);

    oscillator.onended = () => {
      try {
        oscillator.disconnect();
      } catch (error) {}

      try {
        envelope.disconnect();
      } catch (error) {}

      if (filter) {
        try {
          filter.disconnect();
        } catch (error) {}
      }

      if (panner) {
        try {
          panner.disconnect();
        } catch (error) {}
      }

      this.activeNodes.delete(activeNode);
    };

    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);

    this.lastFrequency = Math.round(voice.frequency);

    this.lastIntensity = voice.gain;
  }

  /* =====================================
     STATUS INFORMATION
  ===================================== */

  getStatus() {
    const videoReady = this.video.readyState >= 2 && this.video.videoWidth > 0;

    return {
      isRunning: this.isRunning,
      isPaused: this.isPaused,

      cursor: this.cursor,
      segmentCount: this.segmentCount,
      interval: this.interval,

      audioState: this.audioContext?.state || "not initialized",

      videoTime: Number(this.video.currentTime.toFixed(2)),

      stalledTicks: this.stalledTicks,
      analysisError: this.analysisError,
      lastTick: this.lastTick,

      // Original status properties retained for compatibility.
      running: this.isRunning,
      starting: this.isStarting,

      scanPosition: this.scanPosition,
      totalSegments: this.segmentCount,

      volume: this.volume,

      lastFrequency: this.lastFrequency,
      lastIntensity: this.lastIntensity,

      frameStatus: this.lastFrameStatus,
      videoReady,

      frameCallbackSupported:
        typeof this.video.requestVideoFrameCallback === "function",
    };
  }

  /* =====================================
     CLEANUP
  ===================================== */

  async destroy() {
    this.stop();

    if (this.audioContext) {
      await this.audioContext.close();

      this.audioContext = null;
      this.masterGain = null;
    }
  }
}
