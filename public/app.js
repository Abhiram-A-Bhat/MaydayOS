let map;
let cesiumViewer;
let globeVizCanvas;
let globeVizCtx;
let cesiumToken = "";
let googleMapsKey = "";
let mapProvider = "leaflet";
let globeProvider = "cesium";
let googleMap;
let googleGlobe;
let googleProjectionOverlay = null;
let googleWeatherOverlay = null;
let leafletWeatherOverlay = null;
let leafletTerrainLayer = null;
let cycloneCanvas = null;
let cycloneCtx = null;
let terrainEnabled = false;
let activeRainFrame = "";
let weatherTileStatus = null;
let rainViewerCatalog = null;
let lastActiveClusterUpdate = 0;
const EARTH_RADIUS_M = 6371000;
const MIN_FLIGHT_VIEW_ZOOM = 4;
const MAX_VIEWPORT_AIRCRAFT = 900;
const CRUISE_TURN_BANK_DEG = 15;
const MIN_CRUISE_TURN_RADIUS_KM = 55;
let flightRefreshTimer = null;
let flightRefreshInFlight = false;
let pendingFlightRefresh = false;
let lastFlightBoundsKey = "";
let currentFlightSource = "connecting";
let ultrasonicTerrainAudio = null;

const state = {
  aircraft: [],
  ships: [],
  selected: null,
  scenarios: new Set(["cyclone", "mechanical", "pilot", "gps"]),
  simActive: false,
  startedAt: 0,
  storm: null,
  route: [],
  waterRoute: [],
  airportChoice: null,
  shipChoice: null,
  triangulation: [],
  starlink: [],
  starlinkClusters: [],
  globeReady: false,
  triangulationStarted: false,
  health: [],
  log: [],
  airportCatalog: [],
  flightPlan: null,
  hardwareSim: {
    enabled: false,
    aiControl: false,
    prompted: false,
    lastImu: null,
    smoothedImu: null,
    lastShakeAt: 0,
    lastPromptAt: 0,
    shakeScore: 0,
    mode: "standby",
    ultrasonic: {
      enabled: false,
      triggered: false,
      prompted: false,
      warningActive: false,
      distanceCm: null,
      status: "waiting",
      updatedAt: 0
    }
  },
  multiEmergency: {
    active: false,
    startedAt: 0,
    speed: 5,
    cyclone: null,
    flights: [],
    scheduled: [],
    atcPlan: [],
    atcActivated: false
  },
  flightSim: {
    active: false,
    startedAt: 0,
    speed: 1,
    durationMs: 90000,
    progress: 0,
    phase: "standby",
    placeCyclone: false,
    ignoredWarning: false,
    aiTakeover: false,
    failureTriggered: false,
    passengers: 286,
    fuelPercent: 100,
    flownPath: [],
    currentRoute: [],
    plannedRoute: [],
    routeMode: "destination",
    cyclone: null,
    takeoffTime: "",
    eta: "",
    lastPathSample: 0,
    cyclonePlacedAt: 0,
    cycloneGrowDuration: 12000,
    cycloneMatured: false,
    threatDetected: false,
    routeTransition: null,
    rerouted: false,
    routeStartedAt: 0,
    routeDurationMs: 90000
  },
  cycloneSim: {
    active: false,
    startedAt: 0,
    speedIndex: 1,
    durationMs: 46000,
    progress: 0
  },
  layers: {
    aircraft: L.layerGroup(),
    ships: L.layerGroup(),
    airports: L.layerGroup(),
    emergency: L.layerGroup()
  },
  cesiumEntities: [],
  orbitEntities: [],
  satelliteEntities: [],
  beamEntities: [],
  activeSatelliteEntities: [],
  aircraftEntity: null,
  googleOverlays: {
    aircraft: [],
    ships: [],
    airports: [],
    emergency: []
  }
};

const weatherLayerNames = {
  "0": "Radar Live",
  "1": "Radar -10m",
  "2": "Radar -20m",
  "3": "Radar -30m",
  "6": "Radar -60m"
};

const cycloneSpeedLevels = [0.5, 1, 2, 4, 8];

const japanCycloneTrack = [
  { t: 0, lat: 21.2, lon: 143.7, pressure: 998, wind: 42, radius: 260, eye: 18 },
  { t: 0.18, lat: 23.6, lon: 141.8, pressure: 982, wind: 62, radius: 360, eye: 26 },
  { t: 0.38, lat: 26.7, lon: 139.9, pressure: 955, wind: 92, radius: 520, eye: 38 },
  { t: 0.58, lat: 30.2, lon: 138.2, pressure: 940, wind: 112, radius: 690, eye: 46 },
  { t: 0.78, lat: 33.8, lon: 137.6, pressure: 952, wind: 94, radius: 760, eye: 54 },
  { t: 1, lat: 36.1, lon: 140.4, pressure: 972, wind: 70, radius: 680, eye: 62 }
];

const airports = [
  ["DEL", "Delhi IGI", 28.556, 77.1, 4430, "India"],
  ["BOM", "Mumbai CSMIA", 19.089, 72.865, 3445, "India"],
  ["BLR", "Bengaluru Kempegowda", 13.198, 77.706, 4000, "India"],
  ["MAA", "Chennai", 12.994, 80.17, 3658, "India"],
  ["CCU", "Kolkata", 22.653, 88.446, 3627, "India"],
  ["HYD", "Hyderabad", 17.24, 78.429, 4260, "India"],
  ["DXB", "Dubai", 25.253, 55.365, 4447, "UAE"],
  ["SIN", "Singapore Changi", 1.364, 103.991, 4000, "Singapore"],
  ["LHR", "London Heathrow", 51.47, -0.454, 3902, "UK"],
  ["JFK", "New York JFK", 40.641, -73.778, 4442, "USA"],
  ["SFO", "San Francisco", 37.619, -122.375, 3618, "USA"],
  ["LAX", "Los Angeles", 33.942, -118.408, 3685, "USA"],
  ["HNL", "Honolulu", 21.319, -157.922, 3760, "USA"],
  ["ANC", "Anchorage", 61.174, -149.998, 3531, "USA"],
  ["CDG", "Paris CDG", 49.009, 2.548, 4215, "France"],
  ["HND", "Tokyo Haneda", 35.549, 139.78, 3360, "Japan"],
  ["SYD", "Sydney", -33.939, 151.175, 3962, "Australia"],
  ["DOH", "Doha Hamad", 25.273, 51.608, 4850, "Qatar"],
  ["FRA", "Frankfurt", 50.037, 8.562, 4000, "Germany"],
  ["AMS", "Amsterdam Schiphol", 52.31, 4.768, 3800, "Netherlands"]
].map(([code, name, lat, lon, runway, country]) => ({ code, name, lat, lon, runway, country }));

const systems = [
  ["Engine 1", "Nominal"], ["Engine 2", "Nominal"], ["Fuel", "Nominal"],
  ["Hydraulics", "Nominal"], ["Avionics", "Nominal"], ["Electrical", "Nominal"],
  ["Landing Gear", "Nominal"], ["Cabin Pressure", "Nominal"]
];

init();

async function init() {
  bindUi();
  initCycloneCanvas();
  loadAirportCatalog();
  renderLog();
  renderCalcPanel();
  renderHealth();
  renderFlightSimStats();
  const config = await fetch("/api/config").then((r) => r.json()).catch(() => ({}));
  cesiumToken = config.cesiumIonToken || "";
  googleMapsKey = config.googleMapsApiKey || "";
  if (googleMapsKey) {
    await initGoogleMaps().catch((error) => {
      console.warn("Google Maps failed, falling back to Leaflet/Cesium", error);
      initLeaflet();
    });
  } else {
    initLeaflet();
  }
  refreshData();
  setInterval(refreshData, 15000);
  requestAnimationFrame(tick);
  checkWeatherProvider();
  updateOverlayStatus();
  updateCycloneControls();
  initSocket();
}

function initSocket() {
  const socket = io();
  
  const dashboardModelContainer = document.getElementById("dashboard-model3d");
  if (dashboardModelContainer && window.init3DAircraft) {
      window.airplaneDashboard = window.init3DAircraft(dashboardModelContainer);
  }

  socket.on("update-imu", (data) => {
    const displayImu = handleGyroHardwareUpdate(data);
    if (window.airplaneDashboard) {
        window.airplaneDashboard.updateAttitude(displayImu.pitch, displayImu.roll, displayImu.yaw);
    }

    const healthGrid = document.getElementById("healthGrid");
    if (healthGrid) {
      let attitudeTile = document.getElementById("imu-tile");
      if (!attitudeTile) {
        attitudeTile = document.createElement("div");
        attitudeTile.id = "imu-tile";
        attitudeTile.className = "health-card";
        healthGrid.appendChild(attitudeTile);
      }
      attitudeTile.innerHTML = `<b>Attitude (phone gyro)</b><span>P: ${displayImu.pitch}&deg; | R: ${displayImu.roll}&deg; | Y: ${displayImu.yaw}&deg;${state.hardwareSim.aiControl ? " | AI stabilized" : ""}</span>`;
    }

    const selectedIcon = document.querySelector(".plane-marker.selected");
    if (selectedIcon) {
       selectedIcon.style.transform = `rotate(${displayImu.yaw}deg)`;
    }
  });

  socket.on("update-ultrasonic", (data) => {
    handleUltrasonicUpdate(data);
  });
}

function handleGyroHardwareUpdate(rawData) {
  const imu = normalizeImu(rawData);
  const hardware = state.hardwareSim;
  const now = performance.now();

  if (hardware.enabled && hardware.lastImu) {
    const dt = Math.max(0.05, (now - hardware.lastImu.at) / 1000);
    const deltaPitch = Math.abs(imu.pitch - hardware.lastImu.pitch);
    const deltaRoll = Math.abs(imu.roll - hardware.lastImu.roll);
    const deltaYaw = Math.abs(shortAngleDelta(imu.yaw, hardware.lastImu.yaw));
    const rate = (deltaPitch + deltaRoll + deltaYaw) / dt;
    hardware.shakeScore = hardware.shakeScore * 0.72 + rate * 0.28;
    const violentAttitude = Math.max(deltaPitch, deltaRoll) > 18 || deltaYaw > 28 || hardware.shakeScore > 170;
    if (violentAttitude && !hardware.aiControl) {
      hardware.lastShakeAt = now;
      hardware.mode = "turbulence detected";
      promptGyroAiTakeover(now, imu, Math.round(hardware.shakeScore));
    }
  }

  hardware.lastImu = { ...imu, at: now };
  const displayImu = hardware.aiControl ? stabilizeImu(imu) : imu;
  renderHardwareSimStatus(displayImu);
  return displayImu;
}

function normalizeImu(data) {
  return {
    pitch: Number(data?.pitch) || 0,
    roll: Number(data?.roll) || 0,
    yaw: Number(data?.yaw) || 0
  };
}

function shortAngleDelta(current, previous) {
  let delta = current - previous;
  while (delta > 180) delta -= 360;
  while (delta < -180) delta += 360;
  return delta;
}

function stabilizeImu(imu) {
  const hardware = state.hardwareSim;
  const previous = hardware.smoothedImu || imu;
  const target = {
    pitch: imu.pitch * 0.08,
    roll: imu.roll * 0.08,
    yaw: imu.yaw * 0.12
  };
  const smoothed = {
    pitch: previous.pitch * 0.88 + target.pitch * 0.12,
    roll: previous.roll * 0.88 + target.roll * 0.12,
    yaw: previous.yaw * 0.9 + target.yaw * 0.1
  };
  hardware.smoothedImu = smoothed;
  hardware.mode = "agentic ai stabilizing";
  return {
    pitch: Math.round(smoothed.pitch),
    roll: Math.round(smoothed.roll),
    yaw: Math.round(smoothed.yaw)
  };
}

function promptGyroAiTakeover(now, imu, shakeScore) {
  const hardware = state.hardwareSim;
  if (hardware.prompted || now - hardware.lastPromptAt < 4500) return;
  hardware.prompted = true;
  hardware.lastPromptAt = now;
  renderHardwareSimStatus(imu);
  setTimeout(() => {
    const accepted = window.confirm(`Rapid gyro turbulence detected.\nPitch ${Math.round(imu.pitch)}°, roll ${Math.round(imu.roll)}°, yaw ${Math.round(imu.yaw)}°.\nShake score: ${shakeScore}.\n\nSwitch to Agentic AI stabilization?`);
    if (accepted) {
      activateGyroAiControl();
    } else {
      hardware.prompted = false;
      hardware.mode = "manual gyro control";
      renderHardwareSimStatus();
    }
  }, 0);
}

function toggleHardwareSimulation() {
  const hardware = state.hardwareSim;
  hardware.enabled = !hardware.enabled;
  hardware.aiControl = false;
  hardware.prompted = false;
  hardware.smoothedImu = null;
  hardware.shakeScore = 0;
  hardware.mode = hardware.enabled ? "monitoring gyro turbulence" : "standby";
  renderHardwareSimStatus();
}

function activateGyroAiControl() {
  const hardware = state.hardwareSim;
  hardware.enabled = true;
  hardware.aiControl = true;
  hardware.prompted = false;
  hardware.smoothedImu = hardware.lastImu ? { ...hardware.lastImu } : { pitch: 0, roll: 0, yaw: 0 };
  hardware.mode = "agentic ai stabilizing";
  renderHardwareSimStatus();
}

function resetHardwareSimulation() {
  const hardware = state.hardwareSim;
  hardware.aiControl = false;
  hardware.prompted = false;
  hardware.smoothedImu = null;
  hardware.shakeScore = 0;
  hardware.lastShakeAt = 0;
  hardware.mode = hardware.enabled ? "monitoring gyro turbulence" : "standby";
  hardware.ultrasonic.triggered = false;
  hardware.ultrasonic.prompted = false;
  hardware.ultrasonic.warningActive = false;
  hardware.ultrasonic.status = hardware.ultrasonic.enabled ? "armed" : "waiting";
  renderHardwareSimStatus();
}

function toggleUltrasonicSimulation() {
  const ultrasonic = state.hardwareSim.ultrasonic;
  ultrasonic.enabled = !ultrasonic.enabled;
  ultrasonic.triggered = false;
  ultrasonic.prompted = false;
  ultrasonic.warningActive = false;
  ultrasonic.status = ultrasonic.enabled ? "armed" : "waiting";
  if (ultrasonic.enabled) startUltrasonicFlightSimulation();
  renderHardwareSimStatus();
}

function handleUltrasonicUpdate(data) {
  const ultrasonic = state.hardwareSim.ultrasonic;
  const distance = Number(data?.distanceCm ?? data?.distance ?? data?.cm);
  if (!Number.isFinite(distance)) return;
  ultrasonic.distanceCm = distance;
  ultrasonic.updatedAt = Date.now();
  ultrasonic.status = distance <= 5 ? "object inside 5 cm" : distance <= 10 ? "terrain warning 10 cm" : "clear";
  if (ultrasonic.enabled && distance <= 10 && !ultrasonic.warningActive) {
    ultrasonic.warningActive = true;
    playUltrasonicTerrainWarning();
  }
  if (distance > 10) {
    ultrasonic.warningActive = false;
  }
  if (ultrasonic.enabled && distance <= 5 && !ultrasonic.triggered) {
    ultrasonic.triggered = true;
    promptUltrasonicAiTakeover(distance);
  }
  renderHardwareSimStatus();
}

function playUltrasonicTerrainWarning() {
  if (!ultrasonicTerrainAudio) {
    ultrasonicTerrainAudio = new Audio("/terrain-alert.mp3");
    ultrasonicTerrainAudio.preload = "auto";
    ultrasonicTerrainAudio.volume = 0.95;
  }
  ultrasonicTerrainAudio.currentTime = 0;
  ultrasonicTerrainAudio.play().catch((error) => {
    console.warn("Terrain warning audio blocked or unavailable", error);
  });
}

function promptUltrasonicAiTakeover(distanceCm) {
  const ultrasonic = state.hardwareSim.ultrasonic;
  if (ultrasonic.prompted) return;
  ultrasonic.prompted = true;
  setTimeout(() => {
    const accepted = window.confirm(`Ultrasonic obstacle detected at ${Number(distanceCm).toFixed(1)} cm.\n\nEnable Agentic AI evasive maneuver?`);
    if (accepted) {
      executeUltrasonicAvoidance(distanceCm);
    } else {
      ultrasonic.prompted = false;
      ultrasonic.status = "pilot rejected avoidance";
      renderHardwareSimStatus();
    }
  }, 0);
}

function startUltrasonicFlightSimulation() {
  const from = findAirportByCode("JFK") || airports.find((airport) => airport.code === "JFK");
  const to = findAirportByCode("LAX") || airports.find((airport) => airport.code === "LAX");
  if (!from || !to) return;
  state.flightPlan = buildFlightPlan(from, to, 92, 186, 9000);
  document.getElementById("homePage").classList.add("hidden");
  startPacificFlightSimulation();
  state.flightSim.speed = 2;
  state.flightSim.routeMode = "ultrasonic-hardware-flight";
  state.log = [
    ["Ultrasonic hardware simulation", "JFK to LAX flight loaded. Planned route and live flight path are active on the map."],
    ["Sensor armed", "HC-SR04 plays the terrain warning at 10 cm. At 5 cm, Agentic AI can execute the smooth U-shaped avoidance arc and rejoin the filed route."],
    ...state.log.slice(0, 3)
  ];
  renderLog();
  renderFlightSimStats();
  drawEmergency();
}

function executeUltrasonicAvoidance(distanceCm) {
  if (!state.flightSim.active || !state.selected) startUltrasonicFlightSimulation();
  const sim = state.flightSim;
  const now = performance.now();
  const plane = state.selected;
  const oldRoute = [...sim.currentRoute];
  const oldProgress = routeProgress(sim, now);
  const avoidanceRoute = buildUltrasonicAvoidanceRoute(plane, sim);
  sim.aiTakeover = true;
  sim.routeMode = "ultrasonic-ai-avoidance";
  sim.currentRoute = avoidanceRoute;
  sim.routeStartedAt = now;
  sim.routeDurationMs = routeDurationFor(sim.currentRoute);
  sim.routeTransition = {
    startedAt: now,
    duration: 2600,
    oldRoute,
    oldProgress
  };
  state.route = sim.currentRoute.map((point) => [point.lon, point.lat]);
  state.hardwareSim.ultrasonic.status = `AI avoidance active (${Number(distanceCm).toFixed(1)} cm)`;
  state.log = [
    ["Ultrasonic obstacle", `HC-SR04 detected object at ${Number(distanceCm).toFixed(1)} cm.`],
    ["Agentic AI takeover", "AI commanded a wide U-shaped avoidance arc, smooth lateral offset, and gradual rejoin to the JFK-LAX route."],
    ...state.log.slice(0, 4)
  ];
  renderLog();
  renderFlightSimStats();
  drawEmergency();
}

function buildUltrasonicAvoidanceRoute(plane, sim) {
  const planned = sim.plannedRoute?.length ? sim.plannedRoute : sim.currentRoute;
  const destination = planned[planned.length - 1];
  const currentPlannedProgress = nearestRouteProgress(planned, plane);
  const projection = localRouteProjection(plane);
  const start = { lat: plane.lat, lon: plane.lon };
  const startXY = projection.toXY(start);
  const ahead1 = pointAlongSpline(planned, Math.min(0.96, currentPlannedProgress + 0.10)) || destination;
  const ahead2 = pointAlongSpline(planned, Math.min(0.98, currentPlannedProgress + 0.22)) || destination;
  const rejoin = pointAlongSpline(planned, Math.min(0.99, currentPlannedProgress + 0.34)) || destination;
  const ahead1XY = projection.toXY(ahead1);
  const ahead2XY = projection.toXY(ahead2);
  const rejoinXY = projection.toXY(rejoin);
  const direction = normalizeXY({ x: rejoinXY.x - startXY.x, y: rejoinXY.y - startXY.y }) || { x: -1, y: 0 };
  const side = ((plane.heading || 270) % 360) > 180 ? 1 : -1;
  const normal = { x: -direction.y * side, y: direction.x * side };
  const offsetKm = 210;
  const entry = projection.toLatLon({
    x: startXY.x + direction.x * 90 + normal.x * offsetKm * 0.36,
    y: startXY.y + direction.y * 90 + normal.y * offsetKm * 0.36
  });
  const bottom1 = projection.toLatLon({
    x: ahead1XY.x + normal.x * offsetKm,
    y: ahead1XY.y + normal.y * offsetKm
  });
  const bottom2 = projection.toLatLon({
    x: ahead2XY.x + normal.x * offsetKm,
    y: ahead2XY.y + normal.y * offsetKm
  });
  const exit = projection.toLatLon({
    x: rejoinXY.x + normal.x * offsetKm * 0.38,
    y: rejoinXY.y + normal.y * offsetKm * 0.38
  });
  const uRoute = [
    start,
    entry,
    bottom1,
    bottom2,
    exit,
    rejoin,
    destination
  ];
  return catmullRomChain(dedupeRoute(uRoute), 24);
}

function nearestRouteProgress(route, point) {
  if (!isUsableRoute(route) || !point) return 0.2;
  const samples = 80;
  let best = { progress: 0, distance: Infinity };
  for (let i = 0; i <= samples; i += 1) {
    const progress = i / samples;
    const sample = pointAlongSpline(route, progress);
    if (!sample) continue;
    const distance = km(point.lat, point.lon, sample.lat, sample.lon);
    if (distance < best.distance) best = { progress, distance };
  }
  return best.progress;
}

function renderHardwareSimStatus(imu = state.hardwareSim.lastImu) {
  const hardware = state.hardwareSim;
  const toggle = document.getElementById("hardwareSimToggle");
  const ultrasonicToggle = document.getElementById("ultrasonicSimToggle");
  const aiButton = document.getElementById("gyroAiTakeover");
  const status = document.getElementById("hardwareSimStatus");
  toggle?.classList.toggle("active", hardware.enabled);
  ultrasonicToggle?.classList.toggle("active", hardware.ultrasonic.enabled);
  ultrasonicToggle?.classList.toggle("alert", hardware.ultrasonic.triggered);
  aiButton?.classList.toggle("active", hardware.aiControl);
  aiButton?.classList.toggle("alert", hardware.enabled && !hardware.aiControl && hardware.lastShakeAt > 0);
  if (aiButton) aiButton.disabled = !hardware.enabled;
  if (!status) return;
  const values = imu ? `P ${Math.round(imu.pitch)}° | R ${Math.round(imu.roll)}° | Y ${Math.round(imu.yaw)}°` : "waiting for phone gyro";
  const ultrasonic = hardware.ultrasonic.distanceCm === null
    ? "ultrasonic waiting"
    : `ultrasonic ${Number(hardware.ultrasonic.distanceCm).toFixed(1)} cm (${hardware.ultrasonic.status})`;
  const mode = hardware.enabled ? hardware.mode : "standby";
  status.textContent = `${mode} | ${values} | ${ultrasonic}`;
}

function bindUi() {
  document.querySelectorAll(".scenario").forEach((button) => {
    button.addEventListener("click", () => {
      const scenario = button.dataset.scenario;
      state.scenarios.has(scenario) ? state.scenarios.delete(scenario) : state.scenarios.add(scenario);
      button.classList.toggle("active", state.scenarios.has(scenario));
    });
  });
  bindAction(document.getElementById("startSimulation"), startEmergencySimulation);
  bindAction(document.getElementById("startStarlink"), openGlobe);
  document.getElementById("resetView").addEventListener("click", resetSimulation);
  bindAction(document.getElementById("toggleGlobe"), openGlobe);
  document.getElementById("closeGlobe").addEventListener("click", closeGlobe);
  document.getElementById("downloadReport").addEventListener("click", downloadReport);
  document.getElementById("terrainToggle").addEventListener("click", toggleTerrain);
  document.getElementById("planFlight").addEventListener("click", planFlightFromHome);
  document.getElementById("startFlightSim").addEventListener("click", startPacificFlightSimulation);
  document.getElementById("fastFlightSim").addEventListener("click", fastForwardFlightSimulation);
  document.getElementById("placeCyclone").addEventListener("click", armFlightCyclonePlacement);
  document.getElementById("mechanicalFailure").addEventListener("click", triggerMechanicalFailureScenario);
  document.getElementById("gpsAtcCutoff").addEventListener("click", triggerGpsAtcCutoffScenario);
  document.getElementById("sosTelegram").addEventListener("click", sendSosTelegramAlert);
  document.getElementById("pilotDeviation").addEventListener("click", triggerPilotDeviationScenario);
  document.getElementById("elevenEmergency").addEventListener("click", startElevenEmergencyScenario);
  document.getElementById("aiTakeover").addEventListener("click", authorizeAiTakeover);
  document.getElementById("cycloneReplay").addEventListener("click", toggleJapanCycloneSimulation);
  document.getElementById("cycloneSlower").addEventListener("click", () => adjustCycloneSpeed(-1));
  document.getElementById("cycloneFaster").addEventListener("click", () => adjustCycloneSpeed(1));
  document.querySelectorAll(".weather-option").forEach((button) => {
    button.addEventListener("click", () => toggleWeatherLayer(button.dataset.rainFrame));
  });

  const gyroModal = document.getElementById("gyroModal");
  const openGyroBtn = document.getElementById("openGyroBtn");
  const closeGyroBtn = document.getElementById("closeGyroBtn");
  const hardwareSimToggle = document.getElementById("hardwareSimToggle");
  const ultrasonicSimToggle = document.getElementById("ultrasonicSimToggle");
  const hardwareReset = document.getElementById("hardwareReset");
  const gyroAiTakeover = document.getElementById("gyroAiTakeover");
  if (openGyroBtn && gyroModal) {
    openGyroBtn.addEventListener("click", () => {
      gyroModal.showModal();
      const container = document.getElementById("dashboard-model3d");
      // Re-initialize if not already loaded or size changed
      if (container && window.init3DAircraft && !window.airplaneDashboard) {
        window.airplaneDashboard = window.init3DAircraft(container);
      } else if (window.airplaneDashboard) {
         // Trigger resize event to make sure canvas fills modal
         window.dispatchEvent(new Event('resize'));
      }
      renderHardwareSimStatus();
    });
  }
  if (closeGyroBtn && gyroModal) {
    closeGyroBtn.addEventListener("click", () => {
      gyroModal.close();
    });
  }
  hardwareSimToggle?.addEventListener("click", toggleHardwareSimulation);
  ultrasonicSimToggle?.addEventListener("click", toggleUltrasonicSimulation);
  hardwareReset?.addEventListener("click", resetHardwareSimulation);
  gyroAiTakeover?.addEventListener("click", activateGyroAiControl);

  window.maydayStart = startEmergencySimulation;
}

