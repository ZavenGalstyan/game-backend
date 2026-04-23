const http      = require("http");
const express   = require("express");
const mongoose  = require("mongoose");
const cors      = require("cors");
const bcrypt    = require("bcrypt");
const jwt       = require("jsonwebtoken");
const WebSocket = require("ws");
const swaggerUi   = require("swagger-ui-express");
const swaggerJsdoc = require("swagger-jsdoc");

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || "your_secret_key_change_this_in_production";

app.use(cors());
app.use(express.json());

// ─── Swagger ──────────────────────────────────────────────

const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: "3.0.0",
    info: { title: "NEON CITY Game API", version: "2.0.0", description: "Full backend API for NEON CITY" },
    components: {
      securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } },
    },
  },
  apis: ["./server.js"],
});
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// ─── Database ─────────────────────────────────────────────

mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/neoncity");

// ─── Constants ────────────────────────────────────────────

const CHARACTER_PRICES = {
  timebreaker: 15000,
  ai_avatar:   18000,
  overlord:    20000,
  electric_eel: 16000,
  shadow_lord: 22000,
  plasma_titan: 25000,
  quantum_ghost: 28000,
  omega_prime: 50000,
};

const DEFAULT_UNLOCKED_CHARACTERS = [
  // Page 1 – Street Crew (free)
  "gangster","hacker","mercenary","ghost","engineer","sniper_elite",
  "drone_pilot","chemist","cyber_ninja","cyber_wolf","neon_panther","mecha_bulldog",
  // Page 2 – Specialists (free)
  "medic","ronin","pyro","phantom","spider_drone","robo_hawk",
  "nano_rat","mini_bee","tank_commander","blade_dancer","frost_walker","volt_runner",
];

const NEX_ADD_REASONS = ["game_session", "bonus", "admin"];
const XP_PER_LEVEL    = 1000; // flat for both account and battle pass

const SHOP_CATALOG = {
  characters: [
    { id: "timebreaker",   name: "TIMEBREAKER",   lore: "Bend time.",              price: 15000, color: "#FFDD00" },
    { id: "ai_avatar",     name: "AI AVATAR",     lore: "Digital consciousness.",  price: 18000, color: "#00FFFF" },
    { id: "overlord",      name: "THE OVERLORD",  lore: "Commands all.",           price: 20000, color: "#FF0000" },
    { id: "electric_eel",  name: "ELECTRIC EEL",  lore: "Shock and awe.",          price: 16000, color: "#FFFF00" },
    { id: "shadow_lord",   name: "SHADOW LORD",   lore: "From the darkness.",      price: 22000, color: "#9900FF" },
    { id: "plasma_titan",  name: "PLASMA TITAN",  lore: "Unstoppable force.",      price: 25000, color: "#FF6600" },
    { id: "quantum_ghost", name: "QUANTUM GHOST", lore: "Phase through walls.",    price: 28000, color: "#00FF99" },
    { id: "omega_prime",   name: "OMEGA PRIME",   lore: "The final form.",         price: 50000, color: "#FF00FF" },
  ],
  weapons: [
    { id: "knife",         name: "COMBAT KNIFE",    desc: "Silent and deadly",        price: 800,  damage: 35,  fireRate: 400,  color: "#AAAAAA" },
    { id: "smg",           name: "SMG",             desc: "High fire rate",           price: 1200, damage: 12,  fireRate: 100,  color: "#AAAAAA" },
    { id: "burst",         name: "BURST PISTOL",    desc: "3-round burst",            price: 1500, damage: 18,  fireRate: 350,  color: "#AAAAAA" },
    { id: "shotgun",       name: "SHOTGUN",         desc: "6 pellets per blast",      price: 1800, damage: 22,  fireRate: 750,  color: "#FF8800" },
    { id: "assault",       name: "ASSAULT RIFLE",   desc: "Versatile automatic",      price: 2200, damage: 20,  fireRate: 150,  color: "#AAAAAA" },
    { id: "crossbow",      name: "CROSSBOW",        desc: "Silent, piercing bolts",   price: 2800, damage: 45,  fireRate: 800,  color: "#AAAAAA" },
    { id: "flamethrower",  name: "FLAMETHROWER",    desc: "Area denial weapon",       price: 3200, damage: 15,  fireRate: 80,   color: "#FF4400" },
    { id: "sniper",        name: "SNIPER RIFLE",    desc: "One shot, one kill",       price: 3500, damage: 95,  fireRate: 1800, color: "#AAAAAA" },
    { id: "electricwhip",  name: "ELEC. WHIP",      desc: "Chains to nearby enemies", price: 5500, damage: 40,  fireRate: 600,  color: "#FFFF00" },
    { id: "minigun",       name: "MINIGUN",         desc: "Suppression fire",         price: 6000, damage: 18,  fireRate: 80,   color: "#AAAAAA" },
    { id: "gravitgun",     name: "GRAVITY RIFLE",   desc: "Pulls enemies in",         price: 6500, damage: 55,  fireRate: 1200, color: "#9900FF" },
    { id: "plasmashotgun", name: "PLASMA SHOTGUN",  desc: "Plasma burst spread",      price: 7000, damage: 38,  fireRate: 700,  color: "#00FFCC" },
    { id: "rocket",        name: "ROCKET LAUNCHER", desc: "Explosive area damage",    price: 7800, damage: 120, fireRate: 2500, color: "#FF2200" },
    { id: "timecannon",    name: "TIME CANNON",     desc: "Slows enemies on hit",     price: 8000, damage: 70,  fireRate: 1500, color: "#FFDD00" },
  ],
  upgrades: [
    { id: "health",   name: "MAX HEALTH",   desc: "+20 HP per level",       price: 400,  maxLevel: 5, color: "#FF4444" },
    { id: "speed",    name: "SPEED",        desc: "+18 SPD per level",      price: 500,  maxLevel: 5, color: "#44EEFF" },
    { id: "damage",   name: "DAMAGE",       desc: "+10% DMG per level",     price: 600,  maxLevel: 5, color: "#FF8800" },
    { id: "ammo",     name: "AMMO CAP",     desc: "+25% ammo per level",    price: 600,  maxLevel: 5, color: "#AAAAFF" },
    { id: "firerate", name: "FIRE RATE",    desc: "+10% speed per level",   price: 700,  maxLevel: 5, color: "#FFFF44" },
    { id: "wealth",   name: "WEALTH",       desc: "+15% NEX per level",     price: 750,  maxLevel: 5, color: "#FFD700" },
    { id: "armor",    name: "ARMOR",        desc: "-10% dmg taken/level",   price: 800,  maxLevel: 5, color: "#8888AA" },
    { id: "critical", name: "CRITICAL HIT", desc: "+8% crit chance/level",  price: 800,  maxLevel: 5, color: "#FF44FF" },
    { id: "leech",    name: "LIFE LEECH",   desc: "+5% HP on kill/level",   price: 850,  maxLevel: 5, color: "#FF0044" },
    { id: "dodge",    name: "DODGE",        desc: "+6% dodge chance/level", price: 900,  maxLevel: 5, color: "#44FF88" },
    { id: "regen",    name: "REGEN",        desc: "+2 HP/sec per level",    price: 1000, maxLevel: 5, color: "#00FF44" },
  ],
  vehicles: [
    { id: "sedan",  name: "SEDAN",      desc: "Reliable street car.", price: 2000, speed: 295, hp: 200, color: "#CC3333" },
    { id: "van",    name: "VAN",        desc: "Heavy and durable.",   price: 4000, speed: 240, hp: 400, color: "#888888" },
    { id: "suv",    name: "SUV",        desc: "Off-road capable.",    price: 5000, speed: 270, hp: 350, color: "#336699" },
    { id: "sports", name: "SPORTS CAR", desc: "Maximum speed.",       price: 8000, speed: 380, hp: 180, color: "#FF2244" },
  ],
};

// Flat lookup: category:id → price  (e.g. "weapons:shotgun" → 1800)
const CATALOG_PRICE_MAP = {};
for (const [cat, items] of Object.entries(SHOP_CATALOG)) {
  for (const item of items) CATALOG_PRICE_MAP[`${cat}:${item.id}`] = item.price;
}

// ─── XP & Level Helpers ───────────────────────────────────

function calcProgress(xp) {
  const xpInCurrentLevel     = xp % XP_PER_LEVEL;
  const level                = Math.floor(xp / XP_PER_LEVEL) + 1;
  return {
    level,
    xp,
    xpInCurrentLevel,
    xpNeededForNextLevel: XP_PER_LEVEL - xpInCurrentLevel,
    progressPercent:      Math.floor((xpInCurrentLevel / XP_PER_LEVEL) * 100),
  };
}

function getBpTier(level) {
  if (level <= 10)  return "IRON";
  if (level <= 20)  return "BRONZE";
  if (level <= 35)  return "SILVER";
  if (level <= 50)  return "GOLD";
  if (level <= 65)  return "PLATINUM";
  if (level <= 80)  return "DIAMOND";
  if (level <= 90)  return "MASTER";
  if (level <= 99)  return "LEGEND";
  return "CHAMPION";
}

// XP formula from doc: kills×5, wave×50, boss×200, campaignLevel×150,
// survived (deaths=0) +100, survival/hardcore ×1.5
function calcSessionXp({ kills = 0, waveReached = 0, bossKills = 0, campaignLevel = null, deaths = 0, mode = {} }) {
  let xp = 0;
  xp += kills * 5;
  xp += waveReached * 50;
  xp += bossKills * 200;
  if (campaignLevel) xp += campaignLevel * 150;
  if (deaths === 0)  xp += 100;
  if (mode.survival || mode.hardcore) xp = Math.floor(xp * 1.5);
  return xp;
}

// Returns the key with the highest value from a Mongoose Map or plain object
function getTopKey(map) {
  if (!map) return null;
  const entries = map instanceof Map ? [...map.entries()] : Object.entries(map);
  if (!entries.length) return null;
  return entries.reduce((best, cur) => (cur[1] > best[1] ? cur : best))[0];
}

// ─── Models ───────────────────────────────────────────────

const StatsSchema = new mongoose.Schema({
  totalKills:          { type: Number, default: 0 },
  totalDeaths:         { type: Number, default: 0 },
  totalWaves:          { type: Number, default: 0 },
  totalGamesPlayed:    { type: Number, default: 0 },
  highestWave:         { type: Number, default: 0 },
  highestKillGame:     { type: Number, default: 0 },
  totalPlaytimeSec:    { type: Number, default: 0 },
  totalNexEarned:      { type: Number, default: 0 },
  totalBossKills:      { type: Number, default: 0 },
  totalGrenadesThrown: { type: Number, default: 0 },
  killsByCharacter:    { type: Map, of: Number, default: {} },
  killsByMap:          { type: Map, of: Number, default: {} },
  gamesPerMode: {
    normal:   { type: Number, default: 0 },
    survival: { type: Number, default: 0 },
    hardcore: { type: Number, default: 0 },
    blitz:    { type: Number, default: 0 },
    siege:    { type: Number, default: 0 },
    zombie:   { type: Number, default: 0 },
    arena:    { type: Number, default: 0 },
    campaign: { type: Number, default: 0 },
  },
}, { _id: false });

