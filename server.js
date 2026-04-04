const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const swaggerUi = require("swagger-ui-express");
const swaggerJsdoc = require("swagger-jsdoc");

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || "your_secret_key_change_this_in_production";

// middlewares
app.use(cors());
app.use(express.json());

// swagger setup
const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Game Backend API",
      version: "1.0.0",
      description: "API for game backend — auth, scores, leaderboard, inventory",
    },
  },
  apis: ["./server.js"],
});
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// MongoDB
mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/game");
console.log("MongoDB подключена");

// ─── Models ───────────────────────────────────────────────

// ─── Battle Pass XP Table ─────────────────────────────────
// Index 0 = XP needed to go from level 1 to 2
// Index 1 = XP needed to go from level 2 to 3
// Add as many levels as you want. Levels beyond the table use the last value.
const BP_XP_TABLE = [
  200,   // level 1 → 2
  500,   // level 2 → 3
  900,   // level 3 → 4
  1400,  // level 4 → 5
  2000,  // level 5 → 6
  2700,  // level 6 → 7
  3500,  // level 7 → 8
  4400,  // level 8 → 9
  5400,  // level 9 → 10
  6500,  // level 10 → 11
];

function getBpXpRequired(level) {
  const idx = level - 1;
  return BP_XP_TABLE[idx] ?? BP_XP_TABLE[BP_XP_TABLE.length - 1];
}

// Account level progress: each level needs 1.5x more XP than previous (100, 150, 225 ...)
function calcProgressInfo(xp) {
  let level = 1;
  let levelStart = 0;
  let required = 100;

  while (true) {
    if (xp < levelStart + required) {
      const xpInLevel = xp - levelStart;
      return {
        level,
        xp,
        xpInCurrentLevel:     xpInLevel,
        xpNeededForNextLevel: required - xpInLevel,
        progressPercent:      Math.min(Math.floor((xpInLevel / required) * 100), 100),
      };
    }
    levelStart += required;
    required = Math.floor(required * 1.5);
    level++;
  }
}

// Battle pass level progress: uses BP_XP_TABLE
function calcBpProgressInfo(bpXp) {
  let level = 1;
  let levelStart = 0;

  while (true) {
    const required = getBpXpRequired(level);
    if (bpXp < levelStart + required) {
      const xpInLevel = bpXp - levelStart;
      return {
        level,
        xp:                   bpXp,
        xpInCurrentLevel:     xpInLevel,
        xpNeededForNextLevel: required - xpInLevel,
        progressPercent:      Math.min(Math.floor((xpInLevel / required) * 100), 100),
      };
    }
    levelStart += required;
    level++;
  }
}

// Comment
function calcLevel(xp) {
  return calcProgressInfo(xp).level;
}

function calcBpLevel(bpXp) {
  return calcBpProgressInfo(bpXp).level;
}

const UserSchema = new mongoose.Schema({
  name:      { type: String, required: true, unique: true },
  email:     { type: String, required: true, unique: true },
  password:  { type: String, required: true },
  inventory: [{ type: String }],
  xp:      { type: Number, default: 0 },
  level:   { type: Number, default: 1 },
  nex:     { type: Number, default: 0 },
  bpXp:    { type: Number, default: 0 },
  bpLevel: { type: Number, default: 1 },
}, { timestamps: true });

UserSchema.pre("save", async function () {
  this.level   = calcLevel(this.xp);
  this.bpLevel = calcBpLevel(this.bpXp);
});

const User = mongoose.model("User", UserSchema);

const PlayerSchema = new mongoose.Schema({
  name:   { type: String, required: true },
  time:   Number,
  money:  Number,
  points: Number,
});

const Player = mongoose.model("Player", PlayerSchema);

// ─── Auth ─────────────────────────────────────────────────

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password]
 *             properties:
 *               name:
 *                 type: string
 *                 example: "PlayerOne"
 *               email:
 *                 type: string
 *                 example: "player@example.com"
 *               password:
 *                 type: string
 *                 example: "secret123"
 *     responses:
 *       201:
 *         description: User registered successfully
 *       400:
 *         description: Missing fields / name or email already taken
 */
app.post("/auth/register", async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ message: "name, email and password are required" });
  }

  const nameExists  = await User.findOne({ name });
  if (nameExists) {
    return res.status(400).json({ message: "This name is already taken" });
  }

  const emailExists = await User.findOne({ email });
  if (emailExists) {
    return res.status(400).json({ message: "This email is already registered" });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = await new User({ name, email, password: hashedPassword }).save();

  res.status(201).json({
    message: "Registered successfully",
    user: { id: user._id, name: user.name, email: user.email },
  });
});

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login with name or email and password
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, password]
 *             properties:
 *               name:
 *                 type: string
 *                 example: "PlayerOne"
 *               password:
 *                 type: string
 *                 example: "secret123"
 *     responses:
 *       200:
 *         description: Login successful, returns JWT token
 *       400:
 *         description: Missing fields
 *       401:
 *         description: Invalid name or password
 */