function initCycloneCanvas() {
  cycloneCanvas = document.getElementById("cycloneCanvas");
  cycloneCtx = cycloneCanvas?.getContext("2d");
  resizeCycloneCanvas();
  window.addEventListener("resize", resizeCycloneCanvas);
}

function resizeCycloneCanvas() {
  if (!cycloneCanvas) return;
  const rect = cycloneCanvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  cycloneCanvas.width = Math.max(1, Math.round(rect.width * ratio));
  cycloneCanvas.height = Math.max(1, Math.round(rect.height * ratio));
  if (cycloneCtx) cycloneCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

async function loadAirportCatalog() {
  const status = document.getElementById("preflightStatus");
  try {
    const data = await fetch("/api/airports").then((r) => r.json());
    state.airportCatalog = (data.airports || []).filter((airport) => airport.code && Number.isFinite(airport.lat) && Number.isFinite(airport.lon));
    populateAirportOptions();
    drawAirports();
    if (status) status.textContent = `Loaded ${state.airportCatalog.length.toLocaleString()} airports from ${data.source}. Enter route, fuel, passengers, and cargo to start.`;
  } catch (error) {
    state.airportCatalog = airports;
    populateAirportOptions();
    drawAirports();
    if (status) status.textContent = `Airport database fallback loaded. ${error.message}`;
  }
  setDefaultPlannerAirports();
}

function populateAirportOptions() {
  const datalist = document.getElementById("airportOptions");
  if (!datalist) return;
  datalist.innerHTML = state.airportCatalog
    .slice(0, 9000)
    .map((airport) => `<option value="${airport.code} - ${airport.name}${airport.municipality ? `, ${airport.municipality}` : ""}"></option>`)
    .join("");
}

function setDefaultPlannerAirports() {
  const from = document.getElementById("fromAirport");
  const to = document.getElementById("toAirport");
  if (from && !from.value) from.value = "HND - Tokyo Haneda";
  if (to && !to.value) to.value = "SFO - San Francisco";
}

function planFlightFromHome() {
  const from = findAirportFromInput(document.getElementById("fromAirport").value);
  const to = findAirportFromInput(document.getElementById("toAirport").value);
  const fuel = Number(document.getElementById("fuelInput").value);
  const passengers = clamp(Number(document.getElementById("passengerInput").value), 0, 300);
  const cargoKg = clamp(Number(document.getElementById("cargoInput").value), 0, 30000);
  const status = document.getElementById("preflightStatus");
  if (!from || !to || from.code === to.code) {
    status.textContent = "Choose two different valid airports from the list.";
    return;
  }
  const plan = buildFlightPlan(from, to, fuel, passengers, cargoKg);
  state.flightPlan = plan;
  status.innerHTML = preflightSummary(plan);
  if (!plan.allowed) return;
  document.getElementById("homePage").classList.add("hidden");
  startPacificFlightSimulation();
}

function findAirportFromInput(value) {
  const code = String(value || "").trim().slice(0, 3).toUpperCase();
  return state.airportCatalog.find((airport) => airport.code === code)
    || state.airportCatalog.find((airport) => `${airport.code} ${airport.name}`.toLowerCase().includes(String(value || "").toLowerCase()));
}

function buildFlightPlan(from, to, fuelPercent, passengers, cargoKg) {
  const directDistanceKm = km(from.lat, from.lon, to.lat, to.lon);
  const passengerWeightKg = passengers * 95;
  const operatingWeightKg = 92000;
  const payloadKg = passengerWeightKg + cargoKg;
  const payloadFactor = 1 + payloadKg / 145000 * 0.18;
  const reserveFactor = 1.18;
  const rawDirectFuelNeededPercent = fuelRequiredForLeg(directDistanceKm, payloadFactor, reserveFactor);
  const rangeKm = fuelPercent * 118 / payloadFactor;
  const directAllowed = fuelPercent >= rawDirectFuelNeededPercent;
  const connectionPlan = directAllowed ? { stops: [], route: [from, to] } : findRefuelRoute(from, to, rangeKm, payloadFactor, reserveFactor, fuelPercent);
  const route = connectionPlan?.route || [from, to];
  const legDistances = route.slice(0, -1).map((point, index) => km(point.lat, point.lon, route[index + 1].lat, route[index + 1].lon));
  const legFuel = legDistances.map((distance) => fuelRequiredForLeg(distance, payloadFactor, reserveFactor));
  const maxLegFuelPercent = legFuel.length ? Math.max(...legFuel) : rawDirectFuelNeededPercent;
  const distanceKm = legDistances.reduce((sum, distance) => sum + distance, 0) || directDistanceKm;
  const exceedsTankCapacity = !connectionPlan;
  const allowed = fuelPercent >= 40 && passengers <= 300 && cargoKg <= 30000 && Boolean(connectionPlan) && maxLegFuelPercent <= fuelPercent;
  const flightHours = distanceKm / 870 + (connectionPlan?.stops.length || 0) * 0.75;
  return {
    from,
    to,
    fuelPercent,
    passengers,
    cargoKg,
    directDistanceKm,
    distanceKm,
    payloadKg,
    payloadFactor,
    fuelNeededPercent: Math.min(100, maxLegFuelPercent),
    rawFuelNeededPercent: maxLegFuelPercent,
    rawDirectFuelNeededPercent,
    exceedsTankCapacity,
    rangeKm,
    flightHours,
    allowed,
    route,
    stops: connectionPlan?.stops || [],
    legDistances,
    legFuel
  };
}

function preflightSummary(plan) {
  const checks = [
    `Direct distance: ${Math.round(plan.directDistanceKm).toLocaleString()} km`,
    plan.stops.length
      ? `Planned refuel stops: ${plan.stops.map((airport) => `${airport.code} ${airport.name}`).join(" -> ")}`
      : "Planned refuel stops: none",
    `Planned trip distance: ${Math.round(plan.distanceKm).toLocaleString()} km`,
    `Fuel on board: ${plan.fuelPercent}%`,
    plan.exceedsTankCapacity
      ? `Per-leg fuel requirement: no viable refuel routing found below full tank`
      : `Highest leg fuel required with reserve/load: ${plan.fuelNeededPercent.toFixed(1)}%`,
    `Payload: ${Math.round(plan.payloadKg).toLocaleString()} kg`,
    `Estimated endurance range: ${Math.round(plan.rangeKm).toLocaleString()} km`
  ];
  const verdict = plan.allowed
    ? "Preflight passed. Launching simulation..."
    : plan.exceedsTankCapacity
      ? "Preflight blocked. No safe direct or connecting refuel route found for this load."
      : "Preflight blocked. Increase fuel or reduce passenger/cargo load.";
  return `<strong>${verdict}</strong><br>${checks.join("<br>")}`;
}

function fuelRequiredForLeg(distanceKm, payloadFactor, reserveFactor = 1.18) {
  return (distanceKm / 118) * payloadFactor * reserveFactor;
}

function findRefuelRoute(from, to, rangeKm, payloadFactor, reserveFactor, fuelPercent) {
  const maxLegKm = Math.min(rangeKm * 0.92, (fuelPercent * 118 / payloadFactor) / reserveFactor);
  const catalog = (state.airportCatalog.length ? state.airportCatalog : airports)
    .filter((airport) => airport.code && airport.code !== from.code && airport.code !== to.code)
    .filter((airport) => airport.type === "large_airport" || airport.type === "medium_airport" || !airport.type);
  const route = [from];
  const stops = [];
  let current = from;
  const used = new Set([from.code]);
  for (let hop = 0; hop < 4; hop += 1) {
    const destDistance = km(current.lat, current.lon, to.lat, to.lon);
    if (destDistance <= maxLegKm && fuelRequiredForLeg(destDistance, payloadFactor, reserveFactor) <= fuelPercent) {
      route.push(to);
      return { route, stops };
    }
    const candidates = catalog
      .filter((airport) => !used.has(airport.code))
      .map((airport) => {
        const fromCurrent = km(current.lat, current.lon, airport.lat, airport.lon);
        const toDest = km(airport.lat, airport.lon, to.lat, to.lon);
        const clearance = distanceToSegmentKm(airport.lat, airport.lon, current.lat, current.lon, to.lat, to.lon);
        const progress = destDistance - toDest;
        const runwayBonus = Math.min(18, (airport.runway || runwayEstimateClient(airport.type)) / 240);
        const score = progress * 1.4 - clearance * 1.8 + runwayBonus;
        return { ...airport, fromCurrent, toDest, clearance, progress, score };
      })
      .filter((airport) => airport.fromCurrent <= maxLegKm && airport.progress > 450 && airport.clearance < 1500)
      .sort((a, b) => b.score - a.score);
    const next = candidates[0];
    if (!next) return null;
    used.add(next.code);
    stops.push(next);
    route.push(next);
    current = next;
  }
  const lastLeg = km(current.lat, current.lon, to.lat, to.lon);
  if (lastLeg <= maxLegKm) {
    route.push(to);
    return { route, stops };
  }
  return null;
}

function runwayEstimateClient(type) {
  return type === "large_airport" ? 3900 : type === "medium_airport" ? 2600 : type === "small_airport" ? 1400 : 900;
}

function buildGreatCircleRoute(from, to, steps = 4) {
  const route = [];
  for (let i = 0; i <= steps; i += 1) {
    route.push(interpolateGeo(from, to, i / steps));
  }
  return route;
}

function initLeaflet() {
  mapProvider = "leaflet";
  globeProvider = "cesium";
  map = L.map("mapCanvas", {
    worldCopyJump: true,
    zoomControl: true,
    preferCanvas: true
  }).setView([20.6, 78.9], 4);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors &copy; CARTO"
  }).addTo(map);
  map.on("move zoom resize", () => renderCycloneSimulation(performance.now()));
  map.on("moveend zoomend resize", () => scheduleViewportFlightRefresh());
  map.on("click", (event) => handleMapClick(event.latlng.lat, event.latlng.lng));
  Object.values(state.layers).forEach((layer) => layer.addTo(map));
  leafletTerrainLayer = L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
    maxZoom: 17,
    opacity: 0.92,
    attribution: "&copy; OpenTopoMap"
  });
  drawAirports();
  applyTerrainState();
  applyWeatherLayer();
}