const InventorySchema = new mongoose.Schema({
  weapons:  { type: [String], default: ["pistol"] },
  upgrades: { type: [String], default: [] },
  vehicles: { type: [String], default: [] },
  grenades: { type: Number,  default: 0 },
}, { _id: false });

const UserSchema = new mongoose.Schema({
  name:                { type: String, required: true, unique: true },
  email:               { type: String, required: true, unique: true },
  password:            { type: String, required: true },
  nex:                 { type: Number, default: 0 },
  xp:                  { type: Number, default: 0 },
  level:               { type: Number, default: 1 },
  bpXp:                { type: Number, default: 0 },
  bpLevel:             { type: Number, default: 1 },
  unlockedCharacters:  { type: [String], default: () => [...DEFAULT_UNLOCKED_CHARACTERS] },
  inventory:           { type: InventorySchema, default: () => ({}) },
  stats:               { type: StatsSchema,     default: () => ({}) },
  // Social
  friends:   [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  clanId:    { type: mongoose.Schema.Types.ObjectId, ref: "Clan", default: null },
  onlineAt:  { type: Date, default: null },
  purchaseHistory: [{
    itemId:      { type: String, required: true },
    category:    { type: String, required: true },
    price:       { type: Number, required: true },
    purchasedAt: { type: Date,   default: Date.now },
  }],
}, { timestamps: true });

// Auto-recalculate level fields before every save
UserSchema.pre("save", function () {
  this.level   = calcProgress(this.xp).level;
  this.bpLevel = calcProgress(this.bpXp).level;
});

const User = mongoose.model("User", UserSchema);

const GameSessionSchema = new mongoose.Schema({
  userId:            { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  name:              { type: String, required: true },
  mapId:             String,
  characterId:       String,
  waveReached:       { type: Number, default: 0 },
  kills:             { type: Number, default: 0 },
  deaths:            { type: Number, default: 0 },
  moneyEarned:       { type: Number, default: 0 },
  playtimeSec:       { type: Number, default: 0 },
  campaignLevel:     Number,
  bossKills:         { type: Number, default: 0 },
  mode: {
    survival: Boolean, hardcore: Boolean, blitz:    Boolean,
    siege:    Boolean, zombie:   Boolean, arena:    Boolean, campaign: Boolean,
  },
  weaponsUsed:       [String],
  vehiclesUsed:      [String],
  grenadesThrown:    { type: Number, default: 0 },
  distanceTravelled: { type: Number, default: 0 },
  xpEarned:          { type: Number, default: 0 },
  nexEarned:         { type: Number, default: 0 },
}, { timestamps: true });

const GameSession = mongoose.model("GameSession", GameSessionSchema);

// TTL index auto-removes expired blacklist entries
const TokenBlacklistSchema = new mongoose.Schema({
  token:     { type: String, required: true, unique: true },
  expiresAt: { type: Date,   required: true },
});
TokenBlacklistSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const TokenBlacklist = mongoose.model("TokenBlacklist", TokenBlacklistSchema);

// ─── Social Models ────────────────────────────────────────

const FriendRequestSchema = new mongoose.Schema({
  fromId:   { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  fromName: { type: String, required: true },
  toId:     { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  toName:   { type: String, required: true },
  status:   { type: String, enum: ["pending", "accepted", "rejected"], default: "pending" },
}, { timestamps: true });

const FriendRequest = mongoose.model("FriendRequest", FriendRequestSchema);

const DirectMessageSchema = new mongoose.Schema({
  conversationId: { type: String, required: true, index: true },
  fromId:   { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  fromName: { type: String, required: true },
  toId:     { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  content:  { type: String, required: true, maxlength: 500 },
  readAt:   { type: Date, default: null },
  deleted:  { type: Boolean, default: false },
}, { timestamps: true });

const DirectMessage = mongoose.model("DirectMessage", DirectMessageSchema);

const ClanMemberSubSchema = new mongoose.Schema({
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  name:     { type: String, required: true },
  role:     { type: String, enum: ["leader", "officer", "member"], default: "member" },
  joinedAt: { type: Date, default: Date.now },
}, { _id: false });

const ClanSchema = new mongoose.Schema({
  name:        { type: String, required: true, unique: true },
  tag:         { type: String, required: true, unique: true },
  description: { type: String, default: "", maxlength: 200 },
  leaderId:    { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  leaderName:  { type: String, required: true },
  members:     { type: [ClanMemberSubSchema], default: [] },
  emblem:      { type: String, default: "⭐" },
  isOpen:      { type: Boolean, default: false },
  totalKills:  { type: Number, default: 0 },
}, { timestamps: true });

ClanSchema.virtual("memberCount").get(function () { return this.members.length; });
ClanSchema.set("toJSON", { virtuals: true });

const Clan = mongoose.model("Clan", ClanSchema);

const ClanInviteSchema = new mongoose.Schema({
  clanId:    { type: mongoose.Schema.Types.ObjectId, ref: "Clan", required: true },
  clanName:  { type: String, required: true },
  clanTag:   { type: String, required: true },
  fromId:    { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  fromName:  { type: String, required: true },
  toId:      { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  status:    { type: String, enum: ["pending", "accepted", "rejected", "expired"], default: "pending" },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 48 * 60 * 60 * 1000) },
}, { timestamps: true });

const ClanInvite = mongoose.model("ClanInvite", ClanInviteSchema);

const ClanMessageSchema = new mongoose.Schema({
  clanId:   { type: mongoose.Schema.Types.ObjectId, ref: "Clan", required: true },
  fromId:   { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  fromName: { type: String, required: true },
  fromRole: { type: String, enum: ["leader", "officer", "member"], required: true },
  content:  { type: String, required: true, maxlength: 500 },
}, { timestamps: true });

const ClanMessage = mongoose.model("ClanMessage", ClanMessageSchema);

const NotificationSchema = new mongoose.Schema({
  userId:  { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  type:    { type: String, enum: ["friend_request", "friend_accepted", "clan_invite", "clan_kick", "dm_received"], required: true },
  title:   { type: String, required: true },
  body:    { type: String, required: true },
  payload: { type: mongoose.Schema.Types.Mixed, default: {} },
  readAt:  { type: Date, default: null },
}, { timestamps: true });

const Notification = mongoose.model("Notification", NotificationSchema);

// ─── Auth Middleware ───────────────────────────────────────

async function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer "))
    return res.status(401).json({ error: "UNAUTHORIZED", message: "Missing or invalid token" });

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (await TokenBlacklist.exists({ token }))
      return res.status(401).json({ error: "UNAUTHORIZED", message: "Token has been invalidated" });
    req.user  = payload;
    req.token = token;
    next();
  } catch {
    return res.status(401).json({ error: "UNAUTHORIZED", message: "Invalid or expired token" });
  }
}

// ─── HTTP Server + WebSocket ──────────────────────────────

const server = http.createServer(app);
const wss    = new WebSocket.Server({ server });

// userId (string) → WebSocket
const wsConnections = new Map();

wss.on("connection", async (ws, req) => {
  const token = new URL(req.url, "http://localhost").searchParams.get("token");
  let userId;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (await TokenBlacklist.exists({ token })) throw new Error();
    userId = payload.id.toString();
  } catch {
    ws.close(4001, "Invalid token");
    return;
  }

  wsConnections.set(userId, ws);

  // Update online status on connect
  await User.findByIdAndUpdate(userId, { onlineAt: new Date() });

  ws.on("message", async (raw) => {
    try {
      const msg = JSON.parse(raw);
      if (msg.type === "ping")       return ws.send(JSON.stringify({ type: "pong" }));
      if (msg.type === "heartbeat")  return User.findByIdAndUpdate(userId, { onlineAt: new Date() });
    } catch { /* ignore malformed */ }
  });

  ws.on("close", async () => {
    wsConnections.delete(userId);
  });
});

// Push a JSON event to a connected user (no-op if offline)
function pushToUser(userId, data) {
  const ws = wsConnections.get(userId.toString());
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}

// ─── Social Helpers ───────────────────────────────────────

// Online = heartbeat received within last 2 minutes
function isUserOnline(onlineAt) {
  return onlineAt && Date.now() - new Date(onlineAt).getTime() < 2 * 60 * 1000;
}

// conversationId: deterministic from two user IDs
function makeConversationId(a, b) {
  return [a.toString(), b.toString()].sort().join("_");
}

async function createNotification(userId, type, title, body, payload = {}) {
  const notif = await Notification.create({ userId, type, title, body, payload });
  pushToUser(userId, { type: "notification", payload: { notification: notif } });
  return notif;
}

// In-memory simple rate limiter
const _rateBuckets = new Map();
function rateLimit(userId, action, max, windowMs) {
  const key  = `${userId}:${action}`;
  const now  = Date.now();
  const slot = _rateBuckets.get(key);
  if (!slot || now > slot.resetAt) {
    _rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (slot.count >= max) return false;
  slot.count++;
  return true;
}

// Serialize a friend entry for response
async function serializeFriend(friendUser, viewerClanId) {
  let clanTag = null;
  if (friendUser.clanId) {
    const c = await Clan.findById(friendUser.clanId, { tag: 1 });
    if (c) clanTag = c.tag;
  }
  return {
    id:      friendUser._id,
    name:    friendUser.name,
    account: { level: friendUser.level },
    clanId:  friendUser.clanId || null,
    clanTag,
    isOnline: isUserOnline(friendUser.onlineAt),
    lastSeen: friendUser.onlineAt,
  };
}

// ─── Profile Builder ──────────────────────────────────────

function buildProfile(user) {
  const account = calcProgress(user.xp);
  const bp      = calcProgress(user.bpXp);
  const s       = user.stats;

  return {
    id:   user._id,
    name: user.name,
    nex:  user.nex,
    account: { ...account },
    battlePass: { ...bp, tier: getBpTier(bp.level) },
    stats: {
      totalKills:        s.totalKills,
      totalDeaths:       s.totalDeaths,
      totalWaves:        s.totalWaves,
      totalGamesPlayed:  s.totalGamesPlayed,
      highestWave:       s.highestWave,
      highestKillGame:   s.highestKillGame,
      totalPlaytimeSec:  s.totalPlaytimeSec,
      favoriteCharacter: getTopKey(s.killsByCharacter),
      favoriteMap:       getTopKey(s.killsByMap),
    },
    unlockedCharacters: user.unlockedCharacters,
    createdAt: user.createdAt,
  };
}

async function resolveSocialFields(user) {
  let clanId = null, clanName = null, clanTag = null, clanRole = null;
  if (user.clanId) {
    const clan = await Clan.findById(user.clanId, { name: 1, tag: 1, members: 1 });
    if (clan) {
      const member = clan.members.find(m => m.userId.toString() === user._id.toString());
      clanId = clan._id; clanName = clan.name; clanTag = clan.tag;
      clanRole = member?.role || null;
    }
  }
  return {
    clanId, clanName, clanTag, clanRole,
    friendCount: user.friends?.length || 0,
    isOnline:    isUserOnline(user.onlineAt),
  };
}

// ─── 1. Auth ──────────────────────────────────────────────

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register a new account
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password]
 *             properties:
 *               name:     { type: string, example: PlayerOne }
 *               email:    { type: string, example: player@example.com }
 *               password: { type: string, example: secret123 }
 *     responses:
 *       201:
 *         description: Account created successfully
 *       400:
 *         description: Missing fields
 *       409:
 *         description: Name or email already taken
 */
app.post("/auth/register", async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password)
    return res.status(400).json({ error: "MISSING_FIELDS", message: "name, email and password are required" });

  if (await User.exists({ name }))
    return res.status(409).json({ error: "NAME_TAKEN", message: "This name is already taken" });

  if (await User.exists({ email }))
    return res.status(409).json({ error: "EMAIL_TAKEN", message: "This email is already registered" });

  await User.create({ name, email, password: await bcrypt.hash(password, 10) });

  res.status(201).json({ message: "Account created successfully" });
});

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login and receive a JWT token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, password]
 *             properties:
 *               name:     { type: string, example: PlayerOne }
 *               password: { type: string, example: secret123 }
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 */
app.post("/auth/login", async (req, res) => {
  const { name, password } = req.body;

  if (!name || !password)
    return res.status(400).json({ error: "MISSING_FIELDS", message: "name and password are required" });

  const user = await User.findOne({ $or: [{ name }, { email: name }] });
  if (!user || !(await bcrypt.compare(password, user.password)))
    return res.status(401).json({ error: "INVALID_CREDENTIALS", message: "Invalid name or password" });

  const token = jwt.sign({ id: user._id, name: user.name }, JWT_SECRET, { expiresIn: "7d" });
  res.json({ token, name: user.name });
});

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Invalidate the current token
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out
 */
app.post("/auth/logout", auth, async (req, res) => {
  const decoded    = jwt.decode(req.token);
  const expiresAt  = new Date(decoded.exp * 1000);
  await TokenBlacklist.create({ token: req.token, expiresAt });
  res.json({ message: "Logged out" });
});

/**
 * @swagger
 * /auth/account/{name}:
 *   delete:
 *     summary: Delete an account by name
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *         example: PlayerOne
 *     responses:
 *       200:
 *         description: Account deleted
 *       404:
 *         description: User not found
 */
app.delete("/auth/account/:name", auth, async (req, res) => {
  const user = await User.findOneAndDelete({ name: req.params.name });
  if (!user) return res.status(404).json({ error: "NOT_FOUND", message: "User not found" });

  await GameSession.deleteMany({ userId: user._id });

  res.json({ message: "Account deleted", name: user.name });
});

/**
 * @swagger
 * /auth/users:
 *   get:
 *     summary: Get all registered users
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of all users
 */
app.get("/auth/users", auth, async (req, res) => {
  const users = await User.find({}, { name: 1, email: 1, level: 1, nex: 1, createdAt: 1 });
  res.json({ total: users.length, users });
});

// ─── 2. Profile ───────────────────────────────────────────

/**
 * @swagger
 * /profile/me:
 *   get:
 *     summary: Get your own profile (protected)
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Full profile
 */
app.get("/profile/me", auth, async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ error: "NOT_FOUND", message: "User not found" });

  const social = await resolveSocialFields(user);
  res.json({ ...buildProfile(user), ...social });
});