app.post("/auth/login", async (req, res) => {
  const { name, password } = req.body;

  if (!name || !password) {
    return res.status(400).json({ message: "name and password are required" });
  }

  const user = await User.findOne({ $or: [{ name }, { email: name }] });
  if (!user) {
    return res.status(401).json({ message: "Invalid name/email or password" });
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return res.status(401).json({ message: "Invalid name or password" });
  }

  const token = jwt.sign({ id: user._id, name: user.name }, JWT_SECRET, { expiresIn: "7d" });

  res.json({
    message: "Login successful",
    token,
    user: { id: user._id, name: user.name, email: user.email },
  });
});

/**
 * @swagger
 * /auth/delete:
 *   delete:
 *     summary: Delete a registered user by name
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *                 example: "PlayerOne"
 *     responses:
 *       200:
 *         description: User deleted
 *       400:
 *         description: name is required
 *       404:
 *         description: User not found
 */
app.delete("/auth/delete", async (req, res) => {
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ message: "name is required" });
  }

  const user = await User.findOneAndDelete({ name });
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  res.json({ message: "User deleted" });
});

/**
 * @swagger
 * /auth/users:
 *   get:
 *     summary: Get all registered users (name and email only)
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: List of all users
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                   name:
 *                     type: string
 *                   email:
 *                     type: string
 */
app.get("/auth/users", async (req, res) => {
  const users = await User.find({}, { name: 1, email: 1 });
  res.json(users);
});

// ─── Profile ──────────────────────────────────────────────

/**
 * @swagger
 * /profile/{name}:
 *   get:
 *     summary: Get user profile (level, xp, nex)
 *     tags: [Profile]
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *         example: "PlayerOne"
 *     responses:
 *       200:
 *         description: User profile
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 name:
 *                   type: string
 *                 level:
 *                   type: number
 *                 xp:
 *                   type: number
 *                 nex:
 *                   type: number
 *                 xpForNextLevel:
 *                   type: number
 *       404:
 *         description: User not found
 */
app.get("/profile/:name", async (req, res) => {
  const user = await User.findOne({ name: req.params.name }, { name: 1, level: 1, xp: 1, nex: 1, bpXp: 1, bpLevel: 1 });
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  const accountProgress    = calcProgressInfo(user.xp);
  const battlePassProgress = calcBpProgressInfo(user.bpXp);

  res.json({
    id:   user._id,
    name: user.name,
    nex:  user.nex,
    account: {
      level:               accountProgress.level,
      xp:                  accountProgress.xp,
      xpInCurrentLevel:    accountProgress.xpInCurrentLevel,
      xpNeededForNextLevel: accountProgress.xpNeededForNextLevel,
      progressPercent:     accountProgress.progressPercent,
    },
    battlePass: {
      level:               battlePassProgress.level,
      xp:                  battlePassProgress.xp,
      xpInCurrentLevel:    battlePassProgress.xpInCurrentLevel,
      xpNeededForNextLevel: battlePassProgress.xpNeededForNextLevel,
      progressPercent:     battlePassProgress.progressPercent,
    },
  });
});

/**
 * @swagger
 * /profile/update:
 *   post:
 *     summary: Add xp and/or nex to a user
 *     tags: [Profile]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *                 example: "PlayerOne"
 *               xp:
 *                 type: number
 *                 example: 150
 *               nex:
 *                 type: number
 *                 example: 500
 *               bpXp:
 *                 type: number
 *                 example: 200
 *     responses:
 *       200:
 *         description: Profile updated, returns new stats
 *       400:
 *         description: name is required
 *       404:
 *         description: User not found
 */
app.post("/profile/update", async (req, res) => {
  const { name, xp, nex, bpXp } = req.body;

  if (!name) {
    return res.status(400).json({ message: "name is required" });
  }

  const user = await User.findOne({ name });
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  if (xp   !== undefined) user.xp   += xp;
  if (nex  !== undefined) user.nex  += nex;
  if (bpXp !== undefined) user.bpXp += bpXp;

  await user.save(); // level and bpLevel auto-recalculate via pre-save hook

  const accountProgress    = calcProgressInfo(user.xp);
  const battlePassProgress = calcBpProgressInfo(user.bpXp);

  res.json({
    message: "Profile updated",
    id:   user._id,
    name: user.name,
    nex:  user.nex,
    account: {
      level:               accountProgress.level,
      xp:                  accountProgress.xp,
      xpInCurrentLevel:    accountProgress.xpInCurrentLevel,
      xpNeededForNextLevel: accountProgress.xpNeededForNextLevel,
      progressPercent:     accountProgress.progressPercent,
    },
    battlePass: {
      level:               battlePassProgress.level,
      xp:                  battlePassProgress.xp,
      xpInCurrentLevel:    battlePassProgress.xpInCurrentLevel,
      xpNeededForNextLevel: battlePassProgress.xpNeededForNextLevel,
      progressPercent:     battlePassProgress.progressPercent,
    },
  });
});

