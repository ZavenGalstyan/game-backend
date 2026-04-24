# DASH DREAD — Frontend Multiplayer Implementation Guide

Backend is fully built. This document tells you exactly what the frontend needs to do.

---

## Backend URLs

```
REST API:  https://dash-dread.onrender.com
WebSocket: wss://dash-dread.onrender.com
```

Auth header for all HTTP requests: `Authorization: Bearer <token>`  
Token is already stored in localStorage — use `API.get()` / `API.post()` from `js/api.js`.

---

## Overview: What Needs to Be Built

1. **Lobby screen** — create or join a room before the game starts
2. **Send position** — every 50ms during gameplay, send your player's position via WS
3. **Render remote players** — draw other players on the canvas from WS position updates
4. **Handle room events** — player joined/left, game start, wave start, game over

---

## Step 1 — Lobby UI

Create a new file: `js/multiplayer.js`

### 1a. Create a Room

```js
async function createRoom(mapId, charId) {
  const res = await API.post("/rooms/create", { mapId, charId, maxPlayers: 4 });
  // res = { roomId: "uuid-string", room: { ... } }
  return res;
}
```

### 1b. Browse Open Rooms

```js
async function listRooms(mapId = null) {
  const url = mapId ? `/rooms?mapId=${mapId}` : "/rooms";
  const res = await API.get(url);
  // res = { rooms: [ { roomId, mapId, hostName, playerCount, maxPlayers, status } ] }
  return res.rooms;
}
```

### 1c. Join a Room

```js
async function joinRoom(roomId, charId) {
  const res = await API.post(`/rooms/${roomId}/join`, { charId });
  // res = { room: { roomId, players: [...], hostId, mapId, status } }
  return res.room;
}
```

### 1d. Leave a Room

```js
async function leaveRoom(roomId) {
  await API.post(`/rooms/${roomId}/leave`, {});
}
```

### 1e. Force-Start (host only)

```js
async function startRoom(roomId) {
  await API.post(`/rooms/${roomId}/start`, {});
}
```

### Lobby UI Flow

```
index.html (main menu)
  → "MULTIPLAYER" button
  → Show lobby panel:
      [ Create Room ]  [ Browse Rooms ]
      
  Create Room:
    - Pick map (dropdown)
    - Pick character
    - POST /rooms/create → get roomId
    - Show waiting room with player list
    - Host sees "START GAME" button → POST /rooms/:id/start
    
  Browse Rooms:
    - GET /rooms → show list of open rooms
    - Click a room → POST /rooms/:id/join
    - Show waiting room with player list
    
  Waiting Room:
    - Listen for WS events: room:player_joined, room:player_left
    - When WS sends room:start → navigate to game.html with roomId in URL/state
```

---

## Step 2 — WebSocket Events to Listen For

Subscribe to these in your lobby and game screens using `WS.on(type, fn)`.

### In the Lobby / Waiting Room

```js
// Another player joined your room
WS.on("room:player_joined", ({ player }) => {
  // player = { userId, username, charId, hp, maxHp }
  addPlayerToWaitingRoomUI(player);
});

// A player left your room
WS.on("room:player_left", ({ userId, newHostId }) => {
  removePlayerFromWaitingRoomUI(userId);
  if (newHostId === myUserId) {
    // I am now the host — show "START GAME" button
  }
});

// All players are ready OR host force-started
WS.on("room:start", ({ roomId, mapId, wave }) => {
  // Navigate to game and start multiplayer session
  startMultiplayerGame(roomId, mapId);
});

// Someone clicked ready
WS.on("room:player_ready", ({ userId }) => {
  markPlayerReady(userId);
});
```

### In the Game