/**
 * @swagger
 * /profile/{name}:
 *   get:
 *     summary: Get any player's public profile
 *     tags: [Profile]
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *         example: PlayerOne
 *     responses:
 *       200:
 *         description: Player profile
 *       404:
 *         description: User not found
 */
app.get("/profile/:name", async (req, res) => {
  const user = await User.findOne({ name: req.params.name });
  if (!user) return res.status(404).json({ error: "NOT_FOUND", message: "User not found" });

  const social = await resolveSocialFields(user);
  res.json({ ...buildProfile(user), ...social });
});

// ─── 3. Account XP ────────────────────────────────────────

/**
 * @swagger
 * /account/xp:
 *   post:
 *     summary: Award XP to the player's account
 *     tags: [Account XP]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [xp]
 *             properties:
 *               xp: { type: number, example: 350 }
 *     responses:
 *       200:
 *         description: XP awarded
 */
app.post("/account/xp", auth, async (req, res) => {
  const { xp } = req.body;
  if (typeof xp !== "number" || xp < 0)
    return res.status(400).json({ error: "INVALID_XP", message: "xp must be a non-negative number" });

  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ error: "NOT_FOUND", message: "User not found" });

  const oldLevel = calcProgress(user.xp).level;
  user.xp += xp;
  await user.save();

  const progress = calcProgress(user.xp);
  res.json({ ...progress, leveledUp: progress.level > oldLevel, levelsGained: progress.level - oldLevel });
});

// ─── 4. Battle Pass ───────────────────────────────────────

/**
 * @swagger
 * /battlepass/me:
 *   get:
 *     summary: Get current battle pass progress
 *     tags: [Battle Pass]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Battle pass progress
 */
app.get("/battlepass/me", auth, async (req, res) => {
  const user = await User.findById(req.user.id, { bpXp: 1 });
  if (!user) return res.status(404).json({ error: "NOT_FOUND", message: "User not found" });
  const progress = calcProgress(user.bpXp);
  res.json({ ...progress, tier: getBpTier(progress.level) });
});

/**
 * @swagger
 * /battlepass/xp:
 *   post:
 *     summary: Award battle pass XP
 *     tags: [Battle Pass]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [xp]
 *             properties:
 *               xp: { type: number, example: 280 }
 *     responses:
 *       200:
 *         description: Battle pass XP awarded
 */
app.post("/battlepass/xp", auth, async (req, res) => {
  const { xp } = req.body;
  if (typeof xp !== "number" || xp < 0)
    return res.status(400).json({ error: "INVALID_XP", message: "xp must be a non-negative number" });

  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ error: "NOT_FOUND", message: "User not found" });

  const oldLevel = calcProgress(user.bpXp).level;
  user.bpXp += xp;
  await user.save();

  const progress = calcProgress(user.bpXp);
  res.json({
    ...progress,
    tier:         getBpTier(progress.level),
    leveledUp:    progress.level > oldLevel,
    levelsGained: progress.level - oldLevel,
  });
});

// ─── 5. NEX ───────────────────────────────────────────────

/**
 * @swagger
 * /nex/balance:
 *   get:
 *     summary: Get current NEX balance
 *     tags: [NEX]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: NEX balance
 */
app.get("/nex/balance", auth, async (req, res) => {
  const user = await User.findById(req.user.id, { nex: 1 });
  if (!user) return res.status(404).json({ error: "NOT_FOUND", message: "User not found" });
  res.json({ nex: user.nex });
});

/**
 * @swagger
 * /nex/add:
 *   post:
 *     summary: Add NEX to account
 *     tags: [NEX]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount, reason]
 *             properties:
 *               amount: { type: number, example: 3750 }
 *               reason: { type: string, enum: [game_session, bonus, admin], example: game_session }
 *     responses:
 *       200:
 *         description: NEX added
 *       400:
 *         description: Invalid amount or reason
 */
app.post("/nex/add", auth, async (req, res) => {
  const { amount, reason } = req.body;

  if (typeof amount !== "number" || amount <= 0)
    return res.status(400).json({ error: "INVALID_AMOUNT", message: "amount must be a positive number" });
  if (!NEX_ADD_REASONS.includes(reason))
    return res.status(400).json({ error: "INVALID_REASON", message: `reason must be one of: ${NEX_ADD_REASONS.join(", ")}` });

  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ error: "NOT_FOUND", message: "User not found" });

  user.nex += amount;
  user.stats.totalNexEarned += amount;
  await user.save();

  res.json({ nex: user.nex });
});

/**
 * @swagger
 * /nex/spend:
 *   post:
 *     summary: Deduct NEX from account
 *     tags: [NEX]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount, reason]
 *             properties:
 *               amount: { type: number, example: 15000 }
 *               reason: { type: string, example: character_unlock }
 *               itemId: { type: string, example: timebreaker }
 *     responses:
 *       200:
 *         description: NEX spent
 *       400:
 *         description: Insufficient NEX
 */
app.post("/nex/spend", auth, async (req, res) => {
  const { amount } = req.body;

  if (typeof amount !== "number" || amount <= 0)
    return res.status(400).json({ error: "INVALID_AMOUNT", message: "amount must be a positive number" });

  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ error: "NOT_FOUND", message: "User not found" });

  if (user.nex < amount)
    return res.status(400).json({ error: "INSUFFICIENT_NEX", message: "Insufficient NEX balance" });

  user.nex -= amount;
  await user.save();

  res.json({ nex: user.nex });
});

// ─── Shop ─────────────────────────────────────────────────

/**
 * @swagger
 * /shop/catalog:
 *   get:
 *     summary: All purchasable items with server-authoritative prices (public)
 *     tags: [Shop]
 *     responses:
 *       200:
 *         description: Full shop catalog
 */
app.get("/shop/catalog", (req, res) => {
  res.json(SHOP_CATALOG);
});

/**
 * @swagger
 * /shop/inventory:
 *   get:
 *     summary: Full inventory + NEX balance in one call
 *     tags: [Shop]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Inventory and balance
 */
app.get("/shop/inventory", auth, async (req, res) => {
  const user = await User.findById(req.user.id, { nex: 1, unlockedCharacters: 1, inventory: 1 });
  if (!user) return res.status(404).json({ error: "NOT_FOUND", message: "User not found" });

  res.json({
    nex:        user.nex,
    characters: user.unlockedCharacters,
    weapons:    user.inventory.weapons,
    upgrades:   user.inventory.upgrades,
    vehicles:   user.inventory.vehicles,
    grenades:   user.inventory.grenades,
  });
});

/**
 * @swagger
 * /shop/buy:
 *   post:
 *     summary: Buy an item — atomic NEX deduct + inventory unlock
 *     tags: [Shop]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [itemId, category]
 *             properties:
 *               itemId:   { type: string, example: shotgun }
 *               category: { type: string, enum: [characters, weapons, upgrades, vehicles], example: weapons }
 *     responses:
 *       200:
 *         description: Purchase successful
 *       400:
 *         description: Insufficient NEX, already owned, or invalid item/category
 */