async function initGoogleMaps() {
  await loadScript(`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(googleMapsKey)}&v=beta&libraries=maps3d`);
  mapProvider = "google";
  // Google Maps remains the preferred 2D map provider. The Starlink view uses
  // Cesium because it needs true orbital entities around a globe, not a flat
  // screen overlay on terrain imagery.
  globeProvider = "cesium";
  googleMap = new google.maps.Map(document.getElementById("mapCanvas"), {
    center: { lat: 20.6, lng: 78.9 },
    zoom: 4,
    mapTypeId: "hybrid",
    clickableIcons: false,
    fullscreenControl: false,
    streetViewControl: false,
    mapTypeControl: true,
    gestureHandling: "greedy",
    tilt: 0
  });
  googleProjectionOverlay = new google.maps.OverlayView();
  googleProjectionOverlay.onAdd = function onAdd() {};
  googleProjectionOverlay.draw = function draw() {};
  googleProjectionOverlay.onRemove = function onRemove() {};
  googleProjectionOverlay.setMap(googleMap);
  googleMap.addListener("bounds_changed", () => renderCycloneSimulation(performance.now()));
  googleMap.addListener("idle", () => scheduleViewportFlightRefresh());
  googleMap.addListener("click", (event) => handleMapClick(event.latLng.lat(), event.latLng.lng()));
  drawAirports();
  applyTerrainState();
  applyWeatherLayer();
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = [...document.scripts].find((script) => script.src === src);
    if (existing) return resolve();
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

async function refreshData() {
  const flightUrl = flightsUrlForCurrentView();
  const [flights, ships] = await Promise.allSettled([
    flightUrl ? fetch(flightUrl).then((r) => r.json()) : Promise.resolve(null),
    fetch("/api/ships").then((r) => r.json())
  ]);
  if (flights.status === "fulfilled" && flights.value) {
    state.aircraft = flights.value.aircraft || [];
    updateFlightSource(flights.value.source);
    if (!state.selected && state.aircraft.length) selectAircraft(state.aircraft[0], false);
    if (state.selected) {
      const updated = state.aircraft.find((plane) => plane.id === state.selected.id);
      if (updated) updateSelectedAircraftLive(updated);
    }
    drawAircraft();
  }
  if (ships.status === "fulfilled") {
    state.ships = ships.value.ships || [];
    document.getElementById("shipSource").textContent = `Ships: ${ships.value.source} (${state.ships.length})`;
    drawShips();
  }
  if (state.simActive) recomputeEmergency();
}

function scheduleViewportFlightRefresh(force = false) {
  const key = flightBoundsKey();
  if (!force && key === lastFlightBoundsKey) return;
  clearTimeout(flightRefreshTimer);
  flightRefreshTimer = setTimeout(() => refreshFlightsForCurrentView(key), force ? 0 : 450);
}

async function refreshFlightsForCurrentView(boundsKey = flightBoundsKey()) {
  if (flightRefreshInFlight) {
    pendingFlightRefresh = true;
    return;
  }
  flightRefreshInFlight = true;
  lastFlightBoundsKey = boundsKey;
  try {
    const flightUrl = flightsUrlForCurrentView();
    if (!flightUrl) {
      state.aircraft = [];
      updateFlightSource(currentFlightSource);
      drawAircraft();
      return;
    }
    const flights = await fetch(flightUrl).then((r) => r.json());
    state.aircraft = flights.aircraft || [];
    updateFlightSource(flights.source);
    if (!state.selected && state.aircraft.length) selectAircraft(state.aircraft[0], false);
    if (state.selected) {
      const updated = state.aircraft.find((plane) => plane.id === state.selected.id);
      if (updated) updateSelectedAircraftLive(updated);
    }
    drawAircraft();
    if (state.simActive) recomputeEmergency();
  } catch (error) {
    console.warn("Flight refresh failed", error);
  } finally {
    flightRefreshInFlight = false;
    if (pendingFlightRefresh) {
      pendingFlightRefresh = false;
      scheduleViewportFlightRefresh(true);
    }
  }
}

function updateFlightSource(source) {
  if (source) currentFlightSource = source;
  const visible = visibleAircraft(state.aircraft).length;
  const zoom = currentMapZoom();
  const suffix = zoom < MIN_FLIGHT_VIEW_ZOOM ? "zoom in to load live traffic" : `${visible}/${state.aircraft.length} in view`;
  document.getElementById("flightSource").textContent = `Flights: ${currentFlightSource} (${suffix})`;
}

function flightsUrlForCurrentView() {
  if (currentMapZoom() < MIN_FLIGHT_VIEW_ZOOM) return null;
  const bounds = currentMapBounds(true);
  if (!bounds) return null;
  const west = wrapLon(bounds.west);
  const east = wrapLon(bounds.east);
  const params = new URLSearchParams({
    lamin: bounds.south.toFixed(3),
    lomin: (west <= east ? west : -180).toFixed(3),
    lamax: bounds.north.toFixed(3),
    lomax: (west <= east ? east : 180).toFixed(3)
  });
  return `/api/flights?${params}`;
}

function flightBoundsKey() {
  const bounds = currentMapBounds(true);
  const zoom = currentMapZoom();
  if (!bounds) return "world";
  return [bounds.south, bounds.west, bounds.north, bounds.east, zoom]
    .map((value) => Math.round(value * 10))
    .join(":");
}

function currentMapZoom() {
  if (mapProvider === "google" && googleMap) return googleMap.getZoom() || 3;
  if (map) return map.getZoom();
  return 3;
}

function currentMapBounds(padded = false) {
  let bounds = null;
  if (mapProvider === "google" && googleMap?.getBounds()) {
    const googleBounds = googleMap.getBounds();
    const ne = googleBounds.getNorthEast();
    const sw = googleBounds.getSouthWest();
    bounds = { south: sw.lat(), west: sw.lng(), north: ne.lat(), east: ne.lng() };
  } else if (map) {
    const leafletBounds = map.getBounds();
    bounds = {
      south: leafletBounds.getSouth(),
      west: leafletBounds.getWest(),
      north: leafletBounds.getNorth(),
      east: leafletBounds.getEast()
    };
  }
  if (!bounds || !padded) return bounds;
  const latPad = (bounds.north - bounds.south) * 0.18;
  const lonPad = normalizedLonSpan(bounds.west, bounds.east) * 0.18;
  return {
    south: clamp(bounds.south - latPad, -85, 85),
    west: wrapLon(bounds.west - lonPad),
    north: clamp(bounds.north + latPad, -85, 85),
    east: wrapLon(bounds.east + lonPad)
  };
}

function visibleAircraft(aircraft) {
  const bounds = currentMapBounds(true);
  if (!bounds) return aircraft.filter(hasPlanePosition);
  return aircraft.filter((plane) => hasPlanePosition(plane) && containsWrapped(bounds, plane.lat, plane.lon));
}

function googleAircraftMarker(plane) {
  const marker = new google.maps.Marker({
    map: googleMap,
    position: { lat: plane.lat, lng: plane.lon },
    title: plane.callsign || plane.id,
    icon: googlePlaneIcon(state.selected?.id === plane.id ? "#ffffff" : "#55d6c2", plane.heading || 0)
  });
  marker.addListener("click", () => selectAircraft(plane));
  return marker;
}

function hasPlanePosition(plane) {
  return Number.isFinite(plane?.lat) && Number.isFinite(plane?.lon);
}

function hasGeoPoint(point) {
  return Number.isFinite(point?.lat) && Number.isFinite(point?.lon);
}

function isUsableRoute(route) {
  return Array.isArray(route) && route.length >= 2 && route.every(hasGeoPoint) && Number.isFinite(routeTotalKm(route));
}

function containsWrapped(bounds, lat, lon) {
  if (lat < bounds.south || lat > bounds.north) return false;
  const west = wrapLon(bounds.west);
  const east = wrapLon(bounds.east);
  const wrapped = wrapLon(lon);
  return west <= east ? wrapped >= west && wrapped <= east : wrapped >= west || wrapped <= east;
}

function normalizedLonSpan(west, east) {
  const rawSpan = Math.abs(east - west);
  const span = wrapLon(east) - wrapLon(west);
  const normalized = span >= 0 ? span : span + 360;
  return normalized === 0 && rawSpan > 1 ? Math.min(360, rawSpan) : normalized;
}

function drawAirports() {
  const visibleAirports = airportMarkersForMap();
  if (mapProvider === "google") {
    clearGoogle("airports");
    state.googleOverlays.airports = visibleAirports.map((airport) => new google.maps.Marker({
      map: googleMap,
      position: { lat: airport.lat, lng: airport.lon },
      title: `${airport.name} (${airport.code})`,
      icon: googleSymbol("#ffca6b", "circle", 5)
    }));
    return;
  }
  state.layers.airports.clearLayers();
  visibleAirports.forEach((airport) => {
    L.marker([airport.lat, airport.lon], { icon: divIcon("airport-marker", "A") })
      .bindPopup(`<strong>${airport.name}</strong><br>${airport.code} | runway ${airport.runway} m`)
      .addTo(state.layers.airports);
  });
}

function airportMarkersForMap() {
  const key = new Set();
  const sim = state.flightSim;
  const selected = [
    state.flightPlan?.from,
    state.flightPlan?.to,
    ...(state.flightPlan?.stops || []),
    sim.origin,
    sim.destination,
    ...(sim.refuelStops || []),
    state.airportChoice,
    ...(state.multiEmergency.active ? state.multiEmergency.flights.flatMap((flight) => [flight.origin, flight.sfo]) : []),
    ...(state.multiEmergency.active ? state.multiEmergency.scheduled.map((arrival) => arrival.decision.airport).filter(Boolean) : [])
  ].filter(Boolean);
  return [
    ...selected
  ].filter((airport) => {
    if (!airport?.code || key.has(airport.code)) return false;
    key.add(airport.code);
    return true;
  });
}

function drawAircraft() {
  const multiAircraft = state.multiEmergency.active ? state.multiEmergency.flights.map((flight) => flight.plane).filter(hasPlanePosition) : [];
  const aircraft = state.flightSim.active && state.selected?.id === "REALISTIC-SIM-01"
    ? [state.selected, ...state.aircraft.filter((plane) => plane.id !== "REALISTIC-SIM-01")]
    : [...multiAircraft, ...state.aircraft.filter((plane) => !multiAircraft.some((simPlane) => simPlane.id === plane.id))];
  const visible = visibleAircraft(aircraft);
  if (mapProvider === "google") {
    clearGoogle("aircraft");
    state.googleOverlays.aircraft = visible.slice(0, MAX_VIEWPORT_AIRCRAFT).map((plane) => googleAircraftMarker(plane));
    updateFlightSource(currentFlightSource);
    return;
  }
  
  const svgPlane = `<svg viewBox="-16 -16 32 34" width="16" height="16" style="display:block;"><path d="M 0 -15 L 2 -10 L 3 0 L 15 5 L 15 8 L 3 5 L 2 12 L 6 15 L 6 17 L 0 16 L -6 17 L -6 15 L -2 12 L -3 5 L -15 8 L -15 5 L -3 0 L -2 -10 Z" fill="currentColor"/></svg>`;
  state.layers.aircraft.clearLayers();
  visible.slice(0, MAX_VIEWPORT_AIRCRAFT).forEach((plane) => {
    const selected = state.selected?.id === plane.id;
    L.marker([plane.lat, plane.lon], {
      icon: divIcon(`plane-marker ${selected ? "selected" : ""}`, svgPlane, plane.heading || 0)
    })
      .bindTooltip(plane.callsign || plane.id, { direction: "top", offset: [0, -10] })
      .on("click", () => selectAircraft(plane))
      .addTo(state.layers.aircraft);
  });
  updateFlightSource(currentFlightSource);
}

function drawShips() {
  if (mapProvider === "google") {
    clearGoogle("ships");
    state.googleOverlays.ships = state.ships.map((ship) => new google.maps.Marker({
      map: googleMap,
      position: { lat: ship.lat, lng: ship.lon },
      title: ship.name,
      icon: googleSymbol("#f5a6ff", "ship", 7)
    }));
    return;
  }
  state.layers.ships.clearLayers();
  state.ships.forEach((ship) => {
    L.marker([ship.lat, ship.lon], { icon: divIcon("ship-marker", "▰") })
      .bindPopup(`<strong>${ship.name}</strong><br>${ship.type || "vessel"} | ${ship.speed || 0} kt`)
      .addTo(state.layers.ships);
  });
}

function drawEmergency() {
  if (mapProvider === "google") {
    clearGoogle("emergency");
    drawFlightSimulationOverlaysGoogle();
    drawElevenEmergencyOverlaysGoogle();
    if (!state.selected) return;
    if (state.storm) {
      state.googleOverlays.emergency.push(new google.maps.Circle({
        map: googleMap,
        center: { lat: state.storm.lat, lng: state.storm.lon },
        radius: state.storm.radius * 1000,
        strokeColor: "#ff6670",
        strokeOpacity: 0.85,
        strokeWeight: 2,
        fillColor: "#ff6670",
        fillOpacity: 0.18
      }));
    }
    if (state.route.length) {
      state.googleOverlays.emergency.push(new google.maps.Polyline({
        map: googleMap,
        path: state.route.map(([lng, lat]) => ({ lat, lng })),
        geodesic: true,
        strokeColor: "#78a8ff",
        strokeOpacity: 0.96,
        strokeWeight: 4
      }));
    }
    if (state.waterRoute.length) {
      state.googleOverlays.emergency.push(new google.maps.Polyline({
        map: googleMap,
        path: state.waterRoute.map(([lng, lat]) => ({ lat, lng })),
        geodesic: true,
        strokeColor: "#f5a6ff",
        strokeOpacity: 0.85,
        strokeWeight: 3
      }));
    }
    state.triangulation.forEach((source) => {
      state.googleOverlays.emergency.push(new google.maps.Polyline({
        map: googleMap,
        path: [{ lat: source.lat, lng: source.lon }, { lat: state.selected.lat, lng: state.selected.lon }],
        geodesic: true,
        strokeColor: source.type === "LTE" ? "#55d6c2" : "#ffca6b",
        strokeOpacity: 0.72,
        strokeWeight: 2
      }));
      state.googleOverlays.emergency.push(new google.maps.Marker({
        map: googleMap,
        position: { lat: source.lat, lng: source.lon },
        title: `${source.name}: ${source.confidence}%`,
        icon: googleSymbol(source.type === "LTE" ? "#55d6c2" : "#ffca6b", "circle", 4)
      }));
    });
    return;
  }
  state.layers.emergency.clearLayers();
  drawFlightSimulationOverlaysLeaflet();
  drawElevenEmergencyOverlaysLeaflet();
  if (!state.selected) return;
  if (state.storm) {
    L.circle([state.storm.lat, state.storm.lon], {
      radius: state.storm.radius * 1000,
      color: "#ff6670",
      weight: 2,
      fillColor: "#ff6670",
      fillOpacity: 0.2
    }).bindTooltip("Cyclone cell").addTo(state.layers.emergency);
  }
  if (state.route.length) {
    L.polyline(state.route.map(([lon, lat]) => [lat, lon]), {
      color: "#78a8ff",
      weight: 4,
      opacity: 0.95
    }).bindTooltip("AI emergency route").addTo(state.layers.emergency);
  }
  if (state.waterRoute.length) {
    L.polyline(state.waterRoute.map(([lon, lat]) => [lat, lon]), {
      color: "#f5a6ff",
      weight: 3,
      opacity: 0.9,
      dashArray: "7,8"
    }).bindTooltip("Maritime fallback route").addTo(state.layers.emergency);
  }
  state.triangulation.forEach((source) => {
    L.polyline([[source.lat, source.lon], [state.selected.lat, state.selected.lon]], {
      color: source.type === "LTE" ? "#55d6c2" : "#ffca6b",
      weight: 2,
      opacity: 0.76
    }).bindTooltip(`${source.name}: ${source.confidence}%`).addTo(state.layers.emergency);
    L.marker([source.lat, source.lon], { icon: divIcon("source-marker", source.type === "LTE" ? "C" : "S") })
      .bindTooltip(`${source.name}<br>${Math.round(source.distance)} km | ${source.latency.toFixed(2)} ms`)
      .addTo(state.layers.emergency);
  });
}

function toggleTerrain() {
  terrainEnabled = !terrainEnabled;
  document.getElementById("terrainToggle").classList.toggle("active", terrainEnabled);
  applyTerrainState();
  updateOverlayStatus();
}

function applyTerrainState() {
  if (mapProvider === "google" && googleMap) {
    googleMap.setMapTypeId(terrainEnabled ? google.maps.MapTypeId.TERRAIN : "hybrid");
    return;
  }
  if (!map || !leafletTerrainLayer) return;
  if (terrainEnabled && !map.hasLayer(leafletTerrainLayer)) {
    leafletTerrainLayer.addTo(map);
  } else if (!terrainEnabled && map.hasLayer(leafletTerrainLayer)) {
    map.removeLayer(leafletTerrainLayer);
  }
}

function toggleWeatherLayer(frameOffset) {
  activeRainFrame = activeRainFrame === frameOffset ? "" : frameOffset;
  document.querySelectorAll(".weather-option").forEach((button) => {
    button.classList.toggle("active", button.dataset.rainFrame === activeRainFrame);
  });
  applyWeatherLayer();
  updateOverlayStatus();
}

async function checkWeatherProvider() {
  weatherTileStatus = await fetch("/api/weather/check").then((r) => r.json()).catch((error) => ({
    ok: false,
    message: error.message
  }));
  rainViewerCatalog = await fetch("/api/weather/catalog").then((r) => r.json()).catch(() => null);
  if (activeRainFrame !== "") applyWeatherLayer();
  updateOverlayStatus();
}

function applyWeatherLayer() {
  clearWeatherLayer();
  const frame = getRainViewerFrame(activeRainFrame);
  if (!activeRainFrame || !frame || !rainViewerCatalog?.host) return;
  if (mapProvider === "google" && googleMap) {
    googleWeatherOverlay = new google.maps.ImageMapType({
      getTileUrl: (coord, zoom) => {
        const tileRange = 1 << zoom;
        const x = ((coord.x % tileRange) + tileRange) % tileRange;
        const y = coord.y;
        if (y < 0 || y >= tileRange) return "";
        return `${rainViewerCatalog.host}${frame.path}/256/${zoom}/${x}/${y}/2/1_1.png`;
      },
      tileSize: new google.maps.Size(256, 256),
      minZoom: 0,
      maxZoom: 10,
      opacity: 0.78,
      name: weatherLayerNames[activeRainFrame] || "RainViewer Radar"
    });
    googleMap.overlayMapTypes.insertAt(0, googleWeatherOverlay);
    return;
  }
  if (map) {
    leafletWeatherOverlay = L.tileLayer(`${rainViewerCatalog.host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`, {
      maxZoom: 18,
      maxNativeZoom: 10,
      opacity: 0.78,
      attribution: "&copy; RainViewer"
    }).addTo(map);
  }
}

function getRainViewerFrame(offset) {
  const frames = rainViewerCatalog?.radar?.past || [];
  if (!frames.length || offset === "") return null;
  const numericOffset = Number(offset || 0);
  return frames[Math.max(0, frames.length - 1 - numericOffset)];
}

function clearWeatherLayer() {
  if (googleMap && googleWeatherOverlay) {
    const overlays = googleMap.overlayMapTypes;
    for (let i = overlays.getLength() - 1; i >= 0; i -= 1) {
      if (overlays.getAt(i) === googleWeatherOverlay) overlays.removeAt(i);
    }
    googleWeatherOverlay = null;
  }
  if (map && leafletWeatherOverlay) {
    map.removeLayer(leafletWeatherOverlay);
    leafletWeatherOverlay = null;
  }
}

function updateOverlayStatus() {
  const weatherLabel = activeRainFrame ? weatherLayerNames[activeRainFrame] : "none";
  const weatherStatus = weatherTileStatus && !weatherTileStatus.ok
      ? weatherTileStatus.message
      : `Radar: ${weatherLabel}`;
  const cycloneStatus = state.cycloneSim.active
    ? ` | Japan cyclone ${Math.round(state.cycloneSim.progress * 100)}% @ ${getCycloneSpeed()}x`
    : state.flightSim.cyclone ? " | Pacific cyclone active" : "";
  document.getElementById("overlayStatus").textContent = `Terrain: ${terrainEnabled ? "on" : "off"} | ${weatherStatus}${cycloneStatus}`;
  document.getElementById("mapOverlayBadge").textContent = `${terrainEnabled ? "Terrain" : "Map"}${activeRainFrame ? ` + ${weatherLayerNames[activeRainFrame]}` : ""}${state.cycloneSim.active || state.flightSim.cyclone ? " + Cyclone" : ""}`;
}

function startPacificFlightSimulation() {
  if (!state.flightPlan) {
    const from = state.airportCatalog.find((airport) => airport.code === "HND") || airports.find((airport) => airport.code === "HND");
    const to = state.airportCatalog.find((airport) => airport.code === "SFO") || airports.find((airport) => airport.code === "SFO");
    state.flightPlan = buildFlightPlan(from, to, 85, 220, 12000);
  }
  const plan = state.flightPlan;
  if (!plan.allowed) {
    document.getElementById("preflightStatus").innerHTML = preflightSummary(plan);
    document.getElementById("homePage").classList.remove("hidden");
    return;
  }
  const sim = state.flightSim;
  const now = performance.now();
  const takeoff = new Date();
  const landing = new Date(takeoff.getTime() + plan.flightHours * 60 * 60 * 1000);
  sim.active = true;
  sim.startedAt = now;
  sim.speed = 1;
  sim.progress = 0;
  sim.phase = "takeoff";
  sim.placeCyclone = false;
  sim.ignoredWarning = false;
  sim.aiTakeover = false;
  sim.failureTriggered = false;
  sim.passengers = plan.passengers;
  sim.fuelPercent = plan.fuelPercent;
  sim.initialFuelPercent = plan.fuelPercent;
  sim.cargoKg = plan.cargoKg;
  sim.fuelNeededPercent = plan.fuelNeededPercent;
  sim.legFuel = plan.legFuel;
  sim.refuelStops = plan.stops;
  sim.origin = plan.from;
  sim.destination = plan.to;
  sim.flownPath = [];
  sim.plannedRoute = plan.route;
  sim.currentRoute = [...sim.plannedRoute];
  sim.routeMode = "destination";
  sim.cyclone = null;
  sim.cyclonePlacedAt = 0;
  sim.cycloneMatured = false;
  sim.threatDetected = false;
  sim.routeTransition = null;
  sim.rerouted = false;
  sim.routeStartedAt = now;
  sim.routeDurationMs = sim.durationMs;
  sim.takeoffTime = takeoff.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  sim.eta = landing.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  state.selected = makeFlightSimPlane(sim.currentRoute[0], bearing(plan.from.lat, plan.from.lon, plan.to.lat, plan.to.lon));
  state.aircraft = [state.selected, ...state.aircraft.filter((plane) => plane.id !== state.selected.id)];
  document.getElementById("selectedTitle").textContent = state.selected.callsign;
  document.getElementById("aircraftFacts").innerHTML = [
    ["Route", `${plan.from.code} to ${plan.to.code}`],
    ["Altitude", `${state.selected.altitude || 0} ft`],
    ["Speed", `${state.selected.speed || 0} kt`],
    ["Fuel", `${sim.fuelPercent.toFixed(1)}%`],
    ["Passengers", sim.passengers],
    ["Mode", sim.routeMode]
  ].map(([label, value]) => `<div class="fact"><b>${value}</b><span>${label}</span></div>`).join("");
  state.simActive = false;
  state.storm = null;
  state.route = [];
  state.waterRoute = [];
  state.triangulation = [];
  state.starlink = [];
  state.log = [
    ["Flight initialized", `${plan.from.name} to ${plan.to.name}. ${Math.round(plan.distanceKm).toLocaleString()} km flight plan loaded.`],
    ["Preflight verified", `Fuel ${plan.fuelPercent}% vs highest leg requirement ${plan.fuelNeededPercent.toFixed(1)}%. ${plan.stops.length ? `Refuel stop: ${plan.stops.map((a) => a.code).join(", ")}.` : "Direct flight."}`],
    ["Weather action", "Click Place Cyclone or trigger mechanical/GPS/pilot scenarios during flight."]
  ];
  renderLog();
  renderCalcPanel();
  renderFlightSimStats();
  drawAirports();
  drawAircraft();
  drawEmergency();
  if (mapProvider === "google" && googleMap) {
    googleMap.panTo({ lat: (plan.from.lat + plan.to.lat) / 2, lng: wrapLon((plan.from.lon + plan.to.lon) / 2) });
    googleMap.setZoom(3);
  } else if (map) {
    map.flyTo([(plan.from.lat + plan.to.lat) / 2, wrapLon((plan.from.lon + plan.to.lon) / 2)], 3, { duration: 0.9 });
  }
}

function fastForwardFlightSimulation() {
  if (!state.flightSim.active) startPacificFlightSimulation();
  state.flightSim.speed = state.flightSim.speed >= 32 ? 1 : state.flightSim.speed * 2;
  document.getElementById("fastFlightSim").textContent = `Fast Forward ${state.flightSim.speed}x`;
  renderFlightSimStats();
}

function armFlightCyclonePlacement() {
  if (!state.flightSim.active) startPacificFlightSimulation();
  state.flightSim.placeCyclone = !state.flightSim.placeCyclone;
  document.getElementById("placeCyclone").classList.toggle("active", state.flightSim.placeCyclone);
  state.log.unshift(["Cyclone placement", state.flightSim.placeCyclone ? "Click directly on the flight path to create a severe oceanic cyclone." : "Cyclone placement cancelled."]);
  renderLog();
}

function ignoreCycloneWarning() {
  if (!state.flightSim.active || !state.flightSim.cyclone) return;
  state.flightSim.ignoredWarning = true;
  state.flightSim.routeMode = "ignored-warning";
  state.flightSim.currentRoute = [...state.flightSim.plannedRoute];
  state.route = state.flightSim.currentRoute.map((point) => [point.lon, point.lat]);
  state.log = [
    ["Pilot override", "Cyclone avoidance warning ignored. Aircraft is continuing into the storm cell."],
    ["Risk escalation", "GPS/ATC/visibility loss will trigger if the aircraft penetrates the eyewall."],
    ...state.log.slice(0, 4)
  ];
  renderLog();
  drawEmergency();
}

function authorizeAiTakeover() {
  if (!state.flightSim.active) return;
  state.flightSim.aiTakeover = true;
  state.flightSim.failureTriggered = true;
  state.scenarios.add("gps");
  state.scenarios.add("pilot");
  state.triangulation = buildTriangulation(state.selected);
  state.starlink = buildStarlink(state.selected);
  if (state.flightSim.cyclone) {
    computeFlightEmergencyPlan(true);
    state.flightSim.currentRoute = buildAvoidanceManeuverRoute(state.selected, state.flightSim.currentRoute, state.flightSim.cyclone);
  } else {
    state.flightSim.routeMode = "ai-route-recovery";
    state.flightSim.currentRoute = [{ lat: state.selected.lat, lon: state.selected.lon }, ...state.flightSim.plannedRoute.slice(-3)];
    state.log = [
      ["Agentic AI takeover", "Pilot deviation corrected. AI is returning the aircraft to the filed route with smooth maneuvers."],
      ["Localization", `Starlink/cellular fix confidence ${avg(state.triangulation.map((s) => s.confidence))}%.`],
      ...state.log.slice(0, 3)
    ];
    renderLog();
    renderCalcPanel();
  }
  state.flightSim.routeStartedAt = performance.now();
  state.flightSim.routeDurationMs = routeDurationFor(state.flightSim.currentRoute);
  openGlobe();
}

function triggerMechanicalFailureScenario() {
  if (!state.flightSim.active) startPacificFlightSimulation();
  const sim = state.flightSim;
  const now = performance.now();
  state.scenarios.add("mechanical");
  state.health = buildHealth();
  const plane = state.selected;
  const plan = computeMechanicalFailurePlan(plane, sim);
  if (!plan) return;
  const oldRoute = [...sim.currentRoute];
  const oldProgress = routeProgress(sim, now);
  sim.routeMode = plan.mode;
  sim.currentRoute = smoothEmergencyTurnRoute(plane, plan.route);
  state.airportChoice = plan.airport || null;
  state.shipChoice = plan.ship || null;
  state.route = sim.currentRoute.map((point) => [point.lon, point.lat]);
  state.waterRoute = plan.mode === "mechanical-divert-ship" ? state.route : [];
  state.log = [
    ["Mechanical failure", "Hydraulic/engine fault detected. AI calculated reachable options from current fuel and payload."],
    ["Best route", plan.airport
      ? `${plan.airport.code} selected at ${Math.round(plan.distance)} km. Fuel required ${plan.fuelRequired.toFixed(1)}%, remaining ${sim.fuelPercent.toFixed(1)}%.`
      : `${plan.ship.name} selected at ${Math.round(plan.distance)} km. Fuel required ${plan.fuelRequired.toFixed(1)}%, remaining ${sim.fuelPercent.toFixed(1)}%.`],
    ["Failure consequence", "If the pilot refuses diversion, the aircraft continues until fuel exhaustion."]
  ];
  sim.routeStartedAt = now;
  sim.routeDurationMs = routeDurationFor(sim.currentRoute);
  sim.routeTransition = {
    startedAt: now,
    duration: 3200,
    oldRoute,
    oldProgress
  };
  renderLog();
  renderHealth();
  drawAirports();
  drawEmergency();
}

function computeMechanicalFailurePlan(plane, sim) {
  const rangeKm = Math.max(180, sim.fuelPercent * 68);
  const payloadFactor = state.flightPlan?.payloadFactor || 1.05;
  const airportCandidates = (state.airportCatalog.length ? state.airportCatalog : airports)
    .filter((airport) => airport.code && airport.code !== sim.origin?.code)
    .map((airport) => {
      const route = smoothEmergencyTurnRoute(plane, [{ lat: plane.lat, lon: plane.lon }, { lat: airport.lat, lon: airport.lon }]);
      const distance = routeTotalKm(route);
      const fuelRequired = fuelRequiredForLeg(distance, payloadFactor, 1.1);
      const runway = airport.runway || runwayEstimateClient(airport.type);
      const reachable = distance <= rangeKm && fuelRequired <= sim.fuelPercent;
      const score = (reachable ? 120 : 0) - distance / 12 + runway / 90 + (airport.type === "large_airport" ? 18 : airport.type === "medium_airport" ? 9 : 0);
      return { airport, route, distance, fuelRequired, reachable, score };
    })
    .filter((item) => item.reachable)
    .sort((a, b) => b.score - a.score);
  const ship = nearestShip(plane);
  const shipRoute = ship ? smoothEmergencyTurnRoute(plane, [{ lat: plane.lat, lon: plane.lon }, { lat: ship.lat, lon: ship.lon }]) : [];
  const shipDistance = routeTotalKm(shipRoute);
  const shipFuelRequired = fuelRequiredForLeg(shipDistance, payloadFactor, 1.08);
  const shipPlan = ship && shipDistance <= rangeKm && shipFuelRequired <= sim.fuelPercent
    ? { mode: "mechanical-divert-ship", ship, route: shipRoute, distance: shipDistance, fuelRequired: shipFuelRequired, score: 70 - shipDistance / 14 }
    : null;
  const airportPlan = airportCandidates[0]
    ? { mode: "mechanical-divert-airport", airport: airportCandidates[0].airport, route: airportCandidates[0].route, distance: airportCandidates[0].distance, fuelRequired: airportCandidates[0].fuelRequired, score: airportCandidates[0].score }
    : null;
  if (airportPlan && (!shipPlan || airportPlan.score >= shipPlan.score)) return airportPlan;
  if (shipPlan) return shipPlan;
  const nearestAirport = (state.airportCatalog.length ? state.airportCatalog : airports)
    .map((airport) => ({ ...airport, distance: km(plane.lat, plane.lon, airport.lat, airport.lon) }))
    .sort((a, b) => a.distance - b.distance)[0];
  return nearestAirport
    ? {
        mode: "mechanical-divert-airport",
        airport: nearestAirport,
        route: smoothEmergencyTurnRoute(plane, [{ lat: plane.lat, lon: plane.lon }, { lat: nearestAirport.lat, lon: nearestAirport.lon }]),
        distance: nearestAirport.distance,
        fuelRequired: fuelRequiredForLeg(nearestAirport.distance, payloadFactor, 1.1)
      }
    : null;
}

function triggerGpsAtcCutoffScenario() {
  if (!state.flightSim.active) startPacificFlightSimulation();
  state.scenarios.add("gps");
  state.triangulation = buildTriangulation(state.selected);
  state.starlink = buildStarlink(state.selected);
  state.log = [
    ["GPS/ATC cutoff", "Primary navigation and ATC communication links lost."],
    ["Starlink fallback", "Agentic AI is triangulating position using Starlink constellation and cellular/satellite ranging."],
    ...state.log.slice(0, 3)
  ];
  renderLog();
  renderCalcPanel();
  openGlobe();
}

async function sendSosTelegramAlert() {
  if (!state.flightSim.active) startPacificFlightSimulation();
  ensureSelectedAircraft();
  if (!state.selected) return;
  if (!state.triangulation.length || !state.starlink.length) {
    state.scenarios.add("gps");
    state.triangulation = buildTriangulation(state.selected);
    state.starlink = buildStarlink(state.selected);
    renderCalcPanel();
  }
  const button = document.getElementById("sosTelegram");
  const originalText = button?.textContent || "SOS Telegram";
  if (button) {
    button.disabled = true;
    button.classList.add("active");
    button.textContent = "Sending SOS...";
  }
  const payload = buildSosPayload();
  try {
    const response = await fetch("/api/sos/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || result.message || "Telegram SOS failed");
    state.log = [
      ["SOS transmitted", `Telegram emergency packet sent to ${result.sentTo.join(", ")}. Message id ${result.messageIds.join(", ")}.`],
      ...state.log.slice(0, 5)
    ];
  } catch (error) {
    state.log = [
      ["SOS not sent", `${error.message}. Add TELEGRAM_BOT_TOKEN and chat ids in .env, then restart the server.`],
      ...state.log.slice(0, 5)
    ];
  } finally {
    if (button) {
      button.disabled = false;
      button.classList.remove("active");
      button.textContent = originalText;
    }
    renderLog();
  }
}

function buildSosPayload() {
  const plane = state.selected || {};
  const sim = state.flightSim;
  const nearestAirport = nearestAirportTo(plane);
  const nearestVessel = nearestShip(plane);
  const confidence = state.triangulation.length ? avg(state.triangulation.map((source) => source.confidence)) : 0;
  const cepKm = confidence ? Math.max(3, 38 - confidence / 3) : null;
  const survivalTarget = chooseSosSurvivalTarget(plane, nearestAirport, nearestVessel);
  const blackbox = [
    ...state.log.slice(0, 8).map(([title, body]) => `${title}: ${body}`),
    `Phase: ${sim.phase || "unknown"}`,
    `Route mode: ${sim.routeMode || "unknown"}`,
    `AI takeover: ${sim.aiTakeover ? "authorized" : "not authorized"}`,
    `GPS/ATC: ${state.scenarios.has("gps") ? "cut off/degraded" : "primary available"}`
  ];
  return {
    severity: "MAYDAY SOS",
    recipients: ["ATC", "NAVY", "STARLINK BASE"],
    generatedAt: new Date().toISOString(),
    aircraft: {
      callsign: plane.callsign || plane.id || "UNKNOWN",
      airlineCompany: airlineFromCallsign(plane.callsign || plane.id),
      model: sim.aircraftModel || "Boeing 787-9 Dreamliner demo twin",
      id: plane.id || "unknown",
      source: plane.source || "simulation",
      origin: sim.origin ? `${sim.origin.code} - ${sim.origin.name}` : state.flightPlan?.from ? `${state.flightPlan.from.code} - ${state.flightPlan.from.name}` : "unknown",
      destination: sim.destination ? `${sim.destination.code} - ${sim.destination.name}` : state.flightPlan?.to ? `${state.flightPlan.to.code} - ${state.flightPlan.to.name}` : "unknown",
      altitudeFt: Math.round(plane.altitude || 0),
      speedKt: Math.round(plane.speed || 0),
      headingDeg: Math.round(plane.heading || 0)
    },
    lastKnownLocation: {
      lat: roundCoord(plane.lat),
      lon: roundCoord(plane.lon),
      label: `${roundCoord(plane.lat)}, ${roundCoord(plane.lon)}`
    },
    starlinkTriangulation: {
      lat: roundCoord(plane.lat),
      lon: roundCoord(plane.lon),
      confidencePercent: confidence,
      cepKm,
      activeCluster: nearestClusterLabel(),
      satellites: state.starlink.slice(0, 5).map((sat) => ({
        id: sat.id,
        cluster: sat.cluster + 1,
        beamKm: Math.round(sat.distance),
        latencyMs: Number(sat.latency.toFixed(2)),
        confidencePercent: sat.confidence
      }))
    },
    cellularSatelliteTriangulation: state.triangulation.map((source) => ({
      name: source.name,
      type: source.type,
      distanceKm: Math.round(source.distance),
      latencyMs: Number(source.latency.toFixed(2)),
      confidencePercent: source.confidence
    })),
    fuel: {
      remainingPercent: Number((sim.fuelPercent ?? 0).toFixed(1)),
      initialPercent: Number((sim.initialFuelPercent ?? sim.fuelPercent ?? 0).toFixed(1)),
      estimatedRequiredPercent: Number((sim.fuelNeededPercent ?? 0).toFixed(1)),
      routeMode: sim.routeMode || "unknown"
    },
    payload: {
      passengers: sim.passengers ?? state.flightPlan?.passengers ?? "unknown",
      cargoKg: sim.cargoKg ?? state.flightPlan?.cargoKg ?? "unknown"
    },
    systems: sosSystemStatus(),
    nearestLandOrAirport: nearestAirport ? {
      code: nearestAirport.code,
      name: nearestAirport.name,
      country: nearestAirport.country || "unknown",
      distanceKm: Math.round(nearestAirport.distance),
      runwayM: nearestAirport.runway || runwayEstimateClient(nearestAirport.type)
    } : null,
    nearestShip: nearestVessel ? {
      name: nearestVessel.name,
      type: nearestVessel.type || "vessel",
      distanceKm: Math.round(nearestVessel.distance || km(plane.lat, plane.lon, nearestVessel.lat, nearestVessel.lon)),
      lat: roundCoord(nearestVessel.lat),
      lon: roundCoord(nearestVessel.lon)
    } : null,
    recommendedSurvivalTarget: survivalTarget,
    weatherAndThreats: {
      cyclone: sim.cyclone ? {
        lat: roundCoord(sim.cyclone.lat),
        lon: roundCoord(sim.cyclone.lon),
        windKt: Math.round(sim.cyclone.wind || 0),
        pressureHpa: Math.round(sim.cyclone.pressure || 0),
        radiusKm: Math.round(sim.cyclone.radius || 0)
      } : "none active",
      visibility: state.scenarios.has("gps") ? "lost/degraded under GPS/ATC cutoff scenario" : "normal",
      communications: state.scenarios.has("gps") ? "ATC link cut off; SOS via Starlink/backup channel" : "normal"
    },
    blackboxLog: blackbox
  };
}

function sosSystemStatus() {
  const current = state.health.length ? state.health : buildHealth();
  const gpsCutoff = state.scenarios.has("gps");
  return [
    ...current.map((item) => ({
      name: item.name,
      status: item.warning ? item.status : "working",
      working: !item.warning
    })),
    { name: "GPS", status: gpsCutoff ? "cut off" : "working", working: !gpsCutoff },
    { name: "ATC comms", status: gpsCutoff ? "cut off" : "working", working: !gpsCutoff },
    { name: "Starlink emergency link", status: state.starlink.length ? "working - triangulation active" : "standby", working: Boolean(state.starlink.length) },
    { name: "Agentic AI flight control", status: state.flightSim.aiTakeover ? "active" : "armed", working: true }
  ];
}

function nearestAirportTo(plane) {
  if (!plane || !Number.isFinite(plane.lat) || !Number.isFinite(plane.lon)) return null;
  return (state.airportCatalog.length ? state.airportCatalog : airports)
    .map((airport) => ({ ...airport, distance: km(plane.lat, plane.lon, airport.lat, airport.lon) }))
    .sort((a, b) => a.distance - b.distance)[0] || null;
}

function chooseSosSurvivalTarget(plane, airport, vessel) {
  if (!plane || !airport) return "Awaiting valid aircraft location.";
  const vesselDistance = vessel?.distance ?? (vessel ? km(plane.lat, plane.lon, vessel.lat, vessel.lon) : Infinity);
  const airportFuel = fuelRequiredForLeg(airport.distance, state.flightPlan?.payloadFactor || 1.05, 1.12);
  const remainingFuel = state.flightSim.fuelPercent ?? 0;
  if (airport.distance < 420 || airportFuel <= remainingFuel) {
    return `Nearest viable land option: ${airport.code} ${airport.name}, ${Math.round(airport.distance)} km away.`;
  }
  if (Number.isFinite(vesselDistance)) {
    return `Fuel/range risk. Coordinate maritime intercept near ${vessel.name}, ${Math.round(vesselDistance)} km away.`;
  }
  return `No vessel fix available. Prioritize controlled ditching corridor toward nearest land: ${airport.code}.`;
}

function airlineFromCallsign(callsign) {
  const code = String(callsign || "").toUpperCase();
  const match = [
    ["MAYDAY", "MaydayOS Demo Air"],
    ["JAL", "Japan Airlines"],
    ["ANA", "All Nippon Airways"],
    ["AAL", "American Airlines"],
    ["UAL", "United Airlines"],
    ["DAL", "Delta Air Lines"],
    ["QFA", "Qantas"],
    ["SIA", "Singapore Airlines"],
    ["BA", "British Airways"],
    ["UAE", "Emirates"],
    ["IGO", "IndiGo"],
    ["AI", "Air India"]
  ].find(([prefix]) => code.startsWith(prefix));
  return match?.[1] || "MaydayOS simulated carrier";
}

function roundCoord(value) {
  return Number.isFinite(Number(value)) ? Number(Number(value).toFixed(5)) : null;
}

function triggerPilotDeviationScenario() {
  if (!state.flightSim.active) startPacificFlightSimulation();
  const sim = state.flightSim;
  state.scenarios.add("pilot");
  const plane = state.selected;
  const drift = { lat: plane.lat + 4.2, lon: wrapLon(plane.lon + 7.5) };
  sim.currentRoute = [{ lat: plane.lat, lon: plane.lon }, drift, ...(sim.plannedRoute.slice(-2))];
  sim.routeMode = "pilot-deviation";
  sim.routeStartedAt = performance.now();
  sim.routeDurationMs = routeDurationFor(sim.currentRoute);
  state.log = [
    ["Route deviation", "Aircraft is intentionally drifting away from the filed flight path."],
    ["ATC alert", "Deviation exceeds tolerance. ATC has been notified and is prompting pilot confirmation."],
    ["AI correction", "Authorize Agentic AI Takeover to return with smooth maneuvers to the original route."]
  ];
  renderLog();
  drawEmergency();
}

function startElevenEmergencyScenario() {
  const now = performance.now();
  const sfo = findAirportByCode("SFO") || { code: "SFO", name: "San Francisco International", lat: 37.619, lon: -122.375, runway: 3618 };
  const diversionAirports = ["OAK", "SJC", "SMF", "LAX", "SEA", "PDX", "SAN"]
    .map(findAirportByCode)
    .filter(Boolean);
  const cyclone = { lat: 31.8, lon: -166.2, radius: 720, pressure: 942, wind: 126, eye: 44, intensity: 1.08 };
  const flights = elevenEmergencySeeds().map((seed, index) => {
    const origin = findAirportByCode(seed.origin) || seed;
    const originalDestination = findAirportByCode(seed.dest) || sfo;
    const fuelPercent = seed.fuel;
    const passengers = seed.passengers;
    const cargoKg = seed.cargoKg;
    const base = {
      id: `ELEVEN-${String(index + 1).padStart(2, "0")}`,
      callsign: seed.callsign,
      origin,
      originalDestination,
      sfo,
      fuelPercent,
      passengers,
      cargoKg
    };
    const routeChoices = sidePassCycloneRoutes(
      { lat: origin.lat, lon: origin.lon, heading: seed.heading },
      sfo,
      cyclone
    ).filter(isUsableRoute);
    const fallbackRoute = stormAvoidanceRoute({ lat: origin.lat, lon: origin.lon, heading: seed.heading }, sfo, cyclone);
    const directRoute = smoothFlyableRoute([{ lat: origin.lat, lon: origin.lon }, { lat: sfo.lat, lon: sfo.lon }]);
    const baseRouteToSfo = routeChoices[index % Math.max(1, routeChoices.length)]
      || (isUsableRoute(fallbackRoute) ? fallbackRoute : directRoute);
    const offsetRoute = offsetEmergencyCorridor(baseRouteToSfo, index);
    const routeToSfo = isUsableRoute(offsetRoute) ? offsetRoute : baseRouteToSfo;
    const forcedFuelDivert = ["PAL118", "CES589", "HVN98", "VJC42"].includes(seed.callsign);
    const decisionPoint = pointAlongSpline(routeToSfo, 0.26 + (index % 3) * 0.04) || origin;
    const fuelDivert = forcedFuelDivert ? buildFuelDiversionRoute(origin, decisionPoint, index) : null;
    const activeRoute = fuelDivert?.route || routeToSfo;
    const routeDistance = routeTotalKm(activeRoute);
    const fuelRequired = fuelRequiredForLeg(routeDistance, 1 + (passengers * 95 + cargoKg) / 145000 * 0.18, 1.08);
    const etaMin = Math.round(routeDistance / 14.5);
    const initialProgress = 0;
    const initialPoint = pointAlongSpline(activeRoute, initialProgress) || origin;
    const nextPoint = pointAlongSpline(activeRoute, 0.012) || initialPoint;
    const initialHeading = bearing(initialPoint.lat, initialPoint.lon, nextPoint.lat, nextPoint.lon) || seed.heading;
    return {
      ...base,
      route: activeRoute,
      sfoRoute: routeToSfo,
      routeDistance,
      fuelRequired,
      fuelDivert,
      initialFuelPercent: fuelPercent,
      etaMin,
      progressOffset: -index * 0.025,
      status: forcedFuelDivert ? `fuel divert planned ${fuelDivert?.airport?.code || "ALT"}` : "awaiting takeoff clearance",
      plane: makeMultiEmergencyPlane(base, initialPoint, initialHeading)
    };
  });
  const scheduled = buildScheduledSfoArrivals(flights, diversionAirports);
  state.multiEmergency = {
    active: true,
    startedAt: now,
    speed: 5.5,
    durationMs: 220000,
    cyclone,
    flights,
    scheduled,
    atcPlan: scheduled.map((item) => item.decision),
    atcActivated: false
  };
  state.storm = cyclone;
  state.flightSim.active = false;
  state.log = [
    ["11 Emergency activated", "Eleven long-haul flights from Australia, Philippines, China, Indonesia, and Vietnam are hurricane-threatened over the North Pacific."],
    ["ATC priority", `${flights.filter((f) => !f.fuelDivert).length} emergency flights are sequenced into SFO. ${scheduled.filter((s) => s.decision.type === "hold").length} scheduled arrivals held, ${scheduled.filter((s) => s.decision.type === "divert").length} diverted.`],
    ["Cyclone response", "SFO-capable emergency flights side-pass the cyclone; fuel-critical aircraft turn back or divert to the nearest viable airport."],
    ["Fuel and capacity", `${flights.filter((f) => f.fuelDivert).length}/11 cannot safely continue to SFO and are routed to alternates.`]
  ];
  renderLog();
  renderFlightSimStats();
  drawAirports();
  drawAircraft();
  drawEmergency();
  if (mapProvider === "google" && googleMap) {
    googleMap.panTo({ lat: 7, lng: 142 });
    googleMap.setZoom(3);
  } else if (map) {
    map.flyTo([7, 142], 3, { duration: 0.9 });
  }
}

function elevenEmergencySeeds() {
  return [
    { callsign: "QFA711", origin: "SYD", dest: "JFK", fuel: 91, passengers: 284, cargoKg: 18000, heading: 54 },
    { callsign: "QFA903", origin: "BNE", dest: "MEX", fuel: 87, passengers: 246, cargoKg: 14500, heading: 50 },
    { callsign: "PAL118", origin: "MNL", dest: "LAX", fuel: 83, passengers: 298, cargoKg: 12000, heading: 64 },
    { callsign: "CEB802", origin: "CEB", dest: "SFO", fuel: 79, passengers: 212, cargoKg: 9000, heading: 58 },
    { callsign: "CCA981", origin: "PVG", dest: "JFK", fuel: 88, passengers: 270, cargoKg: 16000, heading: 42 },
    { callsign: "CSN327", origin: "CAN", dest: "LHR", fuel: 82, passengers: 260, cargoKg: 13000, heading: 48 },
    { callsign: "CES589", origin: "XMN", dest: "SEA", fuel: 76, passengers: 238, cargoKg: 11000, heading: 44 },
    { callsign: "GIA880", origin: "CGK", dest: "AMS", fuel: 94, passengers: 301, cargoKg: 19000, heading: 48 },
    { callsign: "BTK51", origin: "DPS", dest: "LAX", fuel: 86, passengers: 221, cargoKg: 8000, heading: 54 },
    { callsign: "HVN98", origin: "SGN", dest: "CDG", fuel: 81, passengers: 252, cargoKg: 10500, heading: 50 },
    { callsign: "VJC42", origin: "DAD", dest: "YVR", fuel: 78, passengers: 207, cargoKg: 7000, heading: 46 }
  ];
}

function buildScheduledSfoArrivals(emergencyFlights, diversionAirports) {
  const baseEta = Math.min(...emergencyFlights.map((flight) => flight.etaMin));
  const sfo = findAirportByCode("SFO") || { code: "SFO", name: "San Francisco International", lat: 37.619, lon: -122.375, runway: 3618 };
  const approaches = [
    { lat: 38.35, lon: -124.85 }, { lat: 37.95, lon: -125.15 }, { lat: 37.55, lon: -125.05 },
    { lat: 37.05, lon: -124.65 }, { lat: 38.75, lon: -123.55 }, { lat: 36.85, lon: -123.35 },
    { lat: 39.05, lon: -122.95 }, { lat: 36.55, lon: -122.95 }, { lat: 38.15, lon: -121.95 },
    { lat: 37.1, lon: -121.75 }
  ];
  const holdCenters = [
    { lat: 37.78, lon: -122.72 }, { lat: 37.54, lon: -122.82 }, { lat: 37.92, lon: -122.25 },
    { lat: 37.36, lon: -122.35 }, { lat: 38.12, lon: -122.58 }, { lat: 37.22, lon: -122.85 }
  ];
  const scheduled = Array.from({ length: 10 }, (_, index) => ({
    callsign: `SFO-SCH-${index + 1}`,
    etaMin: baseEta + index * 2 - 6,
    fuelHoldMin: 18 + (index % 4) * 5
  }));
  const emergencySlots = emergencyFlights
    .map((flight) => flight.etaMin)
    .sort((a, b) => a - b)
    .map((eta, index) => eta + index * 4);
  return scheduled.map((arrival, index) => {
    const conflict = emergencySlots.some((slot) => Math.abs(slot - arrival.etaMin) < 12);
    const holdDelay = 12 + (index % 3) * 5;
    const approachStart = approaches[index];
    const holdCenter = holdCenters[index % holdCenters.length];
    const base = {
      ...arrival,
      conflict,
      progress: 0.38 + index * 0.018,
      initialProgress: 0.38 + index * 0.018,
      approachStart,
      holdCenter,
      sfoRoute: smoothFlyableRoute([approachStart, holdCenter, { lat: sfo.lat, lon: sfo.lon }]),
      route: smoothFlyableRoute([approachStart, holdCenter, { lat: sfo.lat, lon: sfo.lon }]),
      plane: makeScheduledArrivalPlane(arrival, approachStart, bearing(approachStart.lat, approachStart.lon, sfo.lat, sfo.lon))
    };
    if (index < 6 && holdDelay <= arrival.fuelHoldMin + 6) {
      return { ...base, decision: { type: "hold", minutes: holdDelay, detail: `Hold ${holdDelay} min west of SFO while emergency aircraft land first.` } };
    }
    const preferredDiversions = ["LAX", "SAN", "SMF", "SEA"].map(findAirportByCode).filter(Boolean);
    const airport = preferredDiversions[(index - 6) % Math.max(1, preferredDiversions.length)]
      || diversionAirports[index % Math.max(1, diversionAirports.length)]
      || findAirportByCode("LAX");
    const divertRoute = smoothFlyableRoute([approachStart, holdCenter, { lat: airport.lat, lon: airport.lon }]);
    return {
      ...base,
      route: divertRoute,
      decision: { type: "divert", airport, detail: `Temporary diversion to ${airport?.code || "alternate"} to clear SFO for emergency arrivals.` }
    };
  });
}

function buildFuelDiversionRoute(origin, decisionPoint, index) {
  const candidates = ["GUM", "HNL", "HND", "NRT", "KIX", "ANC", "SEA", "YVR"]
    .map(findAirportByCode)
    .filter(Boolean);
  const ranked = candidates
    .map((airport) => ({ airport, distance: km(decisionPoint.lat, decisionPoint.lon, airport.lat, airport.lon) }))
    .sort((a, b) => a.distance - b.distance);
  const airport = ranked[index % Math.min(3, ranked.length || 1)]?.airport || ranked[0]?.airport || findAirportByCode("HNL");
  if (!airport) return null;
  const turnOut = {
    lat: decisionPoint.lat + (airport.lat - decisionPoint.lat) * 0.22 + ((index % 2) ? 1.8 : -1.4),
    lon: wrapLon(decisionPoint.lon + (unwrapLonNear(airport.lon, decisionPoint.lon) - decisionPoint.lon) * 0.22)
  };
  const route = smoothFlyableRoute(dedupeRoute([
    { lat: origin.lat, lon: origin.lon },
    decisionPoint,
    turnOut,
    { lat: airport.lat, lon: airport.lon }
  ]));
  return {
    airport,
    decisionPoint,
    route,
    reason: `Fuel margin below reserve. Nearest viable diversion is ${airport.code}.`
  };
}

function makeMultiEmergencyPlane(flight, point, heading) {
  return {
    id: flight.id,
    callsign: flight.callsign,
    country: "Emergency wave",
    lat: point.lat,
    lon: wrapLon(point.lon),
    altitude: 39000,
    speed: 486,
    heading,
    verticalRate: 0,
    onGround: false,
    source: "11 Emergency simulation"
  };
}

function makeScheduledArrivalPlane(arrival, point, heading) {
  return {
    id: arrival.callsign,
    callsign: arrival.callsign,
    country: "SFO scheduled traffic",
    lat: point.lat,
    lon: wrapLon(point.lon),
    altitude: 28000,
    speed: 315,
    heading,
    verticalRate: -400,
    onGround: false,
    source: "ATC scheduled arrival simulation"
  };
}

function offsetEmergencyCorridor(route, index) {
  if (!route?.length || route.length < 3) return route;
  const magnitude = ((index % 5) - 2) * 0.85 + Math.floor(index / 5) * 0.45;
  const adjusted = route.map((point, pointIndex) => {
    if (pointIndex === 0 || pointIndex === route.length - 1) return point;
    const prev = route[pointIndex - 1];
    const next = route[pointIndex + 1];
    const latVec = next.lat - prev.lat;
    const lonVec = unwrapLonNear(next.lon, prev.lon) - prev.lon;
    const len = Math.hypot(latVec, lonVec) || 1;
    const normalLat = -lonVec / len;
    const normalLon = latVec / len;
    const taper = Math.sin((pointIndex / (route.length - 1)) * Math.PI);
    return {
      lat: point.lat + normalLat * magnitude * taper,
      lon: wrapLon(point.lon + normalLon * magnitude * taper)
    };
  });
  return smoothFlyableRoute(dedupeRoute(adjusted));
}

function findAirportByCode(code) {
  return (state.airportCatalog.length ? state.airportCatalog : airports).find((airport) => airport.code === code)
    || airports.find((airport) => airport.code === code)
    || emergencyAirportFallbacks()[code];
}

function emergencyAirportFallbacks() {
  return {
    BNE: { code: "BNE", name: "Brisbane", lat: -27.384, lon: 153.117, runway: 3560, type: "large_airport" },
    GUM: { code: "GUM", name: "Guam Antonio B. Won Pat", lat: 13.483, lon: 144.797, runway: 3052, type: "large_airport" },
    NRT: { code: "NRT", name: "Tokyo Narita", lat: 35.764, lon: 140.386, runway: 4000, type: "large_airport" },
    KIX: { code: "KIX", name: "Kansai International", lat: 34.434, lon: 135.244, runway: 4000, type: "large_airport" },
    MNL: { code: "MNL", name: "Manila Ninoy Aquino", lat: 14.509, lon: 121.019, runway: 3737, type: "large_airport" },
    CEB: { code: "CEB", name: "Mactan Cebu", lat: 10.307, lon: 123.979, runway: 3300, type: "large_airport" },
    PVG: { code: "PVG", name: "Shanghai Pudong", lat: 31.144, lon: 121.808, runway: 4000, type: "large_airport" },
    CAN: { code: "CAN", name: "Guangzhou Baiyun", lat: 23.392, lon: 113.299, runway: 3800, type: "large_airport" },
    XMN: { code: "XMN", name: "Xiamen Gaoqi", lat: 24.544, lon: 118.128, runway: 3400, type: "large_airport" },
    CGK: { code: "CGK", name: "Jakarta Soekarno-Hatta", lat: -6.126, lon: 106.656, runway: 3660, type: "large_airport" },
    DPS: { code: "DPS", name: "Bali Denpasar", lat: -8.748, lon: 115.167, runway: 3000, type: "large_airport" },
    SGN: { code: "SGN", name: "Ho Chi Minh City", lat: 10.819, lon: 106.652, runway: 3800, type: "large_airport" },
    DAD: { code: "DAD", name: "Da Nang", lat: 16.044, lon: 108.199, runway: 3500, type: "large_airport" },
    OAK: { code: "OAK", name: "Oakland", lat: 37.721, lon: -122.221, runway: 3048, type: "large_airport" },
    SJC: { code: "SJC", name: "San Jose", lat: 37.363, lon: -121.929, runway: 3353, type: "large_airport" },
    SMF: { code: "SMF", name: "Sacramento", lat: 38.695, lon: -121.591, runway: 2621, type: "large_airport" },
    SEA: { code: "SEA", name: "Seattle Tacoma", lat: 47.449, lon: -122.309, runway: 3627, type: "large_airport" },
    PDX: { code: "PDX", name: "Portland", lat: 45.589, lon: -122.597, runway: 3353, type: "large_airport" },
    SAN: { code: "SAN", name: "San Diego", lat: 32.733, lon: -117.193, runway: 2865, type: "large_airport" },
    HNL: { code: "HNL", name: "Honolulu", lat: 21.319, lon: -157.922, runway: 3760, type: "large_airport" },
    ANC: { code: "ANC", name: "Anchorage", lat: 61.174, lon: -149.998, runway: 3531, type: "large_airport" },
    MEX: { code: "MEX", name: "Mexico City", lat: 19.436, lon: -99.072, runway: 3900, type: "large_airport" },
    YVR: { code: "YVR", name: "Vancouver", lat: 49.194, lon: -123.184, runway: 3505, type: "large_airport" }
  };
}

function nearestViableAirport(plane, rangeKm) {
  return (state.airportCatalog.length ? state.airportCatalog : airports)
    .filter((airport) => airport.code && airport.code !== state.flightSim.origin?.code)
    .map((airport) => ({ ...airport, distance: km(plane.lat, plane.lon, airport.lat, airport.lon) }))
    .filter((airport) => airport.distance <= rangeKm || airport.type === "large_airport")
    .sort((a, b) => (a.distance - b.distance) - ((a.runway || 2000) - (b.runway || 2000)) / 100)[0];
}

function handleMapClick(lat, lon) {
  if (!state.flightSim.placeCyclone) return;
  const sim = state.flightSim;
  sim.placeCyclone = false;
  document.getElementById("placeCyclone").classList.remove("active");
  sim.cyclone = {
    lat,
    lon,
    radius: 680,
    pressure: 944,
    wind: 118,
    eye: 42,
    intensity: 0
  };
  sim.cyclonePlacedAt = performance.now();
  sim.cycloneMatured = false;
  sim.threatDetected = false;
  state.storm = sim.cyclone;
  state.cycloneSim.active = false;
  state.log = [
    ["Weather alert", "Cyclone cell forming on the oceanic route. Monitoring development..."],
    ...state.log.slice(0, 4)
  ];
  renderLog();
  renderCycloneSimulation(performance.now());
  drawEmergency();
}

function computeFlightEmergencyPlan(forceDiversion) {
  const sim = state.flightSim;
  const plane = state.selected;
  if (!plane || !sim.cyclone) return;
  const destination = sim.destination || airports.find((airport) => airport.code === "SFO");
  const rangeKm = sim.fuelPercent * 78;
  const options = buildCycloneDecisionOptions(plane, sim, destination, rangeKm);
  const best = options[0];
  if (!best) return;
  const bestAirport = best.airport || null;
  const bestShip = nearestShip(plane);
  state.airportChoice = bestAirport;
  state.shipChoice = best.ship || bestShip;

  if (best.type === "side-pass") {
    sim.routeMode = "cyclone-side-pass";
    sim.currentRoute = best.route;
    state.waterRoute = [];
    state.log = [
      ["Cyclone detected", `Severe storm inserted on the oceanic route. Eye wall wind ${sim.cyclone.wind} kt, pressure ${sim.cyclone.pressure} hPa.`],
      ["Decision", `Sufficient fuel for side-pass evasion. Route clears storm by ${Math.round(best.clearance)} km.`],
      ["Fuel decision", `Required ${Math.round(best.distance)} km, available range ${Math.round(rangeKm)} km. Continuing to ${destination.code}.`],
      ...state.log.slice(0, 4)
    ];
  } else if (best.type === "return-airport" || best.type === "divert-airport") {
    sim.routeMode = best.type;
    sim.currentRoute = best.route;
    state.waterRoute = [];
    state.log = [
      [best.type === "return-airport" ? "Return decision" : "Emergency diversion", `${best.airport.code} selected. Distance ${Math.round(best.distance)} km within available range ${Math.round(rangeKm)} km.`],
      ["Reason", best.reason],
      ["Localization", forceDiversion ? `Starlink plus cell/satellite fix confidence ${avg(state.triangulation.map((s) => s.confidence))}%.` : "Primary navigation remains available."]
    ];
  } else {
    sim.routeMode = "maritime-landing";
    sim.currentRoute = best.route;
    state.waterRoute = best.route.map((point) => [point.lon, point.lat]);
    state.log = [
      ["Maritime fallback", `${best.ship.name} selected at ${Math.round(best.distance)} km. Airport/side-pass options are unsafe or out of range.`],
      ["Impact plan", "AI chooses controlled ditching corridor near vessel support to maximize survivability."],
      ["Localization", forceDiversion ? `Starlink and cell/satellite triangulation active with ${state.starlink.length} LEO beams.` : "Awaiting pilot decision."]
    ];
  }
  state.route = sim.currentRoute.map((point) => [point.lon, point.lat]);
  state.triangulation = forceDiversion ? buildTriangulation(plane) : state.triangulation;
  renderLog();
  renderCalcPanel();
  drawAirports();
  drawEmergency();
}

function buildCycloneDecisionOptions(plane, sim, destination, rangeKm) {
  const storm = sim.cyclone;
  const keepout = stormKeepoutRadiusKm(storm);
  const options = [];
  const sideRoutes = sidePassCycloneRoutes(plane, destination, storm);
  sideRoutes.forEach((route, index) => {
    const distance = routeTotalKm(route);
    const clearance = routeStormClearanceKm(route, storm);
    if (distance <= rangeKm && clearance > keepout) {
      options.push({
        type: "side-pass",
        route,
        distance,
        clearance,
        score: 118 - distance / Math.max(rangeKm, 1) * 45 + (clearance - keepout) / 12 - index * 2,
        reason: "Evasion path keeps destination reachable while avoiding storm core."
      });
    }
  });

  const origin = sim.origin;
  if (origin) {
    const route = sidePassCycloneRoutes(plane, origin, storm, true)[0] || stormAvoidanceRoute(plane, origin, storm);
    const distance = routeTotalKm(route);
    const clearance = routeStormClearanceKm(route, storm);
    if (distance <= rangeKm && clearance > keepout * 0.9) {
      options.push({
        type: "return-airport",
        airport: origin,
        route,
        distance,
        clearance,
        score: 104 - distance / Math.max(rangeKm, 1) * 38 + (origin.runway || 3000) / 190,
        reason: "Returning back is safer than entering or crossing the cyclone corridor."
      });
    }
  }

  const airportPool = (state.airportCatalog.length ? state.airportCatalog : airports)
    .filter((airport) => ["large_airport", "medium_airport", undefined].includes(airport.type) && airport.code !== sim.origin?.code)
    .map((airport) => ({ ...airport, directDistance: km(plane.lat, plane.lon, airport.lat, airport.lon) }))
    .sort((a, b) => a.directDistance - b.directDistance)
    .slice(0, 90);
  airportPool.forEach((airport) => {
    const route = stormAvoidanceRoute(plane, { lat: airport.lat, lon: airport.lon }, storm);
    const distance = routeTotalKm(route);
    const clearance = routeStormClearanceKm(route, storm);
    if (distance <= rangeKm && clearance > keepout * 0.82) {
      options.push({
        type: "divert-airport",
        airport,
        route,
        distance,
        clearance,
        score: 95 - distance / Math.max(rangeKm, 1) * 48 + (airport.runway || 2200) / 120 + clamp((clearance - keepout) / 250, 0, 1) * 14,
        reason: "Destination evasion is less favorable; airport diversion has the best survivability margin."
      });
    }
  });

  const ship = nearestShip(plane);
  if (ship) {
    const route = stormAvoidanceRoute(plane, { lat: ship.lat, lon: ship.lon }, storm);
    const distance = routeTotalKm(route);
    const clearance = routeStormClearanceKm(route, storm);
    if (distance <= rangeKm && clearance > keepout * 0.7) {
      options.push({
        type: "ship",
        ship,
        route,
        distance,
        clearance,
        score: 72 - distance / Math.max(rangeKm, 1) * 42,
        reason: "Vessel support is reachable when airport/diversion options are weaker."
      });
    }
  }
  return options.sort((a, b) => b.score - a.score);
}

function sidePassCycloneRoutes(plane, target, storm, preferBacktrack = false) {
  const start = { lat: plane.lat, lon: plane.lon };
  const end = { lat: target.lat, lon: target.lon };
  const projection = localStormProjection(storm);
  const s = projection.toXY(start);
  const e = projection.toXY(end);
  const radius = stormKeepoutRadiusKm(storm) + cruiseTurnRadiusKm(488, CRUISE_TURN_BANK_DEG) + 90;
  const base = normalizeXY({ x: e.x - s.x, y: e.y - s.y }) || { x: 1, y: 0 };
  const perp = { x: -base.y, y: base.x };
  return [-1, 1].map((side) => {
    const sidePerp = { x: perp.x * side, y: perp.y * side };
    const stormXY = { x: 0, y: 0 };
    const before = {
      x: stormXY.x - base.x * radius * (preferBacktrack ? 1.15 : 1.45) + sidePerp.x * radius * 0.72,
      y: stormXY.y - base.y * radius * (preferBacktrack ? 1.15 : 1.45) + sidePerp.y * radius * 0.72
    };
    const abeam1 = {
      x: stormXY.x + sidePerp.x * radius * 1.12,
      y: stormXY.y + sidePerp.y * radius * 1.12
    };
    const after = {
      x: stormXY.x + base.x * radius * 1.45 + sidePerp.x * radius * 0.72,
      y: stormXY.y + base.y * radius * 1.45 + sidePerp.y * radius * 0.72
    };
    return smoothFlyableRoute(dedupeRoute([
      start,
      projection.toLatLon(before),
      projection.toLatLon(abeam1),
      projection.toLatLon(after),
      end
    ]));
  }).sort((a, b) => routeTotalKm(a) - routeTotalKm(b));
}

function toggleJapanCycloneSimulation() {
  const now = performance.now();
  if (state.cycloneSim.active) {
    state.cycloneSim.active = false;
    state.cycloneSim.progress = 0;
    if (cycloneCtx && cycloneCanvas) cycloneCtx.clearRect(0, 0, cycloneCanvas.clientWidth, cycloneCanvas.clientHeight);
    if (!state.simActive) {
      state.storm = null;
      drawEmergency();
    }
    updateCycloneControls();
    updateOverlayStatus();
    return;
  }
  state.cycloneSim.active = true;
  state.cycloneSim.startedAt = now;
  state.cycloneSim.progress = 0;
  focusJapanCyclone();
  updateCycloneControls();
  renderCycloneSimulation(now);
  updateOverlayStatus();
}

function adjustCycloneSpeed(direction) {
  const now = performance.now();
  const currentProgress = getCycloneProgress(now);
  state.cycloneSim.speedIndex = Math.max(0, Math.min(cycloneSpeedLevels.length - 1, state.cycloneSim.speedIndex + direction));
  state.cycloneSim.startedAt = now - (currentProgress * state.cycloneSim.durationMs) / getCycloneSpeed();
  state.cycloneSim.progress = currentProgress;
  updateCycloneControls();
  updateOverlayStatus();
}

function updateCycloneControls() {
  document.getElementById("cycloneReplay")?.classList.toggle("active", state.cycloneSim.active);
  const label = document.getElementById("cycloneSpeedLabel");
  if (label) label.textContent = `${getCycloneSpeed()}x`;
}

function getCycloneSpeed() {
  return cycloneSpeedLevels[state.cycloneSim.speedIndex] || 1;
}

function focusJapanCyclone() {
  const center = { lat: 31.8, lng: 139.8 };
  if (mapProvider === "google" && googleMap) {
    googleMap.panTo(center);
    googleMap.setZoom(Math.max(googleMap.getZoom() || 4, 5));
    return;
  }
  if (map) map.flyTo([center.lat, center.lng], Math.max(map.getZoom(), 5), { duration: 0.9 });
}

function getCycloneProgress(now) {
  if (!state.cycloneSim.active) return state.cycloneSim.progress || 0;
  return Math.min(1, ((now - state.cycloneSim.startedAt) * getCycloneSpeed()) / state.cycloneSim.durationMs);
}

function renderCycloneSimulation(now) {
  if (!cycloneCtx || !cycloneCanvas) return;
  const width = cycloneCanvas.clientWidth;
  const height = cycloneCanvas.clientHeight;
  cycloneCtx.clearRect(0, 0, width, height);
  let rendered = false;
  if (state.cycloneSim.active) {
    const progress = getCycloneProgress(now);
    state.cycloneSim.progress = progress;
    const storm = interpolateCyclone(progress);
    drawCycloneField(storm, now, progress);
    state.storm = { lat: storm.lat, lon: storm.lon, radius: storm.radius };
    rendered = true;
  }
  if (state.flightSim.active && state.flightSim.cyclone) {
    drawCycloneField(state.flightSim.cyclone, now, 1);
    state.storm = state.flightSim.cyclone;
    rendered = true;
  }
  if (state.multiEmergency.active && state.multiEmergency.cyclone) {
    drawCycloneField(state.multiEmergency.cyclone, now, 1);
    state.storm = state.multiEmergency.cyclone;
    rendered = true;
  }
  if (!rendered) return;
  if (state.simActive && now - (state.cycloneSim.lastRouteSync || 0) > 900) {
    state.cycloneSim.lastRouteSync = now;
    recomputeEmergency();
  }
  updateOverlayStatus();
}

function interpolateCyclone(progress) {
  const clamped = Math.max(0, Math.min(1, progress));
  const nextIndex = japanCycloneTrack.findIndex((point) => point.t >= clamped);
  const next = japanCycloneTrack[Math.max(1, nextIndex === -1 ? japanCycloneTrack.length - 1 : nextIndex)];
  const prev = japanCycloneTrack[japanCycloneTrack.indexOf(next) - 1] || japanCycloneTrack[0];
  const local = (clamped - prev.t) / Math.max(0.001, next.t - prev.t);
  const ease = local * local * (3 - 2 * local);
  const mix = (a, b) => a + (b - a) * ease;
  return {
    lat: mix(prev.lat, next.lat),
    lon: mix(prev.lon, next.lon),
    pressure: mix(prev.pressure, next.pressure),
    wind: mix(prev.wind, next.wind),
    radius: mix(prev.radius, next.radius) * (0.34 + clamped * 0.66),
    eye: mix(prev.eye, next.eye),
    intensity: Math.min(1, 0.22 + clamped * 1.15)
  };
}

function drawCycloneField(storm, now, progress) {
  const center = projectLatLng(storm.lat, storm.lon);
  if (!center) return;
  const displayRadiusKm = storm.radius * 1.45 + 150;
  const north = projectLatLng(storm.lat + displayRadiusKm / 111, storm.lon);
  const pixelRadius = north ? Math.abs(north.y - center.y) : storm.radius * 2;
  if (pixelRadius < 8) return;

  cycloneCtx.save();
  cycloneCtx.globalCompositeOperation = "source-over";
  drawCycloneOuterShield(center, pixelRadius, storm, now, progress);
  drawCycloneRadarCore(center, pixelRadius, storm, now, progress);
  cycloneCtx.globalCompositeOperation = "lighter";
  for (let band = 0; band < 4; band += 1) drawCycloneFeederBand(center, pixelRadius, storm, band, now, progress);
  drawCycloneEye(center, pixelRadius, storm, progress);
  cycloneCtx.restore();
}

function drawCycloneOuterShield(center, radius, storm, now, progress) {
  const shieldRadius = radius * (0.78 + progress * 0.22);
  const gradient = cycloneCtx.createRadialGradient(center.x, center.y, radius * 0.12, center.x, center.y, shieldRadius * 1.12);
  gradient.addColorStop(0, `rgba(238,242,229,${0.28 * storm.intensity})`);
  gradient.addColorStop(0.34, `rgba(185,195,188,${0.18 * storm.intensity})`);
  gradient.addColorStop(0.62, `rgba(118,132,139,${0.11 * storm.intensity})`);
  gradient.addColorStop(1, "rgba(58,70,76,0)");
  cycloneCtx.fillStyle = gradient;
  cycloneCtx.beginPath();
  cycloneCtx.arc(center.x, center.y, shieldRadius, 0, Math.PI * 2);
  cycloneCtx.fill();

  cycloneCtx.globalAlpha = 0.35 * storm.intensity;
  cycloneCtx.strokeStyle = "rgba(230,235,222,0.24)";
  cycloneCtx.lineCap = "round";
  for (let band = 0; band < 18; band += 1) {
    cycloneCtx.beginPath();
    const offset = band * 0.36 + now / 16000;
    for (let i = 0; i <= 90; i += 1) {
      const u = i / 90;
      const r = radius * (0.16 + u * 0.88);
      const angle = offset - u * 4.6 + Math.sin(u * 8 + band) * 0.18;
      const x = center.x + Math.cos(angle) * r;
      const y = center.y + Math.sin(angle) * r * 0.78;
      i === 0 ? cycloneCtx.moveTo(x, y) : cycloneCtx.lineTo(x, y);
    }
    cycloneCtx.lineWidth = Math.max(1, radius * (0.004 + band * 0.00025));
    cycloneCtx.stroke();
  }
  cycloneCtx.globalAlpha = 1;
}

function drawCycloneRadarCore(center, radius, storm, now, progress) {
  const step = Math.max(3, Math.min(7, Math.round(radius / 58)));
  const phase = now / 9200;
  const formation = Math.min(1, progress * 2.2);
  for (let y = -radius; y <= radius; y += step) {
    for (let x = -radius; x <= radius; x += step) {
      const nx = x / radius;
      const ny = y / (radius * 0.78);
      const r = Math.hypot(nx, ny);
      if (r > 1.03 || r < 0.055) continue;
      const theta = Math.atan2(ny, nx);
      const spiral = Math.sin(theta * 2.2 + r * 13.4 - phase * 1.7);
      const secondary = Math.sin(theta * 4.1 + r * 22.0 + phase * 0.55);
      const cellular = pseudoNoise(center.x + x * 0.18, center.y + y * 0.18, now * 0.00008);
      const eyewall = Math.exp(-Math.pow((r - 0.205) / 0.075, 2));
      const innerBand = Math.max(0, spiral) * Math.exp(-Math.pow((r - 0.38) / 0.19, 2));
      const outerBand = Math.max(0, secondary) * Math.exp(-Math.pow((r - 0.68) / 0.24, 2));
      const drySlot = Math.max(0, Math.sin(theta - 1.1 + r * 4.5)) * Math.exp(-Math.pow((r - 0.28) / 0.16, 2));
      let intensity = eyewall * 1.18 + innerBand * 0.74 + outerBand * 0.42 + cellular * 0.18 - drySlot * 0.38;
      intensity *= storm.intensity * formation * Math.max(0, 1.08 - r * 0.42);
      if (intensity < 0.09) continue;
      const color = radarColor(intensity);
      const alpha = Math.min(0.86, 0.16 + intensity * 0.72);
      cycloneCtx.fillStyle = `rgba(${color[0]},${color[1]},${color[2]},${alpha})`;
      cycloneCtx.fillRect(center.x + x, center.y + y, step + 0.9, step + 0.9);
    }
  }
}

function drawCycloneFeederBand(center, radius, storm, band, now, progress) {
  const baseAngle = band * 1.38 - now / 7600 + progress * 2.4;
  cycloneCtx.lineCap = "round";
  cycloneCtx.lineJoin = "round";
  for (let pass = 0; pass < 2; pass += 1) {
    cycloneCtx.beginPath();
    for (let i = 0; i <= 130; i += 1) {
      const u = i / 130;
      const r = radius * (0.22 + u * (0.72 - band * 0.035));
      const angle = baseAngle - u * (4.6 + band * 0.45) + Math.sin(u * 12 + band) * 0.13;
      const x = center.x + Math.cos(angle) * r;
      const y = center.y + Math.sin(angle) * r * 0.78;
      i === 0 ? cycloneCtx.moveTo(x, y) : cycloneCtx.lineTo(x, y);
    }
    cycloneCtx.strokeStyle = pass === 0
      ? `rgba(245,249,228,${0.16 * storm.intensity * Math.min(1, progress * 2)})`
      : `rgba(58,148,255,${0.13 * storm.intensity * Math.min(1, progress * 2)})`;
    cycloneCtx.lineWidth = Math.max(2, radius * (0.026 - pass * 0.011));
    cycloneCtx.stroke();
  }
}

function drawCycloneEye(center, radius, storm, progress) {
  const eyeRadius = Math.max(7, radius * (0.04 + storm.eye / 2600));
  cycloneCtx.globalCompositeOperation = "source-over";
  const clear = cycloneCtx.createRadialGradient(center.x, center.y, eyeRadius * 0.2, center.x, center.y, eyeRadius * 2.25);
  clear.addColorStop(0, "rgba(2, 8, 10, 0.86)");
  clear.addColorStop(0.48, "rgba(9, 20, 24, 0.66)");
  clear.addColorStop(1, "rgba(9, 20, 24, 0)");
  cycloneCtx.fillStyle = clear;
  cycloneCtx.beginPath();
  cycloneCtx.arc(center.x, center.y, eyeRadius * 2.25, 0, Math.PI * 2);
  cycloneCtx.fill();
  cycloneCtx.strokeStyle = `rgba(255,245,208,${0.78 * Math.min(1, progress * 2)})`;
  cycloneCtx.lineWidth = Math.max(2, radius * 0.014);
  cycloneCtx.beginPath();
  cycloneCtx.arc(center.x, center.y, eyeRadius * 1.25, 0, Math.PI * 2);
  cycloneCtx.stroke();
}

function radarColor(value) {
  const v = Math.max(0, Math.min(1.35, value));
  if (v < 0.22) return [26, 93, 215];
  if (v < 0.42) return [27, 187, 245];
  if (v < 0.66) return [69, 235, 89];
  if (v < 0.9) return [241, 238, 54];
  if (v < 1.12) return [255, 139, 28];
  return [241, 41, 35];
}

function pseudoNoise(x, y, z = 0) {
  const n = Math.sin(x * 12.9898 + y * 78.233 + z * 437.12) * 43758.5453;
  return n - Math.floor(n);
}

function projectLatLng(lat, lon) {
  if (mapProvider === "google" && googleProjectionOverlay?.getProjection()) {
    const projection = googleProjectionOverlay.getProjection();
    const latLng = new google.maps.LatLng(lat, lon);
    const point = projection.fromLatLngToContainerPixel
      ? projection.fromLatLngToContainerPixel(latLng)
      : projection.fromLatLngToDivPixel(latLng);
    return point ? { x: point.x, y: point.y } : null;
  }
  if (map) {
    const point = map.latLngToContainerPoint([lat, lon]);
    return { x: point.x, y: point.y };
  }
  return null;
}

function selectAircraft(plane, pan = true) {
  state.selected = plane;
  document.getElementById("selectedTitle").textContent = plane.callsign || plane.id;
  document.getElementById("aircraftFacts").innerHTML = [
    ["ICAO", plane.id], ["Country", plane.country || "Unknown"],
    ["Altitude", `${plane.altitude || 0} ft`], ["Speed", `${plane.speed || 0} kt`],
    ["Heading", `${plane.heading || 0} deg`], ["Source", plane.source || "ADS-B"]
  ].map(([label, value]) => `<div class="fact"><b>${value}</b><span>${label}</span></div>`).join("");
  if (pan && mapProvider === "google" && googleMap) {
    googleMap.panTo({ lat: plane.lat, lng: plane.lon });
    googleMap.setZoom(Math.max(googleMap.getZoom() || 4, 5));
  } else if (pan && map) {
    map.flyTo([plane.lat, plane.lon], Math.max(map.getZoom(), 5), { duration: 0.85 });
  }
  drawAircraft();
  if (state.simActive) recomputeEmergency();
}

function updateSelectedAircraftLive(updated) {
  const previous = state.selected;
  state.selected = { ...previous, ...updated };
  document.getElementById("aircraftFacts").innerHTML = [
    ["ICAO", state.selected.id], ["Country", state.selected.country || "Unknown"],
    ["Altitude", `${state.selected.altitude || 0} ft`], ["Speed", `${state.selected.speed || 0} kt`],
    ["Heading", `${state.selected.heading || 0} deg`], ["Source", state.selected.source || "ADS-B"]
  ].map(([label, value]) => `<div class="fact"><b>${value}</b><span>${label}</span></div>`).join("");
  if (state.simActive) {
    recomputeEmergency();
  }
  updateAircraftEntityPosition();
}

function bindAction(element, handler) {
  element.addEventListener("mousedown", handler);
  element.addEventListener("touchstart", handler, { passive: false });
  element.addEventListener("click", handler);
  element.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") handler(event);
  });
}

