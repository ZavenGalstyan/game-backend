# Frontend WebSocket Events Reference

This file documents every WebSocket event the backend sends **and** receives,
including the exact type names the server actually emits (which differ from the
spec for the relay events).

---

## Connection

Connect with a JWT token as a query parameter:

```
ws://localhost:3000?token=<JWT>
```

On success the server immediately sends:

```json
{ "type": "connected", "payload": { "userId": "abc123" } }
```

---

## Keep-alive

| Client sends    | Server responds |
|-----------------|-----------------|
| `{ "type": "ping" }` | `{ "type": "pong" }` |
| `{ "type": "heartbeat" }` | *(silent — updates online timestamp)* |

---

## Room events

### `room:rejoin`  ← client → server
Send after a page navigation if the player was already in a room.

```json
{ "type": "room:rejoin", "payload": { "roomId": "room_xyz" } }
```

Server responds to **sender** with `room:state` and broadcasts
`room:player_rejoined` to others.

---

### `room:state`  ← server → rejoining client
Full room snapshot.  Every player object includes `charId`.

```json
{
  "type": "room:state",
  "payload": {
    "room": {
      "roomId": "room_xyz",
      "mapId": "neon_city",
      "hostId": "abc123",
      "status": "waiting",
      "players": [
        { "userId": "abc123", "username": "Zaven", "charId": "gangster", "hp": 120, "maxHp": 120 },
        { "userId": "def456", "username": "Bob",   "charId": "hacker",   "hp": 80,  "maxHp": 80  }
      ]
    }
  }
}
```

---

### `room:player_joined`  ← server → all clients in room
Sent when a new player joins via `POST /rooms/:id/join`.
The `player` object **includes `charId`** — use this to render the remote player's character sprite.

```json
{
  "type": "room:player_joined",
  "payload": {
    "player": {
      "userId":   "def456",
      "username": "Bob",
      "charId":   "hacker",
      "hp":       80,
      "maxHp":    80
    }
  }
}
```

---

### `room:player_rejoined`  ← server → all OTHER clients
```json
{ "type": "room:player_rejoined", "payload": { "userId": "abc123", "username": "Zaven" } }
```

### `room:player_disconnected`  ← server → all OTHER clients
Fires immediately when the socket drops (before the 15-second grace period expires).
```json
{ "type": "room:player_disconnected", "payload": { "userId": "abc123" } }
```

### `room:player_left`  ← server → all OTHER clients
Fires after the 15-second grace period if the player did not rejoin.
`newHostId` is non-null only if the host changed.
```json
{ "type": "room:player_left", "payload": { "userId": "abc123", "newHostId": "def456" } }
```

### `room:player_ready`  ← server → all clients
```json
{ "type": "room:player_ready", "payload": { "userId": "abc123" } }
```

### `room:start`  ← server → all clients
Fired when all players are ready.
```json
{ "type": "room:start", "payload": { "roomId": "room_xyz", "mapId": "neon_city", "wave": 1 } }
```

### `room:wave_start`  ← server → all clients
```json
{ "type": "room:wave_start", "payload": { "roomId": "room_xyz", "wave": 2 } }
```

### `room:finished`  ← server → all clients
```json
{ "type": "room:finished", "payload": { "roomId": "room_xyz", "stats": [] } }
```

---

## Position relay

### Client → server: `player:pos`

Send every ~50 ms.

```json
{
  "type": "player:pos",
  "payload": { "x": 1240, "y": 880, "angle": 1.57, "hp": 95, "weaponId": "pistol" }
}
```

### Server → other clients: **`remote:pos`**

> **Note:** The server re-emits as `remote:pos`, not `player:pos`.

```json
{
  "type": "remote:pos",
  "payload": { "userId": "abc123", "x": 1240, "y": 880, "angle": 1.57, "hp": 95, "weaponId": "pistol" }
}
```

---

## Shooting relay