app.post("/shop/buy", auth, async (req, res) => {
  const { itemId, category } = req.body;
  const VALID_CATEGORIES = ["characters", "weapons", "upgrades", "vehicles"];

  if (!itemId || !category)
    return res.status(400).json({ error: "MISSING_FIELDS", message: "itemId and category are required" });

  if (!VALID_CATEGORIES.includes(category))
    return res.status(400).json({ error: "INVALID_CATEGORY", message: "category must be: characters, weapons, upgrades, or vehicles" });

  const price = CATALOG_PRICE_MAP[`${category}:${itemId}`];
  if (price === undefined)
    return res.status(400).json({ error: "ITEM_NOT_FOUND", message: "Item does not exist in the catalog" });

  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ error: "NOT_FOUND", message: "User not found" });

  // Check already owned
  const owned = category === "characters"
    ? user.unlockedCharacters.includes(itemId)
    : user.inventory[category].includes(itemId);

  if (owned)
    return res.status(400).json({ error: "ALREADY_OWNED", message: "Item already owned" });

  if (user.nex < price)
    return res.status(400).json({ error: "INSUFFICIENT_NEX", message: "Not enough NEX balance" });

  // Atomic update: deduct NEX, add item, log purchase
  user.nex -= price;
  if (category === "characters") {
    user.unlockedCharacters.push(itemId);
  } else {
    user.inventory[category].push(itemId);
  }
  user.purchaseHistory.push({ itemId, category, price });
  await user.save();

  res.json({
    message:    "Purchase successful",
    itemId,
    category,
    pricePaid:  price,
    nexBalance: user.nex,
  });
});

// ─── 6. Game Session ──────────────────────────────────────

/**
 * @swagger
 * /session/save:
 *   post:
 *     summary: Save the result of a completed game session
 *     tags: [Game Session]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               mapId:             { type: string,  example: neon_city }
 *               characterId:       { type: string,  example: gangster }
 *               waveReached:       { type: number,  example: 18 }
 *               kills:             { type: number,  example: 95 }
 *               deaths:            { type: number,  example: 1 }
 *               moneyEarned:       { type: number,  example: 23750 }
 *               playtimeSec:       { type: number,  example: 480 }
 *               bossKills:         { type: number,  example: 2 }
 *               grenadesThrown:    { type: number,  example: 4 }
 *               distanceTravelled: { type: number,  example: 8500 }
 *     responses:
 *       200:
 *         description: Session saved with XP and NEX rewards
 */
app.post("/session/save", auth, async (req, res) => {
  const {
    mapId, characterId,
    waveReached  = 0, kills        = 0, deaths       = 0,
    moneyEarned  = 0, playtimeSec  = 0, campaignLevel = null,
    bossKills    = 0, mode         = {},
    weaponsUsed  = [], vehiclesUsed = [],
    grenadesThrown = 0, distanceTravelled = 0,
  } = req.body;

  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ error: "NOT_FOUND", message: "User not found" });

  const xpEarned = calcSessionXp({ kills, waveReached, bossKills, campaignLevel, deaths, mode });

  const oldAccountLevel = calcProgress(user.xp).level;
  const oldBpLevel      = calcProgress(user.bpXp).level;

  // Award XP and NEX
  user.xp   += xpEarned;
  user.bpXp += xpEarned;
  user.nex  += moneyEarned;

  // Update lifetime stats
  const s = user.stats;
  const wasNewHighestWave     = waveReached > s.highestWave;
  const wasNewHighestKillGame = kills > s.highestKillGame;

  s.totalKills          += kills;
  s.totalDeaths         += deaths;
  s.totalWaves          += waveReached;
  s.totalGamesPlayed    += 1;
  s.totalPlaytimeSec    += playtimeSec;
  s.totalBossKills      += bossKills;
  s.totalGrenadesThrown += grenadesThrown;
  s.totalNexEarned      += moneyEarned;

  if (wasNewHighestWave)     s.highestWave     = waveReached;
  if (wasNewHighestKillGame) s.highestKillGame = kills;

  if (characterId) s.killsByCharacter.set(characterId, (s.killsByCharacter.get(characterId) || 0) + kills);
  if (mapId)       s.killsByMap.set(mapId, (s.killsByMap.get(mapId) || 0) + kills);

  const modeKey = mode.survival ? "survival"
    : mode.hardcore ? "hardcore"
    : mode.blitz    ? "blitz"
    : mode.siege    ? "siege"
    : mode.zombie   ? "zombie"
    : mode.arena    ? "arena"
    : mode.campaign ? "campaign"
    : "normal";
  s.gamesPerMode[modeKey] = (s.gamesPerMode[modeKey] || 0) + 1;

  user.markModified("stats");
  await user.save();

  await GameSession.create({
    userId: user._id, name: user.name, mapId, characterId,
    waveReached, kills, deaths, moneyEarned, playtimeSec, campaignLevel,
    bossKills, mode, weaponsUsed, vehiclesUsed,
    grenadesThrown, distanceTravelled, xpEarned, nexEarned: moneyEarned,
  });

  // Update clan total kills
  if (user.clanId && kills > 0) {
    await Clan.findByIdAndUpdate(user.clanId, { $inc: { totalKills: kills } });
  }

  const accountProgress = calcProgress(user.xp);
  const bpProgress      = calcProgress(user.bpXp);

  res.json({
    message:    "Session saved",
    nexEarned:  moneyEarned,
    nexBalance: user.nex,
    accountXP: {
      xpEarned,
      ...accountProgress,
      leveledUp:    accountProgress.level > oldAccountLevel,
      levelsGained: accountProgress.level - oldAccountLevel,
    },
    battlePassXP: {
      xpEarned,
      ...bpProgress,
      tier:         getBpTier(bpProgress.level),
      leveledUp:    bpProgress.level > oldBpLevel,
      levelsGained: bpProgress.level - oldBpLevel,
    },
    newHighScores: {
      highestWave:     wasNewHighestWave,
      highestKillGame: wasNewHighestKillGame,
    },
  });
});

// ─── 7. Leaderboard ───────────────────────────────────────

/**
 * @swagger
 * /leaderboard/kills:
 *   get:
 *     summary: Top 50 players by total kills
 *     tags: [Leaderboard]
 *     responses:
 *       200:
 *         description: Leaderboard
 */
app.get("/leaderboard/kills", async (req, res) => {
  const users = await User.find({}, { name: 1, stats: 1 }).sort({ "stats.totalKills": -1 }).limit(50);
  res.json({
    leaderboard: users.map((u, i) => ({
      rank: i + 1, name: u.name, value: u.stats.totalKills,
      characterId: getTopKey(u.stats.killsByCharacter),
    })),
  });
});

/**
 * @swagger
 * /leaderboard/waves:
 *   get:
 *     summary: Top 50 players by highest wave reached
 *     tags: [Leaderboard]
 *     responses:
 *       200:
 *         description: Leaderboard
 */
app.get("/leaderboard/waves", async (req, res) => {
  const users = await User.find({}, { name: 1, stats: 1 }).sort({ "stats.highestWave": -1 }).limit(50);
  res.json({
    leaderboard: users.map((u, i) => ({
      rank: i + 1, name: u.name, value: u.stats.highestWave,
      characterId: getTopKey(u.stats.killsByCharacter),
    })),
  });
});

/**
 * @swagger
 * /leaderboard/level:
 *   get:
 *     summary: Top 50 players by account level
 *     tags: [Leaderboard]
 *     responses:
 *       200:
 *         description: Leaderboard
 */
app.get("/leaderboard/level", async (req, res) => {
  const users = await User.find({}, { name: 1, level: 1, stats: 1 }).sort({ level: -1 }).limit(50);
  res.json({
    leaderboard: users.map((u, i) => ({
      rank: i + 1, name: u.name, value: u.level,
      characterId: getTopKey(u.stats.killsByCharacter),
    })),
  });
});

/**
 * @swagger
 * /leaderboard/nex:
 *   get:
 *     summary: Top 50 players by total NEX ever earned (all-time)
 *     tags: [Leaderboard]
 *     responses:
 *       200:
 *         description: Leaderboard
 */
app.get("/leaderboard/nex", async (req, res) => {
  const users = await User.find({}, { name: 1, stats: 1 }).sort({ "stats.totalNexEarned": -1 }).limit(50);
  res.json({
    leaderboard: users.map((u, i) => ({
      rank: i + 1, name: u.name, value: u.stats.totalNexEarned,
      characterId: getTopKey(u.stats.killsByCharacter),
    })),
  });
});

/**
 * @swagger
 * /leaderboard/campaign:
 *   get:
 *     summary: Top 50 players by highest campaign level reached
 *     tags: [Leaderboard]
 *     responses:
 *       200:
 *         description: Leaderboard
 */
app.get("/leaderboard/campaign", async (req, res) => {
  const rows = await GameSession.aggregate([
    { $match: { campaignLevel: { $gt: 0 } } },
    { $group: { _id: "$name", value: { $max: "$campaignLevel" } } },
    { $sort: { value: -1 } },
    { $limit: 50 },
  ]);
  res.json({
    leaderboard: rows.map((r, i) => ({ rank: i + 1, name: r._id, value: r.value })),
  });
});

/**
 * @swagger
 * /leaderboard/map/{mapId}:
 *   get:
 *     summary: Top 50 players on a specific map by kills
 *     tags: [Leaderboard]
 *     parameters:
 *       - in: path
 *         name: mapId
 *         required: true
 *         schema:
 *           type: string
 *         example: neon_city
 *     responses:
 *       200:
 *         description: Map leaderboard
 */
app.get("/leaderboard/map/:mapId", async (req, res) => {
  const { mapId } = req.params;
  const field = `stats.killsByMap.${mapId}`;
  const users = await User.find({ [field]: { $gt: 0 } }, { name: 1, stats: 1 })
    .sort({ [field]: -1 }).limit(50);
  res.json({
    leaderboard: users.map((u, i) => ({
      rank: i + 1, name: u.name,
      value: u.stats.killsByMap.get(mapId) || 0,
      characterId: getTopKey(u.stats.killsByCharacter),
    })),
  });
});

// ─── 8. Characters ────────────────────────────────────────

/**
 * @swagger
 * /characters/unlocked:
 *   get:
 *     summary: List all unlocked characters
 *     tags: [Characters]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Unlocked characters list
 */
app.get("/characters/unlocked", auth, async (req, res) => {
  const user = await User.findById(req.user.id, { unlockedCharacters: 1 });
  if (!user) return res.status(404).json({ error: "NOT_FOUND", message: "User not found" });
  res.json({ unlocked: user.unlockedCharacters });
});

/**
 * @swagger
 * /characters/unlock:
 *   post:
 *     summary: Purchase and unlock a locked character
 *     tags: [Characters]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [characterId]
 *             properties:
 *               characterId: { type: string, example: timebreaker }
 *     responses:
 *       200:
 *         description: Character unlocked
 *       400:
 *         description: Already unlocked or insufficient NEX
 *       404:
 *         description: Character not purchasable
 */
app.post("/characters/unlock", auth, async (req, res) => {
  const { characterId } = req.body;
  if (!characterId)
    return res.status(400).json({ error: "MISSING_FIELDS", message: "characterId is required" });

  const price = CHARACTER_PRICES[characterId];
  if (price === undefined)
    return res.status(404).json({ error: "NOT_FOUND", message: "Character not found or not purchasable" });

  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ error: "NOT_FOUND", message: "User not found" });

  if (user.unlockedCharacters.includes(characterId))
    return res.status(400).json({ error: "ALREADY_UNLOCKED", message: "Character already unlocked" });

  if (user.nex < price)
    return res.status(400).json({ error: "INSUFFICIENT_NEX", message: "Insufficient NEX balance" });

  user.nex -= price;
  user.unlockedCharacters.push(characterId);
  await user.save();

  res.json({ message: "Character unlocked", character: characterId, nexSpent: price, nexBalance: user.nex });
});

