# NEON CITY — Social Features API Documentation for Frontend

> **Base URL:** `https://game-backend-wfmf.onrender.com`
> **Protected routes:** `Authorization: Bearer <token>`
> **WebSocket:** `wss://game-backend-wfmf.onrender.com?token=<token>`

---

## How It All Connects

```
Login → save token
   ↓
Open WebSocket → receive real-time events (messages, friend requests, notifications)
   ↓
Call REST endpoints → fetch/manage friends, clans, DMs, notifications
   ↓
Every 30s → POST /friends/heartbeat  (keeps you "online")
```

---

## WebSocket Connection

Connect immediately after login for real-time events.

```js
const ws = new WebSocket(`wss://game-backend-wfmf.onrender.com?token=${token}`);

ws.onmessage = (e) => {
  const { type, payload } = JSON.parse(e.data);
  // handle by type — see "Events the server sends" below
};

ws.onclose = () => {
  // reconnect after 2s → 5s → 10s
};
```

### Events the server sends to you

| `type` | When | `payload` |
|--------|------|-----------|
| `pong` | Reply to your `ping` | — |
| `dm_received` | Someone sent you a DM | `{ message, conversationId }` |
| `clan_message_received` | New message in your clan | `{ message }` |
| `friend_request_received` | Someone added you | `{ request }` |
| `friend_accepted` | Your request was accepted | `{ friend }` |
| `clan_invite_received` | Clan invited you | `{ invite }` |
| `clan_kicked` | You were kicked | `{ clanId, clanName }` |
| `notification` | Any notification | `{ notification }` |
| `friend_online` | A friend came online | `{ name }` |
| `friend_offline` | A friend went offline | `{ name }` |
| `error` | Something went wrong | `{ code, message }` |

### Messages you send to server

```js
ws.send(JSON.stringify({ type: "ping" }))
ws.send(JSON.stringify({ type: "heartbeat", payload: { status: "menu" } }))
// status: "menu" | "in_game"
```

### Heartbeat (keep online status alive)

Call every **30 seconds** while user is on any page:

```js
// REST fallback (if WebSocket not used):
POST /friends/heartbeat
Authorization: Bearer <token>
Body: { "status": "menu" }
Response: { "ok": true }
```

---

## Profile (Updated — now includes social fields)

`GET /profile/me` 🔒 and `GET /profile/:name` now return extra fields:

```json
{
  "id": "abc123",
  "name": "PlayerOne",
  "nex": 12500,
  "account": { "level": 14, "xp": 13400, "xpInCurrentLevel": 400, "xpNeededForNextLevel": 600, "progressPercent": 40 },
  "battlePass": { "level": 23, "tier": "SILVER", "progressPercent": 10 },
  "stats": { "totalKills": 4821, "highestWave": 42, "totalGamesPlayed": 145 },
  "unlockedCharacters": ["gangster", "hacker"],

  "clanId":     "clan_id_here",
  "clanName":   "Neon Crew",
  "clanTag":    "NCG",
  "clanRole":   "officer",
  "friendCount": 12,
  "isOnline":   true
}
```

---

## 1. Friends

---

### `POST /friends/request` 🔒
Send a friend request.

```json
// Request
{ "targetName": "PlayerTwo" }

// Response 201
{ "message": "Friend request sent", "request": { ...FriendRequest } }

// Errors
{ "message": "User not found" }                     // 404
{ "message": "Already friends" }                    // 409
{ "message": "Friend request already exists" }      // 409
{ "message": "Cannot add yourself" }                // 400
```

---

### `GET /friends/requests/incoming` 🔒
All pending requests sent TO you.

```json
// Response 200
{
  "requests": [
    {
      "_id": "req123",
      "fromId": "...", "fromName": "PlayerTwo",
      "toId": "...",   "toName": "PlayerOne",
      "status": "pending",
      "createdAt": "2026-04-11T12:00:00Z"
    }
  ]
}
```

---

### `GET /friends/requests/outgoing` 🔒
All pending requests sent BY you. Same shape as incoming.

---

### `POST /friends/request/:requestId/accept` 🔒
Accept an incoming request.

```json
// Response 200
{ "message": "Friend request accepted", "friend": { ...Friend } }