function startEmergencySimulation(event) {
  event?.preventDefault();
  ensureSelectedAircraft();
  if (!state.selected) return;
  state.simActive = true;
  state.startedAt = performance.now();
  state.storm = state.scenarios.has("cyclone")
    ? { lat: state.selected.lat + 2.1, lon: state.selected.lon + 3.4, radius: 720 }
    : null;
  recomputeEmergency();
  if (mapProvider === "google" && googleMap) {
    googleMap.panTo({ lat: state.selected.lat, lng: state.selected.lon });
    googleMap.setZoom(Math.max(googleMap.getZoom() || 4, 5));
  } else {
    map.flyTo([state.selected.lat, state.selected.lon], Math.max(map.getZoom(), 5), { duration: 0.9 });
  }
}

function resetSimulation() {
  state.simActive = false;
  state.flightSim.active = false;
  state.multiEmergency.active = false;
  state.multiEmergency.flights = [];
  state.multiEmergency.scheduled = [];
  state.multiEmergency.cyclone = null;
  state.flightSim.placeCyclone = false;
  state.flightSim.cyclone = null;
  state.flightSim.cyclonePlacedAt = 0;
  state.flightSim.cycloneMatured = false;
  state.flightSim.threatDetected = false;
  state.flightSim.routeTransition = null;
  state.flightSim.routeStartedAt = 0;
  state.flightSim.routeDurationMs = state.flightSim.durationMs;
  state.flightSim.flownPath = [];
  state.flightSim.currentRoute = [];
  state.flightSim.plannedRoute = [];
  state.storm = null;
  state.route = [];
  state.waterRoute = [];
  state.airportChoice = null;
  state.shipChoice = null;
  state.triangulation = [];
  state.starlink = [];
  state.log = [];
  state.health = [];
  state.cycloneSim.active = false;
  state.cycloneSim.progress = 0;
  if (cycloneCtx && cycloneCanvas) cycloneCtx.clearRect(0, 0, cycloneCanvas.clientWidth, cycloneCanvas.clientHeight);
  updateCycloneControls();
  renderFlightSimStats();
  document.getElementById("fastFlightSim").textContent = "Fast Forward";
  document.getElementById("placeCyclone").classList.remove("active");
  state.layers.emergency.clearLayers();
  state.layers.airports.clearLayers();
  clearGoogle("emergency");
  clearGoogle("airports");
  renderLog();
  renderCalcPanel();
  renderHealth();
}

