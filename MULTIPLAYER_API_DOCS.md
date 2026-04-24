# DASH DREAD — Multiplayer API Documentation

## Frontend Stack (Answer to your question)

- **Language:** Plain JavaScript (ES6+), no frameworks, no build tools
- **Rendering:** HTML5 Canvas 2D API (`ctx.drawImage`, `ctx.fillRect`, paths, etc.)
- **Game loop:** `requestAnimationFrame` at ~60 FPS, delta-time capped at 50ms
- **WebSocket client:** Native browser `WebSocket` API, wrapped in `WS` module (`js/ws.js`)
- **Message format:** JSON `{ type: string, payload: object }` — both directions
- **Auth:** JWT token sent as query param on WS connect: `wss://...?token=<JWT>`
- **No Phaser, no Three.js, no React** — everything is hand-rolled canvas code

---

## Current WebSocket Infrastructure (Already Exists)

The frontend already has a full WS manager (`js/ws.js`):
- Auto-reconnects with exponential backoff (2s → 5s → 10s)
- Sends `ping` / receives `pong` keepalive
- Sends `heartbeat` every 30s with `{ status: 'menu' | 'ingame' }`
- Subscribe to message types via `WS.on('type', fn)`
- Send messages via `WS.send('type', payload)`

The backend already has:
- `wss` WebSocket server on the same HTTP server
- `wsConnections` Map: `userId → WebSocket`
- `pushToUser(userId, data)` helper
- JWT auth on connect

---

## What Needs to Be Added for Multiplayer

### Concept: Session-Based Co-op Rooms

Players join a **room** (same map, same session). Each player controls their own character. Other players are rendered as remote-controlled entities on your canvas. Enemies are authoritative on the **host** client (or server-side for fairness).

---

## 1. Data Structures Needed on Backend

### Room
```js
{
  roomId: string,          // unique ID (nanoid/uuid)
  mapId: string,           // e.g. "neon_city", "desert_sands"
  hostId: string,          // userId of host
  players: [
    {
      userId: string,
      username: string,
      charId: string,       // e.g. "gangster", "phantom"
      x: number,            // world position (pixels)
      y: number,
      angle: number,        // facing direction (radians)
      hp: number,
      maxHp: number,
      weaponId: string,     // current weapon
      kills: number,
      money: number,
      state: 'alive' | 'dead'
    }
  ],
  wave: number,
  status: 'waiting' | 'starting' | 'ingame' | 'finished',
  maxPlayers: 4,
  createdAt: Date
}
```

---

## 2. HTTP REST Endpoints Needed

### Create a room
```
POST /rooms/create
Auth: Bearer <token>
Body: { mapId: string, maxPlayers?: number (1-4) }
Response: { roomId, room }
```

### Join a room
```
POST /rooms/:roomId/join
Auth: Bearer <token>
Body: { charId: string }
Response: { room } or 400 if full/already started
```

### Leave a room
```
POST /rooms/:roomId/leave
Auth: Bearer <token>
Response: { ok: true }
```

### List open rooms (lobby browser)
```
GET /rooms?mapId=<optional>
Auth: Bearer <token>
Response: { rooms: [ { roomId, mapId, hostName, playerCount, maxPlayers, wave, status } ] }
```

### Get room state
```
GET /rooms/:roomId
Auth: Bearer <token>
Response: { room }
```

---

## 3. WebSocket Message Types Needed

### Client → Server (frontend sends these)

| type | payload | when |
|------|---------|------|
| `heartbeat` | `{ status: 'ingame', roomId }` | Already exists — extend it |
| `room:join` | `{ roomId, charId }` | Player enters room |
| `room:leave` | `{ roomId }` | Player leaves/quits |
| `room:ready` | `{ roomId }` | Player ready to start |
| `player:pos` | `{ roomId, x, y, angle, hp, weaponId }` | **Every frame** (throttled to ~20/s) |
| `player:shoot` | `{ roomId, x, y, angle, weaponId, bulletId }` | When player fires |
| `player:action` | `{ roomId, action: 'grenade'|'melee'|'vehicle_enter'|'vehicle_exit' }` | Special actions |
| `player:dead` | `{ roomId, killedBy: 'bot'|userId }` | Player dies |
| `player:revive` | `{ roomId, targetUserId }` | Teammate revive |
| `room:wave_ack` | `{ roomId, wave }` | Host acknowledges wave start |

### Server → Client (backend pushes these)