// ─── 9. Inventory ─────────────────────────────────────────

/**
 * @swagger
 * /inventory:
 *   get:
 *     summary: Get full inventory
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Player inventory
 */
app.get("/inventory", auth, async (req, res) => {
  const user = await User.findById(req.user.id, { inventory: 1 });
  if (!user) return res.status(404).json({ error: "NOT_FOUND", message: "User not found" });
  res.json(user.inventory);
});

/**
 * @swagger
 * /inventory/weapons/add:
 *   post:
 *     summary: Add a weapon to inventory
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [weaponId]
 *             properties:
 *               weaponId: { type: string, example: crossbow }
 *     responses:
 *       200:
 *         description: Weapon added
 */
app.post("/inventory/weapons/add", auth, async (req, res) => {
  const { weaponId } = req.body;
  if (!weaponId)
    return res.status(400).json({ error: "MISSING_FIELDS", message: "weaponId is required" });

  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ error: "NOT_FOUND", message: "User not found" });

  if (!user.inventory.weapons.includes(weaponId)) user.inventory.weapons.push(weaponId);
  await user.save();

  res.json({ weapons: user.inventory.weapons });
});

/**
 * @swagger
 * /inventory/upgrades/add:
 *   post:
 *     summary: Add an upgrade to inventory
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [upgradeId]
 *             properties:
 *               upgradeId: { type: string, example: critical }
 *     responses:
 *       200:
 *         description: Upgrade added
 */
app.post("/inventory/upgrades/add", auth, async (req, res) => {
  const { upgradeId } = req.body;
  if (!upgradeId)
    return res.status(400).json({ error: "MISSING_FIELDS", message: "upgradeId is required" });

  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ error: "NOT_FOUND", message: "User not found" });

  if (!user.inventory.upgrades.includes(upgradeId)) user.inventory.upgrades.push(upgradeId);
  await user.save();

  res.json({ upgrades: user.inventory.upgrades });
});

/**
 * @swagger
 * /inventory/vehicles/add:
 *   post:
 *     summary: Add a vehicle to inventory
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [vehicleId]
 *             properties:
 *               vehicleId: { type: string, example: sports }
 *     responses:
 *       200:
 *         description: Vehicle added
 */
app.post("/inventory/vehicles/add", auth, async (req, res) => {
  const { vehicleId } = req.body;
  if (!vehicleId)
    return res.status(400).json({ error: "MISSING_FIELDS", message: "vehicleId is required" });

  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ error: "NOT_FOUND", message: "User not found" });

  if (!user.inventory.vehicles.includes(vehicleId)) user.inventory.vehicles.push(vehicleId);
  await user.save();

  res.json({ vehicles: user.inventory.vehicles });
});

/**
 * @swagger
 * /inventory/grenades/update:
 *   post:
 *     summary: Update grenade count
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [grenades]
 *             properties:
 *               grenades: { type: number, example: 8 }
 *     responses:
 *       200:
 *         description: Grenades updated
 */
app.post("/inventory/grenades/update", auth, async (req, res) => {
  const { grenades } = req.body;
  if (typeof grenades !== "number" || grenades < 0)
    return res.status(400).json({ error: "INVALID_VALUE", message: "grenades must be a non-negative number" });

  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ error: "NOT_FOUND", message: "User not found" });

  user.inventory.grenades = grenades;
  await user.save();

  res.json({ grenades: user.inventory.grenades });
});

// ─── 10. Statistics ───────────────────────────────────────

/**
 * @swagger
 * /stats/me:
 *   get:
 *     summary: Full stats for the logged-in player
 *     tags: [Statistics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Player statistics
 */
app.get("/stats/me", auth, async (req, res) => {
  const user = await User.findById(req.user.id, { stats: 1 });
  if (!user) return res.status(404).json({ error: "NOT_FOUND", message: "User not found" });

  const s = user.stats;
  res.json({
    totalKills:          s.totalKills,
    totalDeaths:         s.totalDeaths,
    totalWaves:          s.totalWaves,
    totalGamesPlayed:    s.totalGamesPlayed,
    highestWave:         s.highestWave,
    highestKillGame:     s.highestKillGame,
    totalPlaytimeSec:    s.totalPlaytimeSec,
    totalNexEarned:      s.totalNexEarned,
    totalBossKills:      s.totalBossKills,
    totalGrenadesThrown: s.totalGrenadesThrown,
    favoriteCharacter:   getTopKey(s.killsByCharacter),
    favoriteMap:         getTopKey(s.killsByMap),
    killsByCharacter:    Object.fromEntries(s.killsByCharacter),
    killsByMap:          Object.fromEntries(s.killsByMap),
    gamesPerMode:        s.gamesPerMode,
  });
});

/**
 * @swagger
 * /stats/global:
 *   get:
 *     summary: Server-wide totals (public, no auth)
 *     tags: [Statistics]
 *     responses:
 *       200:
 *         description: Global statistics
 */
app.get("/stats/global", async (req, res) => {
  const [agg] = await User.aggregate([
    {
      $group: {
        _id: null,
        totalPlayers:     { $sum: 1 },
        totalKills:       { $sum: "$stats.totalKills" },
        totalGamesPlayed: { $sum: "$stats.totalGamesPlayed" },
      },
    },
  ]);

  // Tally kills by character and map across all players
  const allUsers     = await User.find({}, { "stats.killsByCharacter": 1, "stats.killsByMap": 1 });
  const charTotals   = {};
  const mapTotals    = {};
  for (const u of allUsers) {
    for (const [ch, v] of u.stats.killsByCharacter) charTotals[ch] = (charTotals[ch] || 0) + v;
    for (const [mp, v] of u.stats.killsByMap)       mapTotals[mp]  = (mapTotals[mp]  || 0) + v;
  }

  const topCharacter = Object.entries(charTotals).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const topMap       = Object.entries(mapTotals).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  res.json({
    totalPlayers:     agg?.totalPlayers     ?? 0,
    totalKills:       agg?.totalKills       ?? 0,
    totalGamesPlayed: agg?.totalGamesPlayed ?? 0,
    topCharacter,
    topMap,
  });
});

// ─── Friends ──────────────────────────────────────────────

/**
 * @swagger
 * /friends/request:
 *   post:
 *     summary: Send a friend request
 *     tags: [Friends]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [targetName]
 *             properties:
 *               targetName: { type: string, example: PlayerTwo }
 *     responses:
 *       201: { description: Friend request sent }
 *       400: { description: Cannot add yourself }
 *       404: { description: User not found }
 *       409: { description: Already friends or request exists }
 */
app.post("/friends/request", auth, async (req, res) => {
  const { targetName } = req.body;
  if (!targetName) return res.status(400).json({ message: "targetName is required" });

  if (!rateLimit(req.user.id, "friend_request", 10, 60 * 60 * 1000))
    return res.status(429).json({ message: "Too many friend requests. Try again later." });

  const [me, target] = await Promise.all([
    User.findById(req.user.id),
    User.findOne({ name: targetName }),
  ]);
  if (!target) return res.status(404).json({ message: "User not found" });
  if (target._id.equals(me._id)) return res.status(400).json({ message: "Cannot add yourself" });
  if (me.friends.some(f => f.equals(target._id))) return res.status(409).json({ message: "Already friends" });

  const existing = await FriendRequest.findOne({
    status: "pending",
    $or: [
      { fromId: me._id, toId: target._id },
      { fromId: target._id, toId: me._id },
    ],
  });
  if (existing) return res.status(409).json({ message: "Friend request already exists" });

  const request = await FriendRequest.create({ fromId: me._id, fromName: me.name, toId: target._id, toName: target.name });

  await createNotification(target._id, "friend_request", "Friend Request", `${me.name} sent you a friend request.`, { requestId: request._id, fromName: me.name });
  pushToUser(target._id, { type: "friend_request_received", payload: { request } });

  res.status(201).json({ message: "Friend request sent", request });
});

/**
 * @swagger
 * /friends/requests/incoming:
 *   get:
 *     summary: Get all pending friend requests sent TO you
 *     tags: [Friends]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: List of incoming requests }
 */
app.get("/friends/requests/incoming", auth, async (req, res) => {
  const requests = await FriendRequest.find({ toId: req.user.id, status: "pending" }).sort({ createdAt: -1 });
  res.json({ requests });
});

/**
 * @swagger
 * /friends/requests/outgoing:
 *   get:
 *     summary: Get all pending friend requests sent BY you
 *     tags: [Friends]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: List of outgoing requests }
 */
app.get("/friends/requests/outgoing", auth, async (req, res) => {
  const requests = await FriendRequest.find({ fromId: req.user.id, status: "pending" }).sort({ createdAt: -1 });
  res.json({ requests });
});

/**
 * @swagger
 * /friends/request/{requestId}/accept:
 *   post:
 *     summary: Accept an incoming friend request
 *     tags: [Friends]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: requestId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Friend request accepted }
 *       403: { description: Not the recipient }
 *       404: { description: Request not found }
 */
app.post("/friends/request/:requestId/accept", auth, async (req, res) => {
  const request = await FriendRequest.findById(req.params.requestId);
  if (!request) return res.status(404).json({ message: "Request not found" });
  if (!request.toId.equals(req.user.id)) return res.status(403).json({ message: "Not the recipient" });
  if (request.status !== "pending") return res.status(409).json({ message: "Request already processed" });

  request.status = "accepted";
  await request.save();

  await Promise.all([
    User.findByIdAndUpdate(request.fromId, { $addToSet: { friends: request.toId } }),
    User.findByIdAndUpdate(request.toId,   { $addToSet: { friends: request.fromId } }),
  ]);

  const [friendUser] = await Promise.all([
    User.findById(request.fromId),
    createNotification(request.fromId, "friend_accepted", "Friend Request Accepted", `${request.toName} accepted your friend request.`, { name: request.toName }),
  ]);
  const friend = await serializeFriend(friendUser);
  pushToUser(request.fromId, { type: "friend_accepted", payload: { friend } });

  res.json({ message: "Friend request accepted", friend });
});

/**
 * @swagger
 * /friends/request/{requestId}/reject:
 *   post:
 *     summary: Reject an incoming friend request
 *     tags: [Friends]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: requestId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Request rejected }
 */
app.post("/friends/request/:requestId/reject", auth, async (req, res) => {
  const request = await FriendRequest.findById(req.params.requestId);
  if (!request) return res.status(404).json({ message: "Request not found" });
  if (!request.toId.equals(req.user.id)) return res.status(403).json({ message: "Not the recipient" });
  if (request.status !== "pending") return res.status(409).json({ message: "Request already processed" });

  request.status = "rejected";
  await request.save();
  res.json({ message: "Friend request rejected" });
});

/**
 * @swagger
 * /friends/request/{requestId}:
 *   delete:
 *     summary: Cancel a friend request you sent
 *     tags: [Friends]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: requestId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Request cancelled }
 *       403: { description: Not the sender }
 */