function recomputeEmergency() {
  const plane = state.selected;
  const failurePenalty = state.scenarios.has("mechanical") ? 0.72 : 1;
  const fuelMinutes = Math.round(52 * failurePenalty);
  const rangeKm = fuelMinutes * 13.2;
  const candidates = airports.map((airport) => {
    const distance = km(plane.lat, plane.lon, airport.lat, airport.lon);
    const stormRisk = state.storm ? Math.max(0, 1 - kmToStormLine(plane, airport) / state.storm.radius) : 0;
    const runwayScore = Math.min(1, airport.runway / 3900);
    const fuelScore = Math.max(0, 1 - distance / rangeKm);
    const feasibilityPenalty = distance > rangeKm ? 55 : 0;
    const proximityScore = Math.max(0, 1 - distance / 2400);
    const score = Math.round((fuelScore * 55 + proximityScore * 20 + runwayScore * 15 + (1 - stormRisk) * 10) - feasibilityPenalty);
    return { ...airport, distance, stormRisk, score };
  }).sort((a, b) => b.score - a.score);
  state.airportChoice = candidates[0];
  state.shipChoice = nearestShip(plane);
  state.route = state.airportChoice
    ? stormAvoidanceRoute(plane, state.airportChoice, state.storm).map((point) => [point.lon, point.lat])
    : [];
  state.waterRoute = state.shipChoice ? [[plane.lon, plane.lat], [state.shipChoice.lon, state.shipChoice.lat]] : [];
  state.triangulation = buildTriangulation(plane);
  state.starlink = buildStarlink(plane);
  state.health = buildHealth();
  state.log = [
    ["Emergency declared", scenarioLabel()],
    ["GPS/ATC status", state.scenarios.has("gps") ? "GPS and ATC links degraded. Switching to cellular/satellite ranging." : "Primary navigation available, backup localization armed."],
    ["Localization", `Cellular/satellite fix confidence ${avg(state.triangulation.map((s) => s.confidence))}%. Starlink fallback prepared with ${state.starlink.length} satellite beams.`],
    ["Airport selection", `${state.airportChoice.code} selected. Distance ${Math.round(state.airportChoice.distance)} km, runway ${state.airportChoice.runway} m, suitability ${state.airportChoice.score}/100.`],
    ["Maritime fallback", `${state.shipChoice.name} is nearest water-landing support at ${Math.round(km(plane.lat, plane.lon, state.shipChoice.lat, state.shipChoice.lon))} km.`],
    ["Autonomous assist", state.scenarios.has("pilot") ? "Pilot failure active. AI checklist is controlling emergency navigation recommendations." : "Pilot remains in command with AI recommendations."]
  ];
  renderLog();
  renderCalcPanel();
  renderHealth();
  drawShips();
  drawEmergency();
}

function buildHealth() {
  return systems.map(([name, status]) => {
    if (!state.scenarios.has("mechanical")) return { name, status, warning: false };
    const failed = ["Engine 2", "Hydraulics", "Avionics"].includes(name);
    return { name, status: failed ? (name === "Engine 2" ? "Thrust loss" : "Attention") : status, warning: failed };
  });
}

function buildTriangulation(plane) {
  const sources = [
    ["Cell Tower A", plane.lat + 1.4, plane.lon - 2.2, "LTE"],
    ["Cell Tower B", plane.lat - 1.1, plane.lon + 2.8, "LTE"],
    ["LEO Sat 19", plane.lat + 4.2, plane.lon + 0.8, "satellite"],
    ["Relay Sat 42", plane.lat - 3.2, plane.lon - 3.7, "satellite"]
  ];
  return sources.map(([name, lat, lon, type], index) => {
    const distance = km(plane.lat, plane.lon, lat, lon);
    const latency = type === "LTE" ? distance / 200 : distance / 295;
    const confidence = Math.round(Math.max(48, 96 - distance / 38 - index * 3));
    return { name, lat, lon, type, distance, latency, confidence };
  });
}

function buildStarlink(plane) {
  return buildStarlinkConstellation(plane).visible;
}

function buildStarlinkConstellation(plane) {
  const clusters = Array.from({ length: 10 }, (_, clusterIndex) => {
    const inclination = [-87, -72, -53, -43, -23, 23, 43, 53, 72, 87][clusterIndex];
    const phase = (clusterIndex / 10) * Math.PI * 2;
    const raan = (clusterIndex / 10) * Math.PI * 2;
    const satelliteCount = 20;
    const satellites = Array.from({ length: satelliteCount }, (_, satIndex) => {
      const angle = phase + (satIndex / satelliteCount) * Math.PI * 2;
      const geo = orbitGeo({ inclination, raan }, angle);
      return {
        id: `SL-${clusterIndex + 1}-${String(satIndex + 1).padStart(2, "0")}`,
        cluster: clusterIndex,
        satIndex,
        inclination,
        raan,
        phase,
        baseAngle: angle,
        lat: geo.lat,
        lon: geo.lon,
        altitude: 780000 + (clusterIndex % 3) * 45000
      };
    });
    const nearestDistance = Math.min(...satellites.map((sat) => km(plane.lat, plane.lon, sat.lat, sat.lon)));
    const altitude = 780000 + (clusterIndex % 3) * 45000;
    const angularSpeed = 0.012 + clusterIndex * 0.00065;
    const path = buildOrbitCartesianPath({ inclination, raan, altitude });
    return { id: `Cluster ${clusterIndex + 1}`, clusterIndex, inclination, raan, phase, altitude, angularSpeed, path, satellites, nearestDistance };
  });
  const nearest = [...clusters].sort((a, b) => a.nearestDistance - b.nearestDistance)[0];
  const visible = nearest.satellites
    .map((sat) => enrichStarlinkSatellite(sat, plane))
    .sort((a, b) => a.distance - b.distance || b.confidence - a.confidence)
    .slice(0, 5);
  state.starlinkClusters = clusters;
  state.starlink = visible;
  return { clusters, nearest, visible };
}