| type | payload | when |
|------|---------|------|
| `room:state` | `{ room }` | Full room state on join |
| `room:player_joined` | `{ player }` | New player entered room |
| `room:player_left` | `{ userId, username }` | Player disconnected/left |
| `room:start` | `{ roomId, mapId, wave: 1 }` | All ready — game starts |
| `room:wave_start` | `{ roomId, wave, botCount }` | New wave begins |
| `room:wave_clear` | `{ roomId, wave, reward }` | Wave cleared |
| `remote:pos` | `{ userId, x, y, angle, hp, weaponId }` | Remote player position update |
| `remote:shoot` | `{ userId, x, y, angle, weaponId, bulletId }` | Remote player fired |
| `remote:action` | `{ userId, action }` | Remote player action |
| `remote:dead` | `{ userId, killedBy }` | Remote player died |
| `remote:revive` | `{ userId }` | Remote player was revived |
| `room:finished` | `{ roomId, stats: [] }` | Game over, show stats |

---

## 4. Position Update Rate (Performance Budget)

- Frontend sends `player:pos` at **20 updates/second** (every 50ms), NOT every frame
- Backend relays immediately to all other players in same room — no processing needed
- Each payload is ~80 bytes JSON → 80 × 20/s × 4 players = **~6.4 KB/s total** — fine

**Frontend throttle pattern (already works with existing WS.send):**
```js
// In game loop (called at 60fps):
this._posSendTimer = (this._posSendTimer || 0) + dt;
if (this._posSendTimer >= 0.05) {   // 20/s
  this._posSendTimer = 0;
  WS.send('player:pos', {
    roomId: this._roomId,
    x: player.x, y: player.y,
    angle: player.angle,
    hp: player.hp,
    weaponId: player.weaponId
  });
}
```

---

## 5. Room Relay Logic (Backend)

When backend receives `player:pos` from user A in room R:
1. Look up room R
2. For every other player in R (not user A), call `pushToUser(playerId, { type: 'remote:pos', payload: { userId: A, ...posData } })`

That's the entire relay — no game simulation on backend for positions.

---

## 6. Frontend Rendering Remote Players

Remote players are rendered like `Bot` entities but with:
- Position interpolated between received snapshots (lerp over 50ms)
- Character sprite from their `charId`
- Name tag above their head
- HP bar below name tag
- Their bullets drawn when `remote:shoot` received

The frontend already has `lerp()` in `js/utils.js` for smooth interpolation.

---

## 7. Mongoose Schema Additions

```js
// Room schema
const RoomSchema = new mongoose.Schema({
  roomId:     { type: String, unique: true },
  mapId:      String,
  hostId:     String,
  status:     { type: String, default: 'waiting' },
  maxPlayers: { type: Number, default: 4 },
  wave:       { type: Number, default: 0 },
  players:    [{
    userId:   String,
    username: String,
    charId:   String,
    x: Number, y: Number, angle: Number,
    hp: Number, maxHp: Number,
    weaponId: String,
    kills:    Number,
    money:    Number,
    state:    { type: String, default: 'alive' },
    ready:    { type: Boolean, default: false }
  }],
  createdAt: { type: Date, default: Date.now, expires: 7200 } // auto-delete after 2h
});
```

---

## 8. Maps Available (for mapId validation)

Valid `mapId` values the frontend knows about:
```
neon_city, galactica, wasteland, robot_city, campaign,
survival, hardcore, blitz, siege, frozen_tundra,
ocean_depths, metropolis, desert_sands, jungle,
arena, zombie, lifemode
```

For initial multiplayer, recommended supported maps: `neon_city`, `wasteland`, `metropolis`, `frozen_tundra`, `desert_sands`

---

## 9. Implementation Priority Order

1. **Room CRUD** — POST /rooms/create, POST /rooms/:id/join, GET /rooms
2. **WS relay** — extend existing `ws.on('message')` to handle `room:*` and `player:*` types
3. **Position broadcast** — relay `player:pos` → `remote:pos` to room members
4. **Shoot broadcast** — relay `player:shoot` → `remote:shoot`
5. **Room lifecycle** — start/wave/finish events
6. **REST room browser** — GET /rooms for lobby UI

---

## 10. No Changes Needed to Frontend Auth

The frontend already:
- Sends JWT on WS connect (`wss://...?token=JWT`)
- Has `WS.send(type, payload)` ready to use
- Has `WS.on(type, fn)` for receiving events

The only frontend work needed is:
- Lobby UI (create/join room, list rooms)  
- Sending `player:pos` every 50ms during gameplay
- Rendering remote players from `remote:pos` events
- Handling `remote:shoot` to draw remote bullets
