#include <Wire.h>
#include <MPU6050.h>
#include <Adafruit_BMP085.h>
#include <DHT.h>
#include <WiFi.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>

// ─── WiFi Config ───────────────────────────────────────────
const char* ssid     = "FlightSim";
const char* password = "12345678";

// ─── Sensor Objects ────────────────────────────────────────
MPU6050 mpu1(0x68);   // Gyroscope  (AD0 → GND)
MPU6050 mpu2(0x69);   // Accelerometer (AD0 → 3.3V)
Adafruit_BMP085 bmp;
#define DHTPIN 4
#define DHTTYPE DHT11
DHT dht(DHTPIN, DHTTYPE);

// ─── Web Server & WebSocket ─────────────────────────────────
AsyncWebServer server(80);
AsyncWebSocket ws("/ws");

// ─── Sensor Variables ──────────────────────────────────────
float pitch = 0, roll = 0, yaw = 0;
float ax, ay, az;
float altitude, baseAltitude;
float temperature, humidity, pressure;
unsigned long lastTime = 0;
float dt;
bool fallDetected = false;
bool altLossDetected = false;

// ─── HTML Dashboard ────────────────────────────────────────
const char index_html[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Flight Sim Dashboard</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0d0d0d; color: #e0e0e0; font-family: 'Courier New', monospace; padding: 20px; }
    h1 { text-align: center; color: #00bfff; margin-bottom: 20px; font-size: 1.5rem; letter-spacing: 3px; }
    
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
    
    .card { background: #1a1a2e; border: 1px solid #00bfff33; border-radius: 12px; padding: 16px; }
    .card h2 { color: #00bfff; font-size: 0.85rem; letter-spacing: 2px; margin-bottom: 12px; text-transform: uppercase; }
    
    .value-row { display: flex; justify-content: space-between; align-items: center; margin: 8px 0; }
    .label { color: #888; font-size: 0.8rem; }
    .value { color: #00ff99; font-size: 1.2rem; font-weight: bold; }
    
    .bar-wrap { background: #111; border-radius: 4px; height: 8px; margin-top: 4px; overflow: hidden; }
    .bar { height: 8px; border-radius: 4px; background: linear-gradient(90deg, #00bfff, #00ff99); transition: width 0.1s; }
    
    #horizon-container { display: flex; justify-content: center; margin: 8px 0; }
    canvas { border-radius: 50%; border: 2px solid #00bfff44; }
    
    #alert-banner {
      display: none; background: #ff003355; border: 2px solid #ff0033;
      border-radius: 8px; padding: 14px; text-align: center;
      color: #ff4466; font-size: 1rem; font-weight: bold;
      letter-spacing: 2px; margin-bottom: 16px;
      animation: pulse 0.8s infinite alternate;
    }
    @keyframes pulse { from { opacity: 1; } to { opacity: 0.4; } }
    
    .status-ok  { color: #00ff99; }
    .status-bad { color: #ff4466; }
  </style>
</head>
<body>
  <h1>✈ FLIGHT SIM DASHBOARD</h1>
  <div id="alert-banner">⚠ CRITICAL ALERT — FALL / ALTITUDE LOSS DETECTED</div>

  <div class="grid">
    <!-- Attitude -->
    <div class="card">
      <h2>🧭 Attitude</h2>
      <div class="value-row"><span class="label">PITCH</span><span class="value" id="pitch">0.0°</span></div>
      <div class="bar-wrap"><div class="bar" id="pitch-bar" style="width:50%"></div></div>
      <div class="value-row"><span class="label">ROLL</span><span class="value" id="roll">0.0°</span></div>
      <div class="bar-wrap"><div class="bar" id="roll-bar" style="width:50%"></div></div>
      <div class="value-row"><span class="label">YAW</span><span class="value" id="yaw">0.0°</span></div>
      <div class="bar-wrap"><div class="bar" id="yaw-bar" style="width:50%"></div></div>
    </div>

    <!-- Artificial Horizon -->
    <div class="card">
      <h2>🌅 Artificial Horizon</h2>
      <div id="horizon-container">
        <canvas id="horizonCanvas" width="200" height="200"></canvas>
      </div>
    </div>

    <!-- Altitude -->
    <div class="card">
      <h2>📊 Altitude</h2>
      <div class="value-row"><span class="label">CURRENT</span><span class="value" id="alt">0.0 m</span></div>
      <div class="value-row"><span class="label">BASELINE</span><span class="value" id="base-alt">0.0 m</span></div>
      <div class="value-row"><span class="label">DELTA</span><span class="value" id="delta-alt">0.0 m</span></div>
      <div class="value-row"><span class="label">STATUS</span><span id="alt-status" class="status-ok">NOMINAL</span></div>
    </div>

    <!-- Fall Detection -->
    <div class="card">
      <h2>⚡ Fall Detection</h2>
      <div class="value-row"><span class="label">Ax</span><span class="value" id="ax">0.00 g</span></div>
      <div class="value-row"><span class="label">Ay</span><span class="value" id="ay">0.00 g</span></div>
      <div class="value-row"><span class="label">Az</span><span class="value" id="az">0.00 g</span></div>
      <div class="value-row"><span class="label">G-FORCE</span><span class="value" id="gforce">1.00 g</span></div>
      <div class="value-row"><span class="label">STATE</span><span id="fall-status" class="status-ok">STABLE</span></div>
    </div>

    <!-- Environment -->
    <div class="card">
      <h2>🌡 Environment</h2>
      <div class="value-row"><span class="label">TEMPERATURE</span><span class="value" id="temp">0.0 °C</span></div>
      <div class="value-row"><span class="label">HUMIDITY</span><span class="value" id="hum">0.0 %</span></div>
      <div class="value-row"><span class="label">PRESSURE</span><span class="value" id="pres">0.0 hPa</span></div>
    </div>
  </div>

<script>
  const ws = new WebSocket('ws://' + location.hostname + '/ws');
  const canvas = document.getElementById('horizonCanvas');
  const ctx = canvas.getContext('2d');

  function drawHorizon(pitch, roll) {
    const cx = canvas.width / 2, cy = canvas.height / 2, r = 95;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
    ctx.translate(cx, cy); ctx.rotate(roll * Math.PI / 180);
    const pitchOffset = pitch * 1.5;
    ctx.fillStyle = '#1a6bb5';
    ctx.fillRect(-r, -r * 2, r * 2, r * 2 + pitchOffset);
    ctx.fillStyle = '#8b5e3c';
    ctx.fillRect(-r, pitchOffset, r * 2, r * 2);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-r, pitchOffset); ctx.lineTo(r, pitchOffset); ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = '#ffff00'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx - 30, cy); ctx.lineTo(cx - 10, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + 10, cy); ctx.lineTo(cx + 30, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - 10); ctx.lineTo(cx, cy + 10); ctx.stroke();
  }

  function setBar(id, val, min, max) {
    const pct = Math.min(100, Math.max(0, ((val - min) / (max - min)) * 100));
    document.getElementById(id).style.width = pct + '%';
  }

  ws.onmessage = (e) => {
    const d = JSON.parse(e.data);

    document.getElementById('pitch').textContent = d.pitch.toFixed(1) + '°';
    document.getElementById('roll').textContent  = d.roll.toFixed(1) + '°';
    document.getElementById('yaw').textContent   = d.yaw.toFixed(1) + '°';
    setBar('pitch-bar', d.pitch, -90, 90);
    setBar('roll-bar',  d.roll,  -90, 90);
    setBar('yaw-bar',   d.yaw,   -180, 180);

    drawHorizon(d.pitch, d.roll);

    document.getElementById('alt').textContent      = d.alt.toFixed(1) + ' m';
    document.getElementById('base-alt').textContent = d.baseAlt.toFixed(1) + ' m';
    const delta = d.alt - d.baseAlt;
    document.getElementById('delta-alt').textContent = delta.toFixed(1) + ' m';

    document.getElementById('ax').textContent     = d.ax.toFixed(2) + ' g';
    document.getElementById('ay').textContent     = d.ay.toFixed(2) + ' g';
    document.getElementById('az').textContent     = d.az.toFixed(2) + ' g';
    document.getElementById('gforce').textContent = d.gforce.toFixed(2) + ' g';

    document.getElementById('temp').textContent = d.temp.toFixed(1) + ' °C';
    document.getElementById('hum').textContent  = d.hum.toFixed(1) + ' %';
    document.getElementById('pres').textContent = d.pres.toFixed(1) + ' hPa';

    const banner     = document.getElementById('alert-banner');
    const fallStat   = document.getElementById('fall-status');
    const altStat    = document.getElementById('alt-status');

    if (d.fall) {
      fallStat.textContent = '⚠ FALL / IMPACT';
      fallStat.className = 'status-bad';
    } else {
      fallStat.textContent = 'STABLE';
      fallStat.className = 'status-ok';
    }

    if (d.altLoss) {
      altStat.textContent = '⚠ ALTITUDE LOSS';
      altStat.className = 'status-bad';
    } else {
      altStat.textContent = 'NOMINAL';
      altStat.className = 'status-ok';
    }

    banner.style.display = (d.fall || d.altLoss) ? 'block' : 'none';
  };
</script>
</body>
</html>
)rawliteral";

// ─── WebSocket Event Handler ────────────────────────────────
void onWsEvent(AsyncWebSocket* server, AsyncWebSocketClient* client,
               AwsEventType type, void* arg, uint8_t* data, size_t len) {
  // No incoming messages needed
}

// ─── Setup ──────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  Wire.begin(21, 9);    // ← UPDATED: SDA=21, SCL=9 for ESP32-S3

  // MPU6050 Init
  //mpu1.initialize();
  //mpu2.initialize();
  //if (!mpu1.testConnection()) Serial.println("MPU1 FAIL");
  //if (!mpu2.testConnection()) Serial.println("MPU2 FAIL");

  // BMP180 Init
  //if (!bmp.begin()) Serial.println("BMP180 FAIL");
  //baseAltitude = bmp.readAltitude();

  // DHT Init
  //dht.begin();

  // WiFi Access Point
  WiFi.softAP(ssid, password);
  Serial.print("IP: ");
  Serial.println(WiFi.softAPIP());

  // WebSocket
  ws.onEvent(onWsEvent);
  server.addHandler(&ws);

  // Serve HTML
  server.on("/", HTTP_GET, [](AsyncWebServerRequest* req) {
    req->send_P(200, "text/html", index_html);
  });

  server.begin();
  lastTime = millis();
}

// ─── Loop ───────────────────────────────────────────────────
void loop() {
  unsigned long now = millis();
  dt = (now - lastTime) / 1000.0f;
  lastTime = now;

  // ── MPU1: Gyroscope → Pitch / Roll / Yaw ──
  int16_t gx1, gy1, gz1, ax1_r, ay1_r, az1_r;
  mpu1.getMotion6(&ax1_r, &ay1_r, &az1_r, &gx1, &gy1, &gz1);

  float gx_dps = gx1 / 131.0f;
  float gy_dps = gy1 / 131.0f;
  float gz_dps = gz1 / 131.0f;

  float ax1 = ax1_r / 16384.0f;
  float ay1 = ay1_r / 16384.0f;
  float az1 = az1_r / 16384.0f;

  float accPitch = atan2(ay1, sqrt(ax1*ax1 + az1*az1)) * 180.0f / PI;
  float accRoll  = atan2(-ax1, az1) * 180.0f / PI;

  // Complementary filter
  pitch = 0.98f * (pitch + gy_dps * dt) + 0.02f * accPitch;
  roll  = 0.98f * (roll  + gx_dps * dt) + 0.02f * accRoll;
  yaw  += gz_dps * dt;
  if (yaw > 180)  yaw -= 360;
  if (yaw < -180) yaw += 360;

  // ── MPU2: Accelerometer → Fall Detection ──
  int16_t gx2, gy2, gz2, ax2_r, ay2_r, az2_r;
  mpu2.getMotion6(&ax2_r, &ay2_r, &az2_r, &gx2, &gy2, &gz2);

  ax = ax2_r / 16384.0f;
  ay = ay2_r / 16384.0f;
  az = az2_r / 16384.0f;
  float gforce = sqrt(ax*ax + ay*ay + az*az);

  fallDetected = (gforce < 0.3f || gforce > 2.5f);

  // ── BMP180: Altitude ──
  altitude = bmp.readAltitude();
  altLossDetected = (baseAltitude - altitude) > 3.0f;

  // ── DHT11: Temp & Humidity ──
  temperature = dht.readTemperature();
  humidity    = dht.readHumidity();
  pressure    = bmp.readPressure() / 100.0f;

  // ── Send JSON over WebSocket ──
  if (ws.count() > 0) {
    char json[320];
    snprintf(json, sizeof(json),
      "{\"pitch\":%.2f,\"roll\":%.2f,\"yaw\":%.2f,"
      "\"alt\":%.2f,\"baseAlt\":%.2f,"
      "\"ax\":%.3f,\"ay\":%.3f,\"az\":%.3f,\"gforce\":%.3f,"
      "\"temp\":%.1f,\"hum\":%.1f,\"pres\":%.1f,"
      "\"fall\":%s,\"altLoss\":%s}",
      pitch, roll, yaw,
      altitude, baseAltitude,
      ax, ay, az, gforce,
      temperature, humidity, pressure,
      fallDetected ? "true" : "false",
      altLossDetected ? "true" : "false"
    );
    ws.textAll(json);
  }

  ws.cleanupClients();
  delay(100);
}