app.delete("/friends/request/:requestId", auth, async (req, res) => {
  const request = await FriendRequest.findById(req.params.requestId);
  if (!request) return res.status(404).json({ message: "Request not found" });
  if (!request.fromId.equals(req.user.id)) return res.status(403).json({ message: "Not the sender" });
  if (request.status !== "pending") return res.status(409).json({ message: "Request already processed" });

  await request.deleteOne();
  res.json({ message: "Friend request cancelled" });
});

/**
 * @swagger
 * /friends:
 *   get:
 *     summary: Get your full friends list with online status
 *     tags: [Friends]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Friends list }
 */
app.get("/friends", auth, async (req, res) => {
  const me = await User.findById(req.user.id, { friends: 1 });
  const friendUsers = await User.find({ _id: { $in: me.friends } }, { name: 1, level: 1, clanId: 1, onlineAt: 1 });
  const friends = await Promise.all(friendUsers.map(f => serializeFriend(f)));
  res.json({ friends, total: friends.length });
});

/**
 * @swagger
 * /friends/{friendName}:
 *   delete:
 *     summary: Remove a friend
 *     tags: [Friends]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: friendName
 *         required: true
 *         schema: { type: string }
 *         example: PlayerTwo
 *     responses:
 *       200: { description: Friend removed }
 *       404: { description: Not in friend list }
 */
app.delete("/friends/:friendName", auth, async (req, res) => {
  const [me, friend] = await Promise.all([
    User.findById(req.user.id),
    User.findOne({ name: req.params.friendName }),
  ]);
  if (!friend) return res.status(404).json({ message: "User not found" });
  if (!me.friends.some(f => f.equals(friend._id))) return res.status(404).json({ message: "Not in friend list" });

  await Promise.all([
    User.findByIdAndUpdate(me._id,     { $pull: { friends: friend._id } }),
    User.findByIdAndUpdate(friend._id, { $pull: { friends: me._id } }),
  ]);
  res.json({ message: "Friend removed" });
});

/**
 * @swagger
 * /friends/online:
 *   get:
 *     summary: Get only online friends
 *     tags: [Friends]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Online friends }
 */
app.get("/friends/online", auth, async (req, res) => {
  const me = await User.findById(req.user.id, { friends: 1 });
  const friendUsers = await User.find({ _id: { $in: me.friends } }, { name: 1, level: 1, clanId: 1, onlineAt: 1 });
  const online = (await Promise.all(friendUsers.map(f => serializeFriend(f)))).filter(f => f.isOnline);
  res.json({ online, count: online.length });
});

/**
 * @swagger
 * /friends/heartbeat:
 *   post:
 *     summary: Keep your online status alive (call every 30s)
 *     tags: [Friends]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: OK }
 */
app.post("/friends/heartbeat", auth, async (req, res) => {
  await User.findByIdAndUpdate(req.user.id, { onlineAt: new Date() });
  res.json({ ok: true });
});

// ─── Direct Messages ──────────────────────────────────────

/**
 * @swagger
 * /dm/conversations:
 *   get:
 *     summary: Get all your conversations sorted by most recent
 *     tags: [Direct Messages]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Conversations list with unread counts }
 */
app.get("/dm/conversations", auth, async (req, res) => {
  const uid = req.user.id.toString();
  const messages = await DirectMessage.aggregate([
    { $match: { conversationId: { $regex: uid } } },
    { $sort: { createdAt: -1 } },
    { $group: { _id: "$conversationId", lastMessage: { $first: "$$ROOT" }, unread: { $sum: { $cond: [{ $and: [{ $eq: ["$readAt", null] }, { $ne: [{ $toString: "$toId" }, uid] }, { $eq: ["$deleted", false] }] }, 1, 0] } } } },
    { $sort: { "lastMessage.createdAt": -1 } },
  ]);

  const totalUnread = messages.reduce((s, m) => s + m.unread, 0);
  res.json({
    conversations: messages.map(m => ({
      id: m._id, lastMessage: m.lastMessage, unreadCount: m.unread,
    })),
    totalUnread,
  });
});

/**
 * @swagger
 * /dm/conversations/{conversationId}/messages:
 *   get:
 *     summary: Get messages in a conversation (marks them as read)
 *     tags: [Direct Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
 *       - in: query
 *         name: before
 *         schema: { type: string }
 *         description: messageId cursor for pagination
 *     responses:
 *       200: { description: Messages array }
 *       403: { description: Not a participant }
 */
app.get("/dm/conversations/:conversationId/messages", auth, async (req, res) => {
  const { conversationId } = req.params;
  const uid = req.user.id.toString();
  if (!conversationId.includes(uid)) return res.status(403).json({ message: "Not a participant" });

  const limit  = Math.min(parseInt(req.query.limit) || 50, 100);
  const before = req.query.before;
  const query  = { conversationId, deleted: false };
  if (before) {
    const pivot = await DirectMessage.findById(before);
    if (pivot) query.createdAt = { $lt: pivot.createdAt };
  }

  const messages = await DirectMessage.find(query).sort({ createdAt: -1 }).limit(limit + 1);
  const hasMore  = messages.length > limit;
  if (hasMore) messages.pop();

  // Mark messages sent to this user as read
  await DirectMessage.updateMany({ conversationId, toId: req.user.id, readAt: null }, { readAt: new Date() });

  res.json({ messages: messages.reverse(), hasMore });
});

/**
 * @swagger
 * /dm/send:
 *   post:
 *     summary: Send a direct message to a friend
 *     tags: [Direct Messages]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [toName, content]
 *             properties:
 *               toName:  { type: string, example: PlayerTwo }
 *               content: { type: string, example: "gg!" }
 *     responses:
 *       201: { description: Message sent }
 *       400: { description: Not friends or empty content }
 *       429: { description: Rate limited (20/min) }
 */
app.post("/dm/send", auth, async (req, res) => {
  const { toName, content } = req.body;
  if (!toName || !content?.trim()) return res.status(400).json({ message: "toName and content are required" });
  if (content.trim().length > 500)  return res.status(400).json({ message: "Message too long (max 500 chars)" });

  if (!rateLimit(req.user.id, "dm_send", 20, 60 * 1000))
    return res.status(429).json({ message: "Sending too fast. Slow down." });

  const [me, target] = await Promise.all([
    User.findById(req.user.id),
    User.findOne({ name: toName }),
  ]);
  if (!target) return res.status(404).json({ message: "User not found" });
  if (!me.friends.some(f => f.equals(target._id)))
    return res.status(400).json({ message: "You can only message friends" });

  const conversationId = makeConversationId(me._id, target._id);
  const message = await DirectMessage.create({
    conversationId, fromId: me._id, fromName: me.name,
    toId: target._id, content: content.trim(),
  });

  await createNotification(target._id, "dm_received", "New Message", `${me.name}: ${content.trim().slice(0, 60)}`, { conversationId, fromName: me.name });
  pushToUser(target._id, { type: "dm_received", payload: { message, conversationId } });

  res.status(201).json({ message, conversationId });
});

/**
 * @swagger
 * /dm/conversations/{conversationId}/read:
 *   post:
 *     summary: Mark all messages in a conversation as read
 *     tags: [Direct Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Messages marked as read }
 */
app.post("/dm/conversations/:conversationId/read", auth, async (req, res) => {
  const { conversationId } = req.params;
  const result = await DirectMessage.updateMany({ conversationId, toId: req.user.id, readAt: null }, { readAt: new Date() });
  res.json({ markedRead: result.modifiedCount });
});

/**
 * @swagger
 * /dm/unread:
 *   get:
 *     summary: Get total unread DM count
 *     tags: [Direct Messages]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Unread count }
 */
app.get("/dm/unread", auth, async (req, res) => {
  const unread = await DirectMessage.countDocuments({ toId: req.user.id, readAt: null, deleted: false });
  res.json({ unread });
});

/**
 * @swagger
 * /dm/messages/{messageId}:
 *   delete:
 *     summary: Delete your own message (within 5 minutes)
 *     tags: [Direct Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: messageId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Message deleted }
 *       403: { description: Not your message }
 *       400: { description: Too old to delete }
 */
app.delete("/dm/messages/:messageId", auth, async (req, res) => {
  const msg = await DirectMessage.findById(req.params.messageId);
  if (!msg) return res.status(404).json({ message: "Message not found" });
  if (!msg.fromId.equals(req.user.id)) return res.status(403).json({ message: "Can only delete own messages" });
  if (Date.now() - msg.createdAt.getTime() > 5 * 60 * 1000)
    return res.status(400).json({ message: "Can only delete messages within 5 minutes of sending" });

  msg.deleted = true;
  msg.content = "[message deleted]";
  await msg.save();
  res.json({ message: "Message deleted" });
});

// ─── Clans ────────────────────────────────────────────────

/**
 * @swagger
 * /clans:
 *   post:
 *     summary: Create a new clan
 *     tags: [Clans]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, tag]
 *             properties:
 *               name:        { type: string, example: "Neon Crew" }
 *               tag:         { type: string, example: "NCG" }
 *               description: { type: string, example: "Top players only." }
 *               emblem:      { type: string, example: "⚡" }
 *               isOpen:      { type: boolean, example: false }
 *     responses:
 *       201: { description: Clan created }
 *       409: { description: Already in a clan or name/tag taken }
 *   get:
 *     summary: Browse and search clans (public)
 *     tags: [Clans]
 *     parameters:
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *         description: Search by name or tag
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: sortBy
 *         schema: { type: string, enum: [members, kills, created], default: members }
 *     responses:
 *       200: { description: Clans list }
 */
app.post("/clans", auth, async (req, res) => {
  const { name, tag, description = "", emblem = "⭐", isOpen = false } = req.body;
  if (!name || !tag) return res.status(400).json({ message: "name and tag are required" });
  if (name.length < 3 || name.length > 24) return res.status(400).json({ message: "Clan name must be 3–24 characters" });
  if (!/^[a-zA-Z0-9]{2,5}$/.test(tag))    return res.status(400).json({ message: "Tag must be 2–5 letters/numbers" });

  const me = await User.findById(req.user.id);
  if (me.clanId) return res.status(409).json({ message: "Already in a clan" });

  const upperTag = tag.toUpperCase();
  if (await Clan.exists({ $or: [{ name: { $regex: `^${name}$`, $options: "i" } }, { tag: upperTag }] }))
    return res.status(409).json({ message: "Clan name or tag already taken" });

  const clan = await Clan.create({
    name, tag: upperTag, description: description.slice(0, 200), leaderId: me._id,
    leaderName: me.name, emblem, isOpen,
    members: [{ userId: me._id, name: me.name, role: "leader" }],
  });

  me.clanId = clan._id;
  await me.save();

  res.status(201).json({ message: "Clan created", clan });
});