// Errors
{ "message": "Not the recipient" }      // 403
{ "message": "Request already processed" } // 409
```

---

### `POST /friends/request/:requestId/reject` 🔒
Reject an incoming request.

```json
// Response 200
{ "message": "Friend request rejected" }
```

---

### `DELETE /friends/request/:requestId` 🔒
Cancel a request you sent (before it's accepted).

```json
// Response 200
{ "message": "Friend request cancelled" }
```

---

### `GET /friends` 🔒
Full friends list with online status.

```json
// Response 200
{
  "friends": [
    {
      "id": "...",
      "name": "PlayerTwo",
      "account": { "level": 8 },
      "clanId": "...",
      "clanTag": "NCG",
      "isOnline": true,
      "lastSeen": "2026-04-11T13:00:00Z"
    }
  ],
  "total": 5
}
```

---

### `DELETE /friends/:friendName` 🔒
Remove a friend (removes from both sides).

```
DELETE /friends/PlayerTwo
```

```json
// Response 200
{ "message": "Friend removed" }
```

---

### `GET /friends/online` 🔒
Only friends currently online (`isOnline === true`).

```json
// Response 200
{ "online": [ ...Friend ], "count": 3 }
```

---

## 2. Direct Messages

A **conversation** is created automatically on first message.
`conversationId` = sorted userIds joined with `_` (handled by backend).

---

### `GET /dm/conversations` 🔒
All your conversations, sorted by most recent.

```json
// Response 200
{
  "conversations": [
    {
      "id": "abc_xyz",
      "lastMessage": { "fromName": "PlayerTwo", "content": "gg!", "createdAt": "..." },
      "unreadCount": 2
    }
  ],
  "totalUnread": 2
}
```

---

### `GET /dm/conversations/:conversationId/messages` 🔒
Messages in a conversation. Also marks them as read automatically.

**Query params:**
- `limit` — default 50, max 100
- `before` — messageId cursor for pagination (older messages)

```json
// Response 200
{
  "messages": [
    {
      "_id": "msg123",
      "conversationId": "abc_xyz",
      "fromId": "...", "fromName": "PlayerTwo",
      "toId": "...",
      "content": "gg ez",
      "readAt": null,
      "createdAt": "2026-04-11T13:00:00Z"
    }
  ],
  "hasMore": false
}
```

---

### `POST /dm/send` 🔒
Send a direct message. Only works between friends.

```json
// Request
{ "toName": "PlayerTwo", "content": "gg!" }

// Response 201
{
  "message": { ...DirectMessage },
  "conversationId": "abc_xyz"
}

// Errors
{ "message": "You can only message friends" }  // 400
{ "message": "Sending too fast. Slow down." }  // 429 (20/min limit)
```

---

### `POST /dm/conversations/:conversationId/read` 🔒
Mark all messages in a conversation as read.

```json
// Response 200
{ "markedRead": 3 }
```

---

### `GET /dm/unread` 🔒
Total unread DMs across all conversations.

```json
// Response 200
{ "unread": 5 }
```

---

### `DELETE /dm/messages/:messageId` 🔒
Delete your own message (only within 5 minutes of sending).

```json
// Response 200
{ "message": "Message deleted" }

// Errors
{ "message": "Can only delete own messages" }                         // 403
{ "message": "Can only delete messages within 5 minutes of sending" } // 400
```

---

## 3. Clans

---

### `POST /clans` 🔒
Create a new clan.

```json
// Request
{
  "name": "Neon Crew",
  "tag": "NCG",
  "description": "Top players only.",
  "emblem": "⚡",
  "isOpen": false
}
// tag: 2–5 letters/numbers, auto-uppercased
// name: 3–24 characters

// Response 201
{ "message": "Clan created", "clan": { ...Clan } }