// ─── Inventory ────────────────────────────────────────────

/**
 * @swagger
 * /inventory/add:
 *   post:
 *     summary: Add an item to a user's inventory
 *     tags: [Inventory]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, item]
 *             properties:
 *               name:
 *                 type: string
 *                 example: "PlayerOne"
 *               item:
 *                 type: string
 *                 example: "sword"
 *     responses:
 *       200:
 *         description: Item added
 *       400:
 *         description: Missing fields
 *       404:
 *         description: User not found
 */
app.post("/inventory/add", async (req, res) => {
  const { name, item } = req.body;

  if (!name || !item) {
    return res.status(400).json({ message: "name and item are required" });
  }

  const user = await User.findOne({ name });
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  user.inventory.push(item);
  await user.save();

  res.json({ message: "Item added", inventory: user.inventory });
});

/**
 * @swagger
 * /inventory/{name}:
 *   get:
 *     summary: Get all items in a user's inventory
 *     tags: [Inventory]
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *         example: "PlayerOne"
 *     responses:
 *       200:
 *         description: User's inventory
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 name:
 *                   type: string
 *                 inventory:
 *                   type: array
 *                   items:
 *                     type: string
 *       404:
 *         description: User not found
 */
app.get("/inventory/:name", async (req, res) => {
  const user = await User.findOne({ name: req.params.name }, { name: 1, inventory: 1 });
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }
  res.json({ name: user.name, inventory: user.inventory });
});

// ─── Scores ───────────────────────────────────────────────

/**
 * @swagger
 * /save-score:
 *   post:
 *     summary: Save player score data
 *     tags: [Scores]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *                 example: "PlayerOne"
 *               time:
 *                 type: number
 *                 example: 120
 *               money:
 *                 type: number
 *                 example: 500
 *               points:
 *                 type: number
 *                 example: 1500
 *     responses:
 *       200:
 *         description: Data saved
 *       400:
 *         description: name is required
 */
app.post("/save-score", async (req, res) => {
  const { name, time, money, points } = req.body;

  if (!name) {
    return res.status(400).json({ message: "name is required" });
  }

  const existing = await Player.findOne({ name });

  if (existing) {
    if (time !== undefined) existing.time = time;
    if (money !== undefined) existing.money = money;
    if (points !== undefined && points > (existing.points || 0)) existing.points = points;
    await existing.save();
  } else {
    await new Player({ name, time, money, points }).save();
  }

  res.json({ message: "Data saved" });
});

/**
 * @swagger
 * /leaderboard:
 *   get:
 *     summary: Get top 10 players by points
 *     tags: [Scores]
 *     responses:
 *       200:
 *         description: Top 10 players
 */
app.get("/leaderboard", async (req, res) => {
  const players = await Player.find().sort({ points: -1 }).limit(10);
  res.json(players);
});

/**
 * @swagger
 * /update-player:
 *   put:
 *     summary: Update player score data by name
 *     tags: [Scores]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *                 example: "PlayerOne"
 *               time:
 *                 type: number
 *                 example: 120
 *               money:
 *                 type: number
 *                 example: 1200
 *               points:
 *                 type: number
 *                 example: 1500
 *     responses:
 *       200:
 *         description: Player updated
 *       400:
 *         description: name is required
 *       404:
 *         description: Player not found
 */
app.put("/update-player", async (req, res) => {
  const { name, time, money, points } = req.body;

  if (!name) {
    return res.status(400).json({ message: "name is required" });
  }

  const player = await Player.findOne({ name });
  if (!player) {
    return res.status(404).json({ message: "Player not found" });
  }

  if (time !== undefined) player.time = time;
  if (money !== undefined) player.money = money;
  if (points !== undefined) player.points = points;

  await player.save();
  res.json({ message: "Player updated", player });
});

/**
 * @swagger
 * /delete-all:
 *   delete:
 *     summary: Delete all player score data
 *     tags: [Scores]
 *     responses:
 *       200:
 *         description: All data deleted
 */
app.delete("/delete-all", async (req, res) => {
  await Player.deleteMany({});
  res.json({ message: "All data deleted" });
});

// ─── Health ───────────────────────────────────────────────

app.get("/", (req, res) => {
  res.json({ status: "ok", message: "Game backend is running" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Сервер запущен на http://localhost:${PORT}`);
});