function enrichStarlinkSatellite(sat, plane) {
  const surfaceDistance = km(plane.lat, plane.lon, sat.lat, sat.lon);
  const altitudeKm = sat.altitude / 1000;
  const slantDistance = Math.sqrt(surfaceDistance ** 2 + altitudeKm ** 2);
  const visualPenalty = Math.abs(surfaceDistance - 950) / 80;
  return {
    ...sat,
    distance: slantDistance,
    latency: slantDistance / 299.792,
    confidence: Math.round(clamp(98 - surfaceDistance / 120 - visualPenalty, 55, 97))
  };
}

function orbitLat(cluster, angle) {
  return orbitGeo(cluster, angle).lat;
}

function orbitLon(cluster, angle) {
  return orbitGeo(cluster, angle).lon;
}

function buildOrbitCartesianPath(cluster) {
  const points = [];
  for (let i = 0; i <= 240; i += 1) {
    points.push(orbitCartesian(cluster, (i / 240) * Math.PI * 2));
  }
  return points;
}

function orbitCartesian(cluster, angle) {
  const radius = EARTH_RADIUS_M + cluster.altitude;
  const inclination = Cesium.Math.toRadians(cluster.inclination);
  const raan = cluster.raan;
  const xOrb = radius * Math.cos(angle);
  const yOrb = radius * Math.sin(angle);
  const xInc = xOrb;
  const yInc = yOrb * Math.cos(inclination);
  const zInc = yOrb * Math.sin(inclination);
  const x = xInc * Math.cos(raan) - yInc * Math.sin(raan);
  const y = xInc * Math.sin(raan) + yInc * Math.cos(raan);
  return new Cesium.Cartesian3(x, y, zInc);
}

function orbitGeo(cluster, angle) {
  const cart = orbitCartesian({ ...cluster, altitude: cluster.altitude || 780000 }, angle);
  const cartographic = Cesium.Cartographic.fromCartesian(cart);
  return {
    lat: Cesium.Math.toDegrees(cartographic.latitude),
    lon: wrapLon(Cesium.Math.toDegrees(cartographic.longitude))
  };
}

function nearestShip(plane) {
  return state.ships
    .map((ship) => ({ ...ship, distance: km(plane.lat, plane.lon, ship.lat, ship.lon) }))
    .sort((a, b) => a.distance - b.distance)[0] || { id: "none", name: "No vessel", lat: plane.lat, lon: plane.lon };
}

function ensureSelectedAircraft() {
  if (state.selected) return;
  if (state.aircraft.length) {
    selectAircraft(state.aircraft[0]);
    return;
  }
  const demo = {
    id: "demo-emergency-01",
    callsign: "MAYDAY-01",
    country: "India",
    lat: 18.2,
    lon: 72.8,
    altitude: 33000,
    speed: 432,
    heading: 186,
    verticalRate: -2,
    onGround: false,
    source: "Demo seed while live traffic loads"
  };
  state.aircraft = [demo, ...state.aircraft];
  selectAircraft(demo);
}

async function openGlobe() {
  ensureSelectedAircraft();
  if (!state.starlink.length) buildStarlinkConstellation(state.selected);
  state.globeReady = false;
  state.triangulationStarted = false;
  startWarpTransition();
  if (mapProvider === "google" && googleMap) {
    googleMap.panTo({ lat: state.selected.lat, lng: state.selected.lon });
    googleMap.setZoom(2);
  } else if (map) {
    map.flyTo([state.selected.lat, state.selected.lon], 2, { duration: 1.1 });
  }
  setTimeout(async () => {
    document.getElementById("globeOverlay").classList.add("open");
    if (globeProvider === "google") {
      await bootGoogleGlobe().catch(async (error) => {
        console.warn("Google 3D globe failed, falling back to Cesium", error);
        globeProvider = "cesium";
        await bootCesium(true);
      });
    } else {
      await bootCesium().catch((error) => {
        console.warn("Cesium globe fallback", error);
        bootCesium(true);
      });
    }
    document.getElementById("warpTransition").classList.remove("active");
  }, 760);
}

function startWarpTransition() {
  const transition = document.getElementById("warpTransition");
  transition.classList.remove("active");
  void transition.offsetWidth;
  transition.classList.add("active");
}

async function bootGoogleGlobe() {
  const host = document.getElementById("globeCanvas");
  if (!googleGlobe) {
    const { Map3DElement, MapMode } = await google.maps.importLibrary("maps3d");
    googleGlobe = new Map3DElement({
      center: { lat: state.selected.lat, lng: state.selected.lon, altitude: 9000000 },
      range: 14500000,
      tilt: 0,
      heading: 0,
      mode: MapMode.HYBRID,
      defaultUIHidden: true
    });
    host.innerHTML = "";
    host.append(googleGlobe);
  }
  googleGlobe.center = { lat: state.selected.lat, lng: state.selected.lon, altitude: 9000000 };
  googleGlobe.range = 14500000;
  googleGlobe.tilt = 0;
  globeVizCanvas = document.getElementById("globeViz");
  globeVizCtx = globeVizCanvas.getContext("2d");
  resizeGlobeViz();
  setTimeout(() => {
    state.globeReady = true;
    state.triangulationStarted = true;
    updateActiveStarlinkSelection();
    refreshGoogleGlobeOverlay();
    renderStarlinkCalcs();
  }, 1200);
}

async function bootCesium(useFallbackTerrain = false) {
  Cesium.Ion.defaultAccessToken = cesiumToken;
  if (!cesiumViewer) {
    cesiumViewer = new Cesium.Viewer("globeCanvas", {
      animation: false,
      timeline: false,
      fullscreenButton: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      baseLayerPicker: false,
      navigationHelpButton: false,
      infoBox: false,
      selectionIndicator: false,
      terrain: useFallbackTerrain ? undefined : Cesium.Terrain.fromWorldTerrain()
    });
    cesiumViewer.scene.globe.enableLighting = true;
  }
  globeVizCanvas = document.getElementById("globeViz");
  globeVizCtx = globeVizCanvas.getContext("2d");
  resizeGlobeViz();
  drawCesiumEntities(false);
  const p = state.selected;
  cesiumViewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(p.lon, p.lat, 18000000),
    orientation: {
      heading: Cesium.Math.toRadians(0),
      pitch: Cesium.Math.toRadians(-90),
      roll: 0
    },
    duration: 1.5,
    complete: () => {
      state.globeReady = true;
      state.triangulationStarted = true;
      updateActiveStarlinkSelection();
      refreshActiveBeams();
      renderStarlinkCalcs();
    }
  });
}

function drawCesiumEntities(includeBeams = true) {
  if (!cesiumViewer || !state.selected) return;
  [...state.cesiumEntities, ...state.orbitEntities, ...state.satelliteEntities, ...state.beamEntities, ...state.activeSatelliteEntities].forEach((entity) => cesiumViewer.entities.remove(entity));
  state.cesiumEntities = [];
  state.orbitEntities = [];
  state.satelliteEntities = [];
  state.beamEntities = [];
  state.activeSatelliteEntities = [];
  const p = state.selected;
  state.aircraftEntity = cesiumViewer.entities.add({
    name: p.callsign || "Aircraft",
    position: Cesium.Cartesian3.fromDegrees(p.lon, p.lat, aircraftGlobeAltitude()),
    point: { pixelSize: 12, color: Cesium.Color.WHITE, outlineColor: Cesium.Color.CYAN, outlineWidth: 2 },
    label: { text: "AIRCRAFT", font: "13px sans-serif", fillColor: Cesium.Color.WHITE, pixelOffset: new Cesium.Cartesian2(18, -12) }
  });
  state.cesiumEntities.push(state.aircraftEntity);
  state.starlinkClusters.forEach((cluster) => {
    state.orbitEntities.push(cesiumViewer.entities.add({
      name: cluster.id,
      polyline: {
        positions: cluster.path,
        width: 1.35,
        material: Cesium.Color.fromCssColorString("rgba(120,168,255,0.30)")
      }
    }));
    cluster.satellites.forEach((sat) => {
      const entity = cesiumViewer.entities.add({
        name: sat.id,
        position: Cesium.Cartesian3.fromDegrees(sat.lon, sat.lat, sat.altitude),
        point: { pixelSize: 4, color: Cesium.Color.fromCssColorString("#78a8ff") }
      });
      sat.entity = entity;
      state.satelliteEntities.push(entity);
    });
  });
  if (includeBeams) refreshActiveBeams();
}

function updateStarlinkOrbits(now) {
  if (!cesiumViewer || !state.selected || !state.starlinkClusters.length || !state.triangulationStarted) return;
  const seconds = now / 1000;
  updateAircraftEntityPosition();
  state.starlinkClusters.forEach((cluster) => {
    cluster.satellites.forEach((sat) => {
      const angle = sat.baseAngle + seconds * cluster.angularSpeed;
      sat.lat = orbitLat(cluster, angle);
      sat.lon = orbitLon(cluster, angle);
      const position = orbitCartesian(cluster, angle);
      sat.entity?.position?.setValue(position);
      sat.activeEntity?.position?.setValue(position);
    });
  });
  updateBeamPositions();
  if (now - lastActiveClusterUpdate > 900) {
    lastActiveClusterUpdate = now;
    updateActiveStarlinkSelection();
    if (globeProvider === "google") {
      refreshGoogleGlobeOverlay();
    } else {
      refreshActiveBeams();
    }
    renderStarlinkCalcs();
  }
}

function updateBeamPositions() {
  // Beam and active satellite positions are Cesium CallbackProperties.
  // Keeping this hook preserves the animation loop without mutating properties.
}

function updateAircraftEntityPosition() {
  if (!state.selected || !state.aircraftEntity) return;
  state.aircraftEntity.position = Cesium.Cartesian3.fromDegrees(state.selected.lon, state.selected.lat, aircraftGlobeAltitude());
}

function aircraftGlobeAltitude() {
  return Math.max(11000, Number(state.selected?.altitude || 0) * 0.3048);
}

function updateActiveStarlinkSelection() {
  state.starlinkClusters.forEach((cluster) => {
    cluster.nearestDistance = Math.min(...cluster.satellites.map((sat) => km(state.selected.lat, state.selected.lon, sat.lat, sat.lon)));
  });
  state.starlink = state.starlinkClusters
    .flatMap((cluster) => cluster.satellites)
    .map((sat) => enrichStarlinkSatellite(sat, state.selected))
    .filter((sat) => km(state.selected.lat, state.selected.lon, sat.lat, sat.lon) > 180)
    .sort((a, b) => a.distance - b.distance || b.confidence - a.confidence)
    .slice(0, 5);
}

function refreshActiveBeams() {
  if (!cesiumViewer || !state.selected) return;
  state.beamEntities.forEach((entity) => cesiumViewer.entities.remove(entity));
  state.activeSatelliteEntities.forEach((entity) => cesiumViewer.entities.remove(entity));
  state.beamEntities = [];
  state.activeSatelliteEntities = [];
  state.starlink.forEach((sat, index) => {
    const cluster = state.starlinkClusters[sat.cluster];
    const satellitePosition = new Cesium.CallbackProperty(() => {
      const angle = currentSatelliteAngle(sat);
      const geo = orbitGeo(cluster, angle);
      sat.lat = geo.lat;
      sat.lon = geo.lon;
      return orbitCartesian(cluster, angle);
    }, false);
    const beamPositions = new Cesium.CallbackProperty(() => {
      const angle = currentSatelliteAngle(sat);
      const satPosition = orbitCartesian(cluster, angle);
      const aircraftPosition = Cesium.Cartesian3.fromDegrees(
        state.selected.lon,
        state.selected.lat,
        aircraftGlobeAltitude()
      );
      return [satPosition, aircraftPosition];
    }, false);
    const activeEntity = cesiumViewer.entities.add({
      name: sat.id,
      position: satellitePosition,
      point: {
        pixelSize: index < 3 ? 12 : 10,
        color: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.fromCssColorString("#55d6c2"),
        outlineWidth: 2
      },
      label: index < 5 ? {
        text: sat.id,
        font: "12px sans-serif",
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(12, -12)
      } : undefined
    });
    sat.activeEntity = activeEntity;
    state.activeSatelliteEntities.push(activeEntity);
    const beamEntity = cesiumViewer.entities.add({
      polyline: {
        positions: beamPositions,
        width: index < 3 ? 4 : 3,
        arcType: Cesium.ArcType.NONE,
        clampToGround: false,
        material: Cesium.Color.fromCssColorString(index < 5 ? "rgba(85,214,194,0.95)" : "rgba(120,168,255,0.45)"),
        depthFailMaterial: Cesium.Color.fromCssColorString(index < 5 ? "rgba(85,214,194,0.55)" : "rgba(120,168,255,0.28)")
      }
    });
    state.beamEntities.push(beamEntity);
  });
}

function currentSatelliteAngle(sat) {
  return sat.baseAngle + performance.now() / 1000 * state.starlinkClusters[sat.cluster].angularSpeed;
}

function refreshGoogleGlobeOverlay() {
  // Google Maps 3D is used as the globe base; the tactical Starlink visualization
  // is rendered in drawStarlinkHud on the overlay canvas for provider parity.
}

function closeGlobe() {
  document.getElementById("globeOverlay").classList.remove("open");
}