// Errors
{ "message": "Already in a clan" }               // 409
{ "message": "Clan name or tag already taken" }  // 409
{ "message": "Tag must be 2–5 letters/numbers" } // 400
```

---

### `GET /clans?q=neon&page=1&limit=20`
Browse/search clans. **No auth needed.**

**Query params:** `q` (search), `page`, `limit` (max 50), `sortBy` (`members` | `kills` | `created`)

```json
// Response 200
{
  "clans": [ ...Clan ],
  "total": 42,
  "page": 1,
  "pages": 3
}
```

---

### `GET /clans/:clanId`
Public clan info + member list. **No auth needed.**

```json
// Response 200
{
  "clan": {
    "_id": "...", "name": "Neon Crew", "tag": "NCG",
    "description": "Top players only.", "emblem": "⚡",
    "leaderId": "...", "leaderName": "PlayerOne",
    "memberCount": 8, "maxMembers": 30,
    "isOpen": false, "totalKills": 142000,
    "createdAt": "2026-01-01T00:00:00Z"
  },
  "members": [
    { "userId": "...", "name": "PlayerOne", "role": "leader", "joinedAt": "..." }
  ]
}
```

---

### `GET /clans/me` 🔒
Your own clan with full member list + pending invites (if leader/officer).

```json
// Response 200
{
  "clan": { ...Clan },
  "members": [ ...ClanMember ],
  "myRole": "leader",
  "pendingInvites": [ ...ClanInvite ]
}

// Error
{ "message": "Not in a clan" }  // 404
```

---

### `POST /clans/:clanId/join` 🔒
Join an open clan (no invite needed when `isOpen: true`).

```json
// Response 200
{ "message": "Joined clan", "clan": { ...Clan } }

// Errors
{ "message": "Clan is invite-only" }  // 403
{ "message": "Already in a clan" }    // 400
{ "message": "Clan is full" }         // 400
```

---

### `POST /clans/leave` 🔒
Leave your current clan.

```json
// Response 200
{ "message": "Left clan" }

// Errors
{ "message": "Transfer leadership or disband before leaving" }  // 409 (if you're leader)
```

---

### `DELETE /clans/:clanId` 🔒
Disband the clan (leader only). Removes all members and chat history.

```json
// Response 200
{ "message": "Clan disbanded" }
```

---

### `PATCH /clans/:clanId` 🔒
Update description, emblem, or isOpen. Leader or officer only.

```json
// Request (all optional)
{ "description": "Updated description", "emblem": "🔥", "isOpen": true }

// Response 200
{ "message": "Clan updated", "clan": { ...Clan } }
```

---

### `POST /clans/:clanId/invite` 🔒
Invite a player to your clan. Leader or officer only.

```json
// Request
{ "targetName": "PlayerFive" }

// Response 201
{ "message": "Invitation sent", "invite": { ...ClanInvite } }

// Errors
{ "message": "Player is already in a clan" }               // 400
{ "message": "Clan is full" }                              // 400
{ "message": "Max 10 pending invites at a time" }          // 400
{ "message": "Pending invite already exists for this player" } // 409
```

---

### `GET /clans/invites` 🔒
All pending clan invites sent to you.

```json
// Response 200
{
  "invites": [
    {
      "_id": "inv123",
      "clanId": "...", "clanName": "Neon Crew", "clanTag": "NCG",
      "fromName": "PlayerOne",
      "status": "pending",
      "expiresAt": "2026-04-13T12:00:00Z"
    }
  ]
}
```

---

### `POST /clans/invites/:inviteId/accept` 🔒
Accept a clan invite.

```json
// Response 200
{ "message": "Joined clan", "clan": { ...Clan } }

// Errors
{ "message": "Invite is expired" }     // 409
{ "message": "Already in a clan" }     // 409
{ "message": "Clan is full" }          // 409
```

---

### `POST /clans/invites/:inviteId/reject` 🔒
Reject a clan invite.

```json
// Response 200
{ "message": "Invite rejected" }
```

---

### `DELETE /clans/:clanId/members/:targetName` 🔒
Kick a member. Leader can kick anyone. Officer can kick members only.

```json
// Response 200
{ "message": "Member kicked" }
```

---

### `POST /clans/:clanId/members/:targetName/promote` 🔒
Promote member → officer. Leader only.

```json
// Response 200
{ "message": "Member promoted to officer" }
```

---

### `POST /clans/:clanId/members/:targetName/demote` 🔒
Demote officer → member. Leader only.

```json
// Response 200
{ "message": "Officer demoted to member" }
```

---

### `POST /clans/:clanId/transfer` 🔒
Transfer leadership to another member. Current leader becomes officer.

```json
// Request
{ "targetName": "PlayerTwo" }

