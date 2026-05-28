# Proposals & Problems — Frontend API Reference

All endpoints require a `Bearer` token in the `Authorization` header.

---

## Proposals

A proposal is a feature request or suggestion from a player.

### Submit a proposal
```
POST /proposals
Authorization: Bearer <token>
Content-Type: application/json

{
  "title":       "Add a snow map",
  "description": "I think a snow/tundra map would be great because..."
}
```
**Response 201:**
```json
{ "message": "Proposal submitted", "proposalId": "664abc..." }
```

---

### Get all proposals
```
GET /proposals
Authorization: Bearer <token>
```
Optional query params:
| Param    | Values                        | Default |
|----------|-------------------------------|---------|
| `status` | `open` `accepted` `rejected`  | all     |
| `limit`  | integer                       | 50      |
| `skip`   | integer                       | 0       |

**Response 200:**
```json
{
  "total": 12,
  "proposals": [
    {
      "_id":           "664abc...",
      "submitterName": "Zaven",
      "title":         "Add a snow map",
      "description":   "I think a snow/tundra map...",
      "status":        "open",
      "createdAt":     "2026-05-28T10:00:00.000Z",
      "updatedAt":     "2026-05-28T10:00:00.000Z"
    }
  ]
}
```

---

### Change proposal status
```
PATCH /proposals/:id/status
Authorization: Bearer <token>
Content-Type: application/json

{ "status": "accepted" }
```
Valid values: `open` `accepted` `rejected`

**Response 200:**
```json
{ "message": "Status updated", "proposal": { ...updatedProposal } }
```

---

### Delete a proposal
```
DELETE /proposals/:id
Authorization: Bearer <token>
```
**Response 200:**
```json
{ "message": "Proposal deleted" }
```

---

## Problems

A problem is a bug report or issue submitted by a player.

### Submit a problem
```
POST /problems
Authorization: Bearer <token>
Content-Type: application/json

{
  "title":       "Game crashes on wave 5",
  "description": "Every time I reach wave 5 with the shotgun equipped..."
}
```
**Response 201:**
```json
{ "message": "Problem submitted", "problemId": "664def..." }
```

---

### Get all problems
```
GET /problems
Authorization: Bearer <token>
```
Optional query params:
| Param    | Values                      | Default |
|----------|-----------------------------|---------|
| `status` | `open` `fixed` `dismissed`  | all     |
| `limit`  | integer                     | 50      |
| `skip`   | integer                     | 0       |

**Response 200:**
```json
{
  "total": 5,
  "problems": [
    {
      "_id":           "664def...",
      "submitterName": "Bob",
      "title":         "Game crashes on wave 5",
      "description":   "Every time I reach wave 5...",
      "status":        "open",
      "createdAt":     "2026-05-28T11:00:00.000Z",
      "updatedAt":     "2026-05-28T11:00:00.000Z"
    }
  ]
}
```

---

### Change problem status
```
PATCH /problems/:id/status
Authorization: Bearer <token>
Content-Type: application/json

{ "status": "fixed" }
```
Valid values: `open` `fixed` `dismissed`

**Response 200:**
```json
{ "message": "Status updated", "problem": { ...updatedProblem } }
```

---

### Delete a problem
```
DELETE /problems/:id
Authorization: Bearer <token>
```
**Response 200:**
```json
{ "message": "Problem deleted" }
```

---

## Error responses

| Status | Error code        | Meaning                        |
|--------|-------------------|--------------------------------|
| 400    | `MISSING_FIELDS`  | `title` or `description` missing |
| 400    | `INVALID_STATUS`  | Status value not in allowed list |
| 404    | `NOT_FOUND`       | ID does not exist              |
| 401    | `UNAUTHORIZED`    | Missing or invalid token       |

---

## Summary table

| Method   | Endpoint                   | Purpose                    |
|----------|----------------------------|----------------------------|
| `POST`   | `/proposals`               | Submit a proposal          |
| `GET`    | `/proposals`               | Get all proposals          |
| `PATCH`  | `/proposals/:id/status`    | Change proposal status     |
| `DELETE` | `/proposals/:id`           | Delete a proposal          |
| `POST`   | `/problems`                | Submit a bug report        |
| `GET`    | `/problems`                | Get all problems           |
| `PATCH`  | `/problems/:id/status`     | Change problem status      |
| `DELETE` | `/problems/:id`            | Delete a problem           |
