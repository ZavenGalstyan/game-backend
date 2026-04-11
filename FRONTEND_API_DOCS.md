# NEON CITY — Complete Backend API Documentation

> **Base URL:** `https://game-backend-wfmf.onrender.com`
> **Local URL:** `http://localhost:3000`
> **Swagger UI:** `https://game-backend-wfmf.onrender.com/docs`
> **All bodies:** JSON — `Content-Type: application/json`
> **Protected routes 🔒:** Add header → `Authorization: Bearer <token>`

---

## How Authentication Works

1. `POST /auth/login` → get `{ token, name }`
2. Store the token
3. Send on every protected request: `Authorization: Bearer <token>`
4. Token expires in **7 days**
5. `POST /auth/logout` to invalidate early

---

## Table of Contents

1. [Auth](#1-auth)
2. [Profile](#2-profile)
3. [Account XP](#3-account-xp)
4. [Battle Pass](#4-battle-pass)
5. [NEX Currency](#5-nex-currency)
6. [Shop](#6-shop)
7. [Game Session](#7-game-session)
8. [Leaderboard](#8-leaderboard)
9. [Characters](#9-characters)
10. [Inventory](#10-inventory)
11. [Statistics](#11-statistics)
12. [Friends](#12-friends)
13. [Direct Messages](#13-direct-messages)
14. [Clans](#14-clans)
15. [Clan Chat](#15-clan-chat)
16. [Notifications](#16-notifications)
17. [Player Search](#17-player-search)
18. [WebSocket](#18-websocket)
19. [Error Format](#19-error-format)
20. [All Endpoints Table](#20-all-endpoints-table)
21. [Valid IDs Reference](#21-valid-ids-reference)

---

## 1. Auth

### `POST /auth/register`
```json
// Request
{ "name": "PlayerOne", "email": "player@example.com", "password": "secret123" }

// Response 201
{ "message": "Account created successfully" }

// Errors
{ "error": "MISSING_FIELDS" }
{ "error": "NAME_TAKEN" }
{ "error": "EMAIL_TAKEN" }
```

### `POST /auth/login`
```json
// Request  (name field also accepts email)
{ "name": "PlayerOne", "password": "secret123" }

// Response 200
{ "token": "eyJhbGci...", "name": "PlayerOne" }

// Errors
{ "error": "INVALID_CREDENTIALS" }
```

### `POST /auth/logout` 🔒
```json
// Response 200
{ "message": "Logged out" }
```

### `GET /auth/users` 🔒
```json
// Response 200
{
  "total": 3,
  "users": [
    { "_id": "abc123", "name": "PlayerOne", "email": "...", "level": 14, "nex": 12500, "createdAt": "..." }
  ]
}
```

### `DELETE /auth/account/:name` 🔒
Deletes account and all its game sessions.
```
DELETE /auth/account/PlayerOne
```
```json
// Response 200
{ "message": "Account deleted", "name": "PlayerOne" }
```

---

## 2. Profile

### `GET /profile/me` 🔒
### `GET /profile/:name` (public)

Both return the same shape:

```json
{
  "id":   "abc123",
  "name": "PlayerOne",
  "nex":  12500,

  "account": {
    "level": 14, "xp": 13400,
    "xpInCurrentLevel": 400, "xpNeededForNextLevel": 600, "progressPercent": 40
  },

  "battlePass": {
    "level": 23, "xp": 22100,
    "xpInCurrentLevel": 100, "xpNeededForNextLevel": 900, "progressPercent": 10,
    "tier": "SILVER"
  },

  "stats": {
    "totalKills": 4821, "totalDeaths": 312, "totalWaves": 88,
    "totalGamesPlayed": 145, "highestWave": 42, "highestKillGame": 180,
    "totalPlaytimeSec": 72000,
    "favoriteCharacter": "gangster", "favoriteMap": "neon_city"
  },

  "unlockedCharacters": ["gangster", "hacker", "medic", "..."],

  "clanId":     "clan_id_here",
  "clanName":   "Neon Crew",
  "clanTag":    "NCG",
  "clanRole":   "officer",
  "friendCount": 12,
  "isOnline":   true,

  "createdAt": "2025-01-15T10:00:00Z"
}
```

---

## 3. Account XP

Each level = **1000 XP**. Level = `floor(totalXP / 1000) + 1`

> XP is awarded automatically by `POST /session/save`. Use this only to grant XP separately.

### `POST /account/xp` 🔒
```json
// Request
{ "xp": 350 }

// Response 200
{ "level": 15, "xp": 14350, "xpInCurrentLevel": 350, "xpNeededForNextLevel": 650, "progressPercent": 35, "leveledUp": true, "levelsGained": 1 }
```

---

## 4. Battle Pass

100 levels, each = **1000 XP**.

| Tier | Levels | | Tier | Levels |
|------|--------|---|------|--------|
| IRON | 1–10 | | PLATINUM | 51–65 |
| BRONZE | 11–20 | | DIAMOND | 66–80 |
| SILVER | 21–35 | | MASTER | 81–90 |
| GOLD | 36–50 | | LEGEND | 91–99 |
| | | | CHAMPION | 100 |

### `GET /battlepass/me` 🔒
```json
// Response 200
{ "level": 23, "xp": 22100, "xpInCurrentLevel": 100, "xpNeededForNextLevel": 900, "progressPercent": 10, "tier": "SILVER" }
```

### `POST /battlepass/xp` 🔒
```json
// Request
{ "xp": 280 }

// Response 200
{ "level": 24, "xp": 22380, "xpInCurrentLevel": 380, "xpNeededForNextLevel": 620, "progressPercent": 38, "tier": "SILVER", "leveledUp": true, "levelsGained": 1 }
```

---

## 5. NEX Currency

NEX is earned automatically by `POST /session/save`.

### `GET /nex/balance` 🔒
```json
{ "nex": 12500 }
```

### `POST /nex/add` 🔒
```json
// Request
{ "amount": 3750, "reason": "game_session" }
// reason: game_session | bonus | admin

// Response 200
{ "nex": 16250 }
```

### `POST /nex/spend` 🔒
```json
// Request
{ "amount": 1800, "reason": "weapons_buy", "itemId": "shotgun" }

// Response 200
{ "nex": 10700 }

// Error
{ "error": "INSUFFICIENT_NEX" }
```

---

## 6. Shop

### `GET /shop/catalog` (public)
Returns all purchasable items with prices.
```json
{
  "characters": [
    { "id": "timebreaker", "name": "TIMEBREAKER", "lore": "Bend time.", "price": 15000, "color": "#FFDD00" }
  ],
  "weapons": [
    { "id": "shotgun", "name": "SHOTGUN", "desc": "6 pellets per blast", "price": 1800, "damage": 22, "fireRate": 750, "color": "#FF8800" }
  ],
  "upgrades": [
    { "id": "speed", "name": "SPEED", "desc": "+18 SPD per level", "price": 500, "maxLevel": 5, "color": "#44EEFF" }
  ],
  "vehicles": [
    { "id": "sedan", "name": "SEDAN", "desc": "Reliable street car.", "price": 2000, "speed": 295, "hp": 200, "color": "#CC3333" }
  ]
}
```

### `GET /shop/inventory` 🔒
Full owned inventory + NEX in one call. Use on shop page load.
```json
{
  "nex": 12500,
  "characters": ["gangster", "hacker", "medic"],
  "weapons":    ["pistol", "shotgun"],
  "upgrades":   ["speed", "armor"],
  "vehicles":   ["sedan"],
  "grenades":   4
}
```

### `POST /shop/buy` 🔒
Atomic purchase — validates price, checks ownership, deducts NEX, adds item.
```json
// Request
{ "itemId": "shotgun", "category": "weapons" }
// category: characters | weapons | upgrades | vehicles

// Response 200
{ "message": "Purchase successful", "itemId": "shotgun", "category": "weapons", "pricePaid": 1800, "nexBalance": 10700 }

// Errors
{ "error": "ITEM_NOT_FOUND" }
{ "error": "ALREADY_OWNED" }
{ "error": "INSUFFICIENT_NEX" }
{ "error": "INVALID_CATEGORY" }
```

---

## 7. Game Session

Call this **once at the end of every game.** Automatically:
- Calculates XP from kills/waves/bosses and awards to account + battle pass
- Adds `moneyEarned` to NEX
- Updates all lifetime stats
- Detects new high scores
- Updates clan total kills

### `POST /session/save` 🔒

```json
// Request
{
  "mapId":         "neon_city",
  "characterId":   "gangster",
  "waveReached":   18,
  "kills":         95,
  "deaths":        1,
  "moneyEarned":   23750,
  "playtimeSec":   480,
  "campaignLevel": null,
  "bossKills":     2,
  "mode": { "survival": false, "hardcore": false, "blitz": false, "siege": false, "zombie": false, "arena": false, "campaign": false },
  "weaponsUsed":   ["pistol", "shotgun"],
  "vehiclesUsed":  ["sedan"],
  "grenadesThrown": 4,
  "distanceTravelled": 8500
}
```

**XP formula (backend calculates automatically):**
| Event | XP |
|---|---|
| Per kill | +5 |
| Per wave survived | +50 |
| Per boss kill | +200 |
| Per campaign level | +150 |
| Survived (deaths = 0) | +100 |
| Survival or Hardcore mode | ×1.5 |

```json
// Response 200
{
  "message": "Session saved",
  "nexEarned":  23750,
  "nexBalance": 41200,
  "accountXP": {
    "xpEarned": 575, "level": 16, "xp": 15575,
    "xpInCurrentLevel": 575, "xpNeededForNextLevel": 425, "progressPercent": 57,
    "leveledUp": true, "levelsGained": 1
  },
  "battlePassXP": {
    "xpEarned": 575, "level": 25, "xp": 24575,
    "xpInCurrentLevel": 575, "xpNeededForNextLevel": 425, "progressPercent": 57,
    "tier": "SILVER", "leveledUp": false, "levelsGained": 0
  },
  "newHighScores": { "highestWave": false, "highestKillGame": true }
}
```

---

## 8. Leaderboard

All leaderboard endpoints are **public — no auth needed.**
All return the same shape — only `value` differs.

```json
{
  "leaderboard": [
    { "rank": 1, "name": "PlayerOne", "value": 48210, "characterId": "gangster" },
    { "rank": 2, "name": "PlayerTwo", "value": 32100, "characterId": "phantom" }
  ]
}
```

| Endpoint | `value` means |
|----------|--------------|
| `GET /leaderboard/kills` | Total kills |
| `GET /leaderboard/waves` | Highest wave ever reached |
| `GET /leaderboard/level` | Account level |
| `GET /leaderboard/nex` | Lifetime NEX earned |
| `GET /leaderboard/campaign` | Highest campaign level |
| `GET /leaderboard/map/:mapId` | Kills on that specific map |

---

## 9. Characters

### `GET /characters/unlocked` 🔒
```json
{ "unlocked": ["gangster", "hacker", "medic", "..."] }
```
> New accounts start with all 24 free characters unlocked.

### `POST /characters/unlock` 🔒
Alternative to `/shop/buy` for characters only.
```json
// Request
{ "characterId": "timebreaker" }

// Response 200
{ "message": "Character unlocked", "character": "timebreaker", "nexSpent": 15000, "nexBalance": 500 }

// Errors
{ "error": "ALREADY_UNLOCKED" }
{ "error": "INSUFFICIENT_NEX" }
```

---

## 10. Inventory

### `GET /inventory` 🔒
```json
{ "weapons": ["pistol","shotgun"], "upgrades": ["speed"], "vehicles": ["sedan"], "grenades": 12 }
```

### `POST /inventory/weapons/add` 🔒
```json
{ "weaponId": "crossbow" }
// Response: { "weapons": [...] }
```

### `POST /inventory/upgrades/add` 🔒
```json
{ "upgradeId": "critical" }
// Response: { "upgrades": [...] }
```

### `POST /inventory/vehicles/add` 🔒
```json
{ "vehicleId": "sports" }
// Response: { "vehicles": [...] }
```

### `POST /inventory/grenades/update` 🔒
```json
{ "grenades": 8 }
// Response: { "grenades": 8 }
```

---

## 11. Statistics

### `GET /stats/me` 🔒
```json
{
  "totalKills": 4821, "totalDeaths": 312, "totalWaves": 88,
  "totalGamesPlayed": 145, "highestWave": 42, "highestKillGame": 180,
  "totalPlaytimeSec": 72000, "totalNexEarned": 980000,
  "totalBossKills": 88, "totalGrenadesThrown": 340,
  "favoriteCharacter": "gangster", "favoriteMap": "neon_city",
  "killsByCharacter": { "gangster": 2100, "phantom": 1800 },
  "killsByMap":       { "neon_city": 3000, "zombie": 1821 },
  "gamesPerMode":     { "normal": 100, "survival": 20, "hardcore": 15, "blitz": 5, "siege": 3, "zombie": 0, "arena": 0, "campaign": 2 }
}
```

### `GET /stats/global` (public)
```json
{ "totalPlayers": 8412, "totalKills": 14800000, "totalGamesPlayed": 220000, "topCharacter": "gangster", "topMap": "neon_city" }
```

---

## 12. Friends

All friends endpoints require 🔒 token.

### `POST /friends/request`
Send a friend request.
```json
// Request
{ "targetName": "PlayerTwo" }

// Response 201
{ "message": "Friend request sent", "request": { "_id": "...", "fromName": "PlayerOne", "toName": "PlayerTwo", "status": "pending", "createdAt": "..." } }

// Errors
{ "message": "User not found" }
{ "message": "Already friends" }
{ "message": "Friend request already exists" }
{ "message": "Cannot add yourself" }
```

### `GET /friends/requests/incoming`
All pending requests sent TO you.
```json
{ "requests": [ { "_id": "...", "fromName": "PlayerTwo", "status": "pending", "createdAt": "..." } ] }
```

### `GET /friends/requests/outgoing`
All pending requests sent BY you. Same shape.

### `POST /friends/request/:requestId/accept`
```json
// Response 200
{ "message": "Friend request accepted", "friend": { "id": "...", "name": "PlayerTwo", "account": { "level": 8 }, "clanTag": "NCG", "isOnline": true, "lastSeen": "..." } }
```

### `POST /friends/request/:requestId/reject`
```json
{ "message": "Friend request rejected" }
```

### `DELETE /friends/request/:requestId`
Cancel a request you sent.
```json
{ "message": "Friend request cancelled" }
```

### `GET /friends`
Full friends list with online status.
```json
{
  "friends": [
    { "id": "...", "name": "PlayerTwo", "account": { "level": 8 }, "clanId": "...", "clanTag": "NCG", "isOnline": true, "lastSeen": "..." }
  ],
  "total": 5
}
```

### `DELETE /friends/:friendName`
```
DELETE /friends/PlayerTwo
```
```json
{ "message": "Friend removed" }
```

### `GET /friends/online`
Only currently online friends.
```json
{ "online": [ ...sameAsFriends ], "count": 3 }
```

### `POST /friends/heartbeat`
Call every **30 seconds** to stay marked as online.
```json
// Request body (optional)
{ "status": "menu" }
// status: "menu" | "in_game"

// Response 200
{ "ok": true }
```

---

## 13. Direct Messages

A conversation is created automatically on first message.

### `GET /dm/conversations` 🔒
```json
{
  "conversations": [
    { "id": "abc_xyz", "lastMessage": { "fromName": "PlayerTwo", "content": "gg!", "createdAt": "..." }, "unreadCount": 2 }
  ],
  "totalUnread": 2
}
```

### `GET /dm/conversations/:conversationId/messages` 🔒
Also marks messages as read automatically.

Query params: `limit` (default 50, max 100), `before` (messageId for pagination)
```json
{
  "messages": [
    { "_id": "msg123", "conversationId": "abc_xyz", "fromName": "PlayerTwo", "content": "gg ez", "readAt": null, "createdAt": "..." }
  ],
  "hasMore": false
}
```

### `POST /dm/send` 🔒
Only works between friends.
```json
// Request
{ "toName": "PlayerTwo", "content": "gg!" }

// Response 201
{ "message": { ...DirectMessage }, "conversationId": "abc_xyz" }

// Errors
{ "message": "You can only message friends" }
{ "message": "Sending too fast. Slow down." }  // 429 — 20/min limit
```

### `POST /dm/conversations/:conversationId/read` 🔒
```json
{ "markedRead": 3 }
```

### `GET /dm/unread` 🔒
```json
{ "unread": 5 }
```

### `DELETE /dm/messages/:messageId` 🔒
Delete your own message within 5 minutes of sending.
```json
{ "message": "Message deleted" }
```

---

## 14. Clans

### `POST /clans` 🔒
Create a new clan.
```json
// Request
{ "name": "Neon Crew", "tag": "NCG", "description": "Top players only.", "emblem": "⚡", "isOpen": false }
// tag: 2–5 letters/numbers, auto-uppercased | name: 3–24 chars

// Response 201
{ "message": "Clan created", "clan": { ...Clan } }

// Errors
{ "message": "Already in a clan" }
{ "message": "Clan name or tag already taken" }
```

### `GET /clans` (public)
Browse and search clans.

Query params: `q` (search), `page`, `limit` (max 50), `sortBy` (`members` | `kills` | `created`)
```json
{ "clans": [ ...Clan ], "total": 42, "page": 1, "pages": 3 }
```

### `GET /clans/me` 🔒
Your clan with full members + pending invites (if leader/officer).
```json
{
  "clan": { "_id": "...", "name": "Neon Crew", "tag": "NCG", "emblem": "⚡", "leaderId": "...", "leaderName": "PlayerOne", "memberCount": 8, "isOpen": false, "totalKills": 142000, "createdAt": "..." },
  "members": [ { "userId": "...", "name": "PlayerOne", "role": "leader", "joinedAt": "..." } ],
  "myRole": "leader",
  "pendingInvites": [ ...ClanInvite ]
}
```

### `GET /clans/invites` 🔒
All clan invites sent to you.
```json
{
  "invites": [
    { "_id": "...", "clanName": "Neon Crew", "clanTag": "NCG", "fromName": "PlayerOne", "status": "pending", "expiresAt": "..." }
  ]
}
```

### `GET /clans/:clanId` (public)
```json
{ "clan": { ...Clan }, "members": [ ...ClanMember ] }
```

### `PATCH /clans/:clanId` 🔒
Update description, emblem, or isOpen. Leader or officer only.
```json
// Request (all optional)
{ "description": "Updated.", "emblem": "🔥", "isOpen": true }

// Response 200
{ "message": "Clan updated", "clan": { ...Clan } }
```

### `POST /clans/:clanId/join` 🔒
Join an open clan (`isOpen: true`).
```json
{ "message": "Joined clan", "clan": { ...Clan } }
// Errors: "Clan is invite-only" | "Already in a clan" | "Clan is full"
```

### `POST /clans/leave` 🔒
```json
{ "message": "Left clan" }
// Error: "Transfer leadership or disband before leaving"  (if you're leader)
```

### `DELETE /clans/:clanId` 🔒
Disband (leader only). Deletes all members, invites, and chat history.
```json
{ "message": "Clan disbanded" }
```

### `POST /clans/:clanId/invite` 🔒
Invite a player. Leader or officer only.
```json
// Request
{ "targetName": "PlayerFive" }

// Response 201
{ "message": "Invitation sent", "invite": { ...ClanInvite } }
```

### `POST /clans/invites/:inviteId/accept` 🔒
```json
{ "message": "Joined clan", "clan": { ...Clan } }
```

### `POST /clans/invites/:inviteId/reject` 🔒
```json
{ "message": "Invite rejected" }
```

### `DELETE /clans/:clanId/members/:targetName` 🔒
Kick a member. Leader can kick anyone. Officer can kick members only.
```json
{ "message": "Member kicked" }
```

### `POST /clans/:clanId/members/:targetName/promote` 🔒
Promote member → officer. Leader only.
```json
{ "message": "Member promoted to officer" }
```

### `POST /clans/:clanId/members/:targetName/demote` 🔒
Demote officer → member. Leader only.
```json
{ "message": "Officer demoted to member" }
```

### `POST /clans/:clanId/transfer` 🔒
Transfer leadership. Caller becomes officer.
```json
// Request
{ "targetName": "PlayerTwo" }

// Response 200
{ "message": "Leadership transferred" }
```

---

## 15. Clan Chat

### `GET /clans/:clanId/chat` 🔒
Members only. Query params: `limit` (default 50), `before` (messageId cursor)
```json
{
  "messages": [
    { "_id": "...", "fromName": "PlayerOne", "fromRole": "leader", "content": "Let's go!", "createdAt": "..." }
  ],
  "hasMore": false
}
```

### `POST /clans/:clanId/chat` 🔒
Members only. Rate limit: 10/min.
```json
// Request
{ "content": "gg everyone!" }

// Response 201
{ "message": { ...ClanMessage } }

// Errors
{ "message": "Not a clan member" }
{ "message": "Sending too fast" }  // 429
```

---

## 16. Notifications

Auto-created by the server when:
- Someone sends you a friend request → `friend_request`
- Someone accepts your request → `friend_accepted`
- You're invited to a clan → `clan_invite`
- You're kicked from a clan → `clan_kick`
- You receive a DM → `dm_received`

### `GET /notifications` 🔒
Query params: `limit` (default 30), `unreadOnly` (boolean)
```json
{
  "notifications": [
    {
      "_id": "...", "type": "friend_request",
      "title": "Friend Request", "body": "PlayerTwo sent you a friend request.",
      "payload": { "requestId": "...", "fromName": "PlayerTwo" },
      "readAt": null, "createdAt": "..."
    }
  ],
  "unreadCount": 3
}
```

### `POST /notifications/:notificationId/read` 🔒
```json
{ "ok": true }
```

### `POST /notifications/read-all` 🔒
```json
{ "marked": 5 }
```

### `GET /notifications/unread-count` 🔒
For the navbar badge.
```json
{ "count": 3 }
```

---

## 17. Player Search

### `GET /players/search?q=play&limit=10` (public)
```json
{
  "players": [
    { "name": "PlayerOne", "account": { "level": 14 }, "clanTag": "NCG", "isOnline": true }
  ]
}
```

---

## 18. WebSocket

Connect right after login for real-time events.

```
wss://game-backend-wfmf.onrender.com?token=<token>
```

### Events the server sends YOU

| `type` | When | `payload` |
|--------|------|-----------|
| `pong` | Reply to ping | — |
| `dm_received` | Someone DMed you | `{ message, conversationId }` |
| `clan_message_received` | New clan chat message | `{ message }` |
| `friend_request_received` | Someone added you | `{ request }` |
| `friend_accepted` | Your request accepted | `{ friend }` |
| `clan_invite_received` | Clan invited you | `{ invite }` |
| `clan_kicked` | You were kicked | `{ clanId, clanName }` |
| `notification` | Any notification | `{ notification }` |
| `friend_online` | Friend came online | `{ name }` |
| `friend_offline` | Friend went offline | `{ name }` |
| `error` | Error event | `{ code, message }` |

### Messages YOU send to server
```js
ws.send(JSON.stringify({ type: "ping" }))
ws.send(JSON.stringify({ type: "heartbeat", payload: { status: "menu" } }))
// status: "menu" | "in_game"
```

### Reconnect strategy
On disconnect → retry after 2s, then 5s, then 10s.

### Polling fallback (if no WebSocket)

| What | Endpoint | Every |
|------|----------|-------|
| New DMs | `GET /dm/unread` | 5s |
| Notifications | `GET /notifications/unread-count` | 5s |
| Friends online | `GET /friends/online` | 30s |
| Clan chat | `GET /clans/:id/chat` | 5s |
| Stay online | `POST /friends/heartbeat` | 30s |

---

## 19. Error Format

```json
{ "error": "SHORT_KEY", "message": "Human readable description" }
```
> Social endpoints return just `{ "message": "..." }` without `error` key.

| Status | Meaning |
|--------|---------|
| 200 | OK |
| 201 | Created |
| 400 | Bad request / validation |
| 401 | Missing or invalid token |
| 403 | Authenticated but not allowed |
| 404 | Not found |
| 409 | Conflict / duplicate |
| 429 | Rate limited |
| 500 | Server error |

---

## 20. All Endpoints Table

| Method | Endpoint | 🔒 | Description |
|--------|----------|:--:|-------------|
| POST | `/auth/register` | | Register |
| POST | `/auth/login` | | Login → token |
| POST | `/auth/logout` | ✓ | Invalidate token |
| GET | `/auth/users` | ✓ | All users |
| DELETE | `/auth/account/:name` | ✓ | Delete account |
| GET | `/profile/me` | ✓ | Own full profile |
| GET | `/profile/:name` | | Any player's profile |
| POST | `/account/xp` | ✓ | Add account XP |
| GET | `/battlepass/me` | ✓ | BP progress + tier |
| POST | `/battlepass/xp` | ✓ | Add BP XP |
| GET | `/nex/balance` | ✓ | NEX balance |
| POST | `/nex/add` | ✓ | Add NEX |
| POST | `/nex/spend` | ✓ | Spend NEX |
| GET | `/shop/catalog` | | All items + prices |
| GET | `/shop/inventory` | ✓ | Owned items + NEX |
| POST | `/shop/buy` | ✓ | Buy any item |
| POST | `/session/save` | ✓ | Save game result |
| GET | `/leaderboard/kills` | | Top 50 by kills |
| GET | `/leaderboard/waves` | | Top 50 by wave |
| GET | `/leaderboard/level` | | Top 50 by level |
| GET | `/leaderboard/nex` | | Top 50 by nex earned |
| GET | `/leaderboard/campaign` | | Top 50 campaign |
| GET | `/leaderboard/map/:mapId` | | Top 50 on a map |
| GET | `/characters/unlocked` | ✓ | Unlocked characters |
| POST | `/characters/unlock` | ✓ | Buy character |
| GET | `/inventory` | ✓ | Full inventory |
| POST | `/inventory/weapons/add` | ✓ | Add weapon |
| POST | `/inventory/upgrades/add` | ✓ | Add upgrade |
| POST | `/inventory/vehicles/add` | ✓ | Add vehicle |
| POST | `/inventory/grenades/update` | ✓ | Set grenades |
| GET | `/stats/me` | ✓ | Full player stats |
| GET | `/stats/global` | | Server-wide stats |
| POST | `/friends/request` | ✓ | Send friend request |
| GET | `/friends/requests/incoming` | ✓ | Incoming requests |
| GET | `/friends/requests/outgoing` | ✓ | Outgoing requests |
| POST | `/friends/request/:id/accept` | ✓ | Accept request |
| POST | `/friends/request/:id/reject` | ✓ | Reject request |
| DELETE | `/friends/request/:id` | ✓ | Cancel sent request |
| GET | `/friends` | ✓ | Full friends list |
| DELETE | `/friends/:name` | ✓ | Remove friend |
| GET | `/friends/online` | ✓ | Online friends only |
| POST | `/friends/heartbeat` | ✓ | Keep online status |
| GET | `/dm/conversations` | ✓ | All conversations |
| GET | `/dm/conversations/:id/messages` | ✓ | Messages in conversation |
| POST | `/dm/send` | ✓ | Send DM |
| POST | `/dm/conversations/:id/read` | ✓ | Mark as read |
| GET | `/dm/unread` | ✓ | Total unread count |
| DELETE | `/dm/messages/:id` | ✓ | Delete own message |
| POST | `/clans` | ✓ | Create clan |
| GET | `/clans` | | Browse/search clans |
| GET | `/clans/me` | ✓ | My clan |
| GET | `/clans/invites` | ✓ | My clan invites |
| GET | `/clans/:id` | | Public clan info |
| PATCH | `/clans/:id` | ✓ | Update clan info |
| POST | `/clans/:id/join` | ✓ | Join open clan |
| POST | `/clans/leave` | ✓ | Leave clan |
| DELETE | `/clans/:id` | ✓ | Disband clan |
| POST | `/clans/:id/invite` | ✓ | Invite player |
| POST | `/clans/invites/:id/accept` | ✓ | Accept invite |
| POST | `/clans/invites/:id/reject` | ✓ | Reject invite |
| DELETE | `/clans/:id/members/:name` | ✓ | Kick member |
| POST | `/clans/:id/members/:name/promote` | ✓ | Promote to officer |
| POST | `/clans/:id/members/:name/demote` | ✓ | Demote to member |
| POST | `/clans/:id/transfer` | ✓ | Transfer leadership |
| GET | `/clans/:id/chat` | ✓ | Clan chat history |
| POST | `/clans/:id/chat` | ✓ | Send clan message |
| GET | `/notifications` | ✓ | All notifications |
| POST | `/notifications/:id/read` | ✓ | Mark one read |
| POST | `/notifications/read-all` | ✓ | Mark all read |
| GET | `/notifications/unread-count` | ✓ | Unread badge count |
| GET | `/players/search` | | Search players |

---

## 21. Valid IDs Reference

### Free Characters (24 — auto-unlocked on register)
`gangster` `hacker` `mercenary` `ghost` `engineer` `sniper_elite` `drone_pilot` `chemist` `cyber_ninja` `cyber_wolf` `neon_panther` `mecha_bulldog` `medic` `ronin` `pyro` `phantom` `spider_drone` `robo_hawk` `nano_rat` `mini_bee` `tank_commander` `blade_dancer` `frost_walker` `volt_runner`

### Locked Characters (buy with NEX)
| ID | Price |
|----|------:|
| `timebreaker` | 15,000 |
| `ai_avatar` | 18,000 |
| `overlord` | 20,000 |
| `electric_eel` | 16,000 |
| `shadow_lord` | 22,000 |
| `plasma_titan` | 25,000 |
| `quantum_ghost` | 28,000 |
| `omega_prime` | 50,000 |

### Weapons (pistol is free, rest purchasable)
`knife`(800) `smg`(1200) `burst`(1500) `shotgun`(1800) `assault`(2200) `crossbow`(2800) `flamethrower`(3200) `sniper`(3500) `electricwhip`(5500) `minigun`(6000) `gravitgun`(6500) `plasmashotgun`(7000) `rocket`(7800) `timecannon`(8000)

### Upgrades
`health`(400) `speed`(500) `damage`(600) `ammo`(600) `firerate`(700) `wealth`(750) `armor`(800) `critical`(800) `leech`(850) `dodge`(900) `regen`(1000)

### Vehicles
`sedan`(2000) `van`(4000) `suv`(5000) `sports`(8000)

### Map IDs
`neon_city` `galactica` `lifemode` `arena` `zombie` `wasteland` `robot_city` `campaign` `survival` `hardcore` `blitz` `siege` `frozen_tundra` `ocean_depths` `metropolis` `desert_sands` `jungle`

### Rate Limits
| Action | Limit |
|--------|-------|
| Send DM | 20 / minute |
| Clan chat | 10 / minute |
| Friend requests | 10 / hour |
| Clan invites | 20 / hour |