// Response 200
{ "message": "Leadership transferred" }
```

---

## 4. Clan Chat

---

### `GET /clans/:clanId/chat` 🔒
Clan chat history. Members only.

**Query params:** `limit` (default 50, max 100), `before` (messageId cursor)

```json
// Response 200
{
  "messages": [
    {
      "_id": "msg123",
      "clanId": "...",
      "fromName": "PlayerOne", "fromRole": "leader",
      "content": "Let's go!",
      "createdAt": "2026-04-11T13:00:00Z"
    }
  ],
  "hasMore": false
}
```

---

### `POST /clans/:clanId/chat` 🔒
Send a message to clan chat. Members only. Rate limit: 10/min.

```json
// Request
{ "content": "gg everyone!" }

// Response 201
{ "message": { ...ClanMessage } }

// Errors
{ "message": "Not a clan member" }  // 403
{ "message": "Sending too fast" }   // 429
```

---

## 5. Notifications

---

### `GET /notifications?limit=30&unreadOnly=false` 🔒

```json
// Response 200
{
  "notifications": [
    {
      "_id": "notif123",
      "type": "friend_request",
      "title": "Friend Request",
      "body": "PlayerTwo sent you a friend request.",
      "payload": { "requestId": "...", "fromName": "PlayerTwo" },
      "readAt": null,
      "createdAt": "2026-04-11T12:00:00Z"
    }
  ],
  "unreadCount": 3
}
```

**Notification types:**
| `type` | When triggered |
|--------|---------------|
| `friend_request` | Someone sends you a friend request |
| `friend_accepted` | Someone accepts your request |
| `clan_invite` | You are invited to a clan |
| `clan_kick` | You are kicked from a clan |
| `dm_received` | You receive a direct message |

---

### `POST /notifications/:notificationId/read` 🔒
Mark one notification as read.

```json
// Response 200
{ "ok": true }
```

---

### `POST /notifications/read-all` 🔒
Mark all notifications as read.

```json
// Response 200
{ "marked": 5 }
```

---

### `GET /notifications/unread-count` 🔒
For the navbar badge.

```json
// Response 200
{ "count": 3 }
```

---

## 6. Player Search

### `GET /players/search?q=play&limit=10`
**No auth needed.** Search players by name (partial match).

```json
// Response 200
{
  "players": [
    {
      "name": "PlayerOne",
      "account": { "level": 14 },
      "clanTag": "NCG",
      "isOnline": true
    }
  ]
}
```

---

## Polling Fallback (if no WebSocket)

If you don't use WebSocket, poll these endpoints instead:

| What | Endpoint | Every |
|------|----------|-------|
| New DMs | `GET /dm/unread` | 5s |
| Notifications | `GET /notifications/unread-count` | 5s |
| Friends online | `GET /friends/online` | 30s |
| Clan chat | `GET /clans/:id/chat?before=<lastId>` | 5s |
| Keep online | `POST /friends/heartbeat` | 30s |

---

## Rate Limits

| Action | Limit |
|--------|-------|
| Send DM | 20 per minute |
| Clan chat | 10 per minute |
| Friend requests | 10 per hour |
| Clan invites | 20 per hour |

---

## Error Format

All errors return:

```json
{ "message": "Human readable description" }
```

| Status | Meaning |
|--------|---------|
| 400 | Bad request / business rule failed |
| 401 | Missing or invalid token |
| 403 | Authenticated but not allowed |
| 404 | Not found |
| 409 | Conflict / duplicate |
| 429 | Rate limited |
| 500 | Server error |

---

## Complete Endpoint Table

| Method | Endpoint | 🔒 | Description |
|--------|----------|:--:|-------------|
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

## Important: Install `ws` Package

The backend now uses WebSockets. Run this once on the server:

```bash
npm install ws
```
