import http from "node:http";
import { readFile } from "node:fs/promises";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");

loadEnv(path.join(__dirname, ".env"));

const PORT = Number(process.env.PORT || 3000);
const AIS_BBOX = parseAisBoundingBox(process.env.AISSTREAM_BBOX);
const OPEN_SKY_TOKEN_URL =
  "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";
const OPEN_SKY_STATES_URL = "https://opensky-network.org/api/states/all";
const ADSB_FI_BASE_URL = "https://opendata.adsb.fi/api/v2/lat";
const AIRPORTS_CSV_URL = "https://davidmegginson.github.io/ourairports-data/airports.csv";
const TERRAIN_ALERT_AUDIO = process.env.TERRAIN_ALERT_AUDIO || "C:\\Users\\Vishal\\Desktop\\New folder (3)\\terrain.mp3";
const ADSB_FI_REGIONS = [
  [35, 139, 250],
  [22, 78, 450],
  [39, -98, 650],
  [50, 8, 450],
  [1, 104, 350],
  [-33, 151, 350],
  [-15, -146, 350]
];

let tokenCache = { token: "", expiresAt: 0 };
let aircraftCache = { time: 0, aircraft: [] };
let airportsCache = { time: 0, airports: [] };
let openSkyBackoffUntil = 0;
let shipCache = [];
let aisStarted = false;
let ultrasonicSerialStarted = false;

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".mp3": "audio/mpeg"
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    if (url.pathname === "/api/flights") {
      return sendJson(res, await getFlights(url));
    }
    if (url.pathname === "/api/ships") {
      maybeStartAisStream();
      return sendJson(res, {
        source: shipCache.length ? "aisstream-or-simulated-cache" : "simulated",
        ships: buildShips(url)
      });
    }
    if (url.pathname === "/api/airports") {
      return sendJson(res, await getAirports());
    }
    if (url.pathname === "/api/health") {
      return sendJson(res, {
        ok: true,
        openskyConfigured: Boolean(process.env.OPENSKY_CLIENT_ID && process.env.OPENSKY_CLIENT_SECRET),
        aisConfigured: Boolean(process.env.AISSTREAM_API_KEY),
        aisLive: process.env.AISSTREAM_LIVE === "true",
        cesiumConfigured: Boolean(process.env.CESIUM_ION_TOKEN),
        googleMapsConfigured: Boolean(process.env.GOOGLE_MAPS_API_KEY),
        rainViewerConfigured: true
      });
    }
    if (url.pathname === "/api/config") {
      return sendJson(res, {
        cesiumIonToken: process.env.CESIUM_ION_TOKEN || "",
        googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || "",
        weatherProvider: "rainviewer"
      });
    }
    if (url.pathname === "/api/weather/check") {
      return sendJson(res, await checkRainViewerWeather());
    }
    if (url.pathname === "/api/weather/catalog") {
      return sendJson(res, await getRainViewerCatalog());
    }
    if (url.pathname === "/api/sos/telegram" && req.method === "POST") {
      const payload = await readJsonBody(req);
      const result = await sendTelegramSos(payload);
      return sendJson(res, result, result.ok ? 200 : 400);
    }
    if (url.pathname === "/terrain-alert.mp3") {
      return serveTerrainAlertAudio(res);
    }
    if (url.pathname === "/api/ultrasonic") {
      const distanceCm = Number(url.searchParams.get("cm") || url.searchParams.get("distance"));
      if (!Number.isFinite(distanceCm)) {
        return sendJson(res, { ok: false, error: "Provide ?cm=<distance in centimeters>" }, 400);
      }
      const payload = {
        distanceCm,
        triggered: distanceCm <= 5,
        source: "esp32-hc-sr04",
        updatedAt: Date.now()
      };
      io.emit("update-ultrasonic", payload);
      return sendJson(res, { ok: true, ...payload });
    }
    return serveStatic(url.pathname, res);
  } catch (error) {
    sendJson(res, { error: error.message }, 500);
  }
});

server.listen(PORT, () => {
  console.log(`MaydayOS demo running at http://localhost:${PORT}`);
  maybeStartUltrasonicSerial();
});

const io = new Server(server);