```js
// Remote player moved
WS.on("remote:pos", ({ userId, x, y, angle, hp, weaponId }) => {
  updateRemotePlayer(userId, { x, y, angle, hp, weaponId });
});

// Remote player fired a bullet
WS.on("remote:shoot", ({ userId, x, y, angle, weaponId, bulletId }) => {
  spawnRemoteBullet({ x, y, angle, weaponId, bulletId });
});

// Remote player did something (grenade, melee, etc.)
WS.on("remote:action", ({ userId, action }) => {
  handleRemoteAction(userId, action);
});

// Remote player died
WS.on("remote:dead", ({ userId, killedBy }) => {
  setRemotePlayerDead(userId);
});

// Teammate was revived
WS.on("remote:revive", ({ userId }) => {
  setRemotePlayerAlive(userId);
});

// Next wave is starting
WS.on("room:wave_start", ({ wave }) => {
  startWave(wave);
});

// Game is over
WS.on("room:finished", ({ roomId, stats }) => {
  showGameOverScreen(stats);
});
```

---

## Step 3 — Sending Messages During Gameplay

All messages use `WS.send(type, payload)` which already exists in `js/ws.js`.

### 3a. Send Your Position (every 50ms — NOT every frame)

Add this inside your game loop in `js/core/game.js`:

```js
// Add this property to the Game class
this._mpTimer = 0;

// Inside your update(dt) method, add:
if (this._roomId) {
  this._mpTimer += dt;
  if (this._mpTimer >= 0.05) {   // 50ms = 20 updates per second
    this._mpTimer = 0;
    WS.send("player:pos", {
      x:        this.player.x,
      y:        this.player.y,
      angle:    this.player.angle,
      hp:       this.player.hp,
      weaponId: this.player.currentWeapon?.id || "pistol",
    });
  }
}
```

### 3b. Send When You Fire

In the shooting logic (wherever you create a bullet):

```js
if (this._roomId) {
  WS.send("player:shoot", {
    x:        bullet.x,
    y:        bullet.y,
    angle:    bullet.angle,
    weaponId: this.player.currentWeapon?.id,
    bulletId: Math.random().toString(36).slice(2),
  });
}
```

### 3c. Send When You Die

```js
if (this._roomId) {
  WS.send("player:dead", { killedBy: "bot" }); // or killedBy: enemyUserId
}
```

### 3d. Send Revive

```js
if (this._roomId) {
  WS.send("player:revive", { targetUserId: deadPlayer.userId });
}
```

### 3e. Mark Yourself Ready (in lobby)

```js
WS.send("room:ready", {});
```

### 3f. Host: Signal Wave Cleared

```js
// Call this when all bots in the wave are dead
if (this._roomId && this._isHost) {
  WS.send("room:wave_ack", { wave: this.currentWave });
}
```

### 3g. Host: Signal Game Over

```js
if (this._roomId && this._isHost) {
  WS.send("room:finished", {
    stats: this.players.map(p => ({
      userId: p.userId,
      username: p.username,
      kills: p.kills,
      wave: this.currentWave,
    })),
  });
}
```

---

## Step 4 — Rendering Remote Players

Remote players are other players sent to you via `remote:pos` events.
Store them in a Map and draw them every frame like a Bot but with a name tag.

### Data structure

```js
// In your Game class
this._remotePlayers = new Map(); // userId → { x, y, angle, hp, maxHp, weaponId, username, charId, targetX, targetY }
```

### Update function (called when remote:pos arrives)

```js
function updateRemotePlayer(userId, data) {
  const existing = game._remotePlayers.get(userId);
  if (existing) {
    // Save as target for interpolation
    existing.targetX    = data.x;
    existing.targetY    = data.y;
    existing.angle      = data.angle;
    existing.hp         = data.hp;
    existing.weaponId   = data.weaponId;
  }
}
```

### Interpolation in game update loop

```js
for (const [uid, rp] of this._remotePlayers) {
  if (rp.targetX !== undefined) {
    rp.x = lerp(rp.x, rp.targetX, 0.3);  // lerp() is in js/utils.js
    rp.y = lerp(rp.y, rp.targetY, 0.3);
  }
}
```

### Draw remote players (add to your render loop)

