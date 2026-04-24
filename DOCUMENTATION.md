# DASH DREAD — Full Project Documentation

> Top-down 2D browser game with real-time backend.  
> Backend: `https://game-backend-wfmf.onrender.com`  
> Swagger UI: `https://game-backend-wfmf.onrender.com/docs`

---

## Table of Contents

1. [Frontend Overview](#1-frontend-overview)
2. [Backend Overview](#2-backend-overview)
3. [Authentication](#3-authentication)
4. [WebSocket Connection](#4-websocket-connection)
5. [Player Profile & XP](#5-player-profile--xp)
6. [NEX Currency](#6-nex-currency)
7. [Shop & Inventory](#7-shop--inventory)
8. [Session Saving](#8-session-saving)
9. [Leaderboards](#9-leaderboards)
10. [Characters](#10-characters)
11. [Stats](#11-stats)
12. [Friends](#12-friends)
13. [Direct Messages](#13-direct-messages)
14. [Clans](#14-clans)
15. [Notifications](#15-notifications)
16. [Players (Search & Online Count)](#16-players-search--online-count)
17. [Battle Pass](#17-battle-pass)
18. [Data Models](#18-data-models)
19. [XP & Level Formula](#19-xp--level-formula)
20. [Multiplayer (To Be Built)](#20-multiplayer-to-be-built)

---

## 1. Frontend Overview

| Property | Value |
|----------|-------|
| Language | Plain JavaScript (ES6+), no frameworks |
| Rendering | HTML5 Canvas 2D API |
| Game loop | `requestAnimationFrame` ~60 FPS, dt capped at 50ms |
| WebSocket | Native browser `WebSocket`, wrapped in `WS` module (`js/ws.js`) |
| Message format | JSON `{ type: string, payload: object }` both directions |
| Auth | JWT sent as query param on WS connect: `wss://...?token=<JWT>` |
| Base URL | Configured in `js/api.js` as `API_BASE` |

### Frontend File Structure
```
js/
  api.js          — HTTP helper (API.get / API.post with auth headers)
  auth.js         — Login / register / logout / session / navbar
  ws.js           — WebSocket manager (auto-reconnect, ping, heartbeat)
  config.js       — All game config (characters, maps, weapons, upgrades)
  entities/
    entities.js   — Game classes: Player, Bot, Vehicle, Bullet, etc.
  core/
    game.js       — Main Game class (~4,000 lines)
    map.js        — Tile map, collision, portals
    game-render.js — Outdoor rendering
    game-furniture.js — Indoor building renders
    game-dealer.js — Car dealership / casino indoor
    game-metro.js  — Metro station
    game-tower.js  — Tower mode
  systems/
    ui.js         — HUD rendering
    shop.js       — Shop/dealership/casino managers
    audio.js      — Sound effects
  utils.js        — Vec2, lerp, clamp, rnd helpers
  social.js       — Social API calls (friends/DM/clans/notifications)
  social-ui.js    — Social panel UI (FAB button + chat panel)
index.html        — Main menu / character select
game.html         — Game screen
```

### Maps (17 playable)
`neon_city`, `galactica`, `wasteland`, `robot_city`, `campaign`, `survival`, `hardcore`, `blitz`, `siege`, `frozen_tundra`, `ocean_depths`, `metropolis`, `desert_sands`, `jungle`, `arena`, `zombie`, `lifemode`

### Characters (8)
`gangster` (dog), `hacker` (cat), `mercenary` (wolf), `ghost` (raven), `medic` (bear), `ronin` (fox), `pyro` (salamander), `phantom` (spirit)

---

## 2. Backend Overview

| Property | Value |
|----------|-------|
| Runtime | Node.js |
| Framework | Express 5 |
| Database | MongoDB via Mongoose |
| Auth | JWT (7-day tokens, blacklist on logout) |
| Real-time | WebSocket (`ws` package) on same HTTP server |
| Hosted | Render.com (`game-backend-wfmf.onrender.com`) |
| Repo | GitHub: `ZavenGalstyan/game-backend` (branch: `master`) |

### Environment Variables
```
MONGO_URI     — MongoDB connection string (default: mongodb://127.0.0.1:27017/neoncity)
JWT_SECRET    — JWT signing secret
PORT          — Server port (default: 3000)
```

---

## 3. Authentication

All protected routes require: `Authorization: Bearer <token>`

### Register
```
POST /auth/register
Body: { name: string, email: string, password: string }

201: { message: "Account created successfully" }
400: MISSING_FIELDS
409: NAME_TAKEN | EMAIL_TAKEN
```

### Login
```
POST /auth/login
Body: { name: string, password: string }
       (name field also accepts email)

200: { token: string, name: string }
400: MISSING_FIELDS
401: INVALID_CREDENTIALS
```

### Logout
```
POST /auth/logout
Auth: required

200: { message: "Logged out" }
```
> Token is added to a blacklist (TTL-indexed, auto-expires when JWT expires).

### Delete Account
```
DELETE /auth/account/:name
Auth: required

200: { message: "Account deleted", name: string }
404: NOT_FOUND
```

---

## 4. WebSocket Connection

Connect with JWT token as query param:
```
wss://game-backend-wfmf.onrender.com/ws?token=<JWT>
```

If token is invalid → server closes with code `4001`.

### Message Format
Both directions use JSON:
```json
{ "type": "string", "payload": { ... } }
```

### Client → Server Messages

| type | payload | description |
|------|---------|-------------|
| `ping` | `{}` | Keepalive — server responds with `{ type: "pong" }` |
| `heartbeat` | `{ status: "menu" \| "ingame" }` | Updates `user.onlineAt` in DB |

### Server → Client Messages

| type | payload | when |
|------|---------|------|
| `pong` | `{}` | Response to ping |
| `notification` | `{ notification }` | New notification pushed in real-time |

### Frontend WS API (`WS` module)
```js
WS.connect()                    // Call after login
WS.disconnect()                 // Call on logout
WS.send('type', payload)        // Returns true if sent, false if offline
WS.on('type', fn)               // Subscribe to message type
WS.off('type', fn)              // Unsubscribe
WS.isConnected()                // boolean
WS.on('*', fn)                  // Catch-all for all messages
```

Reconnect backoff: 2s → 5s → 10s. Falls back to HTTP polling (notifications unread count every 15s) while disconnected.

---

## 5. Player Profile & XP

### Get My Profile
```
GET /profile/me
Auth: required

200: {
  name, email, nex, xp, level, bpXp, bpLevel,
  bpTier, progressPercent, xpInCurrentLevel, xpNeededForNextLevel,
  unlockedCharacters: string[],
  inventory: { weapons, upgrades, vehicles, grenades },
  stats: { ... },
  friends: [{ name, onlineAt }],
  clanId, purchaseHistory,
  createdAt, updatedAt
}
```

### Get Public Profile
```
GET /profile/:name
No auth required

200: { name, level, nex, stats, clanId, createdAt }
404: NOT_FOUND
```

### Add Account XP
```
POST /account/xp
Auth: required
Body: { xp: number }

200: { message, xpAdded, ...calcProgress(user.xp) }
```

---

## 6. NEX Currency

NEX is the in-game currency (earned from gameplay, spent in shop).

### Get Balance
```
GET /nex/balance
Auth: required

200: { nex: number, level: number }
```

### Add NEX
```
POST /nex/add
Auth: required
Body: { amount: number, reason: "game_session" | "bonus" | "admin" }

200: { message, nexAdded, nexBalance }
400: INVALID_REASON | INVALID_AMOUNT
```

### Spend NEX
```
POST /nex/spend
Auth: required
Body: { amount: number, reason: string }

200: { message, nexSpent, nexBalance }
400: INSUFFICIENT_FUNDS
```

---

## 7. Shop & Inventory

### Get Shop Catalog
```
GET /shop/catalog
No auth required

200: {
  characters: [{ id, name, lore, price, color }],
  weapons:    [{ id, name, desc, price, damage, fireRate, color }],
  upgrades:   [{ id, name, desc, price, maxLevel, color }],
  vehicles:   [{ id, name, desc, price, speed, hp, color }]
}
```

### Get My Inventory
```
GET /shop/inventory
Auth: required

200: {
  weapons:  string[],
  upgrades: string[],
  vehicles: string[],
  grenades: number,
  nex:      number
}
```

### Buy Item
```
POST /shop/buy
Auth: required
Body: { category: "weapons"|"upgrades"|"vehicles"|"characters", itemId: string }

200: { message, item, nexSpent, nexBalance, inventory }
400: MISSING_FIELDS | INVALID_ITEM | ALREADY_OWNED
402: INSUFFICIENT_FUNDS
```

### Inventory Endpoints (called by game on session end)

**Add weapon:**
```
POST /inventory/weapons/add
Auth: required
Body: { weaponId: string }
200: { message, weapons }
```

**Add upgrade:**
```
POST /inventory/upgrades/add
Auth: required
Body: { upgradeId: string }
200: { message, upgrades }
```

**Add vehicle:**
```
POST /inventory/vehicles/add
Auth: required
Body: { vehicleId: string }
200: { message, vehicles }
```

**Update grenades:**
```
POST /inventory/grenades/update
Auth: required
Body: { grenades: number }
200: { message, grenades }
```

---

## 8. Session Saving

Called at the end of every game session to save stats and award XP + NEX.

```
POST /session/save
Auth: required
Body: {
  mapId:             string,
  characterId:       string,
  waveReached:       number,
  kills:             number,
  deaths:            number,
  moneyEarned:       number,
  playtimeSec:       number,
  campaignLevel:     number | null,
  bossKills:         number,
  mode: {
    survival?:  boolean,
    hardcore?:  boolean,
    blitz?:     boolean,
    siege?:     boolean,
    zombie?:    boolean,
    arena?:     boolean,
    campaign?:  boolean
  },
  weaponsUsed:       string[],
  vehiclesUsed:      string[],
  grenadesThrown:    number,
  distanceTravelled: number
}

200: {
  message,
  nexEarned, nexBalance,
  accountXP:  { xpEarned, level, progressPercent, leveledUp, levelsGained, ... },
  battlePassXP: { xpEarned, level, tier, leveledUp, levelsGained, ... },
  newHighScores: { highestWave: bool, highestKillGame: bool }
}
```

---

## 9. Leaderboards

All leaderboards return top 50 players. No auth required.

```
GET /leaderboard/kills        → sorted by stats.totalKills
GET /leaderboard/waves        → sorted by stats.highestWave
GET /leaderboard/level        → sorted by xp (account level)
GET /leaderboard/nex          → sorted by stats.totalNexEarned (all-time)
GET /leaderboard/campaign     → sorted by highest campaign level in sessions
GET /leaderboard/map/:mapId   → kills on a specific map
```

Response shape:
```json
{
  "leaderboard": [
    { "rank": 1, "name": "PlayerOne", "value": 4200, "characterId": "phantom" }
  ]
}
```

---

## 10. Characters

### Get Unlocked Characters
```
GET /characters/unlocked
Auth: required

200: { unlockedCharacters: string[] }
```

### Unlock Character (buy with NEX)
```
POST /characters/unlock
Auth: required
Body: { characterId: string }

200: { message, characterId, nexSpent, nexBalance, unlockedCharacters }
400: MISSING_FIELDS | INVALID_CHARACTER | ALREADY_UNLOCKED | FREE_CHARACTER
402: INSUFFICIENT_FUNDS
```

**Premium character prices:**
| Character | Price |
|-----------|-------|
| timebreaker | 15,000 NEX |
| ai_avatar | 18,000 NEX |
| overlord | 20,000 NEX |
| electric_eel | 16,000 NEX |
| shadow_lord | 22,000 NEX |
| plasma_titan | 25,000 NEX |
| quantum_ghost | 28,000 NEX |
| omega_prime | 50,000 NEX |

---

## 11. Stats

### My Stats
```
GET /stats/me
Auth: required

200: {
  name, level, nex,
  stats: {
    totalKills, totalDeaths, totalWaves, totalGamesPlayed,
    highestWave, highestKillGame, totalPlaytimeSec,
    totalNexEarned, totalBossKills, totalGrenadesThrown,
    killsByCharacter: { characterId: number },
    killsByMap:       { mapId: number },
    gamesPerMode:     { normal, survival, hardcore, blitz, siege, zombie, arena, campaign }
  }
}
```

### Global Stats
```
GET /stats/global
No auth required

200: {
  totalPlayers, totalKills, totalGamesPlayed,
  totalPlaytimeHours, totalBossKills,
  killsByCharacter: { ... },
  killsByMap: { ... },
  gamesPerMode: { ... }
}
```

---

## 12. Friends

### Send Friend Request
```
POST /friends/request
Auth: required
Body: { targetName: string }

200: { message, request }
400: SELF_REQUEST | ALREADY_FRIENDS | ALREADY_SENT | REQUEST_EXISTS
404: NOT_FOUND
```

### Get Incoming Requests
```
GET /friends/requests/incoming
Auth: required

200: { requests: [{ _id, fromName, createdAt }] }
```

### Get Outgoing Requests
```
GET /friends/requests/outgoing
Auth: required

200: { requests: [{ _id, toName, status, createdAt }] }
```

### Accept Request
```
POST /friends/request/:requestId/accept
Auth: required

200: { message }
```
> Both users are added to each other's friends list. A `friend_accepted` notification is pushed via WS.

### Reject Request
```
POST /friends/request/:requestId/reject
Auth: required

200: { message }
```

### Cancel Outgoing Request
```
DELETE /friends/request/:requestId
Auth: required

200: { message }
```

### Get Friends List
```
GET /friends
Auth: required

200: {
  friends: [{ name, level, nex, onlineAt, isOnline: bool, clanId }]
}
```

### Remove Friend
```
DELETE /friends/:friendName
Auth: required

200: { message }
```

### Online Friends
```
GET /friends/online
Auth: required

200: { online: [{ name, onlineAt }] }
```

### Friends Heartbeat
```
POST /friends/heartbeat
Auth: required
Body: { status: "menu" | "ingame" }

200: { message, onlineAt }
```

---

## 13. Direct Messages

### Get Conversations
```
GET /dm/conversations
Auth: required

200: {
  conversations: [{
    conversationId, partner: { name, onlineAt, isOnline },
    lastMessage: { content, fromName, createdAt },
    unreadCount
  }]
}
```

### Get Messages in Conversation
```
GET /dm/conversations/:conversationId/messages?limit=50&before=<messageId>
Auth: required

200: { messages: [{ _id, fromName, content, createdAt, readAt, deleted }] }
```

### Send DM
```
POST /dm/send
Auth: required
Body: { toName: string, content: string (max 500 chars) }

200: { message: { _id, fromName, content, createdAt } }
404: NOT_FOUND
```
> Recipient receives `{ type: "dm_received", payload: { message, from } }` via WS in real-time.

### Mark Conversation Read
```
POST /dm/conversations/:conversationId/read
Auth: required

200: { message, markedRead: number }
```

### Unread Count
```
GET /dm/unread
Auth: required

200: { unread: number }
```

### Delete Message
```
DELETE /dm/messages/:messageId
Auth: required

200: { message }
403: FORBIDDEN (not your message)
404: NOT_FOUND
```

---

## 14. Clans

### Create Clan
```
POST /clans
Auth: required
Body: { name: string, tag: string (2-5 chars), description?: string, emblem?: string, isOpen?: boolean }

201: { message, clan }
400: MISSING_FIELDS | ALREADY_IN_CLAN
409: NAME_TAKEN | TAG_TAKEN
```

### Browse Clans
```
GET /clans?search=<optional>
No auth required

200: { clans: [{ _id, name, tag, emblem, leaderName, memberCount, totalKills, isOpen }] }
```

### Get My Clan
```
GET /clans/me
Auth: required

200: { clan: { ..., members: [{ name, role, joinedAt }] } }
404: NOT_IN_CLAN
```

### Get Clan by ID
```
GET /clans/:clanId
No auth required

200: { clan }
```

### Update Clan
```
PATCH /clans/:clanId
Auth: required (leader only)
Body: { description?, emblem?, isOpen? }

200: { message, clan }
```

### Join Open Clan
```
POST /clans/:clanId/join
Auth: required

200: { message }
400: ALREADY_IN_CLAN | NOT_OPEN
404: NOT_FOUND
```

### Leave Clan
```
POST /clans/leave
Auth: required

200: { message }
400: NOT_IN_CLAN | LEADER_MUST_TRANSFER
```

### Delete Clan
```
DELETE /clans/:clanId
Auth: required (leader only)

200: { message }
```

### Invite to Clan
```
POST /clans/:clanId/invite
Auth: required (leader or officer)
Body: { targetName: string }

200: { message, invite }
400: ALREADY_IN_CLAN | ALREADY_INVITED | NOT_FRIENDS
404: NOT_FOUND
```
> Target receives `{ type: "clan_invite", ... }` notification via WS.

### Get My Invites
```
GET /clans/invites
Auth: required

200: { invites: [{ _id, clanName, clanTag, fromName, expiresAt }] }
```

### Accept Clan Invite
```
POST /clans/invites/:inviteId/accept
Auth: required

200: { message }
```

### Reject Clan Invite
```
POST /clans/invites/:inviteId/reject
Auth: required

200: { message }
```

### Kick Member
```
DELETE /clans/:clanId/members/:targetName
Auth: required (leader or officer)

200: { message }
403: FORBIDDEN (can't kick leader or same rank officer)
```
> Kicked user receives `{ type: "clan_kick", ... }` notification via WS.

### Promote Member
```
POST /clans/:clanId/members/:targetName/promote
Auth: required (leader only)
→ member → officer

200: { message }
```

### Demote Member
```
POST /clans/:clanId/members/:targetName/demote
Auth: required (leader only)
→ officer → member

200: { message }
```

### Transfer Leadership
```
POST /clans/:clanId/transfer
Auth: required (leader only)
Body: { targetName: string }

200: { message }
```

### Clan Chat History
```
GET /clans/:clanId/chat?limit=50
Auth: required (clan member)

200: { messages: [{ fromName, fromRole, content, createdAt }] }
```

### Send Clan Chat Message
```
POST /clans/:clanId/chat
Auth: required (clan member)
Body: { content: string (max 500 chars) }

201: { message: { fromName, fromRole, content, createdAt } }
```
> All online clan members receive `{ type: "clan_message", payload: { clanId, message } }` via WS.

---

## 15. Notifications

### Get All Notifications
```
GET /notifications?limit=30&skip=0
Auth: required

200: { notifications: [{ _id, type, title, body, payload, readAt, createdAt }] }
```

**Notification types:**
| type | when |
|------|------|
| `friend_request` | Someone sent you a friend request |
| `friend_accepted` | Your request was accepted |
| `clan_invite` | You were invited to a clan |
| `clan_kick` | You were kicked from a clan |
| `dm_received` | You received a direct message |

### Mark One Read
```
POST /notifications/:notificationId/read
Auth: required

200: { message }
```

### Mark All Read
```
POST /notifications/read-all
Auth: required

200: { message, markedRead: number }
```

### Unread Count
```
GET /notifications/unread-count
Auth: required

200: { unread: number }
```

---

## 16. Players (Search & Online Count)

### Search Players
```
GET /players/search?q=<name>
No auth required

200: { players: [{ name, level, onlineAt, isOnline }] }
```

### Online Player Count
```
GET /players/online
No auth required

200: { online: number, since: ISO8601 }
```
> "Online" = user had a heartbeat within the last 2 minutes.

---

## 17. Battle Pass

### Get My Battle Pass
```
GET /battlepass/me
Auth: required

200: {
  bpXp, bpLevel, bpTier,
  progressPercent, xpInCurrentLevel, xpNeededForNextLevel
}
```

**Tiers by level:**
| Levels | Tier |
|--------|------|
| 1–10 | IRON |
| 11–20 | BRONZE |
| 21–35 | SILVER |
| 36–50 | GOLD |
| 51–65 | PLATINUM |
| 66–80 | DIAMOND |
| 81–90 | MASTER |
| 91–99 | LEGEND |
| 100+ | CHAMPION |

### Add Battle Pass XP
```
POST /battlepass/xp
Auth: required
Body: { xp: number }

200: { message, xpAdded, bpLevel, bpTier, progressPercent, leveledUp, levelsGained }
```

---

## 18. Data Models

### User
```
name              String (unique)
email             String (unique)
password          String (bcrypt hashed)
nex               Number (in-game currency)
xp                Number (account XP)
level             Number (auto-computed from xp)
bpXp              Number (battle pass XP)
bpLevel           Number (auto-computed from bpXp)
unlockedCharacters String[]
inventory         { weapons: String[], upgrades: String[], vehicles: String[], grenades: Number }
stats             StatsSchema
friends           ObjectId[] → User
clanId            ObjectId → Clan | null
onlineAt          Date | null
purchaseHistory   [{ itemId, category, price, purchasedAt }]
```

### Stats (embedded in User)
```
totalKills, totalDeaths, totalWaves, totalGamesPlayed
highestWave, highestKillGame
totalPlaytimeSec, totalNexEarned, totalBossKills, totalGrenadesThrown
killsByCharacter  Map<characterId, count>
killsByMap        Map<mapId, count>
gamesPerMode      { normal, survival, hardcore, blitz, siege, zombie, arena, campaign }
```

### GameSession
```
userId, name, mapId, characterId
waveReached, kills, deaths, moneyEarned, playtimeSec
campaignLevel, bossKills
mode              { survival, hardcore, blitz, siege, zombie, arena, campaign }
weaponsUsed       String[]
vehiclesUsed      String[]
grenadesThrown, distanceTravelled
xpEarned, nexEarned
createdAt
```

### Clan
```
name, tag (2-5 chars), description
leaderId, leaderName
members           [{ userId, name, role: leader|officer|member, joinedAt }]
emblem            String (emoji)
isOpen            Boolean
totalKills        Number
```

### FriendRequest
```
fromId, fromName, toId, toName
status            pending | accepted | rejected
createdAt
```

### DirectMessage
```
conversationId    String (deterministic: sorted [userId1, userId2].join('_'))
fromId, fromName, toId
content           String (max 500)
readAt            Date | null
deleted           Boolean
createdAt
```

### Notification
```
userId
type              friend_request | friend_accepted | clan_invite | clan_kick | dm_received
title, body
payload           Mixed (extra data)
readAt            Date | null
createdAt
```

---

## 19. XP & Level Formula

### Account Level
```
XP_PER_LEVEL = 1000 (flat)
level = floor(xp / 1000) + 1
progressPercent = (xp % 1000) / 10
```

### Session XP Award
```
+5  XP per kill
+50 XP per wave reached
+200 XP per boss kill
+150 XP per campaign level (if campaign mode)
+100 XP bonus for zero deaths
×1.5 multiplier for survival or hardcore mode
```

---

## 20. Multiplayer (To Be Built)

See `MULTIPLAYER_API_DOCS.md` for the full spec.

### Summary

The frontend already has:
- `WS.send(type, payload)` — ready to use
- `WS.on(type, fn)` — ready to use
- `lerp()` in `js/utils.js` for position interpolation

What needs to be built on the backend:

| Priority | Task |
|----------|------|
| 1 | `Room` Mongoose schema (roomId, mapId, hostId, players[], wave, status) |
| 2 | `POST /rooms/create` — create a room |
| 3 | `POST /rooms/:id/join` — join with charId |
| 4 | `GET /rooms` — lobby browser |
| 5 | WS relay: `player:pos` → broadcast `remote:pos` to room |
| 6 | WS relay: `player:shoot` → broadcast `remote:shoot` to room |
| 7 | WS events: `room:start`, `room:wave_start`, `room:wave_clear`, `room:finished` |

The backend does **not** simulate the game — it relays position/action messages between players in the same room. Enemies run on the host client.

Position update rate: **20/sec** (one message every 50ms per player).  
Bandwidth per room of 4: ~6 KB/s total — well within limits.