### Client → server: `player:shoot`

```json
{
  "type": "player:shoot",
  "payload": { "x": 1240, "y": 880, "angle": 1.57, "weaponId": "pistol", "bulletId": "k2x9a" }
}
```

### Server → other clients: **`remote:shoot`**

> **Note:** The server re-emits as `remote:shoot`, not `player:shoot`.

```json
{
  "type": "remote:shoot",
  "payload": { "userId": "abc123", "x": 1240, "y": 880, "angle": 1.57, "weaponId": "pistol", "bulletId": "k2x9a" }
}
```

---

## Player state events

### `player:action`  ← client → server → others as `remote:action`
### `player:dead`  ← client → server → others as `remote:dead`

```json
{ "type": "player:dead", "payload": { "killedBy": "def456" } }
```

Relayed as:
```json
{ "type": "remote:dead", "payload": { "userId": "abc123", "killedBy": "def456" } }
```

### `player:revive`  ← client → server → others as `remote:revive`

```json
{ "type": "player:revive", "payload": { "targetUserId": "def456" } }
```

### `room:ready`  ← client → server
Mark this player as ready to start.

---

## Shared enemy events (NEW)

### `bot:spawn`  ← HOST client → server → non-host clients

**Only the host** (the player who created the room, identified by `hostId`) should send this.
The server validates sender is the host; non-host senders are silently ignored.

Host sends:
```json
{
  "type": "bot:spawn",
  "payload": {
    "id":       "ab3f7c",
    "x":        1500,
    "y":        900,
    "type":     "normal",
    "wave":     3,
    "waveSize": 8
  }
}
```

Other clients receive (same payload, not echoed back to host):
```json
{
  "type": "bot:spawn",
  "payload": {
    "id":       "ab3f7c",
    "x":        1500,
    "y":        900,
    "type":     "normal",
    "wave":     3,
    "waveSize": 8
  }
}
```

Valid `type` values: `mini`, `normal`, `big`, `police`, `swat`, `heavyswat`,
`sniper`, `bomber`, `juggernaut`.

---

### `bot:dead`  ← ANY client → server → all OTHER clients

Any client (host or not) sends this when their local simulation kills a bot.
The server relays it to every other client so they remove the same enemy.
Duplicates are safe — the frontend should be idempotent (ignore if already dead).

Client sends:
```json
{ "type": "bot:dead", "payload": { "id": "ab3f7c" } }
```

Other clients receive (not echoed back to sender):
```json
{ "type": "bot:dead", "payload": { "id": "ab3f7c" } }
```

---

## Wave progression (host only)

### `room:wave_ack`  ← HOST → server
Send after a wave ends to advance to the next wave.

```json
{ "type": "room:wave_ack", "payload": {} }
```

Server responds with `room:wave_start` to **all** clients.

---

## Game end (host only)

### `room:finished`  ← HOST → server

```json
{ "type": "room:finished", "payload": { "stats": [] } }
```

---

## Summary table

| Event sent by client | Server action | Clients receive |
|---|---|---|
| `ping` | pong | sender: `pong` |
| `heartbeat` | update DB | — |
| `room:rejoin` | re-register | sender: `room:state`, others: `room:player_rejoined` |
| `room:ready` | mark ready, maybe start | all: `room:player_ready` (+ `room:start` if all ready) |
| `room:wave_ack` | increment wave | all: `room:wave_start` |
| `room:finished` | mark finished | all: `room:finished` |
| `player:pos` | relay | others: **`remote:pos`** |
| `player:shoot` | relay | others: **`remote:shoot`** |
| `player:action` | relay | others: **`remote:action`** |
| `player:dead` | update DB + relay | others: **`remote:dead`** |
| `player:revive` | update DB + relay | others: **`remote:revive`** |
| `bot:spawn` *(host only)* | relay | others: **`bot:spawn`** |
| `bot:dead` | relay | others: **`bot:dead`** |