io.on("connection", (socket) => {
  console.log("Device linked to MaydayOS Network");

  socket.on("phone-imu", (data) => {
    io.emit("update-imu", data);
  });
  
  socket.on("phone-accel", (data) => {
    io.emit("update-accel", data);
  });

  socket.on("ultrasonic", (data) => {
    const distanceCm = Number(data?.distanceCm ?? data?.distance ?? data?.cm);
    if (!Number.isFinite(distanceCm)) return;
    io.emit("update-ultrasonic", {
      distanceCm,
      triggered: distanceCm <= 5,
      source: "socket-ultrasonic",
      updatedAt: Date.now()
    });
  });
});

async function maybeStartUltrasonicSerial() {
  if (ultrasonicSerialStarted) return;
  ultrasonicSerialStarted = true;
  try {
    const { SerialPort } = await import("serialport");
    const portPath = process.env.ULTRASONIC_SERIAL_PORT || process.env.SERIAL_PORT || await detectEsp32SerialPort(SerialPort);
    if (!portPath) {
      console.log("Ultrasonic serial disabled. Set ULTRASONIC_SERIAL_PORT=COMx to read HC-SR04 over USB.");
      return;
    }
    const port = new SerialPort({
      path: portPath,
      baudRate: Number(process.env.ULTRASONIC_BAUD || 115200),
      autoOpen: true
    });
    let buffer = "";
    port.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";
      lines.forEach((line) => publishUltrasonicSerialLine(line, portPath));
    });
    port.on("open", () => {
      console.log(`Ultrasonic serial connected on ${portPath}`);
    });
    port.on("error", (error) => {
      console.warn(`Ultrasonic serial error on ${portPath}: ${error.message}`);
    });
  } catch (error) {
    console.warn("Ultrasonic serial unavailable. Run `npm install` after adding serialport, then set ULTRASONIC_SERIAL_PORT=COMx.");
    console.warn(error.message);
  }
}

async function detectEsp32SerialPort(SerialPort) {
  try {
    const ports = await SerialPort.list();
    const preferred = ports.find((port) => {
      const text = `${port.path} ${port.manufacturer || ""} ${port.friendlyName || ""} ${port.vendorId || ""}`.toLowerCase();
      return text.includes("cp210") || text.includes("ch340") || text.includes("usb-serial") || text.includes("silicon labs") || text.includes("wch") || text.includes("esp32");
    });
    const detected = preferred?.path || ports[0]?.path || "";
    if (detected) console.log(`Auto-detected ultrasonic serial candidate: ${detected}`);
    return detected;
  } catch (error) {
    console.warn(`Could not auto-detect serial port: ${error.message}`);
    return "";
  }
}

function publishUltrasonicSerialLine(line, portPath) {
  const trimmed = String(line || "").trim();
  if (!trimmed) return;
  const match = trimmed.match(/-?\d+(\.\d+)?/);
  if (!match) return;
  const distanceCm = Number(match[0]);
  if (!Number.isFinite(distanceCm) || distanceCm <= 0) return;
  io.emit("update-ultrasonic", {
    distanceCm,
    triggered: distanceCm <= 5,
    source: `usb-serial:${portPath}`,
    updatedAt: Date.now()
  });
}

function loadEnv(file) {
  if (!existsSync(file)) return;
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...rest] = trimmed.split("=");
    if (!process.env[key]) process.env[key] = rest.join("=");
  }
}

async function getAirports() {
  const cachedFresh = Date.now() - airportsCache.time < 24 * 60 * 60 * 1000;
  if (cachedFresh && airportsCache.airports.length) {
    return { source: "ourairports-cache", airports: airportsCache.airports };
  }
  try {
    const response = await fetch(AIRPORTS_CSV_URL, {
      headers: { "User-Agent": "MaydayOS hackathon demo" }
    });
    if (!response.ok) throw new Error(`OurAirports ${response.status}`);
    const csv = await response.text();
    const airports = parseAirportsCsv(csv);
    airportsCache = { time: Date.now(), airports };
    return { source: "ourairports", airports };
  } catch (error) {
    return {
      source: "fallback",
      warning: error.message,
      airports: fallbackAirports()
    };
  }
}