```js
function drawRemotePlayers(ctx, camera) {
  for (const [uid, rp] of game._remotePlayers) {
    if (rp.dead) continue;

    const sx = rp.x - camera.x;
    const sy = rp.y - camera.y;

    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(rp.angle);

    // Draw character sprite (same as local player, using charId)
    // e.g. ctx.drawImage(charSprites[rp.charId], -16, -16, 32, 32);

    ctx.restore();

    // HP bar above player
    const barW = 40, barH = 5;
    const hpPct = rp.hp / rp.maxHp;
    ctx.fillStyle = "#333";
    ctx.fillRect(sx - barW / 2, sy - 36, barW, barH);
    ctx.fillStyle = hpPct > 0.5 ? "#0f0" : hpPct > 0.25 ? "#ff0" : "#f00";
    ctx.fillRect(sx - barW / 2, sy - 36, barW * hpPct, barH);

    // Name tag
    ctx.fillStyle = "#fff";
    ctx.font = "bold 11px monospace";
    ctx.textAlign = "center";
    ctx.fillText(rp.username, sx, sy - 42);
  }
}
```

---

## Step 5 — Room Lifecycle in game.js

When the game starts in multiplayer mode, `game.html` should receive the roomId and a flag for whether this player is the host.

### Starting the game

```js
// In game.html or wherever you initialise the Game class
const urlParams  = new URLSearchParams(window.location.search);
const roomId     = urlParams.get("roomId");   // null for solo
const isHost     = urlParams.get("host") === "1";

game._roomId  = roomId;
game._isHost  = isHost;
```

### When room:player_joined fires during gameplay

```js
WS.on("room:player_joined", ({ player }) => {
  game._remotePlayers.set(player.userId, {
    x: 0, y: 0, targetX: 0, targetY: 0,
    angle: 0, hp: player.hp, maxHp: player.maxHp,
    username: player.username, charId: player.charId,
    dead: false,
  });
});
```

### When room:player_left fires during gameplay

```js
WS.on("room:player_left", ({ userId }) => {
  game._remotePlayers.delete(userId);
});
```

### On game exit / disconnect

```js
async function exitMultiplayer() {
  if (game._roomId) {
    await leaveRoom(game._roomId);
    game._roomId = null;
  }
}
```

---

## Summary: Files to Create / Modify

| File | Action | What to do |
|------|--------|------------|
| `js/multiplayer.js` | **Create new** | Lobby functions: createRoom, listRooms, joinRoom, leaveRoom, startRoom |
| `index.html` | **Modify** | Add "MULTIPLAYER" button and lobby panel UI |
| `js/core/game.js` | **Modify** | Add `_roomId`, `_isHost`, `_remotePlayers`, position send timer, remote player render |
| `game.html` | **Modify** | Read `roomId` from URL params, pass to Game |

---

## Quick Reference: All WS Message Types

### You SEND these

| type | when |
|------|------|
| `room:ready` | Player clicks "Ready" in lobby |
| `player:pos` | Every 50ms during game |
| `player:shoot` | When you fire |
| `player:action` | Grenade / melee / vehicle |
| `player:dead` | When you die |
| `player:revive` | When you revive a teammate |
| `room:wave_ack` | Host only: wave is cleared |
| `room:finished` | Host only: game over |

### You RECEIVE these

| type | when |
|------|------|
| `room:player_joined` | Someone joined your room |
| `room:player_left` | Someone left your room |
| `room:player_ready` | Someone clicked ready |
| `room:start` | Game is starting now |
| `room:wave_start` | New wave beginning |
| `room:finished` | Game over |
| `remote:pos` | Another player moved |
| `remote:shoot` | Another player fired |
| `remote:action` | Another player did an action |
| `remote:dead` | Another player died |
| `remote:revive` | A player was revived |

---

## Notes

- `WS.send()` and `WS.on()` already exist in `js/ws.js` — use them directly
- `lerp()` already exists in `js/utils.js` — use it for smooth position interpolation
- The server is **not** the game engine — it only relays messages between players
- **Host** = the player who created the room. Enemies run on the host client. When host disconnects, first remaining player becomes host automatically
- Rooms auto-delete from the database after 2 hours
- Position updates run at 20/sec (every 50ms), not 60fps — this keeps bandwidth low