function resizeGlobeViz() {
  if (!globeVizCanvas) return;
  const rect = globeVizCanvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  globeVizCanvas.width = Math.max(1, Math.floor(rect.width * dpr));
  globeVizCanvas.height = Math.max(1, Math.floor(rect.height * dpr));
  globeVizCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function drawStarlinkHud(now) {
  if (!document.getElementById("globeOverlay").classList.contains("open") || !globeVizCtx) return;
  resizeGlobeViz();
  const width = globeVizCanvas.clientWidth;
  const height = globeVizCanvas.clientHeight;
  globeVizCtx.clearRect(0, 0, width, height);
  if (globeProvider === "google") drawGoogleConstellationCanvas(now, width, height);
  globeVizCtx.fillStyle = "rgba(7,17,20,0.64)";
  globeVizCtx.fillRect(18, 18, 310, 82);
  globeVizCtx.fillStyle = "#edf7f5";
  globeVizCtx.font = "700 13px Inter, sans-serif";
  globeVizCtx.fillText(state.triangulationStarted ? "Nearest Starlink cluster: lock acquired" : "Loading orbital constellation", 32, 42);
  globeVizCtx.font = "12px Inter, sans-serif";
  globeVizCtx.fillStyle = "#9db5b3";
  globeVizCtx.fillText(`Nearest active cluster: ${state.triangulationStarted ? nearestClusterLabel() : "waiting"}`, 32, 64);
  globeVizCtx.fillText(`Weighted position confidence: ${state.triangulationStarted ? avg(state.starlink.map((s) => s.confidence)) : 0}%`, 32, 84);
  const pulse = (Math.sin(now / 220) + 1) / 2;
  globeVizCtx.strokeStyle = `rgba(85,214,194,${0.35 + pulse * 0.45})`;
  globeVizCtx.lineWidth = 2;
  globeVizCtx.beginPath();
  globeVizCtx.arc(width - 90, 76, 26 + pulse * 12, 0, Math.PI * 2);
  globeVizCtx.stroke();
}

function drawGoogleConstellationCanvas(now, width, height) {
  const cx = width * 0.52;
  const cy = height * 0.50;
  const r = Math.min(width, height) * 0.30;
  globeVizCtx.save();
  globeVizCtx.globalCompositeOperation = "source-over";
  state.starlinkClusters.forEach((cluster, index) => {
    const orbitH = r * (0.34 + (index % 5) * 0.055);
    const tilt = (index - 4.5) * 0.045;
    globeVizCtx.strokeStyle = "rgba(120,168,255,0.16)";
    globeVizCtx.lineWidth = 1;
    globeVizCtx.beginPath();
    globeVizCtx.ellipse(cx, cy, r * 1.18, orbitH, tilt, 0, Math.PI * 2);
    globeVizCtx.stroke();
    cluster.satellites.forEach((sat, satIndex) => {
      const angle = sat.baseAngle + now / 1000 * cluster.angularSpeed;
      const x = cx + Math.cos(angle) * r * 1.18;
      const y = cy + Math.sin(angle) * orbitH;
      if (satIndex % 2 === 0) {
        globeVizCtx.fillStyle = "rgba(120,168,255,0.55)";
        globeVizCtx.fillRect(x - 1.5, y - 1.5, 3, 3);
      }
    });
  });
  const planeX = cx + r * 0.34;
  const planeY = cy + r * 0.04;
  const activeCluster = state.starlink.length ? state.starlinkClusters[state.starlink[0].cluster] : state.starlinkClusters[0];
  const localRadius = Math.max(78, r * 0.38);
  state.starlink.slice(0, 5).forEach((sat, index) => {
    const angle = (index / 5) * Math.PI * 2 + now / 2600;
    const offsetScale = [0.9, 0.74, 1.08, 0.68, 0.96][index];
    const x = planeX + Math.cos(angle) * localRadius * offsetScale;
    const y = planeY + Math.sin(angle) * localRadius * 0.48 * offsetScale;
    globeVizCtx.strokeStyle = index < 3 ? "rgba(120,168,255,0.82)" : "rgba(120,168,255,0.50)";
    globeVizCtx.lineWidth = index < 3 ? 2.2 : 1.4;
    globeVizCtx.beginPath();
    globeVizCtx.moveTo(x, y);
    globeVizCtx.lineTo(planeX, planeY);
    globeVizCtx.stroke();
    globeVizCtx.fillStyle = "#ffffff";
    globeVizCtx.beginPath();
    globeVizCtx.arc(x, y, 5.5, 0, Math.PI * 2);
    globeVizCtx.fill();
    globeVizCtx.strokeStyle = "#78a8ff";
    globeVizCtx.lineWidth = 2;
    globeVizCtx.stroke();
    if (index < 3) {
      globeVizCtx.fillStyle = "#dce8ff";
      globeVizCtx.font = "11px Inter, sans-serif";
      globeVizCtx.fillText(sat.id, x + 8, y - 7);
    }
  });
  if (activeCluster) {
    globeVizCtx.strokeStyle = "rgba(85,214,194,0.34)";
    globeVizCtx.lineWidth = 1.4;
    globeVizCtx.beginPath();
    globeVizCtx.ellipse(planeX, planeY, localRadius * 1.2, localRadius * 0.58, now / 3200, 0, Math.PI * 2);
    globeVizCtx.stroke();
  }
  globeVizCtx.fillStyle = "#ffffff";
  globeVizCtx.beginPath();
  globeVizCtx.arc(planeX, planeY, 7, 0, Math.PI * 2);
  globeVizCtx.fill();
  globeVizCtx.strokeStyle = "#55d6c2";
  globeVizCtx.lineWidth = 2;
  globeVizCtx.stroke();
  globeVizCtx.font = "12px Inter, sans-serif";
  globeVizCtx.fillText("AIRCRAFT", planeX + 12, planeY - 8);
  globeVizCtx.restore();
}

function renderLog() {
  document.getElementById("decisionLog").innerHTML = state.log.length
    ? state.log.map(([title, body]) => `<div class="log-entry"><strong>${title}</strong>${body}</div>`).join("")
    : `<div class="log-entry"><strong>Standby</strong>Select a flight and start an emergency simulation.</div>`;
}

function renderCalcPanel() {
  if (!state.triangulation.length) {
    document.getElementById("calcPanel").innerHTML = `<div class="calc-row"><div><strong>Standby</strong><span>armed</span></div><div>Triangulation calculations appear after an emergency simulation starts.</div><div class="bar"><span style="width:12%"></span></div></div>`;
    return;
  }
  const rows = state.triangulation.map((source) => [
    source.name,
    `${source.type} | ${Math.round(source.distance)} km | ${source.latency.toFixed(2)} ms`,
    source.confidence
  ]);
  rows.push(["Position lock", `CEP error radius ${Math.max(3, 38 - avg(state.triangulation.map((s) => s.confidence)) / 3).toFixed(1)} km`, avg(state.triangulation.map((s) => s.confidence))]);
  document.getElementById("calcPanel").innerHTML = rows.map(([name, detail, value]) => `<div class="calc-row"><div><strong>${name}</strong><span>${value}%</span></div><div>${detail}</div><div class="bar"><span style="width:${value}%"></span></div></div>`).join("");
}

function renderStarlinkCalcs() {
  document.getElementById("starlinkCalculations").innerHTML = state.starlink.slice(0, 4).map((sat) => `<div class="calc-row"><div><strong>${sat.id}</strong><span>${sat.confidence}%</span></div><div>cluster ${sat.cluster + 1} | ${sat.distance.toFixed(0)} km beam | ${sat.latency.toFixed(2)} ms ToF</div><div class="bar"><span style="width:${sat.confidence}%"></span></div></div>`).join("");
}

function nearestClusterLabel() {
  if (!state.starlink.length) return "standby";
  return `Cluster ${state.starlink[0].cluster + 1}`;
}

function renderHealth() {
  const items = state.health.length ? state.health : systems.map(([name, status]) => ({ name, status, warning: false }));
  document.getElementById("healthGrid").innerHTML = items.map((item) => `<div class="health-card ${item.warning ? "warning" : ""}"><b>${item.name}</b><span>${item.status}</span></div>`).join("");
}

function tick(now) {
  updateElevenEmergencyScenario(now);
  updateFlightSimulation(now);
  document.getElementById("simClock").textContent = state.flightSim.active
    ? `Flight ${Math.round(state.flightSim.progress * 100)}%`
    : state.multiEmergency.active ? "11 Emergency"
    : state.simActive ? elapsed(now - state.startedAt) : "Standby";
  renderCycloneSimulation(now);
  updateStarlinkOrbits(now);
  drawStarlinkHud(now);
  requestAnimationFrame(tick);
}

function updateFlightSimulation(now) {
  const sim = state.flightSim;
  if (!sim.active) return;
  sim.progress = Math.min(1, ((now - sim.startedAt) * sim.speed) / sim.durationMs);

  // Gradually grow cyclone intensity after placement
  if (sim.cyclone && sim.cyclonePlacedAt && !sim.cycloneMatured) {
    const elapsed = (now - sim.cyclonePlacedAt) * sim.speed;
    const growthT = Math.min(1, elapsed / sim.cycloneGrowDuration);
    const eased = growthT * growthT * (3 - 2 * growthT);
    sim.cyclone.intensity = eased * 1.08;
    sim.cyclone.eye = eased * 42;
    sim.cyclone.wind = eased * 118;
    sim.cyclone.pressure = 1013 - eased * (1013 - 944);
    if (growthT >= 1) {
      sim.cycloneMatured = true;
      state.log = [
        ["Cyclone matured", `Full intensity reached. Wind ${sim.cyclone.wind.toFixed(0)} kt, pressure ${sim.cyclone.pressure.toFixed(0)} hPa.`],
        ...state.log.slice(0, 4)
      ];
      renderLog();
    }
  }

  // Threat detection: only reroute when plane is close enough
  if (sim.cyclone && !sim.threatDetected && !sim.ignoredWarning && sim.cyclone.intensity > 0.5) {
    const planeDist = km(state.selected?.lat || 0, state.selected?.lon || 0, sim.cyclone.lat, sim.cyclone.lon);
    const threatRadius = sim.cyclone.radius * 2.5;
    if (planeDist < threatRadius) {
      sim.threatDetected = true;
      beginSmoothReroute(sim, now);
    }
  }

  // Handle smooth route transition
  let activeRoute = sim.currentRoute.length ? sim.currentRoute : sim.plannedRoute;
  const activeProgress = routeProgress(sim, now);
  if (sim.routeTransition) {
    const transElapsed = (now - sim.routeTransition.startedAt) * sim.speed;
    const transT = Math.min(1, transElapsed / sim.routeTransition.duration);
    const eased = transT * transT * (3 - 2 * transT);
    if (transT >= 1) {
      sim.routeTransition = null;
    } else {
      const oldPt = pointAlongSpline(sim.routeTransition.oldRoute, sim.routeTransition.oldProgress);
      const newPt = pointAlongSpline(activeRoute, activeProgress);
      if (oldPt && newPt) {
        const blended = {
          lat: oldPt.lat + (newPt.lat - oldPt.lat) * eased,
          lon: wrapLon(unwrapLonNear(oldPt.lon, newPt.lon) + (unwrapLonNear(newPt.lon, oldPt.lon) - unwrapLonNear(oldPt.lon, newPt.lon)) * eased)
        };
        const prev = state.selected || blended;
        const hdg = bearing(prev.lat, prev.lon, blended.lat, blended.lon) || 72;
        sim.fuelPercent = fuelAtRouteProgress(sim, activeRoute, activeProgress);
        sim.phase = sim.progress < 0.08 ? "takeoff" : sim.progress > 0.93 ? "landing" : "cruise";
        state.selected = makeFlightSimPlane(blended, hdg);
        state.aircraft = [state.selected, ...state.aircraft.filter((p) => p.id !== state.selected.id)];
        if (now - sim.lastPathSample > 450) {
          sim.lastPathSample = now;
          sim.flownPath.push({ lat: blended.lat, lon: blended.lon });
          if (sim.flownPath.length > 260) sim.flownPath.shift();
        }
        updateFlightSimUI(sim, now);
        return;
      }
    }
  }

  const point = pointAlongSpline(activeRoute, activeProgress);
  if (!point) return;
  sim.fuelPercent = fuelAtRouteProgress(sim, activeRoute, activeProgress);
  sim.phase = sim.progress < 0.08 ? "takeoff" : sim.progress > 0.93 ? "landing" : "cruise";
  const previous = state.selected || point;
  const heading = bearing(previous.lat || point.lat, previous.lon || point.lon, point.lat, point.lon) || 72;
  state.selected = makeFlightSimPlane(point, heading);
  state.aircraft = [state.selected, ...state.aircraft.filter((plane) => plane.id !== state.selected.id)];
  if (now - sim.lastPathSample > 450) {
    sim.lastPathSample = now;
    sim.flownPath.push({ lat: point.lat, lon: point.lon });
    if (sim.flownPath.length > 260) sim.flownPath.shift();
  }
  if (sim.cyclone && sim.ignoredWarning && !sim.failureTriggered) {
    const stormDistance = km(point.lat, point.lon, sim.cyclone.lat, sim.cyclone.lon);
    if (stormDistance < sim.cyclone.radius * 0.45) {
      sim.failureTriggered = true;
      state.scenarios.add("gps");
      state.scenarios.add("pilot");
      state.triangulation = buildTriangulation(state.selected);
      state.starlink = buildStarlink(state.selected);
      state.log = [
        ["Complete navigation failure", "Aircraft has penetrated cyclone eyewall. GPS, ATC communications, and forward visibility are lost."],
        ["Pilot prompt", "Authorize Agentic AI Takeover to localize with Starlink/cellular triangulation and select the survival route."],
        ["Starlink standby", `${state.starlink.length} LEO satellite beams available for emergency position lock.`]
      ];
      renderLog();
      renderCalcPanel();
    }
  }
  if (sim.fuelPercent <= 0 && !sim.aiTakeover) {
    sim.active = false;
    sim.phase = "crash";
    state.log = [
      ["Fuel exhaustion", "Pilot rejected/ignored safe diversion. Aircraft ran out of fuel and crashed."],
      ["Outcome", "Simulation ended with catastrophic loss."]
    ];
    renderLog();
    renderFlightSimStats();
    drawEmergency();
    return;
  }
  updateFlightSimUI(sim, now);
}

function updateElevenEmergencyScenario(now) {
  const sim = state.multiEmergency;
  if (!sim.active) return;
  const elapsed = (now - sim.startedAt) * sim.speed;
  sim.flights.forEach((flight, index) => {
    if (!isUsableRoute(flight.route)) {
      flight.status = "route data unavailable";
      return;
    }
    const progress = Math.min(1, Math.max(0, elapsed / (sim.durationMs || 220000) + flight.progressOffset));
    const point = pointAlongSpline(flight.route, progress);
    if (!hasGeoPoint(point)) {
      if (hasPlanePosition(flight.plane)) return;
      flight.status = "route data unavailable";
      return;
    }
    const prev = hasPlanePosition(flight.plane) ? flight.plane : point;
    const heading = bearing(prev.lat, prev.lon, point.lat, point.lon) || flight.plane?.heading || 55;
    const previousGoogleLon = Number.isFinite(flight.plane?.googleLon) ? flight.plane.googleLon : prev.lon;
    const googleLon = unwrapLonNear(point.lon, previousGoogleLon);
    flight.progress = progress;
    flight.fuelPercent = Math.max(6, (flight.initialFuelPercent || flight.fuelPercent || 80) - progress * flight.fuelRequired * 0.72);
    flight.plane = makeMultiEmergencyPlane(flight, point, heading);
    flight.plane.googleLon = googleLon;
    flight.plane.altitude = progress < 0.08 ? Math.round(1200 + progress * 472500)
      : progress > 0.82 ? Math.max(1600, Math.round(39000 - (progress - 0.82) * 120000))
      : 39000;
    flight.plane.speed = progress > 0.85 ? 290 : 486 - index * 3;
    const stormClearance = sim.cyclone ? km(point.lat, point.lon, sim.cyclone.lat, sim.cyclone.lon) : 9999;
    if (progress <= 0.01) flight.status = "taking off";
    else if (flight.fuelDivert && progress > 0.24) flight.status = `fuel divert ${flight.fuelDivert.airport?.code || "ALT"}`;
    else if (stormClearance < (sim.cyclone.radius || 720) * 1.45) flight.status = "cyclone evade route";
    else if (progress > 0.78 && progress < 1) flight.status = "SFO emergency sequence";
    else if (progress >= 1) flight.status = flight.fuelDivert ? `landed ${flight.fuelDivert.airport?.code || "ALT"}` : "landed SFO";
    else flight.status = "enroute emergency wave";
  });
  const firstSfoConflict = sim.flights.some((flight) => !flight.fuelDivert && (
    (flight.progress || 0) > 0.72 ||
    (hasPlanePosition(flight.plane) && km(flight.plane.lat, flight.plane.lon, 37.619, -122.375) < 900)
  ));
  if (firstSfoConflict) sim.atcActivated = true;
  sim.scheduled.forEach((arrival, index) => {
    const activeRoute = sim.atcActivated ? arrival.route : arrival.sfoRoute;
    if (!isUsableRoute(activeRoute)) return;
    const emergencyWaveProgress = elapsed / (sim.durationMs || 220000);
    const rawProgress = (arrival.initialProgress || 0.38) + emergencyWaveProgress * 0.34 + index * 0.006;
    const progress = sim.atcActivated ? Math.min(1, Math.max(0, rawProgress)) : Math.min(0.62, Math.max(0, rawProgress));
    let point;
    let heading = 95;
    if (sim.atcActivated && arrival.decision.type === "hold") {
      const orbit = holdingPatternPoint(arrival.holdCenter, index, now, sim.speed);
      point = orbit.point;
      heading = orbit.heading;
      arrival.status = "holding for emergency wave";
    } else {
      point = pointAlongSpline(activeRoute, progress);
      const previous = hasPlanePosition(arrival.plane) ? arrival.plane : point;
      heading = hasGeoPoint(point) ? bearing(previous.lat, previous.lon, point.lat, point.lon) || arrival.plane?.heading || 95 : heading;
      arrival.status = sim.atcActivated && arrival.decision.type === "divert" ? `diverting ${arrival.decision.airport?.code || "ALT"}` : "scheduled approach";
    }
    if (!hasGeoPoint(point)) return;
    const previousGoogleLon = Number.isFinite(arrival.plane?.googleLon) ? arrival.plane.googleLon : point.lon;
    const googleLon = unwrapLonNear(point.lon, previousGoogleLon);
    arrival.progress = progress;
    arrival.plane = makeScheduledArrivalPlane(arrival, point, heading);
    arrival.plane.googleLon = googleLon;
    arrival.plane.altitude = arrival.decision.type === "hold" && progress > 0.42 && progress < 0.86 ? 12000 : Math.max(2400, Math.round(28000 - progress * 23000));
  });
  drawAircraft();
  drawEmergency();
}

function holdingPatternPoint(center, index, now, speed = 1) {
  const angle = ((now * speed) / 2600 + index * 0.85) % (Math.PI * 2);
  const latRadius = 0.18;
  const lonRadius = 0.38;
  const point = {
    lat: center.lat + Math.sin(angle) * latRadius,
    lon: wrapLon(center.lon + Math.cos(angle) * lonRadius)
  };
  const next = {
    lat: center.lat + Math.sin(angle + 0.08) * latRadius,
    lon: wrapLon(center.lon + Math.cos(angle + 0.08) * lonRadius)
  };
  return { point, heading: bearing(point.lat, point.lon, next.lat, next.lon) };
}

function updateFlightSimUI(sim, now) {
  document.getElementById("selectedTitle").textContent = state.selected.callsign;
  const routeLabel = `${sim.origin?.code || "FROM"} to ${sim.destination?.code || "TO"}`;
  document.getElementById("aircraftFacts").innerHTML = [
    ["Route", routeLabel],
    ["Altitude", `${state.selected.altitude || 0} ft`],
    ["Speed", `${state.selected.speed || 0} kt`],
    ["Fuel", `${sim.fuelPercent.toFixed(1)}%`],
    ["Passengers", sim.passengers],
    ["Mode", sim.routeMode]
  ].map(([label, value]) => `<div class="fact"><b>${value}</b><span>${label}</span></div>`).join("");
  renderFlightSimStats();
  drawAircraft();
  drawEmergency();
}

function beginSmoothReroute(sim, now) {
  const oldRoute = [...sim.currentRoute];
  const oldProgress = routeProgress(sim, now);
  computeFlightEmergencyPlan(false);
  sim.currentRoute = buildAvoidanceManeuverRoute(state.selected, sim.currentRoute, sim.cyclone);
  sim.routeStartedAt = now;
  sim.routeDurationMs = routeDurationFor(sim.currentRoute);
  sim.routeTransition = {
    startedAt: now,
    duration: 2800,
    oldRoute,
    oldProgress
  };
}

function routeProgress(sim, now) {
  const startedAt = sim.routeStartedAt || sim.startedAt;
  const duration = Math.max(1, sim.routeDurationMs || sim.durationMs);
  return Math.min(1, Math.max(0, ((now - startedAt) * sim.speed) / duration));
}

function routeDurationFor(route) {
  const distance = routeTotalKm(route);
  const baselineKmPerMs = Math.max(0.02, routeTotalKm(state.flightSim.plannedRoute) / state.flightSim.durationMs);
  return clamp(distance / baselineKmPerMs, 18000, 90000);
}

function fuelAtRouteProgress(sim, route, progress) {
  if (!route?.length || route.length < 2) return sim.fuelPercent;
  if (sim.routeMode !== "destination" || !sim.refuelStops?.length) {
    return Math.max(0, (sim.initialFuelPercent || 100) - sim.progress * (sim.fuelNeededPercent || 82) - (sim.routeMode === "reroute-destination" ? 4 : 0));
  }
  const legs = route.slice(0, -1).map((point, index) => km(point.lat, point.lon, route[index + 1].lat, route[index + 1].lon));
  const total = legs.reduce((sum, distance) => sum + distance, 0);
  let travelled = total * Math.max(0, Math.min(1, progress));
  for (let i = 0; i < legs.length; i += 1) {
    if (travelled <= legs[i]) {
      const legProgress = travelled / Math.max(1, legs[i]);
      const legFuel = sim.legFuel?.[i] || sim.fuelNeededPercent || 82;
      return Math.max(0, (sim.initialFuelPercent || 100) - legFuel * legProgress);
    }
    travelled -= legs[i];
  }
  return Math.max(0, (sim.initialFuelPercent || 100) - (sim.legFuel?.at(-1) || sim.fuelNeededPercent || 82));
}

function renderFlightSimStats() {
  const sim = state.flightSim;
  const el = document.getElementById("flightSimStats");
  if (!el) return;
  if (state.multiEmergency.active) {
    const multi = state.multiEmergency;
    const sfo = multi.flights.filter((flight) => flight.status?.includes("SFO")).length;
    const holds = multi.scheduled.filter((arrival) => arrival.decision.type === "hold").length;
    const diverts = multi.scheduled.filter((arrival) => arrival.decision.type === "divert").length;
    el.innerHTML = [
      ["11 Emergency", "scenario"],
      [`${multi.flights.filter((flight) => hasPlanePosition(flight.plane)).length}/11`, "aircraft tracked"],
      [`${sfo}/11`, "SFO sequence"],
      [String(holds), "scheduled holds"],
      [String(diverts), "scheduled diverts"],
      [`${multi.speed}x`, "sim speed"],
      ["North Pacific", "cyclone zone"]
    ].map(([value, label]) => `<div class="sim-stat"><b>${value}</b><span>${label}</span></div>`).join("");
    return;
  }
  if (!sim.active) {
    el.innerHTML = `<div class="sim-stat"><b>Standby</b><span>flight sim</span></div><div class="sim-stat"><b>Plan route</b><span>home page</span></div>`;
    return;
  }
  const destination = sim.routeMode === "divert-airport" && state.airportChoice ? state.airportChoice.code
    : sim.routeMode === "maritime-landing" && state.shipChoice ? state.shipChoice.name
      : sim.destination?.code || "DEST";
  const remainingKm = state.selected ? remainingRouteKm(sim.currentRoute, state.selected) : 0;
  el.innerHTML = [
    [`${sim.origin?.code || "FROM"} -> ${destination}`, "route"],
    [sim.phase.toUpperCase(), "phase"],
    [`${sim.takeoffTime} / ${sim.eta}`, "takeoff / ETA"],
    [`${sim.fuelPercent.toFixed(1)}%`, "fuel left"],
    [String(sim.passengers), "passengers"],
    [`${Math.round(sim.cargoKg || 0).toLocaleString()} kg`, "cargo"],
    [sim.refuelStops?.length ? sim.refuelStops.map((a) => a.code).join(" -> ") : "none", "refuel stops"],
    [`${Math.round(remainingKm)} km`, "remaining"],
    [`${sim.speed}x`, "sim speed"],
    [sim.routeMode.replace("-", " "), "decision"]
  ].map(([value, label]) => `<div class="sim-stat"><b>${value}</b><span>${label}</span></div>`).join("");
}

function drawFlightSimulationOverlaysGoogle() {
  const sim = state.flightSim;
  if (!sim.active) return;
  const plannedSmooth = sim.plannedRoute.length > 2 && sim.plannedRoute.length <= 6 ? catmullRomChain(sim.plannedRoute, 30) : sim.plannedRoute;
  const activeSmooth = sim.currentRoute.length > 2 && sim.currentRoute.length <= 6 ? catmullRomChain(sim.currentRoute, 30) : sim.currentRoute;
  const planned = plannedSmooth.map((p) => ({ lat: p.lat, lng: p.lon }));
  const active = activeSmooth.map((p) => ({ lat: p.lat, lng: p.lon }));
  const flown = sim.flownPath.map((p) => ({ lat: p.lat, lng: p.lon }));
  if (planned.length) {
    state.googleOverlays.emergency.push(new google.maps.Polyline({
      map: googleMap,
      path: planned,
      geodesic: true,
      strokeColor: "#ffffff",
      strokeOpacity: 0.28,
      strokeWeight: 2
    }));
  }
  if (active.length) {
    state.googleOverlays.emergency.push(new google.maps.Polyline({
      map: googleMap,
      path: active,
      geodesic: true,
      strokeColor: activeRouteColor(sim, true),
      strokeOpacity: 0.34,
      strokeWeight: 13
    }));
    state.googleOverlays.emergency.push(new google.maps.Polyline({
      map: googleMap,
      path: active,
      geodesic: true,
      strokeColor: activeRouteColor(sim),
      strokeOpacity: 1,
      strokeWeight: 5
    }));
  }
  if (flown.length > 1) {
    state.googleOverlays.emergency.push(new google.maps.Polyline({
      map: googleMap,
      path: flown,
      geodesic: true,
      strokeColor: "#55d6c2",
      strokeOpacity: 0.38,
      strokeWeight: 15
    }));
    state.googleOverlays.emergency.push(new google.maps.Polyline({
      map: googleMap,
      path: flown,
      geodesic: true,
      strokeColor: "#55d6c2",
      strokeOpacity: 1,
      strokeWeight: 5
    }));
  }
  if (state.selected?.id === "REALISTIC-SIM-01") {
    state.googleOverlays.emergency.push(new google.maps.Marker({
      map: googleMap,
      position: { lat: state.selected.lat, lng: state.selected.lon },
      title: state.selected.callsign,
      icon: googlePlaneIcon("#ffffff", state.selected.heading || 0, 1.08)
    }));
  }
}

function drawFlightSimulationOverlaysLeaflet() {
  const sim = state.flightSim;
  if (!sim.active) return;
  if (sim.plannedRoute.length) {
    const plannedSmooth = sim.plannedRoute.length > 2 && sim.plannedRoute.length <= 6 ? catmullRomChain(sim.plannedRoute, 30) : sim.plannedRoute;
    L.polyline(plannedSmooth.map((p) => [p.lat, p.lon]), { color: "#ffffff", weight: 2, opacity: 0.32, dashArray: "8,8" }).addTo(state.layers.emergency);
  }
  if (sim.currentRoute.length) {
    const activeSmooth = sim.currentRoute.length > 2 && sim.currentRoute.length <= 6 ? catmullRomChain(sim.currentRoute, 30) : sim.currentRoute;
    L.polyline(activeSmooth.map((p) => [p.lat, p.lon]), { color: activeRouteColor(sim, true), weight: 13, opacity: 0.34 }).addTo(state.layers.emergency);
    L.polyline(activeSmooth.map((p) => [p.lat, p.lon]), { color: activeRouteColor(sim), weight: 5, opacity: 1 }).addTo(state.layers.emergency);
  }
  if (sim.flownPath.length > 1) {
    L.polyline(sim.flownPath.map((p) => [p.lat, p.lon]), { color: "#55d6c2", weight: 15, opacity: 0.38 }).addTo(state.layers.emergency);
    L.polyline(sim.flownPath.map((p) => [p.lat, p.lon]), { color: "#55d6c2", weight: 5, opacity: 1 }).addTo(state.layers.emergency);
  }
  if (state.selected?.id === "REALISTIC-SIM-01") {
    L.marker([state.selected.lat, state.selected.lon], {
      icon: divIcon("plane-marker selected sim-plane-marker", "✈", state.selected.heading || 0),
      zIndexOffset: 1000
    }).addTo(state.layers.emergency);
  }
}

function drawElevenEmergencyOverlaysGoogle() {
  const sim = state.multiEmergency;
  if (!sim.active) return;
  sim.flights.forEach((flight, index) => {
    const progress = clamp(flight.progress || 0, 0, 1);
    const flownPath = googlePathFromRoute(routeSegmentByProgress(flight.route, 0, progress), flight.plane?.googleLon);
    const activePath = googlePathFromRoute(routeSegmentByProgress(flight.route, progress, Math.min(1, progress + 0.24)), flight.plane?.googleLon);
    const color = flight.fuelDivert ? "#f5a6ff" : flight.fuelRequired <= flight.fuelPercent + 8 ? "#55d6c2" : "#ffca6b";
    if (flight.fuelDivert?.airport) {
      state.googleOverlays.emergency.push(new google.maps.Marker({
        map: googleMap,
        position: { lat: flight.fuelDivert.airport.lat, lng: flight.fuelDivert.airport.lon },
        title: `${flight.callsign} fuel diversion target ${flight.fuelDivert.airport.code}`,
        icon: googleSymbol("#f5a6ff", "circle", 7),
        zIndex: 2700 + index
      }));
    }
    if (activePath.length > 1) {
      state.googleOverlays.emergency.push(new google.maps.Polyline({
        map: googleMap,
        path: activePath,
        geodesic: true,
        strokeColor: color,
        strokeOpacity: 0.22,
        strokeWeight: 7,
        icons: [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 1, scale: 2.8 }, offset: "0", repeat: "24px" }]
      }));
    }
    if (flownPath.length > 1) {
      state.googleOverlays.emergency.push(new google.maps.Polyline({
        map: googleMap,
        path: flownPath,
        geodesic: true,
        strokeColor: color,
        strokeOpacity: 0.24,
        strokeWeight: 13
      }));
      state.googleOverlays.emergency.push(new google.maps.Polyline({
        map: googleMap,
        path: flownPath,
        geodesic: true,
        strokeColor: color,
        strokeOpacity: 0.95,
        strokeWeight: 3
      }));
    }
    if (flight.plane) {
      state.googleOverlays.emergency.push(googleHtmlMarker(
        googlePoint(flight.plane),
        `<div class="eleven-google-plane ${flight.fuelDivert ? "fuel-divert" : ""}"><svg class="eleven-google-plane-icon" style="transform: rotate(${Math.round(flight.plane.heading || 0)}deg)" viewBox="-18 -18 36 38" aria-hidden="true"><path d="M 0 -15 L 2 -10 L 3 0 L 15 5 L 15 8 L 3 5 L 2 12 L 6 15 L 6 17 L 0 16 L -6 17 L -6 15 L -2 12 L -3 5 L -15 8 L -15 5 L -3 0 L -2 -10 Z"></path></svg><span>${flight.callsign}${flight.fuelDivert ? ` DIV ${flight.fuelDivert.airport?.code || "ALT"}` : ""}</span></div>`,
        "google-emergency-aircraft"
      ));
    }
  });
  sim.scheduled.forEach((arrival, index) => {
    const activeDecision = sim.atcActivated ? arrival.decision.type : "approach";
    const color = activeDecision === "hold" ? "#ffca6b" : activeDecision === "divert" ? "#f5a6ff" : "#78a8ff";
    const progress = clamp(arrival.progress || 0, 0, 1);
    const drawRoute = sim.atcActivated ? arrival.route : arrival.sfoRoute;
    const scheduledActivePath = activeDecision === "hold"
      ? googlePathFromRoute([arrival.approachStart, arrival.holdCenter], arrival.plane?.googleLon)
      : googlePathFromRoute(routeSegmentByProgress(drawRoute, Math.max(0, progress - 0.12), Math.min(1, progress + 0.36)), arrival.plane?.googleLon);
    if (scheduledActivePath.length > 1) {
      state.googleOverlays.emergency.push(new google.maps.Polyline({
        map: googleMap,
        path: scheduledActivePath,
        geodesic: true,
        strokeColor: color,
        strokeOpacity: activeDecision === "approach" ? 0.54 : 0.82,
        strokeWeight: activeDecision === "approach" ? 2 : 3,
        icons: [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 1, scale: 3 }, offset: "0", repeat: "18px" }]
      }));
    }
    if (activeDecision === "hold") {
      const center = { lat: arrival.holdCenter.lat, lng: arrival.holdCenter.lon };
      state.googleOverlays.emergency.push(new google.maps.Circle({
        map: googleMap,
        center,
        radius: 23000 + index * 2200,
        strokeColor: color,
        strokeOpacity: 0.9,
        strokeWeight: 3,
        fillColor: color,
        fillOpacity: 0.08
      }));
    }
    if (activeDecision === "divert" && arrival.decision.airport) {
      state.googleOverlays.emergency.push(new google.maps.Marker({
        map: googleMap,
        position: { lat: arrival.decision.airport.lat, lng: arrival.decision.airport.lon },
        title: `${arrival.callsign} diversion target ${arrival.decision.airport.code}`,
        icon: googleSymbol("#f5a6ff", "circle", 6),
        zIndex: 2600 + index
      }));
    }
    if (hasPlanePosition(arrival.plane)) {
      state.googleOverlays.emergency.push(googleHtmlMarker(
        googlePoint(arrival.plane),
        `<div class="scheduled-google-plane ${activeDecision}"><svg class="scheduled-google-plane-icon" style="transform: rotate(${Math.round(arrival.plane.heading || 0)}deg)" viewBox="-18 -18 36 38" aria-hidden="true"><path d="M 0 -15 L 2 -10 L 3 0 L 15 5 L 15 8 L 3 5 L 2 12 L 6 15 L 6 17 L 0 16 L -6 17 L -6 15 L -2 12 L -3 5 L -15 8 L -15 5 L -3 0 L -2 -10 Z"></path></svg><span>${arrival.callsign} ${activeDecision === "approach" ? "APP" : activeDecision === "hold" ? "HOLD" : `DIV ${arrival.decision.airport?.code || "ALT"}`}</span></div>`,
        "google-scheduled-aircraft"
      ));
    }
  });
}

function drawElevenEmergencyOverlaysLeaflet() {
  const sim = state.multiEmergency;
  if (!sim.active) return;
  sim.flights.forEach((flight) => {
    const color = flight.fuelDivert ? "#f5a6ff" : flight.fuelRequired <= flight.fuelPercent + 8 ? "#55d6c2" : "#ffca6b";
    const progress = clamp(flight.progress || 0, 0, 1);
    const activePath = routeSegmentByProgress(flight.route, progress, Math.min(1, progress + 0.24));
    const flownPath = routeSegmentByProgress(flight.route, 0, progress);
    if (activePath.length > 1) {
      L.polyline(activePath.map((p) => [p.lat, p.lon]), { color, weight: 7, opacity: 0.22, dashArray: "6,12" }).addTo(state.layers.emergency);
    }
    if (flownPath.length > 1) {
      L.polyline(flownPath.map((p) => [p.lat, p.lon]), { color, weight: 13, opacity: 0.24 }).addTo(state.layers.emergency);
      L.polyline(flownPath.map((p) => [p.lat, p.lon]), { color, weight: 3, opacity: 0.95 }).addTo(state.layers.emergency);
    }
    if (flight.plane) {
      L.marker([flight.plane.lat, flight.plane.lon], {
        icon: divIcon("plane-marker selected sim-plane-marker eleven-plane-marker", "&#9992;", flight.plane.heading || 0),
        zIndexOffset: 2000
      }).bindTooltip(`${flight.callsign}${flight.fuelDivert ? ` DIV ${flight.fuelDivert.airport?.code || "ALT"}` : ""}`, { direction: "top", offset: [0, -14] }).addTo(state.layers.emergency);
    }
    if (flight.fuelDivert?.airport) {
      L.marker([flight.fuelDivert.airport.lat, flight.fuelDivert.airport.lon], {
        icon: divIcon("airport-marker", "")
      }).bindTooltip(`${flight.callsign} fuel diversion: ${flight.fuelDivert.airport.code}`).addTo(state.layers.emergency);
    }
  });
  sim.scheduled.forEach((arrival) => {
    const activeDecision = sim.atcActivated ? arrival.decision.type : "approach";
    const color = activeDecision === "hold" ? "#ffca6b" : activeDecision === "divert" ? "#f5a6ff" : "#78a8ff";
    const progress = clamp(arrival.progress || 0, 0, 1);
    const drawRoute = sim.atcActivated ? arrival.route : arrival.sfoRoute;
    const activePath = activeDecision === "hold"
      ? [arrival.approachStart, arrival.holdCenter]
      : routeSegmentByProgress(drawRoute, Math.max(0, progress - 0.12), Math.min(1, progress + 0.36));
    if (activePath.length > 1) {
      L.polyline(activePath.map((p) => [p.lat, p.lon]), { color, weight: 3, opacity: 0.78, dashArray: "5,9" }).addTo(state.layers.emergency);
    }
    if (activeDecision === "hold") {
      L.circle([arrival.holdCenter.lat, arrival.holdCenter.lon], {
        radius: 26000,
        color,
        weight: 3,
        fillOpacity: 0.08
      }).bindTooltip(`${arrival.callsign} holding`).addTo(state.layers.emergency);
    }
    if (hasPlanePosition(arrival.plane)) {
      L.marker([arrival.plane.lat, arrival.plane.lon], {
        icon: divIcon(`plane-marker selected sim-plane-marker scheduled-plane-marker ${activeDecision}`, "&#9992;", arrival.plane.heading || 0),
        zIndexOffset: 1800
      }).bindTooltip(`${arrival.callsign}: ${activeDecision}`, { direction: "top", offset: [0, -14] }).addTo(state.layers.emergency);
    }
  });
}

