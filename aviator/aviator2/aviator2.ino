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

// ─── WebSocket Event Handler ────────────────────────────────
void onWsEvent(AsyncWebSocket* server, AsyncWebSocketClient* client,
               AwsEventType type, void* arg, uint8_t* data, size_t len) {
  // No incoming messages needed for this dashboard
}

// ─── Setup ──────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  
  // Initialize I2C matching your Breadboard wiring (SDA=21, SCL=22)
  Wire.begin(21, 22);

  // MPU6050 Init
  mpu1.initialize();
  mpu2.initialize();
  
  if (!mpu1.testConnection()) {
    Serial.println("MPU1 (Gyroscope) FAIL - Check wiring on 0x68");
  } else {
    Serial.println("MPU1 (Gyroscope) OK");
  }
  
  if (!mpu2.testConnection()) {
    Serial.println("MPU2 (Accelerometer) FAIL - Check wiring on 0x69");
  } else {
    Serial.println("MPU2 (Accelerometer) OK");
  }

  // BMP180 Init
  if (!bmp.begin()) {
    Serial.println("BMP180 FAIL - Check wiring");
  } else {
    Serial.println("BMP180 OK");
    baseAltitude = bmp.readAltitude();
  }

  // DHT Init
  dht.begin();
  Serial.println("DHT11 Init Called");

  // WiFi Access Point
  WiFi.softAP(ssid, password);
  Serial.println("FlightSim AP Started!");
  Serial.print("IP Address: ");
  Serial.println(WiFi.softAPIP());

  // WebSocket
  ws.onEvent(onWsEvent);
  server.addHandler(&ws);

  // Note: We no longer serve HTML from the ESP32. We use the React frontend!

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