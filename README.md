# MaydayOS: AI-Powered Aviation Emergency Response & Decision Intelligence Platform

> **Navigate, Adapt & Survive** — Next-generation multi-domain emergency avionics and survival intelligence platform.

[![Node.js](https://img.shields.io/badge/Node.js-22%2B-green.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Web%20%7C%20CesiumJS%20%7C%20ESP32-orange.svg)]()

---

## ✈️ Overview

**MaydayOS** is a real-time emergency decision intelligence platform designed to assist flight crews and ground controllers during critical in-flight emergencies. When adverse conditions strike — including catastrophic weather systems (cyclones/thunderstorms), mechanical power degradation, crew incapacitation, or total GPS/ATC communication denial — MaydayOS executes dynamic survival decision intelligence.

### Core Capabilities:
- **Global In-Flight Monitoring**: Ingestion of real-time ADS-B and OpenSky Network flight vectors alongside worldwide airport databases.
- **Orbital Starlink Triangulation**: Autonomous satellite-based positional fixes and Constellation Triangulation when ground radar and GNSS are degraded or lost.
- **Maritime Rescue Vectoring**: Real-time maritime tracking via AISStream to locate and vector nearest surface vessels (naval destroyers, cargo ships, tankers) for emergency ditching rendezvous.
- **Live Adverse Weather Detection**: RainViewer radar imagery catalog analysis and cyclone avoidance routing.
- **Dynamic AI Decision Tree**: Instant calculation of gliding distance, remaining fuel endurance, runway suitability, and survival landing alternatives.
- **Multi-Channel Emergency SOS Dispatch**: Instant generation and dispatch of automated SOS telemetric payloads to Air Traffic Control, Naval units, and Starlink command centers via Telegram Bot integration.
- **ESP32 Telemetry & Avionics Integration**: Real-time flight sim hardware dashboard and IMU complementary filter telemetry support (dual MPU6050 gyroscope/accelerometer, BMP180 barometric altimeter, and DHT11).

---

## 🛠️ System Architecture

```
                      +-----------------------------+
                      |   Flight Sensors / ESP32    |
                      |   (MPU6050, BMP180, DHT11)  |
                      +--------------+--------------+
                                     |
                                     | WebSocket / Serial (HC-SR04)
                                     v
+-----------------------+     +---------------+     +-----------------------+
|  OpenSky / ADS-B API  | --> |               | <-- |  AISStream (Maritime) |
+-----------------------+     |   MaydayOS    |     +-----------------------+
| RainViewer Radar APIs | --> | Node.js Server| --> | Telegram SOS Gateway  |
+-----------------------+     |               |     +-----------------------+
                              +-------+-------+
                                      |
                           HTTP / Socket.IO Stream
                                      v
                     +---------------------------------+
                     | Leaflet Map / Cesium 3D Globe   |
                     |  & Three.js Cockpit Avionics    |
                     +---------------------------------+
```

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (version 20 or higher, v22+ recommended)
- [npm](https://www.npmjs.com/)
- (Optional) Arduino IDE or PlatformIO for flashing ESP32 firmware in `aviator/`

### 1. Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/Abhiram-A-Bhat/MaydayOS-AI-Powered-Aviation-Emergency-Response-Decision-Intelligence-Platform.git
cd MaydayOS-AI-Powered-Aviation-Emergency-Response-Decision-Intelligence-Platform
npm install
```

### 2. Environment Configuration

Copy the example environment file and configure your API credentials:

```bash
cp .env.example .env
```

Edit `.env` with your API keys:

| Environment Variable | Description |
| :--- | :--- |
| `PORT` | Local web server port (default: `3000`) |
| `OPENSKY_CLIENT_ID` | OpenSky Network API username / client ID |
| `OPENSKY_CLIENT_SECRET` | OpenSky Network API secret |
| `AISSTREAM_API_KEY` | AISStream API key for maritime vessel tracking |
| `AISSTREAM_LIVE` | Enable live AIS websocket connection (`true` or `false`) |
| `AISSTREAM_BBOX` | Maritime bounding box `[minLat, minLon, maxLat, maxLon]` |
| `CESIUM_ION_TOKEN` | Cesium Ion access token for 3D globe visualization |
| `GOOGLE_MAPS_API_KEY` | Optional Google Maps Platform key |
| `TELEGRAM_BOT_TOKEN` | Optional Telegram bot token for instant SOS dispatch |
| `TELEGRAM_ATC_CHAT_ID` | Telegram chat ID for Air Traffic Control alerts |
| `TELEGRAM_NAVY_CHAT_ID` | Telegram chat ID for Naval rescue alerts |
| `TELEGRAM_STARLINK_CHAT_ID` | Telegram chat ID for orbital operations base alerts |

### 3. Running the Server

Start the application:

```bash
# Local development mode
npm run local

# Or full server deployment
npm start
```

Open your browser at:
```
http://localhost:3000
```

---

## 📡 Hardware / IoT Integration (`aviator/`)

The repository includes embedded ESP32 firmware in [`aviator/`](./aviator):

- **`aviator/aviator.ino`**: Standalone ESP32 flight simulator web server broadcasting telemetry over WebSockets.
- **`aviator/aviator2/aviator2.ino`**: Dual MPU6050 complementary filter implementation (gyroscope + accelerometer), BMP180 altitude monitoring, and g-force fall/alt-loss detection.

---

## 🔒 Security & Secret Management

- Never commit the `.env` file containing live credentials to version control.
- Ensure all live API keys, tokens, and secrets remain restricted in `.env` (ignored by `.gitignore`).
- For production deployments, inject credentials via environment variables or secret vaults.

---

## 📄 License

This project is licensed under the MIT License.