app.get("/clans", async (req, res) => {
  const { q, page = 1, limit = 20, sortBy = "members" } = req.query;
  const filter = q ? { $or: [{ name: { $regex: q, $options: "i" } }, { tag: { $regex: q, $options: "i" } }] } : {};
  const sortMap = { kills: { totalKills: -1 }, created: { createdAt: -1 }, members: {} };
  const total = await Clan.countDocuments(filter);
  let clans   = await Clan.find(filter).skip((page - 1) * Math.min(limit, 50)).limit(Math.min(limit, 50));
  if (sortBy === "members") clans = clans.sort((a, b) => b.members.length - a.members.length);
  else if (sortMap[sortBy]) clans = await Clan.find(filter).sort(sortMap[sortBy]).skip((page - 1) * Math.min(limit, 50)).limit(Math.min(limit, 50));
  res.json({ clans, total, page: Number(page), pages: Math.ceil(total / Math.min(limit, 50)) });
});

/**
 * @swagger
 * /clans/me:
 *   get:
 *     summary: Get your own clan with members and pending invites
 *     tags: [Clans]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Your clan info }
 *       404: { description: Not in a clan }
 */
app.get("/clans/me", auth, async (req, res) => {
  const me = await User.findById(req.user.id);
  if (!me.clanId) return res.status(404).json({ message: "Not in a clan" });

  const clan = await Clan.findById(me.clanId);
  if (!clan) return res.status(404).json({ message: "Clan not found" });

  const myMember = clan.members.find(m => m.userId.equals(me._id));
  let pendingInvites = [];
  if (["leader", "officer"].includes(myMember?.role)) {
    pendingInvites = await ClanInvite.find({ clanId: clan._id, status: "pending", expiresAt: { $gt: new Date() } });
  }

  res.json({ clan, members: clan.members, myRole: myMember?.role || "member", pendingInvites });
});

/**
 * @swagger
 * /clans/invites:
 *   get:
 *     summary: Get all pending clan invites sent to you
 *     tags: [Clans]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Pending clan invites }
 */
app.get("/clans/invites", auth, async (req, res) => {
  await ClanInvite.updateMany({ toId: req.user.id, status: "pending", expiresAt: { $lt: new Date() } }, { status: "expired" });
  const invites = await ClanInvite.find({ toId: req.user.id, status: "pending" });
  res.json({ invites });
});

/**
 * @swagger
 * /clans/{clanId}:
 *   get:
 *     summary: Get public clan info and member list
 *     tags: [Clans]
 *     parameters:
 *       - in: path
 *         name: clanId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Clan info }
 *       404: { description: Clan not found }
 *   patch:
 *     summary: Update clan description, emblem, or open status (leader/officer only)
 *     tags: [Clans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: clanId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               description: { type: string }
 *               emblem:      { type: string }
 *               isOpen:      { type: boolean }
 *     responses:
 *       200: { description: Clan updated }
 *       403: { description: Insufficient role }
 *   delete:
 *     summary: Disband the clan (leader only)
 *     tags: [Clans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: clanId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Clan disbanded }
 *       403: { description: Not the leader }
 */
app.get("/clans/:clanId", async (req, res) => {
  const clan = await Clan.findById(req.params.clanId);
  if (!clan) return res.status(404).json({ message: "Clan not found" });
  res.json({ clan, members: clan.members });
});

app.patch("/clans/:clanId", auth, async (req, res) => {
  const clan = await Clan.findById(req.params.clanId);
  if (!clan) return res.status(404).json({ message: "Clan not found" });
  const member = clan.members.find(m => m.userId.equals(req.user.id));
  if (!member || !["leader", "officer"].includes(member.role)) return res.status(403).json({ message: "Insufficient role" });

  const { description, emblem, isOpen } = req.body;
  if (description !== undefined) clan.description = description.slice(0, 200);
  if (emblem      !== undefined) clan.emblem       = emblem;
  if (isOpen      !== undefined) clan.isOpen       = isOpen;
  await clan.save();
  res.json({ message: "Clan updated", clan });
});

/**
 * @swagger
 * /clans/{clanId}/join:
 *   post:
 *     summary: Join an open clan (no invite needed)
 *     tags: [Clans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: clanId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Joined clan }
 *       403: { description: Clan is invite-only }
 *       400: { description: Already in a clan or clan full }
 */
app.post("/clans/:clanId/join", auth, async (req, res) => {
  const me   = await User.findById(req.user.id);
  const clan = await Clan.findById(req.params.clanId);
  if (!clan)     return res.status(404).json({ message: "Clan not found" });
  if (me.clanId) return res.status(400).json({ message: "Already in a clan" });
  if (!clan.isOpen) return res.status(403).json({ message: "Clan is invite-only" });
  if (clan.members.length >= 30) return res.status(400).json({ message: "Clan is full" });

  clan.members.push({ userId: me._id, name: me.name, role: "member" });
  await clan.save();
  me.clanId = clan._id;
  await me.save();
  res.json({ message: "Joined clan", clan });
});

/**
 * @swagger
 * /clans/leave:
 *   post:
 *     summary: Leave your current clan
 *     tags: [Clans]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Left clan }
 *       409: { description: Leader must transfer or disband first }
 */
app.post("/clans/leave", auth, async (req, res) => {
  const me   = await User.findById(req.user.id);
  if (!me.clanId) return res.status(400).json({ message: "Not in a clan" });
  const clan = await Clan.findById(me.clanId);
  if (!clan) { me.clanId = null; await me.save(); return res.json({ message: "Left clan" }); }

  const member = clan.members.find(m => m.userId.equals(me._id));
  if (member?.role === "leader") {
    if (clan.members.length === 1) {
      await Clan.findByIdAndDelete(clan._id);
      await User.updateMany({ clanId: clan._id }, { clanId: null });
      return res.json({ message: "Left clan (clan disbanded — no members remaining)" });
    }
    return res.status(409).json({ message: "Transfer leadership or disband before leaving" });
  }

  clan.members = clan.members.filter(m => !m.userId.equals(me._id));
  await clan.save();
  me.clanId = null;
  await me.save();
  res.json({ message: "Left clan" });
});

app.delete("/clans/:clanId", auth, async (req, res) => {
  const clan = await Clan.findById(req.params.clanId);
  if (!clan) return res.status(404).json({ message: "Clan not found" });
  if (!clan.leaderId.equals(req.user.id)) return res.status(403).json({ message: "Only the leader can disband" });

  const memberIds = clan.members.map(m => m.userId);
  await Promise.all([
    User.updateMany({ _id: { $in: memberIds } }, { clanId: null }),
    ClanInvite.deleteMany({ clanId: clan._id }),
    ClanMessage.deleteMany({ clanId: clan._id }),
    clan.deleteOne(),
  ]);
  res.json({ message: "Clan disbanded" });
});

/**
 * @swagger
 * /clans/{clanId}/invite:
 *   post:
 *     summary: Invite a player to the clan (leader/officer only)
 *     tags: [Clans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: clanId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [targetName]
 *             properties:
 *               targetName: { type: string, example: PlayerFive }
 *     responses:
 *       201: { description: Invitation sent }
 *       403: { description: Insufficient role }
 *       409: { description: Invite already exists }
 */
app.post("/clans/:clanId/invite", auth, async (req, res) => {
  const { targetName } = req.body;
  if (!targetName) return res.status(400).json({ message: "targetName is required" });
  if (!rateLimit(req.user.id, "clan_invite", 20, 60 * 60 * 1000))
    return res.status(429).json({ message: "Too many invites" });

  const [clan, target] = await Promise.all([
    Clan.findById(req.params.clanId),
    User.findOne({ name: targetName }),
  ]);
  if (!clan)   return res.status(404).json({ message: "Clan not found" });
  if (!target) return res.status(404).json({ message: "User not found" });

  const senderMember = clan.members.find(m => m.userId.equals(req.user.id));
  if (!senderMember || !["leader", "officer"].includes(senderMember.role))
    return res.status(403).json({ message: "Insufficient role" });

  if (target.clanId) return res.status(400).json({ message: "Player is already in a clan" });
  if (clan.members.length >= 30) return res.status(400).json({ message: "Clan is full" });

  const pending = await ClanInvite.countDocuments({ clanId: clan._id, status: "pending", expiresAt: { $gt: new Date() } });
  if (pending >= 10) return res.status(400).json({ message: "Max 10 pending invites at a time" });

  const dup = await ClanInvite.findOne({ clanId: clan._id, toId: target._id, status: "pending" });
  if (dup) return res.status(409).json({ message: "Pending invite already exists for this player" });

  const sender = await User.findById(req.user.id, { name: 1 });
  const invite = await ClanInvite.create({
    clanId: clan._id, clanName: clan.name, clanTag: clan.tag,
    fromId: sender._id, fromName: sender.name, toId: target._id,
  });

  await createNotification(target._id, "clan_invite", "Clan Invite", `${sender.name} invited you to join [${clan.tag}] ${clan.name}.`, { inviteId: invite._id, clanName: clan.name });
  pushToUser(target._id, { type: "clan_invite_received", payload: { invite } });

  res.status(201).json({ message: "Invitation sent", invite });
});

/**
 * @swagger
 * /clans/invites/{inviteId}/accept:
 *   post:
 *     summary: Accept a clan invite
 *     tags: [Clans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: inviteId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Joined clan }
 *       409: { description: Expired, already in clan, or clan full }
 */
app.post("/clans/invites/:inviteId/accept", auth, async (req, res) => {
  await ClanInvite.updateMany({ status: "pending", expiresAt: { $lt: new Date() } }, { status: "expired" });
  const invite = await ClanInvite.findById(req.params.inviteId);
  if (!invite) return res.status(404).json({ message: "Invite not found" });
  if (!invite.toId.equals(req.user.id)) return res.status(403).json({ message: "Not the invitee" });
  if (invite.status !== "pending") return res.status(409).json({ message: `Invite is ${invite.status}` });

  const [me, clan] = await Promise.all([
    User.findById(req.user.id),
    Clan.findById(invite.clanId),
  ]);
  if (!clan)    return res.status(404).json({ message: "Clan no longer exists" });
  if (me.clanId) return res.status(409).json({ message: "Already in a clan" });
  if (clan.members.length >= 30) return res.status(409).json({ message: "Clan is full" });

  clan.members.push({ userId: me._id, name: me.name, role: "member" });
  await clan.save();
  me.clanId = clan._id;
  await me.save();
  invite.status = "accepted";
  await invite.save();

  res.json({ message: "Joined clan", clan });
});

/**
 * @swagger
 * /clans/invites/{inviteId}/reject:
 *   post:
 *     summary: Reject a clan invite
 *     tags: [Clans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: inviteId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Invite rejected }
 */
app.post("/clans/invites/:inviteId/reject", auth, async (req, res) => {
  const invite = await ClanInvite.findById(req.params.inviteId);
  if (!invite) return res.status(404).json({ message: "Invite not found" });
  if (!invite.toId.equals(req.user.id)) return res.status(403).json({ message: "Not the invitee" });
  invite.status = "rejected";
  await invite.save();
  res.json({ message: "Invite rejected" });
});

/**
 * @swagger
 * /clans/{clanId}/members/{targetName}:
 *   delete:
 *     summary: Kick a member from the clan
 *     tags: [Clans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: clanId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: targetName
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Member kicked }
 *       403: { description: Insufficient role }
 */
