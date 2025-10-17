# Real-Time Chat Application with WebRTC Video Calling
## Verteiltes System mit Microservices-Architektur

[![Review Assignment Due Date](https://classroom.github.com/assets/deadline-readme-button-22041afd0340ce965d47ae6ef1cefeee28c7c493a6346c4f15d667ab976d596c.svg)](https://classroom.github.com/a/jJjjf4zV)

---

## 📋 Inhaltsverzeichnis

1. [Projektübersicht](#-projektübersicht)
2. [Systemarchitektur](#-systemarchitektur)
3. [Microservices](#-microservices)
4. [Technologie-Stack](#-technologie-stack)
5. [Event-Driven Architecture](#-event-driven-architecture)
6. [WebRTC Implementierung](#-webrtc-implementierung)
7. [Installation & Setup](#-installation--setup)
8. [API Dokumentation](#-api-dokumentation)
9. [Monitoring & Logging](#-monitoring--logging)
10. [Deployment](#-deployment)
11. [Troubleshooting](#-troubleshooting)

---

## 🎯 Projektübersicht

Eine moderne, verteilte Chat-Applikation mit Echtzeit-Videoanruf-Funktionalität, entwickelt mit einer Microservices-Architektur und Event-Driven Design-Prinzipien.

### Hauptfunktionen

- ✅ **Echtzeit-Chat** - Instant Messaging mit WebSocket-Kommunikation
- ✅ **Video/Audio-Anrufe** - P2P WebRTC-Verbindungen mit STUN/TURN Support
- ✅ **Benutzerw** - Persistente Login-Sessions
- ✅ **Systembenachrichtigungen** - Join/Leave/System-Events
- ✅ **Chat-Historie** - Nachrichtenspeicherung in MongoDB
- ✅ **Statistiken** - Echtzeit-Analytics und Metriken
- ✅ **Zentralisiertes Logging** - Event-Tracking über alle Services
- ✅ **Filterbare Nachrichten** - System-Messages ein-/ausblenden
- ✅ **Responsive UI** - Material-UI Design für alle Geräte

---

## 🏗️ Systemarchitektur

### Architektur-Diagramm

```
┌─────────────────────────────────────────────────────────────────┐
│                           CADDY PROXY                            │
│                          (Port 80/443)                           │
│                     Reverse Proxy & Load Balancer                │
└────────┬───────────────┬───────────────┬───────────────┬────────┘
         │               │               │               │
         │               │               │               │
    ┌────▼─────┐   ┌────▼────────┐ ┌───▼──────────┐ ┌─▼────────────┐
    │ FRONTEND │   │ CHAT SERVICE│ │ PARTICIPANT  │ │ STUN/TURN    │
    │  (React) │   │  (Node.js)  │ │   SERVICE    │ │   SERVICE    │
    │ Port 8000│   │  Port 8001  │ │  Port 8003   │ │ Port 8005    │
    └────┬─────┘   └──┬─────┬────┘ └──┬─────┬─────┘ └──┬───────────┘
         │            │     │          │     │           │
         │        ┌───▼─────▼──────────▼─────▼───────────▼───────┐
         │        │           RABBITMQ MESSAGE BROKER             │
         │        │              (Port 5672/15672)                │
         │        │          Event-Driven Communication           │
         │        └───┬────────────────────────────┬──────────────┘
         │            │                            │
         │        ┌───▼──────────┐         ┌──────▼──────────┐
         │        │  LOG SERVICE │         │    MONGODB      │
         │        │  (Node.js)   │         │   (Database)    │
         │        │  Port 8004   │         │   Port 27017    │
         │        └──────────────┘         └─────────────────┘
         │
    ┌────▼──────────────┐
    │ MONGO EXPRESS UI  │
    │    (Port 8081)    │
    └───────────────────┘
```

### Kommunikationsflüsse

#### 1. Chat-Nachricht Senden
```
User → Frontend → Caddy → Chat Service → MongoDB
                              ↓
                          RabbitMQ → Log Service
```

#### 2. Videoanruf Initiieren
```
User A → Frontend → Caddy → Chat Service (Signaling)
                                  ↓
                           WebSocket Emit
                                  ↓
User B ← Frontend ← Caddy ← Chat Service
         ↓
    WebRTC P2P Connection (via STUN/TURN)
         ↓
    Direct Video/Audio Stream
```

#### 3. Event Logging
```
Any Service → RabbitMQ → Log Service → MongoDB (logs collection)
```

---

## 🔧 Microservices

### 1. Frontend Service (React)
**Port:** 8000  
**Technologie:** React 18, Material-UI, Socket.IO Client, Simple-Peer

**Verantwortlichkeiten:**
- Benutzeroberfläche rendern
- WebSocket-Verbindung zum Chat Service
- WebRTC Peer-to-Peer Verbindungen
- State Management (React Hooks)
- Routing und Navigation

**Hauptkomponenten:**
- `App.js` - Hauptapplikation und WebSocket-Logik
- `ChatHeader.js` - Navigation und Status-Anzeige
- `ChatArea.js` - Nachrichtenanzeige
- `MessageInput.js` - Nachrichteneingabe
- `UserList.js` - Online-Benutzer Liste
- `useWebRTC_simple_peer.js` - WebRTC Hook mit Simple-Peer

**Key Features:**
- Persistent Login (localStorage)
- Echtzeit-Updates via WebSocket
- System-Message Filtering
- Force Google STUN Toggle
- Connection Status Monitoring

---

### 2. Chat Service (Node.js)
**Port:** 8001  
**Technologie:** Express, Socket.IO, MongoDB, RabbitMQ

**Verantwortlichkeiten:**
- WebSocket-Verbindungen verwalten
- Echtzeit-Nachrichtenaustausch
- WebRTC Signaling (SDP Offer/Answer/ICE)
- User Session Management
- Chat-Historie speichern

**API Endpoints:**
```
GET  /api/chat/messages/recent  - Letzte Nachrichten abrufen
GET  /api/chat/messages/user    - Nur Benutzer-Nachrichten
GET  /api/chat/users             - Online-Benutzer
POST /api/chat/clear             - Chat löschen
```

**Socket.IO Events:**
```javascript
// Client → Server
'join'              // User betritt Chat
'send-message'      // Nachricht senden
'webrtc-signal'     // WebRTC Signaling
'call-end'          // Anruf beenden
'call-declined'     // Anruf ablehnen

// Server → Client
'user-joined'       // Neuer User
'user-left'         // User verlässt
'receive-message'   // Neue Nachricht
'webrtc-signal'     // WebRTC Signal forwarden
'call-end'          // Anruf beendet
```

**Event-Publishing:**
- `user_joined` → RabbitMQ
- `user_left` → RabbitMQ
- `message_sent` → RabbitMQ
- `webrtc_call_initiated` → RabbitMQ
- `webrtc_call_ended` → RabbitMQ

---

### 3. Participant Service (Node.js)
**Port:** 8003  
**Technologie:** Express, MongoDB, RabbitMQ

**Verantwortlichkeiten:**
- Benutzerverwaltung
- Session-Tracking
- Benutzerstatistiken
- Online-Status

**API Endpoints:**
```
POST /api/participants/join   - Benutzer registrieren
POST /api/participants/leave  - Benutzer abmelden
GET  /api/participants        - Alle Teilnehmer
GET  /api/participants/stats  - Statistiken
```

**Event-Publishing:**
- `participant_joined` → RabbitMQ
- `participant_left` → RabbitMQ

---

### 4. Log Service (Node.js)
**Port:** 8004  
**Technologie:** Express, MongoDB, RabbitMQ Consumer

**Verantwortlichkeiten:**
- Zentralisiertes Event-Logging
- RabbitMQ Message Consumption
- Log-Aggregation
- Historische Datenanalyse

**API Endpoints:**
```
GET /api/logs             - Alle Logs abrufen
GET /api/logs/recent      - Neueste Logs
GET /api/logs/stats       - Log-Statistiken
GET /api/logs/user/:user  - Logs pro User
```

**Event-Subscription:**
- Alle Events aus RabbitMQ Queues:
  - `logs` queue
  - `webrtc_events` queue

**Log-Schema:**
```javascript
{
  timestamp: Date,
  level: String,      // 'info', 'warn', 'error'
  service: String,    // Origin service
  event: String,      // Event name
  user: String,       // Username
  data: Object,       // Event payload
  metadata: Object    // Additional context
}
```

---

### 5. STUN/TURN Service (Node.js + Coturn)
**Ports:** 3478 (UDP/TCP), 5349 (TLS), 8005 (API), 8080 (Admin)  
**Technologie:** Express, Coturn, RabbitMQ

**Verantwortlichkeiten:**
- STUN Server für NAT-Traversal
- TURN Relay für restriktive Netzwerke
- ICE Candidate Generation
- WebRTC Connection Stats

**API Endpoints:**
```
GET /api/turn/config  - ICE Server Konfiguration
GET /api/turn/stats   - Connection Statistics
GET /api/turn/health  - Service Health Check
```

**TURN Konfiguration:**
```javascript
{
  urls: "turn:app.lab.joku.dev:3478",
  username: "user",
  credential: "pass",
  credentialType: "password"
}
```

**Event-Publishing:**
- `turn_allocation` → RabbitMQ
- `turn_connection` → RabbitMQ
- `turn_disconnection` → RabbitMQ

---

## 💻 Technologie-Stack

### Frontend
| Technologie | Version | Zweck |
|------------|---------|-------|
| React | 18.x | UI Framework |
| Material-UI | 5.x | Component Library |
| Socket.IO Client | 4.x | WebSocket Communication |
| Simple-Peer | 9.x | WebRTC Abstraction |
| Axios | 1.x | HTTP Client |

### Backend Services
| Technologie | Version | Zweck |
|------------|---------|-------|
| Node.js | 18.x | Runtime Environment |
| Express | 4.x | Web Framework |
| Socket.IO | 4.x | WebSocket Server |
| MongoDB | 6.0 | Database |
| RabbitMQ | 3.x | Message Broker |

### Infrastructure
| Technologie | Version | Zweck |
|------------|---------|-------|
| Docker | 24.x | Containerization |
| Docker Compose | 2.x | Orchestration |
| Caddy | 2.x | Reverse Proxy |
| Coturn | 4.x | STUN/TURN Server |

---

## 🔄 Event-Driven Architecture

### Warum Event-Driven?

Das System nutzt Event-Driven Architecture (EDA) für:
- **Loose Coupling** - Services sind unabhängig voneinander
- **Scalability** - Services können individuell skaliert werden
- **Async Communication** - Nicht-blockierende Operationen
- **Event Sourcing** - Vollständige Event-Historie
- **Fault Tolerance** - Fehler in einem Service betreffen andere nicht

### RabbitMQ Setup

**Exchanges:**
- `logs` - Direct Exchange für Log-Events
- `webrtc_events` - Topic Exchange für WebRTC-Events

**Queues:**
- `logs` - Sammelt alle System-Logs
- `webrtc_events` - Sammelt WebRTC-spezifische Events

**Bindings:**
```
logs exchange → logs queue (routing key: *)
webrtc_events exchange → webrtc_events queue (routing key: webrtc.*)
```

### Event Flow Beispiel

```javascript
// Chat Service publiziert Event
channel.publish(
  'logs',
  'info',
  Buffer.from(JSON.stringify({
    event: 'message_sent',
    user: 'Alice',
    data: { message: 'Hello World' }
  }))
);

// Log Service konsumiert Event
channel.consume('logs', (msg) => {
  const event = JSON.parse(msg.content.toString());
  await saveToMongoDB(event);
  channel.ack(msg);
});
```

---

## 📹 WebRTC Implementierung

### Simple-Peer Integration

Das System nutzt **Simple-Peer**, eine battle-tested WebRTC-Bibliothek:

**Vorteile:**
- ✅ Automatische SDP Offer/Answer Generierung
- ✅ ICE Candidate Trickling
- ✅ Einheitliches Signal-Event statt 3+ Events
- ✅ Browser-Kompatibilität handled
- ✅ Error-Handling eingebaut

**Vorher (Manual WebRTC):**
```javascript
// Manuell: offer, answer, ice-candidate Events
socket.on('call-offer', ...);
socket.on('call-answer', ...);
socket.on('ice-candidate', ...);
// ~500 Zeilen Code
```

**Nachher (Simple-Peer):**
```javascript
// Automatisch: Ein 'webrtc-signal' Event für alles
peer.on('signal', data => {
  socket.emit('webrtc-signal', { target, signal: data });
});
// ~350 Zeilen Code, mehr Zuverlässigkeit
```

### Connection Flow

```
1. User A klickt "Call" Button
   ↓
2. Frontend erstellt Peer (initiator: true)
   ↓
3. Simple-Peer generiert SDP Offer + ICE Candidates
   ↓
4. Signal → Socket.IO → Chat Service → User B
   ↓
5. User B klickt "Accept"
   ↓
6. Frontend erstellt Peer (initiator: false)
   ↓
7. Peer empfängt Offer, generiert Answer
   ↓
8. Answer + ICE → Chat Service → User A
   ↓
9. ICE Kandidaten ausgetauscht
   ↓
10. P2P Connection etabliert
    ↓
11. Video/Audio Streams fließen direkt!
```

### ICE Candidate Queuing

**Problem:** Caller sendet ICE Candidates sofort nach Offer, aber Callee hat noch keinen Peer erstellt.

**Lösung:** ICE Candidate Queue
```javascript
const pendingCandidatesRef = useRef([]);

// Candidates queuen wenn kein Peer existiert
if (!peerRef.current && !data.signal?.type) {
  pendingCandidatesRef.current.push(data.signal);
}

// Alle queued Candidates verarbeiten nach Peer-Erstellung
peer.signal(callData.signal); // Offer
pendingCandidatesRef.current.forEach(candidate => {
  peer.signal(candidate);
});
```

### STUN/TURN Konfiguration

**Automatische Erkennung:**
```javascript
// 1. Versuche Custom TURN Server
const config = await fetch('/api/turn/config');

// 2. Fallback zu Google STUN
if (!config) {
  useGoogleSTUN();
}

// 3. Manual Override möglich
localStorage.setItem('forceGoogleStun', 'true');
```

**ICE Server Config:**
```javascript
{
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    {
      urls: "turn:app.lab.joku.dev:3478",
      username: "user",
      credential: "pass"
    }
  ]
}
```

---

## 🚀 Installation & Setup

### Voraussetzungen

- Docker 24.x oder höher
- Docker Compose 2.x oder höher
- Node.js 18.x (für lokale Entwicklung)
- Git

### Schnellstart

```bash
# Repository klonen
git clone <repository-url>
cd lb2-projektarbeit-joshsethsimon

# Alle Services starten
docker-compose up -d

# Logs anzeigen
docker-compose logs -f

# Einzelne Service-Logs
docker-compose logs -f chat-service
docker-compose logs -f frontend
```

### Services überprüfen

```bash
# Status aller Container
docker-compose ps

# Sollte zeigen:
# - caddy (running)
# - frontend (running)
# - chat-service (running)
# - participant-service (running)
# - log-service (running)
# - stun-turn-service (running)
# - mongodb (running)
# - mongo-express (running)
# - rabbitmq (running)
```

### Zugriff auf die Applikation

| Service | URL | Credentials |
|---------|-----|-------------|
| **Chat App** | http://localhost | - |
| **RabbitMQ Admin** | http://localhost:15672 | guest / guest |
| **Mongo Express** | http://localhost:8081 | admin / admin |
| **TURN Stats** | http://localhost/api/turn/stats | - |
| **TURN Admin** | http://localhost/turn-admin | - |

### Lokale Entwicklung (ohne Docker)

```bash
# MongoDB starten
docker run -d -p 27017:27017 --name mongo mongo:6.0

# RabbitMQ starten
docker run -d -p 5672:5672 -p 15672:15672 --name rabbitmq rabbitmq:3-management

# Chat Service
cd chat-service
npm install
PORT=8001 DATABASE_URL=mongodb://localhost:27017/chatapp npm start

# Frontend
cd frontend
npm install
npm start

# Weitere Services analog...
```

---

## 📡 API Dokumentation

### Chat Service API

#### GET /api/chat/messages/recent
Holt die neuesten Chat-Nachrichten.

**Query Parameters:**
- `limit` (optional) - Anzahl Nachrichten (default: 50)

**Response:**
```json
{
  "messages": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "username": "Alice",
      "message": "Hello World",
      "timestamp": "2024-10-17T20:00:00.000Z",
      "type": "user"
    }
  ]
}
```

#### GET /api/chat/messages/user
Holt nur Benutzer-Nachrichten (keine System-Messages).

**Query Parameters:**
- `limit` (optional) - Anzahl Nachrichten (default: 50)

**Response:** Wie `/messages/recent` aber nur `type: "user"`

#### GET /api/chat/users
Holt Liste der online Benutzer.

**Response:**
```json
{
  "users": ["Alice", "Bob", "Charlie"]
}
```

#### POST /api/chat/clear
Löscht alle Chat-Nachrichten.

**Response:**
```json
{
  "message": "Chat cleared successfully"
}
```

---

### Participant Service API

#### POST /api/participants/join
Registriert einen neuen Teilnehmer.

**Body:**
```json
{
  "username": "Alice"
}
```

**Response:**
```json
{
  "message": "Participant joined successfully",
  "participant": {
    "_id": "...",
    "username": "Alice",
    "joinedAt": "2024-10-17T20:00:00.000Z",
    "isOnline": true
  }
}
```

#### POST /api/participants/leave
Meldet einen Teilnehmer ab.

**Body:**
```json
{
  "username": "Alice"
}
```

#### GET /api/participants
Holt alle Teilnehmer.

**Response:**
```json
{
  "participants": [
    {
      "username": "Alice",
      "isOnline": true,
      "joinedAt": "2024-10-17T20:00:00.000Z"
    }
  ]
}
```

#### GET /api/participants/stats
Holt Teilnehmer-Statistiken.

**Response:**
```json
{
  "total": 10,
  "online": 3,
  "offline": 7
}
```

---

### Log Service API

#### GET /api/logs
Holt alle Logs.

**Query Parameters:**
- `limit` (optional) - Anzahl Logs (default: 100)
- `level` (optional) - Filter nach Level (info/warn/error)
- `service` (optional) - Filter nach Service
- `user` (optional) - Filter nach User

**Response:**
```json
{
  "logs": [
    {
      "timestamp": "2024-10-17T20:00:00.000Z",
      "level": "info",
      "service": "chat-service",
      "event": "message_sent",
      "user": "Alice",
      "data": { "message": "Hello" }
    }
  ],
  "total": 150
}
```

#### GET /api/logs/stats
Holt Log-Statistiken.

**Response:**
```json
{
  "total": 1000,
  "byLevel": {
    "info": 800,
    "warn": 150,
    "error": 50
  },
  "byService": {
    "chat-service": 500,
    "participant-service": 300,
    "log-service": 200
  }
}
```

---

### STUN/TURN Service API

#### GET /api/turn/config
Holt ICE Server Konfiguration.

**Response:**
```json
{
  "iceServers": [
    {
      "urls": "stun:app.lab.joku.dev:3478"
    },
    {
      "urls": "turn:app.lab.joku.dev:3478",
      "username": "user",
      "credential": "pass"
    }
  ]
}
```

#### GET /api/turn/stats
Holt TURN Server Statistiken.

**Response:**
```json
{
  "activeSessions": 3,
  "totalAllocations": 45,
  "bytesTransferred": 1048576,
  "uptime": "12h 30m"
}
```

#### GET /api/turn/health
Health Check für TURN Service.

**Response:**
```json
{
  "status": "healthy",
  "services": {
    "stun": true,
    "turn": true,
    "api": true
  }
}
```

---

## 📊 Monitoring & Logging

### RabbitMQ Management UI

**URL:** http://localhost:15672  
**Credentials:** guest / guest

**Features:**
- Queue-Übersicht und Statistiken
- Message-Rate Monitoring
- Connection-Tracking
- Exchange Bindings

**Wichtige Queues:**
- `logs` - Alle System-Events
- `webrtc_events` - WebRTC-spezifische Events

### Mongo Express UI

**URL:** http://localhost:8081  
**Credentials:** admin / admin

**Databases:**
- `chatapp` - Hauptdatenbank
  - `messages` - Chat-Nachrichten
  - `participants` - Benutzer
  - `logs` - Event-Logs
  - `statistics` - Aggregierte Stats

### TURN Service Monitoring

**Stats API:** http://localhost/api/turn/stats  
**Admin UI:** http://localhost/turn-admin

**Metriken:**
- Active WebRTC Sessions
- TURN Allocations
- Bandwidth Usage
- Connection Success Rate

### Application Logs

```bash
# Alle Services
docker-compose logs -f

# Spezifischer Service
docker-compose logs -f chat-service

# Letzte N Zeilen
docker-compose logs --tail=100 chat-service

# Fehler filtern
docker-compose logs chat-service | grep ERROR
```

---

## 🚢 Deployment

### Production Build

```bash
# Production Docker Compose
docker-compose -f docker-compose.prod.yml up -d

# Mit Build
docker-compose -f docker-compose.prod.yml up -d --build
```

### Environment Variables

Erstelle `.env` Datei im Root:

```bash
# MongoDB
MONGO_INITDB_DATABASE=chatapp
MONGO_INITDB_ROOT_USERNAME=admin
MONGO_INITDB_ROOT_PASSWORD=secure_password

# RabbitMQ
RABBITMQ_DEFAULT_USER=admin
RABBITMQ_DEFAULT_PASS=secure_password

# TURN Server
TURN_USERNAME=turnuser
TURN_PASSWORD=secure_turn_pass
EXTERNAL_IP=your_public_ip

# Frontend
REACT_APP_API_URL=https://your-domain.com
REACT_APP_WS_URL=wss://your-domain.com
```

### SSL/TLS mit Caddy

Caddy konfiguriert automatisch Let's Encrypt SSL:

```caddyfile
your-domain.com {
    reverse_proxy frontend:8000
    reverse_proxy /api/chat/* chat-service:8001
    reverse_proxy /api/participants/* participant-service:8003
    reverse_proxy /api/logs/* log-service:8004
    reverse_proxy /api/turn/* stun-turn-service:8005
}
```

### Scaling

```bash
# Service skalieren
docker-compose up -d --scale chat-service=3

# Load Balancing über Caddy
# Automatisch Round-Robin zwischen Instanzen
```

---

## 🐛 Troubleshooting

### WebRTC Connection Fails

**Problem:** Video-Anrufe verbinden nicht

**Lösungen:**
1. Force Google STUN aktivieren (DNS/Cloud Icon klicken)
2. TURN Server Status prüfen: `curl http://localhost/api/turn/health`
3. Browser Console auf ICE-Fehler prüfen
4. Firewall-Regeln für UDP Port 3478 prüfen

### WebSocket Disconnects

**Problem:** Chat trennt Verbindung

**Lösungen:**
1. Caddy Logs prüfen: `docker-compose logs caddy`
2. Chat Service Status: `docker-compose ps chat-service`
3. Network connectivity: `docker network inspect lb2-projektarbeit-joshsethsimon_chat-network`

### process.nextTick Error

**Problem:** `process.nextTick is not a function`

**Lösung:**
- Hard Refresh (Ctrl+Shift+R)
- Browser Cache leeren
- Service neu starten: `docker-compose restart frontend`

### MongoDB Connection Issues

**Problem:** Services können nicht zu MongoDB verbinden

**Lösungen:**
```bash
# MongoDB Status
docker-compose ps mongodb

# MongoDB Logs
docker-compose logs mongodb

# MongoDB neu starten
docker-compose restart mongodb

# Verbindung testen
docker exec -it mongodb mongosh --eval "db.adminCommand('ping')"
```

### RabbitMQ Queue Backup

**Problem:** Messages stauen sich in Queue

**Lösungen:**
1. RabbitMQ UI öffnen: http://localhost:15672
2. Queue leeren: Select Queue → "Purge"
3. Log Service neu starten: `docker-compose restart log-service`

### Port Conflicts

**Problem:** Port bereits in Verwendung

**Lösung:**
```bash
# Verwendete Ports finden
lsof -i :8000  # Frontend
lsof -i :8001  # Chat Service
lsof -i :27017 # MongoDB

# Prozess beenden
kill -9 <PID>

# Oder andere Ports in docker-compose.yml definieren
```

---

## 📚 Zusätzliche Dokumentation

- [Simple-Peer Implementation](./SIMPLE_PEER_IMPLEMENTATION.md) - WebRTC Details
- [ICE Candidate Queuing Fix](./ICE_CANDIDATE_QUEUE_FIX.md) - WebRTC Bugfixes
- [Force Google STUN Feature](./FORCE_GOOGLE_STUN.md) - STUN Server Toggle
- [Circular Dependency Fix](./CIRCULAR_DEPENDENCY_FIX.md) - React Hook Fix
- [STUN/TURN Service](./stun-turn-service/README.md) - TURN Server Details
- [Persistent Login](./PERSISTENT_LOGIN.md) - Session Management
- [Statistics](./STATISTICS_IMPLEMENTATION.md) - Analytics Features

---

## 🤝 Mitwirkende

**Projekt Team:**
- Josh
- Seth  
- Simon

**Institution:** BBZ-BL-IT  
**Kurs:** LB2 Projektarbeit  
**Datum:** Oktober 2024

---

## 📄 Lizenz

Dieses Projekt wurde für Bildungszwecke im Rahmen des LB2-Moduls entwickelt.

---

## 🎓 Technische Highlights

### Microservices-Prinzipien
✅ **Single Responsibility** - Jeder Service hat eine klare Aufgabe  
✅ **Loose Coupling** - Services kommunizieren über Events  
✅ **High Cohesion** - Related functionality grouped together  
✅ **Independent Deployment** - Services können unabhängig deployed werden  
✅ **Technology Heterogeneity** - Services können verschiedene Tech-Stacks nutzen

### Event-Driven Design
✅ **Asynchrone Kommunikation** - Nicht-blockierende Operations  
✅ **Event Sourcing** - Vollständige Event-Historie  
✅ **CQRS Patterns** - Command/Query Separation  
✅ **Message Broker** - RabbitMQ als zentraler Event-Bus  
✅ **Event Replay** - Events können wiederholt werden

### WebRTC Best Practices
✅ **Simple-Peer Library** - Production-ready WebRTC Abstraction  
✅ **ICE Candidate Trickling** - Progressive connectivity  
✅ **STUN/TURN Fallback** - Automatische Failover  
✅ **Connection State Monitoring** - Real-time status tracking  
✅ **Error Recovery** - Graceful degradation

---

**🚀 Happy Coding!**