function parseAirportsCsv(csv) {
  const lines = csv.split(/\r?\n/);
  const headers = parseCsvLine(lines.shift() || "");
  const index = Object.fromEntries(headers.map((name, i) => [name, i]));
  return lines
    .map(parseCsvLine)
    .filter((row) => row.length > 10 && row[index.type] !== "closed" && row[index.iata_code])
    .map((row) => ({
      code: row[index.iata_code],
      ident: row[index.ident],
      name: row[index.name],
      lat: Number(row[index.latitude_deg]),
      lon: Number(row[index.longitude_deg]),
      country: row[index.iso_country],
      municipality: row[index.municipality],
      type: row[index.type],
      runway: runwayEstimate(row[index.type])
    }))
    .filter((airport) => airport.code && Number.isFinite(airport.lat) && Number.isFinite(airport.lon))
    .sort((a, b) => airportTypeRank(a.type) - airportTypeRank(b.type) || a.code.localeCompare(b.code))
    .slice(0, 9000);
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"' && line[i + 1] === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

function airportTypeRank(type) {
  return ({ large_airport: 0, medium_airport: 1, small_airport: 2, heliport: 3, seaplane_base: 4 }[type] ?? 9);
}

function runwayEstimate(type) {
  return type === "large_airport" ? 3900 : type === "medium_airport" ? 2600 : type === "small_airport" ? 1400 : 900;
}

function fallbackAirports() {
  return [
    ["DEL", "Delhi IGI", 28.556, 77.1, 4430, "IN"],
    ["BOM", "Mumbai CSMIA", 19.089, 72.865, 3445, "IN"],
    ["HND", "Tokyo Haneda", 35.549, 139.78, 3360, "JP"],
    ["NRT", "Tokyo Narita", 35.771, 140.392, 4000, "JP"],
    ["SFO", "San Francisco", 37.619, -122.375, 3618, "US"],
    ["LAX", "Los Angeles", 33.942, -118.408, 3685, "US"],
    ["JFK", "New York JFK", 40.641, -73.778, 4442, "US"],
    ["HNL", "Honolulu", 21.319, -157.922, 3760, "US"],
    ["ANC", "Anchorage", 61.174, -149.998, 3531, "US"],
    ["PPT", "Tahiti Faa'a", -17.553, -149.607, 3420, "PF"],
    ["SIN", "Singapore Changi", 1.364, 103.991, 4000, "SG"],
    ["DXB", "Dubai", 25.253, 55.365, 4447, "AE"],
    ["LHR", "London Heathrow", 51.47, -0.454, 3902, "GB"],
    ["SYD", "Sydney", -33.939, 151.175, 3962, "AU"]
  ].map(([code, name, lat, lon, runway, country]) => ({ code, name, lat, lon, runway, country, municipality: "", type: "large_airport" }));
}

async function serveStatic(urlPath, res) {
  const cleanPath = urlPath === "/" ? "/index.html" : decodeURIComponent(urlPath);
  const target = path.normalize(path.join(publicDir, cleanPath));
  if (!target.startsWith(publicDir)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  if (!existsSync(target)) {
    res.writeHead(404);
    return res.end("Not found");
  }
  res.writeHead(200, {
    "Content-Type": contentTypes[path.extname(target)] || "application/octet-stream",
    "Cache-Control": "no-store"
  });
  createReadStream(target).pipe(res);
}

function serveTerrainAlertAudio(res) {
  if (!existsSync(TERRAIN_ALERT_AUDIO)) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
    return res.end(`Terrain alert audio not found at ${TERRAIN_ALERT_AUDIO}`);
  }
  res.writeHead(200, {
    "Content-Type": "audio/mpeg",
    "Cache-Control": "no-store"
  });
  createReadStream(TERRAIN_ALERT_AUDIO).pipe(res);
}

async function getFlights(url) {
  const bounds = parseFlightBounds(url.searchParams);
  if (!bounds) {
    return {
      source: "viewport-required",
      warning: "Flight traffic is loaded only for the current map viewport.",
      time: Math.floor(Date.now() / 1000),
      aircraft: []
    };
  }
  try {
    if (Date.now() < openSkyBackoffUntil) throw new Error("OpenSky backoff after rate limit");
    const token = await getOpenSkyToken();
    const qs = new URLSearchParams(bounds);
    const response = await fetch(`${OPEN_SKY_STATES_URL}?${qs}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    if (!response.ok) throw new Error(`OpenSky ${response.status}`);
    const data = await response.json();
    const aircraft = (data.states || [])
      .map(mapOpenSkyState)
      .filter((plane) => Number.isFinite(plane.lat) && Number.isFinite(plane.lon))
      .filter((plane) => inBounds(plane, bounds))
      .slice(0, 899);
    aircraft.unshift(frenchPolynesiaDemoAircraft());
    const boundedAircraft = filterAircraftByBounds(aircraft, bounds);
    aircraftCache = { time: Date.now(), aircraft: boundedAircraft };
    return { source: "opensky", time: data.time || Math.floor(Date.now() / 1000), aircraft: boundedAircraft };
  } catch (error) {
    if (String(error.message).includes("429")) openSkyBackoffUntil = Date.now() + 5 * 60 * 1000;
    try {
      const aircraft = filterAircraftByBounds(await getAdsbFiFlights(), bounds);
      if (aircraft.length) {
        aircraftCache = { time: Date.now(), aircraft };
        return {
          source: "adsb.fi-live",
          warning: `OpenSky unavailable: ${error.message}`,
          time: Math.floor(Date.now() / 1000),
          aircraft
        };
      }
    } catch {
      // Fall through to cache or simulation.
    }
    const cachedFresh = Date.now() - aircraftCache.time < 10 * 60 * 1000;
    return {
      source: cachedFresh ? "opensky-cache" : "simulated",
      warning: error.message,
      time: Math.floor(Date.now() / 1000),
      aircraft: filterAircraftByBounds(cachedFresh ? ensureFrenchPolynesiaAircraft(aircraftCache.aircraft) : simulatedAircraft(), bounds)
    };
  }
}

function parseFlightBounds(params) {
  const required = ["lamin", "lomin", "lamax", "lomax"];
  if (required.some((key) => !params.has(key))) return null;
  const bounds = {
    lamin: Number(params.get("lamin")),
    lomin: Number(params.get("lomin")),
    lamax: Number(params.get("lamax")),
    lomax: Number(params.get("lomax"))
  };
  if (Object.values(bounds).some((value) => !Number.isFinite(value))) return null;
  bounds.lamin = Math.max(-85, Math.min(85, bounds.lamin));
  bounds.lamax = Math.max(-85, Math.min(85, bounds.lamax));
  bounds.lomin = wrapLon(bounds.lomin);
  bounds.lomax = wrapLon(bounds.lomax);
  if (bounds.lamin > bounds.lamax) [bounds.lamin, bounds.lamax] = [bounds.lamax, bounds.lamin];
  return bounds;
}

async function getAdsbFiFlights() {
  const regions = await Promise.allSettled(ADSB_FI_REGIONS.map(async ([lat, lon, dist]) => {
    const response = await fetch(`${ADSB_FI_BASE_URL}/${lat}/lon/${lon}/dist/${dist}`, {
      headers: { "User-Agent": "MaydayOS hackathon demo" }
    });
    if (!response.ok) throw new Error(`adsb.fi ${response.status}`);
    return await response.json();
  }));
  const seen = new Set();
  const aircraft = [];
  for (const result of regions) {
    if (result.status !== "fulfilled") continue;
    for (const plane of result.value.aircraft || []) {
      const mapped = mapAdsbFiState(plane);
      if (!mapped || seen.has(mapped.id)) continue;
      seen.add(mapped.id);
      aircraft.push(mapped);
      if (aircraft.length >= 899) break;
    }
  }
  return ensureFrenchPolynesiaAircraft(aircraft);
}

async function getOpenSkyToken() {
  if (!process.env.OPENSKY_CLIENT_ID || !process.env.OPENSKY_CLIENT_SECRET) return "";
  if (tokenCache.token && Date.now() < tokenCache.expiresAt - 60_000) return tokenCache.token;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: process.env.OPENSKY_CLIENT_ID,
    client_secret: process.env.OPENSKY_CLIENT_SECRET
  });
  const response = await fetch(OPEN_SKY_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  if (!response.ok) throw new Error(`OpenSky auth ${response.status}`);
  const data = await response.json();
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + Number(data.expires_in || 1800) * 1000
  };
  return tokenCache.token;
}

function mapOpenSkyState(state) {
  return {
    id: state[0],
    callsign: String(state[1] || "UNKNOWN").trim(),
    country: state[2],
    lastPosition: state[3],
    lastContact: state[4],
    lon: state[5],
    lat: state[6],
    altitude: Math.round(state[7] || state[13] || 0),
    onGround: Boolean(state[8]),
    speed: Math.round((state[9] || 0) * 1.94384),
    heading: Math.round(state[10] || 0),
    verticalRate: Math.round(state[11] || 0),
    squawk: state[14],
    source: "OpenSky ADS-B"
  };
}

function mapAdsbFiState(plane) {
  if (!Number.isFinite(plane.lat) || !Number.isFinite(plane.lon)) return null;
  return {
    id: plane.hex || plane.flight?.trim() || `adsb-${plane.lat}-${plane.lon}`,
    callsign: String(plane.flight || plane.r || "ADS-B").trim(),
    country: plane.r || plane.desc || "ADS-B",
    lastPosition: Math.floor(Date.now() / 1000 - Number(plane.seen_pos || 0)),
    lastContact: Math.floor(Date.now() / 1000 - Number(plane.seen || 0)),
    lon: plane.lon,
    lat: plane.lat,
    altitude: Math.round(Number(plane.alt_baro === "ground" ? 0 : plane.alt_baro || plane.alt_geom || 0)),
    onGround: plane.alt_baro === "ground",
    speed: Math.round(Number(plane.gs || plane.tas || 0)),
    heading: Math.round(Number(plane.track || plane.mag_heading || plane.true_heading || 0)),
    verticalRate: Math.round(Number(plane.baro_rate || plane.geom_rate || 0)),
    squawk: plane.squawk,
    source: "adsb.fi live ADS-B"
  };
}

function simulatedAircraft() {
  const now = Date.now() / 1000;
  const routes = [
    ["AI204", 28.57, 77.1, 190, 37000, "India"],
    ["UAE517", 25.25, 55.36, 115, 39000, "United Arab Emirates"],
    ["BA142", 51.47, -0.45, 272, 36000, "United Kingdom"],
    ["SIA321", 1.35, 103.99, 315, 41000, "Singapore"],
    ["QFA12", -33.94, 151.18, 42, 38000, "Australia"],
    ["DAL88", 40.64, -73.78, 81, 34000, "United States"],
    ["JAL44", 35.55, 139.78, 68, 33000, "Japan"],
    ["AF225", 48.85, 2.35, 246, 35000, "France"],
    ["IGO817", 19.09, 72.87, 162, 31000, "India"],
    ["KLM876", 52.31, 4.76, 294, 37000, "Netherlands"]
  ];
  return [
    frenchPolynesiaDemoAircraft(),
    ...routes.map(([callsign, lat, lon, heading, altitude, country], index) => ({
    id: `sim-${index}`,
    callsign,
    country,
    lat: lat + Math.sin(now / 160 + index) * 1.8,
    lon: lon + Math.cos(now / 140 + index) * 2.4,
    heading,
    altitude,
    speed: 430 + index * 8,
    verticalRate: index % 3 === 0 ? -2 : 0,
    onGround: false,
    source: "Demo fallback"
    }))
  ];
}

function frenchPolynesiaDemoAircraft() {
  const now = Date.now() / 1000;
  return {
    id: "demo-french-polynesia",
    callsign: "MAYDAY-FP01",
    country: "French Polynesia",
    lat: -15.25 + Math.sin(now / 120) * 0.12,
    lon: -146.9 + Math.cos(now / 135) * 0.16,
    heading: 118,
    altitude: 36000,
    speed: 462,
    verticalRate: 0,
    onGround: false,
    source: "Demo aircraft near French Polynesia"
  };
}

function ensureFrenchPolynesiaAircraft(aircraft) {
  return [
    frenchPolynesiaDemoAircraft(),
    ...aircraft.filter((plane) => plane.id !== "demo-french-polynesia")
  ].slice(0, 900);
}

function filterAircraftByBounds(aircraft, bounds) {
  return aircraft
    .filter((plane) => Number.isFinite(plane.lat) && Number.isFinite(plane.lon) && inBounds(plane, bounds))
    .slice(0, 900);
}

function inBounds(plane, bounds) {
  if (!bounds) return true;
  if (plane.lat < bounds.lamin || plane.lat > bounds.lamax) return false;
  const lon = wrapLon(plane.lon);
  const west = wrapLon(bounds.lomin);
  const east = wrapLon(bounds.lomax);
  return west <= east ? lon >= west && lon <= east : lon >= west || lon <= east;
}

function wrapLon(lon) {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

function maybeStartAisStream() {
  if (aisStarted || process.env.AISSTREAM_LIVE !== "true" || !process.env.AISSTREAM_API_KEY) return;
  if (typeof WebSocket === "undefined") return;
  aisStarted = true;
  try {
    const ws = new WebSocket("wss://stream.aisstream.io/v0/stream");
    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({
        APIKey: process.env.AISSTREAM_API_KEY,
        BoundingBoxes: [AIS_BBOX],
        FilterMessageTypes: ["PositionReport"]
      }));
    });
    ws.addEventListener("message", (event) => {
      try {
        const data = JSON.parse(event.data);
        const report = data.Message?.PositionReport;
        if (!report) return;
        const ship = {
          id: String(report.UserID),
          name: data.MetaData?.ShipName?.trim() || `MMSI ${report.UserID}`,
          lat: report.Latitude,
          lon: report.Longitude,
          speed: Math.round((report.Sog || 0) * 10) / 10,
          heading: Math.round(report.Cog || 0),
          type: "AIS live vessel"
        };
        shipCache = [ship, ...shipCache.filter((item) => item.id !== ship.id)].slice(0, 350);
      } catch {
        // Ignore malformed stream packets.
      }
    });
    ws.addEventListener("close", () => {
      aisStarted = false;
      setTimeout(maybeStartAisStream, 30_000);
    });
  } catch {
    aisStarted = false;
  }
}

function parseAisBoundingBox(value) {
  if (!value) return [[-15, 50], [30, 95]];
  const [minLat, minLon, maxLat, maxLon] = value.split(",").map(Number);
  if ([minLat, minLon, maxLat, maxLon].some((num) => !Number.isFinite(num))) return [[-15, 50], [30, 95]];
  return [[minLat, minLon], [maxLat, maxLon]];
}

function buildShips() {
  if (shipCache.length >= 20) return shipCache;
  const now = Date.now() / 1000;
  const simulated = [
    ["INS Sahyadri", 12.9, 73.9, "naval destroyer"],
    ["MV Ocean Resolve", 8.2, 76.6, "cargo ship"],
    ["USNS Mercy Demo", 16.1, 69.2, "hospital ship"],
    ["MV Pacific Arc", 1.2, 88.5, "container ship"],
    ["CG Sentinel", 21.4, 65.7, "coast guard"],
    ["MV Bengal Star", 13.0, 87.3, "commercial vessel"],
    ["INS Vikrant Demo", 14.6, 72.5, "carrier group"],
    ["MV Arabian Dawn", 23.7, 61.4, "tanker"],
    ["MV Pacific Trader", 31.8, -151.6, "container ship"],
    ["USNS Pacific Relief", 24.4, -158.9, "hospital ship"],
    ["MV Polynesia Star", -16.6, -149.8, "commercial vessel"],
    ["FS Prairial Demo", -17.9, -141.2, "naval patrol vessel"],
    ["MV Coral Meridian", -22.4, -132.8, "cargo ship"],
    ["MV Equator Bridge", 0.8, -163.4, "container ship"],
    ["MV North Pacific Lane", 43.2, -176.5, "tanker"],
    ["JMSDF Rescue Demo", 31.5, 147.2, "naval support ship"],
    ["MV Philippine Sea", 14.6, 128.4, "cargo ship"],
    ["MV Sunda Strait", -7.4, 105.9, "container ship"],
    ["MV Malacca Express", 3.1, 98.6, "container ship"],
    ["MV South China Carrier", 16.8, 116.3, "container ship"],
    ["MV Diego Garcia Supply", -7.2, 72.4, "naval support ship"],
    ["MV Indian Ocean Grace", -14.9, 83.8, "bulk carrier"],
    ["MV Cape Route", -34.8, 25.2, "cargo ship"],
    ["MV Mozambique Channel", -18.6, 42.1, "commercial vessel"],
    ["MV Red Sea Corridor", 19.9, 39.2, "tanker"],
    ["MV Gulf Horizon", 25.8, 55.9, "commercial vessel"],
    ["MV Mediterranean Aid", 34.8, 18.6, "rescue vessel"],
    ["MV Atlantic Resolve", 31.2, -42.8, "container ship"],
    ["USCG Atlantic Demo", 25.4, -68.2, "coast guard"],
    ["MV Caribbean Mercy", 18.1, -72.4, "hospital ship"],
    ["MV South Atlantic Lane", -19.6, -31.5, "bulk carrier"],
    ["MV Tasman Guardian", -39.8, 160.6, "commercial vessel"],
    ["MV Coral Sea Rescue", -18.4, 153.5, "rescue vessel"],
    ["MV Southern Ocean Watch", -48.7, 104.3, "research vessel"]
  ];
  return simulated.map(([name, lat, lon, type], index) => ({
    id: `ship-${index}`,
    name,
    lat: lat + Math.sin(now / 180 + index) * 0.35,
    lon: lon + Math.cos(now / 200 + index) * 0.45,
    speed: Math.round((8 + index * 1.7) * 10) / 10,
    heading: Math.round((now / 8 + index * 37) % 360),
    type
  }));
}

async function readJsonBody(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 256_000) throw new Error("Request body too large");
  }
  if (!body.trim()) return {};
  return JSON.parse(body);
}

async function sendTelegramSos(payload) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const targets = telegramTargets();
  if (!token) {
    return { ok: false, error: "TELEGRAM_BOT_TOKEN is not configured in .env" };
  }
  if (!targets.length) {
    return { ok: false, error: "No Telegram chat ids configured. Set TELEGRAM_ATC_CHAT_ID, TELEGRAM_NAVY_CHAT_ID, TELEGRAM_STARLINK_CHAT_ID, or TELEGRAM_CHAT_IDS." };
  }
  const text = formatSosTelegramMessage(payload);
  const sent = [];
  const failed = [];
  for (const target of targets) {
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: target.chatId,
          text: `[${target.label}]\n${text}`,
          disable_web_page_preview: true
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) {
        throw new Error(data.description || `Telegram HTTP ${response.status}`);
      }
      sent.push({ label: target.label, messageId: data.result?.message_id });
    } catch (error) {
      failed.push({ label: target.label, error: error.message });
    }
  }
  return {
    ok: sent.length > 0,
    sentTo: sent.map((item) => item.label),
    messageIds: sent.map((item) => item.messageId).filter(Boolean),
    failed,
    message: sent.length ? "SOS telegram sent" : "No SOS telegram messages were delivered"
  };
}

function telegramTargets() {
  const roleTargets = [
    ["ATC", process.env.TELEGRAM_ATC_CHAT_ID],
    ["NAVY", process.env.TELEGRAM_NAVY_CHAT_ID],
    ["STARLINK BASE", process.env.TELEGRAM_STARLINK_CHAT_ID]
  ].filter(([, chatId]) => chatId);
  const genericTargets = String(process.env.TELEGRAM_CHAT_IDS || "")
    .split(",")
    .map((chatId, index) => ({ label: `EMERGENCY DESK ${index + 1}`, chatId: chatId.trim() }))
    .filter((target) => target.chatId);
  return [
    ...roleTargets.map(([label, chatId]) => ({ label, chatId })),
    ...genericTargets
  ];
}

function formatSosTelegramMessage(payload = {}) {
  const aircraft = payload.aircraft || {};
  const loc = payload.lastKnownLocation || {};
  const starlink = payload.starlinkTriangulation || {};
  const fuel = payload.fuel || {};
  const nearestAirport = payload.nearestLandOrAirport;
  const nearestShip = payload.nearestShip;
  const weather = payload.weatherAndThreats || {};
  const payloadInfo = payload.payload || {};
  const systems = Array.isArray(payload.systems) ? payload.systems : [];
  const blackbox = Array.isArray(payload.blackboxLog) ? payload.blackboxLog : [];
  const cellular = Array.isArray(payload.cellularSatelliteTriangulation) ? payload.cellularSatelliteTriangulation : [];
  const sats = Array.isArray(starlink.satellites) ? starlink.satellites : [];
  return [
    "MAYDAYOS SOS ALERT",
    `Generated: ${payload.generatedAt || new Date().toISOString()}`,
    "",
    "AIRCRAFT",
    `Callsign: ${aircraft.callsign || "UNKNOWN"}`,
    `Airline: ${aircraft.airlineCompany || "UNKNOWN"}`,
    `Model: ${aircraft.model || "UNKNOWN"}`,
    `Route: ${aircraft.origin || "UNKNOWN"} -> ${aircraft.destination || "UNKNOWN"}`,
    `Flight state: ${aircraft.altitudeFt || 0} ft | ${aircraft.speedKt || 0} kt | heading ${aircraft.headingDeg || 0} deg`,
    "",
    "POSITION",
    `Last known: ${loc.label || `${loc.lat}, ${loc.lon}`}`,
    `Starlink fix: ${starlink.lat}, ${starlink.lon} | confidence ${starlink.confidencePercent || 0}% | CEP ${starlink.cepKm ?? "n/a"} km`,
    `Active constellation: ${starlink.activeCluster || "standby"}`,
    `Nearest beams: ${sats.map((sat) => `${sat.id} ${sat.beamKm}km ${sat.latencyMs}ms`).join(" | ") || "none"}`,
    `Cell/sat ranging: ${cellular.map((source) => `${source.name} ${source.distanceKm}km ${source.confidencePercent}%`).join(" | ") || "none"}`,
    "",
    "FUEL AND PAYLOAD",
    `Fuel: ${fuel.remainingPercent ?? "unknown"}% remaining | initial ${fuel.initialPercent ?? "unknown"}% | required ${fuel.estimatedRequiredPercent ?? "unknown"}%`,
    `Payload: ${payloadInfo.passengers ?? "unknown"} passengers | cargo ${payloadInfo.cargoKg ?? "unknown"} kg`,
    "",
    "SURVIVAL OPTIONS",
    `Recommendation: ${payload.recommendedSurvivalTarget || "Awaiting AI decision"}`,
    `Nearest airport/land: ${nearestAirport ? `${nearestAirport.code} ${nearestAirport.name}, ${nearestAirport.distanceKm} km, runway ${nearestAirport.runwayM} m` : "unknown"}`,
    `Nearest vessel: ${nearestShip ? `${nearestShip.name} (${nearestShip.type}), ${nearestShip.distanceKm} km at ${nearestShip.lat}, ${nearestShip.lon}` : "unknown"}`,
    "",
    "THREATS",
    `Weather: ${typeof weather.cyclone === "string" ? weather.cyclone : `cyclone ${weather.cyclone?.windKt || 0} kt, ${weather.cyclone?.pressureHpa || 0} hPa, radius ${weather.cyclone?.radiusKm || 0} km`}`,
    `Visibility: ${weather.visibility || "unknown"}`,
    `Communications: ${weather.communications || "unknown"}`,
    "",
    "SYSTEM STATUS",
    systems.map((system) => `${system.working ? "OK" : "FAIL"} ${system.name}: ${system.status}`).join("\n") || "No system status supplied",
    "",
    "BLACKBOX SNAPSHOT",
    blackbox.slice(0, 12).map((line) => `- ${line}`).join("\n") || "No log supplied"
  ].join("\n").slice(0, 3900);
}

function sendJson(res, payload, status = 200) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

async function getRainViewerCatalog() {
  const url = "https://api.rainviewer.com/public/weather-maps.json";
  const response = await fetch(url);
  if (!response.ok) {
    return { ok: false, status: response.status, message: `RainViewer catalog returned HTTP ${response.status}` };
  }
  return await response.json();
}

async function checkRainViewerWeather() {
  try {
    const data = await getRainViewerCatalog();
    const frames = data?.radar?.past || [];
    return {
      ok: Boolean(data?.host && frames.length),
      status: data?.status || 200,
      frames: frames.length,
      message: data?.host && frames.length
        ? "RainViewer radar catalog access is active."
        : "RainViewer radar catalog is unavailable or empty."
    };
  } catch (error) {
    return { ok: false, status: -1, message: error.message };
  }
}