app.delete("/clans/:clanId/members/:targetName", auth, async (req, res) => {
  const [clan, target] = await Promise.all([
    Clan.findById(req.params.clanId),
    User.findOne({ name: req.params.targetName }),
  ]);
  if (!clan)   return res.status(404).json({ message: "Clan not found" });
  if (!target) return res.status(404).json({ message: "User not found" });

  const kicker = clan.members.find(m => m.userId.equals(req.user.id));
  const victim = clan.members.find(m => m.userId.equals(target._id));
  if (!kicker || !victim) return res.status(404).json({ message: "Member not found" });

  if (kicker.role === "officer" && victim.role !== "member")
    return res.status(403).json({ message: "Officers can only kick members" });
  if (kicker.role === "member")
    return res.status(403).json({ message: "Insufficient role" });
  if (victim.userId.equals(req.user.id))
    return res.status(400).json({ message: "Use /clans/leave to leave" });

  clan.members = clan.members.filter(m => !m.userId.equals(target._id));
  await clan.save();
  target.clanId = null;
  await target.save();

  await createNotification(target._id, "clan_kick", "Kicked from Clan", `You were kicked from [${clan.tag}] ${clan.name}.`, { clanId: clan._id, clanName: clan.name });
  pushToUser(target._id, { type: "clan_kicked", payload: { clanId: clan._id, clanName: clan.name } });

  res.json({ message: "Member kicked" });
});

/**
 * @swagger
 * /clans/{clanId}/members/{targetName}/promote:
 *   post:
 *     summary: Promote a member to officer (leader only)
 *     tags: [Clans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: clanId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: targetName
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Member promoted to officer }
 *       403: { description: Not leader }
 */
app.post("/clans/:clanId/members/:targetName/promote", auth, async (req, res) => {
  const clan = await Clan.findById(req.params.clanId);
  if (!clan) return res.status(404).json({ message: "Clan not found" });
  if (!clan.leaderId.equals(req.user.id)) return res.status(403).json({ message: "Only leader can promote" });

  const member = clan.members.find(m => m.name === req.params.targetName);
  if (!member) return res.status(404).json({ message: "Member not found" });
  if (member.role !== "member") return res.status(400).json({ message: "Member is already officer or leader" });

  member.role = "officer";
  await clan.save();
  res.json({ message: "Member promoted to officer" });
});

/**
 * @swagger
 * /clans/{clanId}/members/{targetName}/demote:
 *   post:
 *     summary: Demote an officer to member (leader only)
 *     tags: [Clans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: clanId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: targetName
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Officer demoted to member }
 *       403: { description: Not leader }
 */
app.post("/clans/:clanId/members/:targetName/demote", auth, async (req, res) => {
  const clan = await Clan.findById(req.params.clanId);
  if (!clan) return res.status(404).json({ message: "Clan not found" });
  if (!clan.leaderId.equals(req.user.id)) return res.status(403).json({ message: "Only leader can demote" });

  const member = clan.members.find(m => m.name === req.params.targetName);
  if (!member) return res.status(404).json({ message: "Member not found" });
  if (member.role !== "officer") return res.status(400).json({ message: "Member is not an officer" });

  member.role = "member";
  await clan.save();
  res.json({ message: "Officer demoted to member" });
});

/**
 * @swagger
 * /clans/{clanId}/transfer:
 *   post:
 *     summary: Transfer leadership to another member (leader only)
 *     tags: [Clans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: clanId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [targetName]
 *             properties:
 *               targetName: { type: string, example: PlayerTwo }
 *     responses:
 *       200: { description: Leadership transferred }
 *       403: { description: Not the leader }
 */
app.post("/clans/:clanId/transfer", auth, async (req, res) => {
  const { targetName } = req.body;
  const clan = await Clan.findById(req.params.clanId);
  if (!clan) return res.status(404).json({ message: "Clan not found" });
  if (!clan.leaderId.equals(req.user.id)) return res.status(403).json({ message: "Only the leader can transfer leadership" });

  const newLeaderMember = clan.members.find(m => m.name === targetName);
  if (!newLeaderMember) return res.status(404).json({ message: "Member not found" });

  const oldLeaderMember = clan.members.find(m => m.userId.equals(req.user.id));
  newLeaderMember.role = "leader";
  oldLeaderMember.role = "officer";
  clan.leaderId    = newLeaderMember.userId;
  clan.leaderName  = newLeaderMember.name;
  await clan.save();
  res.json({ message: "Leadership transferred" });
});

// ─── Clan Chat ────────────────────────────────────────────

/**
 * @swagger
 * /clans/{clanId}/chat:
 *   get:
 *     summary: Get clan chat history (members only)
 *     tags: [Clan Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: clanId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
 *       - in: query
 *         name: before
 *         schema: { type: string }
 *         description: messageId cursor for pagination
 *     responses:
 *       200: { description: Chat messages }
 *       403: { description: Not a clan member }
 *   post:
 *     summary: Send a message to clan chat (members only, 10/min limit)
 *     tags: [Clan Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: clanId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [content]
 *             properties:
 *               content: { type: string, example: "gg everyone!" }
 *     responses:
 *       201: { description: Message sent }
 *       403: { description: Not a clan member }
 *       429: { description: Rate limited }
 */
app.get("/clans/:clanId/chat", auth, async (req, res) => {
  const clan = await Clan.findById(req.params.clanId, { members: 1 });
  if (!clan) return res.status(404).json({ message: "Clan not found" });
  if (!clan.members.some(m => m.userId.equals(req.user.id)))
    return res.status(403).json({ message: "Not a clan member" });

  const limit  = Math.min(parseInt(req.query.limit) || 50, 100);
  const before = req.query.before;
  const query  = { clanId: req.params.clanId };
  if (before) {
    const pivot = await ClanMessage.findById(before);
    if (pivot) query.createdAt = { $lt: pivot.createdAt };
  }

  const messages = await ClanMessage.find(query).sort({ createdAt: -1 }).limit(limit + 1);
  const hasMore  = messages.length > limit;
  if (hasMore) messages.pop();
  res.json({ messages: messages.reverse(), hasMore });
});

app.post("/clans/:clanId/chat", auth, async (req, res) => {
  const { content } = req.body;
  if (!content?.trim())          return res.status(400).json({ message: "content is required" });
  if (content.trim().length > 500) return res.status(400).json({ message: "Message too long (max 500 chars)" });
  if (!rateLimit(req.user.id, "clan_chat", 10, 60 * 1000))
    return res.status(429).json({ message: "Sending too fast" });

  const clan = await Clan.findById(req.params.clanId, { members: 1 });
  if (!clan) return res.status(404).json({ message: "Clan not found" });
  const member = clan.members.find(m => m.userId.equals(req.user.id));
  if (!member) return res.status(403).json({ message: "Not a clan member" });

  const msg = await ClanMessage.create({
    clanId: req.params.clanId, fromId: req.user.id,
    fromName: req.user.name, fromRole: member.role,
    content: content.trim(),
  });

  // Push to all online clan members
  clan.members.forEach(m => {
    if (!m.userId.equals(req.user.id)) {
      pushToUser(m.userId, { type: "clan_message_received", payload: { message: msg } });
    }
  });

  res.status(201).json({ message: msg });
});

// ─── Notifications ────────────────────────────────────────

/**
 * @swagger
 * /notifications:
 *   get:
 *     summary: Get your notifications
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 30 }
 *       - in: query
 *         name: unreadOnly
 *         schema: { type: boolean, default: false }
 *     responses:
 *       200: { description: Notifications list }
 */
app.get("/notifications", auth, async (req, res) => {
  const limit      = Math.min(parseInt(req.query.limit) || 30, 100);
  const unreadOnly = req.query.unreadOnly === "true";
  const filter     = { userId: req.user.id };
  if (unreadOnly) filter.readAt = null;

  const [notifications, unreadCount] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).limit(limit),
    Notification.countDocuments({ userId: req.user.id, readAt: null }),
  ]);
  res.json({ notifications, unreadCount });
});

/**
 * @swagger
 * /notifications/{notificationId}/read:
 *   post:
 *     summary: Mark a notification as read
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: notificationId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Marked as read }
 */
app.post("/notifications/:notificationId/read", auth, async (req, res) => {
  await Notification.findOneAndUpdate({ _id: req.params.notificationId, userId: req.user.id }, { readAt: new Date() });
  res.json({ ok: true });
});

/**
 * @swagger
 * /notifications/read-all:
 *   post:
 *     summary: Mark all notifications as read
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: All marked as read }
 */
app.post("/notifications/read-all", auth, async (req, res) => {
  const result = await Notification.updateMany({ userId: req.user.id, readAt: null }, { readAt: new Date() });
  res.json({ marked: result.modifiedCount });
});

/**
 * @swagger
 * /notifications/unread-count:
 *   get:
 *     summary: Get unread notification count (for navbar badge)
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Unread count }
 */
app.get("/notifications/unread-count", auth, async (req, res) => {
  const count = await Notification.countDocuments({ userId: req.user.id, readAt: null });
  res.json({ count });
});

// ─── Player Search ────────────────────────────────────────

/**
 * @swagger
 * /players/search:
 *   get:
 *     summary: Search players by name (public)
 *     tags: [Players]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema: { type: string }
 *         description: Partial name to search
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *     responses:
 *       200: { description: Matching players }
 *       400: { description: q is required }
 */
app.get("/players/search", async (req, res) => {
  const { q, limit = 10 } = req.query;
  if (!q) return res.status(400).json({ message: "q is required" });
  if (!rateLimit("global", "player_search", 30, 60 * 1000))
    return res.status(429).json({ message: "Search rate limit exceeded" });

  const users = await User.find(
    { name: { $regex: q, $options: "i" } },
    { name: 1, level: 1, clanId: 1, onlineAt: 1 }
  ).limit(Math.min(parseInt(limit), 20));

  const players = await Promise.all(users.map(async u => {
    let clanTag = null;
    if (u.clanId) {
      const c = await Clan.findById(u.clanId, { tag: 1 });
      if (c) clanTag = c.tag;
    }
    return { name: u.name, account: { level: u.level }, clanTag, isOnline: isUserOnline(u.onlineAt) };
  }));

  res.json({ players });
});

// ─── Online Players ───────────────────────────────────────

/**
 * @swagger
 * /players/online:
 *   get:
 *     summary: Get the number of currently online players (no auth required)
 *     tags: [Players]
 *     responses:
 *       200:
 *         description: Online player count
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 online:
 *                   type: integer
 *                   example: 42
 *                 since:
 *                   type: string
 *                   format: date-time
 *                   description: Cutoff timestamp (players active after this are considered online)
 */
app.get("/players/online", async (req, res) => {
  const cutoff = new Date(Date.now() - 2 * 60 * 1000);
  const online = await User.countDocuments({ onlineAt: { $gte: cutoff } });
  res.json({ online, since: cutoff.toISOString() });
});

// ─── Health ───────────────────────────────────────────────

app.get("/", (req, res) => {
  res.json({ status: "ok", message: "NEON CITY backend is running" });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
