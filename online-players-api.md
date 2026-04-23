# Online Players API

## Endpoint

```
GET https://dash-dread.onrender.com/players/online
```

- No authentication required
- No request body or headers needed

## Response

```json
{
  "online": 42
}
```

| Field    | Type   | Description                              |
|----------|--------|------------------------------------------|
| `online` | number | Players active in the last 2 minutes     |

## Implementation

```html
<span id="online-count">...</span>
```

```js
async function updateOnlineCount() {
  const res = await fetch("https://dash-dread.onrender.com/players/online");
  const { online } = await res.json();
  document.getElementById("online-count").textContent = online + " online";
}

updateOnlineCount();
setInterval(updateOnlineCount, 30000);
```

## Notes

- Refresh every **30 seconds**
- A player is "online" if they sent a heartbeat in the last 2 minutes
- Works from any frontend — no login needed