function activeRouteColor(sim, glow = false) {
  if (sim.routeMode?.includes("ship") || sim.routeMode === "maritime-landing") return glow ? "#f5a6ff" : "#ffc7ff";
  if (sim.routeMode?.includes("mechanical")) return glow ? "#ffca6b" : "#ffe8a8";
  if (sim.routeMode?.includes("pilot") || sim.routeMode?.includes("ai-route")) return glow ? "#55d6c2" : "#c7fff5";
  return glow ? "#78a8ff" : "#d5e4ff";
}

function divIcon(className, html = "", rotation = 0) {
  return L.divIcon({
    className: "",
    html: `<div class="${className}" style="transform: rotate(${rotation}deg)">${html}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });
}

function googleHtmlMarker(position, html, className) {
  const overlay = new google.maps.OverlayView();
  overlay.onAdd = function onAdd() {
    this.div = document.createElement("div");
    this.div.className = className;
    this.div.innerHTML = html;
    (this.getPanes().floatPane || this.getPanes().overlayMouseTarget).appendChild(this.div);
  };
  overlay.draw = function draw() {
    const projection = this.getProjection();
    const point = projection?.fromLatLngToDivPixel(new google.maps.LatLng(position.lat, position.lng));
    if (!point || !this.div) return;
    this.div.style.left = `${point.x}px`;
    this.div.style.top = `${point.y}px`;
  };
  overlay.onRemove = function onRemove() {
    this.div?.remove();
    this.div = null;
  };
  overlay.setMap(googleMap);
  return overlay;
}

function googlePoint(point) {
  return {
    lat: point.lat,
    lng: Number.isFinite(point.googleLon) ? point.googleLon : point.lon
  };
}

function googlePathFromRoute(route, referenceLng) {
  if (!route?.length) return [];
  let previousLng = Number.isFinite(referenceLng)
    ? referenceLng
    : Number.isFinite(route[0].googleLon) ? route[0].googleLon : route[0].lon;
  return route.map((point, index) => {
    const lng = index === 0 && Number.isFinite(point.googleLon)
      ? point.googleLon
      : unwrapLonNear(point.lon, previousLng);
    previousLng = lng;
    return { lat: point.lat, lng };
  });
}

function clearGoogle(layerName) {
  state.googleOverlays[layerName].forEach((overlay) => overlay.setMap?.(null));
  state.googleOverlays[layerName] = [];
}

function googleSymbol(color, type, scale) {
  if (type === "ship") {
    return {
      path: "M 0 -8 L 8 3 L 3 8 L -3 8 L -8 3 Z",
      fillColor: color,
      fillOpacity: 1,
      strokeColor: "#071114",
      strokeWeight: 1,
      scale: 1
    };
  }
  return {
    path: google.maps.SymbolPath.CIRCLE,
    fillColor: color,
    fillOpacity: 1,
    strokeColor: "#071114",
    strokeWeight: 1,
    scale
  };
}

function googlePlaneIcon(color, heading, scale = 0.85) {
  return {
    path: "M 0 -15 L 2 -10 L 3 0 L 15 5 L 15 8 L 3 5 L 2 12 L 6 15 L 6 17 L 0 16 L -6 17 L -6 15 L -2 12 L -3 5 L -15 8 L -15 5 L -3 0 L -2 -10 Z",
    fillColor: color,
    fillOpacity: 1,
    strokeColor: "#071114",
    strokeWeight: 1.5,
    rotation: heading,
    scale
  };
}

function scenarioLabel() {
  const labels = { cyclone: "cyclone penetration", mechanical: "mechanical failure", pilot: "pilot failure", gps: "GPS/ATC loss" };
  return [...state.scenarios].map((key) => labels[key]).join(" + ");
}

function makeFlightSimPlane(point, heading) {
  return {
    id: "REALISTIC-SIM-01",
    callsign: `MAYDAY-${state.flightSim.origin?.code || "SIM"}${state.flightSim.destination?.code || ""}`,
    country: state.flightSim.origin?.country || "Simulation",
    lat: point.lat,
    lon: wrapLon(point.lon),
    altitude: state.flightSim.phase === "takeoff" ? 18000 : state.flightSim.phase === "landing" ? 9000 : 37000,
    speed: state.flightSim.failureTriggered ? 310 : 488,
    heading: Math.round(heading),
    verticalRate: 0,
    onGround: false,
    source: "Pacific flight simulation"
  };
}

function pointAlongRoute(route, progress) {
  if (!route.length) return null;
  if (route.length === 1) return route[0];
  const legs = [];
  let total = 0;
  for (let i = 0; i < route.length - 1; i += 1) {
    const distance = km(route[i].lat, route[i].lon, route[i + 1].lat, route[i + 1].lon);
    legs.push(distance);
    total += distance;
  }
  let target = total * Math.max(0, Math.min(1, progress));
  for (let i = 0; i < legs.length; i += 1) {
    if (target <= legs[i]) {
      const f = target / Math.max(1, legs[i]);
      return interpolateGeo(route[i], route[i + 1], f);
    }
    target -= legs[i];
  }
  return route[route.length - 1];
}

function pointAlongSpline(route, progress) {
  if (!route.length) return null;
  if (route.length === 1) return route[0];
  if (route.length === 2) return pointAlongRoute(route, progress);
  // Routes with many points already have smooth arc waypoints; skip extra spline
  if (route.length > 6) return pointAlongRoute(route, progress);
  const splinePoints = catmullRomChain(route, 40);
  return pointAlongRoute(splinePoints, progress);
}

function routeSegmentByProgress(route, startProgress, endProgress) {
  if (!isUsableRoute(route)) return [];
  const start = clamp(startProgress, 0, 1);
  const end = clamp(endProgress, 0, 1);
  if (end <= start) return [];
  const dense = route.length > 6 ? route : catmullRomChain(route, 28);
  const startPoint = pointAlongRoute(dense, start);
  const endPoint = pointAlongRoute(dense, end);
  if (!hasGeoPoint(startPoint) || !hasGeoPoint(endPoint)) return [];
  const legs = [];
  let total = 0;
  for (let i = 0; i < dense.length - 1; i += 1) {
    const distance = km(dense[i].lat, dense[i].lon, dense[i + 1].lat, dense[i + 1].lon);
    legs.push(distance);
    total += distance;
  }
  let travelled = 0;
  const startKm = total * start;
  const endKm = total * end;
  const segment = [startPoint];
  for (let i = 1; i < dense.length - 1; i += 1) {
    travelled += legs[i - 1];
    if (travelled > startKm && travelled < endKm) segment.push(dense[i]);
  }
  segment.push(endPoint);
  return dedupeRoute(segment);
}

function catmullRomChain(waypoints, segmentsPerLeg) {
  if (waypoints.length < 2) return [...waypoints];
  const extended = [
    extrapolatePoint(waypoints[1], waypoints[0]),
    ...waypoints,
    extrapolatePoint(waypoints[waypoints.length - 2], waypoints[waypoints.length - 1])
  ];
  const result = [];
  for (let i = 1; i < extended.length - 2; i += 1) {
    const p0 = extended[i - 1];
    const p1 = extended[i];
    const p2 = extended[i + 1];
    const p3 = extended[i + 2];
    const segs = i === 1 || i === extended.length - 3 ? Math.ceil(segmentsPerLeg * 0.6) : segmentsPerLeg;
    for (let s = 0; s < segs; s += 1) {
      const t = s / segs;
      result.push(catmullRomPoint(p0, p1, p2, p3, t));
    }
  }
  result.push(waypoints[waypoints.length - 1]);
  return result;
}

function catmullRomPoint(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  const lat0 = p0.lat, lat1 = p1.lat, lat2 = p2.lat, lat3 = p3.lat;
  const lon0 = unwrapLonNear(p0.lon, p1.lon);
  const lon1 = p1.lon;
  const lon2 = unwrapLonNear(p2.lon, p1.lon);
  const lon3 = unwrapLonNear(p3.lon, p1.lon);
  const lat = 0.5 * ((2 * lat1) + (-lat0 + lat2) * t + (2 * lat0 - 5 * lat1 + 4 * lat2 - lat3) * t2 + (-lat0 + 3 * lat1 - 3 * lat2 + lat3) * t3);
  const lon = 0.5 * ((2 * lon1) + (-lon0 + lon2) * t + (2 * lon0 - 5 * lon1 + 4 * lon2 - lon3) * t2 + (-lon0 + 3 * lon1 - 3 * lon2 + lon3) * t3);
  return { lat, lon: wrapLon(lon) };
}

function extrapolatePoint(from, to) {
  return {
    lat: to.lat + (to.lat - from.lat),
    lon: wrapLon(to.lon + (unwrapLonNear(to.lon, from.lon) - unwrapLonNear(from.lon, to.lon)))
  };
}

function interpolateGeo(a, b, fraction) {
  const lonA = unwrapLonNear(a.lon, b.lon);
  const lonB = unwrapLonNear(b.lon, lonA);
  return {
    lat: a.lat + (b.lat - a.lat) * fraction,
    lon: wrapLon(lonA + (lonB - lonA) * fraction)
  };
}

function remainingRouteKm(route, plane) {
  if (!route.length || !plane) return 0;
  return km(plane.lat, plane.lon, route[route.length - 1].lat, route[route.length - 1].lon);
}

function stormAvoidanceRoute(plane, target, storm) {
  const start = { lat: plane.lat, lon: plane.lon };
  const end = { lat: target.lat, lon: target.lon };
  if (!storm) return smoothFlyableRoute([start, end]);
  const radius = stormKeepoutRadiusKm(storm) + cruiseTurnRadiusKm(488, CRUISE_TURN_BANK_DEG) + 25;
  const projection = localStormProjection(storm);
  const s = projection.toXY(start);
  const e = projection.toXY(end);
  if (!segmentCircleRisk(s, e, radius)) return smoothFlyableRoute([start, end]);

  const startTangents = tangentPointsFromPoint(s, radius);
  const endTangents = tangentPointsFromPoint(e, radius);
  if (!startTangents.length || !endTangents.length) {
    return smoothFlyableRoute(emergencyRadialEscapeRoute(s, e, radius, projection));
  }

  let best = null;
  for (const a of startTangents) {
    for (const b of endTangents) {
      for (const direction of [-1, 1]) {
        const sweep = directedAngle(a.angle, b.angle, direction);
        const length = distanceXY(s, a) + Math.abs(sweep) * radius + distanceXY(b, e);
        if (!best || length < best.length) best = { a, b, direction, sweep, length };
      }
    }
  }
  if (!best) return [start, end];

  const arcSteps = Math.max(5, Math.ceil(Math.abs(best.sweep) / (Math.PI / 12)));
  const route = [start, projection.toLatLon(best.a)];
  for (let i = 1; i < arcSteps; i += 1) {
    const angle = best.a.angle + (best.sweep * i) / arcSteps;
    route.push(projection.toLatLon({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius }));
  }
  route.push(projection.toLatLon(best.b), end);
  return smoothFlyableRoute(dedupeRoute(route));
}

function buildAvoidanceManeuverRoute(plane, route, storm) {
  if (!plane || !storm || route.length < 2) return route;
  const projection = localRouteProjection(plane);
  const start = projection.toXY(plane);
  const stormPoint = projection.toXY(storm);
  const headingRad = (plane.heading || bearing(route[0].lat, route[0].lon, route[1].lat, route[1].lon) || 72) * Math.PI / 180;
  const heading = { x: Math.sin(headingRad), y: Math.cos(headingRad) };
  const toStorm = normalizeXY({ x: stormPoint.x - start.x, y: stormPoint.y - start.y });
  const stormSide = toStorm ? heading.x * toStorm.y - heading.y * toStorm.x : 1;
  const turnSide = stormSide >= 0 ? -1 : 1;
  const normal = turnSide > 0
    ? { x: -heading.y, y: heading.x }
    : { x: heading.y, y: -heading.x };
  const radius = Math.max(140, cruiseTurnRadiusKm(488, CRUISE_TURN_BANK_DEG) * 3.2);
  const outboundLegKm = Math.max(90, radius * 0.55);
  const arcStart = {
    x: start.x + heading.x * outboundLegKm,
    y: start.y + heading.y * outboundLegKm
  };
  const center = {
    x: arcStart.x + normal.x * radius,
    y: arcStart.y + normal.y * radius
  };
  const startAngle = Math.atan2(arcStart.y - center.y, arcStart.x - center.x);
  const sweep = turnSide > 0 ? Math.PI * 0.96 : -Math.PI * 0.96;
  const arcPoints = [plane];
  const steps = 18;
  for (let i = 0; i <= steps; i += 1) {
    const angle = startAngle + (sweep * i) / steps;
    arcPoints.push(projection.toLatLon({
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius
    }));
  }
  const joined = smoothFlyableRoute([...arcPoints, ...route.slice(1)]);
  const keepout = stormKeepoutRadiusKm(storm);
  return routeStormClearanceKm(joined, storm) > keepout ? joined : route;
}

function smoothEmergencyTurnRoute(plane, route) {
  if (!plane || !route?.length || route.length < 2) return route;
  const target = route[route.length - 1];
  const start = { lat: plane.lat, lon: plane.lon };
  const currentHeading = plane.heading ?? bearing(route[0].lat, route[0].lon, route[1].lat, route[1].lon);
  const targetHeading = bearing(start.lat, start.lon, target.lat, target.lon);
  const delta = signedHeadingDelta(currentHeading, targetHeading);
  const turnDirection = delta >= 0 ? 1 : -1;
  const projection = localRouteProjection(start);
  const startXY = projection.toXY(start);
  const headingRad = currentHeading * Math.PI / 180;
  const forward = { x: Math.sin(headingRad), y: Math.cos(headingRad) };
  const normal = turnDirection > 0
    ? { x: Math.cos(headingRad), y: -Math.sin(headingRad) }
    : { x: -Math.cos(headingRad), y: Math.sin(headingRad) };
  const radius = Math.max(70, cruiseTurnRadiusKm(430, 22) * 2.1);
  const arcSweep = clamp(Math.abs(delta) * Math.PI / 180, Math.PI / 7, Math.PI * 0.92) * turnDirection;
  const center = {
    x: startXY.x + normal.x * radius,
    y: startXY.y + normal.y * radius
  };
  const startAngle = Math.atan2(startXY.y - center.y, startXY.x - center.x);
  const points = [start];
  const steps = 16;
  for (let i = 1; i <= steps; i += 1) {
    const angle = startAngle + (arcSweep * i) / steps;
    points.push(projection.toLatLon({
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius
    }));
  }
  const exit = points[points.length - 1];
  const merge = interpolateGeo(exit, target, 0.22);
  const direct = [exit, merge, target];
  return smoothFlyableRoute(dedupeRoute([...points, ...direct]));
}

function signedHeadingDelta(from, to) {
  return ((((to - from) % 360) + 540) % 360) - 180;
}

function stormKeepoutRadiusKm(storm) {
  return Math.max(260, storm.radius + 120);
}

function localStormProjection(storm) {
  const kmPerLat = 111.32;
  const kmPerLon = 111.32 * Math.max(0.2, Math.cos(storm.lat * Math.PI / 180));
  return {
    toXY(point) {
      return {
        x: (unwrapLonNear(point.lon, storm.lon) - storm.lon) * kmPerLon,
        y: (point.lat - storm.lat) * kmPerLat
      };
    },
    toLatLon(point) {
      return {
        lat: storm.lat + point.y / kmPerLat,
        lon: wrapLon(storm.lon + point.x / kmPerLon)
      };
    }
  };
}

function tangentPointsFromPoint(point, radius) {
  const d = Math.hypot(point.x, point.y);
  if (d <= radius + 1) return [];
  const theta = Math.atan2(point.y, point.x);
  const alpha = Math.acos(radius / d);
  return [theta + alpha, theta - alpha].map((angle) => ({
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
    angle
  }));
}

function directedAngle(from, to, direction) {
  let delta = normalizeAngle(to - from);
  if (direction > 0 && delta < 0) delta += Math.PI * 2;
  if (direction < 0 && delta > 0) delta -= Math.PI * 2;
  return delta;
}

function normalizeAngle(angle) {
  let value = angle;
  while (value <= -Math.PI) value += Math.PI * 2;
  while (value > Math.PI) value -= Math.PI * 2;
  return value;
}

function segmentCircleRisk(a, b, radius) {
  return pointSegmentDistanceXY({ x: 0, y: 0 }, a, b) < radius;
}

function emergencyRadialEscapeRoute(start, end, radius, projection) {
  const outward = Math.atan2(start.y, start.x);
  const escape = {
    x: Math.cos(outward) * (radius + 120),
    y: Math.sin(outward) * (radius + 120)
  };
  return dedupeRoute([projection.toLatLon(start), projection.toLatLon(escape), projection.toLatLon(end)]);
}

function routeStormClearanceKm(route, storm) {
  if (!storm || route.length < 2) return 99999;
  const projection = localStormProjection(storm);
  let clearance = Infinity;
  for (let i = 0; i < route.length - 1; i += 1) {
    clearance = Math.min(clearance, pointSegmentDistanceXY({ x: 0, y: 0 }, projection.toXY(route[i]), projection.toXY(route[i + 1])));
  }
  return clearance;
}

function smoothFlyableRoute(route, speedKt = 488, bankDeg = CRUISE_TURN_BANK_DEG) {
  if (route.length < 3) return dedupeRoute(route);
  const projection = localRouteProjection(route[0]);
  const points = route.map((point) => projection.toXY(point));
  const radius = cruiseTurnRadiusKm(speedKt, bankDeg);
  const smoothed = [route[0]];

  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = points[i - 1];
    const current = points[i];
    const next = points[i + 1];
    const inVec = normalizeXY({ x: current.x - prev.x, y: current.y - prev.y });
    const outVec = normalizeXY({ x: next.x - current.x, y: next.y - current.y });
    if (!inVec || !outVec) continue;

    const turnAngle = Math.acos(clamp(-(inVec.x * outVec.x + inVec.y * outVec.y), -1, 1));
    if (turnAngle < 0.05 || Math.PI - turnAngle < 0.03) {
      smoothed.push(route[i]);
      continue;
    }

    const inboundLen = distanceXY(prev, current);
    const outboundLen = distanceXY(current, next);
    const requestedOffset = radius / Math.tan(turnAngle / 2);
    const offset = Math.min(requestedOffset, inboundLen * 0.42, outboundLen * 0.42);
    const actualRadius = Math.max(8, offset * Math.tan(turnAngle / 2));
    const entry = { x: current.x - inVec.x * offset, y: current.y - inVec.y * offset };
    const exit = { x: current.x + outVec.x * offset, y: current.y + outVec.y * offset };
    const cross = inVec.x * outVec.y - inVec.y * outVec.x;
    const normal = cross >= 0 ? { x: -inVec.y, y: inVec.x } : { x: inVec.y, y: -inVec.x };
    const center = { x: entry.x + normal.x * actualRadius, y: entry.y + normal.y * actualRadius };
    const startAngle = Math.atan2(entry.y - center.y, entry.x - center.x);
    const endAngle = Math.atan2(exit.y - center.y, exit.x - center.x);
    const sweep = directedAngle(startAngle, endAngle, cross >= 0 ? 1 : -1);
    const steps = Math.max(4, Math.ceil(Math.abs(sweep) / (Math.PI / 18)));

    smoothed.push(projection.toLatLon(entry));
    for (let step = 1; step < steps; step += 1) {
      const angle = startAngle + (sweep * step) / steps;
      smoothed.push(projection.toLatLon({
        x: center.x + Math.cos(angle) * actualRadius,
        y: center.y + Math.sin(angle) * actualRadius
      }));
    }
    smoothed.push(projection.toLatLon(exit));
  }

  smoothed.push(route[route.length - 1]);
  return dedupeRoute(smoothed);
}

function cruiseTurnRadiusKm(speedKt, bankDeg) {
  const speedMs = speedKt * 0.514444;
  const bankRad = bankDeg * Math.PI / 180;
  const physicsRadius = (speedMs * speedMs) / (9.80665 * Math.tan(bankRad)) / 1000;
  return Math.max(MIN_CRUISE_TURN_RADIUS_KM, physicsRadius);
}

function localRouteProjection(anchor) {
  const kmPerLat = 111.32;
  const kmPerLon = 111.32 * Math.max(0.2, Math.cos(anchor.lat * Math.PI / 180));
  return {
    toXY(point) {
      return {
        x: (unwrapLonNear(point.lon, anchor.lon) - anchor.lon) * kmPerLon,
        y: (point.lat - anchor.lat) * kmPerLat
      };
    },
    toLatLon(point) {
      return {
        lat: anchor.lat + point.y / kmPerLat,
        lon: wrapLon(anchor.lon + point.x / kmPerLon)
      };
    }
  };
}

function normalizeXY(vector) {
  const length = Math.hypot(vector.x, vector.y);
  if (length < 0.0001) return null;
  return { x: vector.x / length, y: vector.y / length };
}

function pointSegmentDistanceXY(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const denom = dx * dx + dy * dy;
  if (denom <= 0.0001) return distanceXY(point, a);
  const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / denom, 0, 1);
  return distanceXY(point, { x: a.x + dx * t, y: a.y + dy * t });
}

function distanceXY(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function dedupeRoute(route) {
  return route.filter((point, index) => {
    if (index === 0) return true;
    const previous = route[index - 1];
    return km(previous.lat, previous.lon, point.lat, point.lon) > 1;
  });
}

function routeTotalKm(route) {
  let total = 0;
  for (let i = 0; i < route.length - 1; i++) {
    total += km(route[i].lat, route[i].lon, route[i + 1].lat, route[i + 1].lon);
  }
  return total;
}

function bearing(lat1, lon1, lat2, lon2) {
  const p1 = lat1 * Math.PI / 180;
  const p2 = lat2 * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function unwrapLonNear(lon, reference) {
  let value = lon;
  while (value - reference > 180) value -= 360;
  while (reference - value > 180) value += 360;
  return value;
}

function kmToStormLine(plane, airport) {
  if (!state.storm) return 99999;
  const a = { x: plane.lon, y: plane.lat };
  const b = { x: airport.lon, y: airport.lat };
  const c = { x: state.storm.lon, y: state.storm.lat };
  const t = clamp(((c.x - a.x) * (b.x - a.x) + (c.y - a.y) * (b.y - a.y)) / ((b.x - a.x) ** 2 + (b.y - a.y) ** 2), 0, 1);
  const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  return km(c.y, c.x, p.y, p.x);
}

function distanceToSegmentKm(lat, lon, lat1, lon1, lat2, lon2) {
  const a = { x: lon1, y: lat1 };
  const b = { x: unwrapLonNear(lon2, lon1), y: lat2 };
  const c = { x: unwrapLonNear(lon, lon1), y: lat };
  const denom = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  const t = denom ? clamp(((c.x - a.x) * (b.x - a.x) + (c.y - a.y) * (b.y - a.y)) / denom, 0, 1) : 0;
  const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  return km(c.y, c.x, p.y, p.x);
}

function km(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function avg(values) {
  const nums = values.filter(Number.isFinite);
  return nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : 0;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function wrapLon(lon) {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

function elapsed(ms) {
  const seconds = Math.floor(ms / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function downloadReport() {
  window.open("/report.pdf", "_blank");
}

function makePdf(lines) {
  const pageLines = chunk(lines, 36);
  const dynamicObjects = [];
  const pages = [];
  const fontId = 3;
  pageLines.forEach((group, pageIndex) => {
    const content = [
      "BT /F1 20 Tf 54 760 Td (MaydayOS Report) Tj ET",
      ...group.map((line, index) => `BT /F1 ${index === 0 && pageIndex === 0 ? 16 : 10} Tf 54 ${730 - index * 18} Td (${pdfEscape(line)}) Tj ET`)
    ].join("\n");
    const contentId = 4 + dynamicObjects.length;
    dynamicObjects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    const pageId = 4 + dynamicObjects.length;
    dynamicObjects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    pages.push(`${pageId} 0 R`);
  });
  const all = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pages.join(" ")}] /Count ${pages.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ...dynamicObjects
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  all.forEach((obj, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${all.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer << /Size ${all.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return pdf;
}

function chunk(items, size) {
  const output = [];
  for (let i = 0; i < items.length; i += size) output.push(items.slice(i, i + size));
  return output;
}

function pdfEscape(text) {
  return String(text).replace(/[\\()]/g, "\\$&").replace(/[^\x20-\x7E]/g, "");
}
