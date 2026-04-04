const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const swaggerUi = require("swagger-ui-express");
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

const NEX_ADD_REASONS  = ["game_session", "bonus", "admin"];
const XP_PER_LEVEL     = 1000; // flat for both account and battle pass

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
  res.json(buildProfile(user));
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
  res.json(buildProfile(user));
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

// ─── Health ───────────────────────────────────────────────

app.get("/", (req, res) => {
  res.json({ status: "ok", message: "NEON CITY backend is running" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
