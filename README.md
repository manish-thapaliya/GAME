# 🇳🇵 Maitighar Mayhem — माइतीघर महेम (a.k.a. Kathmandu Kombat)

A complete, browser-based **2D multiplayer fighting game** inspired by *FightKaro / Sansad Showdown*, culturally localized for **Nepal**. Two players connect via a 4-character room code and brawl on the **"Maitighar Mandala"** stage as satirical representatives of **Nepali government bodies**.

> **यो खेल पूर्ण रूपमा काल्पनिक र व्यङ्गात्मक हो।**
> *This game is purely fictional and satirical.* No real politician, party, or state institution is endorsed or defamed.

---

## 🛠 Tech Stack

| Layer     | Technology                                        |
|-----------|---------------------------------------------------|
| Frontend  | HTML5, CSS3, **Phaser 3** (CDN), Vanilla JS       |
| Backend   | **Node.js + Express + Socket.io** (authoritative 30 Hz game loop) |
| Packages  | npm                                               |

## 📂 File Structure

```
maitighar-mayhem/
├── package.json        # deps + start/dev scripts
├── server.js           # Node + Express + Socket.io authoritative backend
├── public/
│   ├── index.html      # Landing page: Host Room / Join Room UI + roster
│   ├── style.css       # Modern UI, Nepali crimson-red & gold accents
│   └── game.js         # Phaser 3 client: lobby wiring, sync, fight scene
└── README.md           # You are here
```

---

## 🚀 Run Locally

**Prerequisite:** Node.js ≥ 16 ([nodejs.org](https://nodejs.org))

```bash
# 1. Install dependencies
npm install

# 2. Start the server (serves the game AND the socket backend on port 3000)
npm start
```

Open **http://localhost:3000** in two browser tabs/windows:

1. Tab A → click **Host Room (कोठ बनाउनुहोस्)** → a 4-character **Room Code (कोड)** appears.
2. Tab B → type that code into **Join Room Code** → **Join (सामेल हुनुहोस्)**.
3. Both clients get a 3-second countdown, then enter the arena. First to win **2 of 3 rounds** takes the match.

For auto-restart during development: `npm run dev` (uses `nodemon`).

> Change the port with `PORT=8080 npm start`. LAN play works out of the box — the startup banner prints your network URLs.

---

## 🎮 Controls (both players share the keyboard layout)

| Action                        | Key          | नेपाली             |
|-------------------------------|--------------|--------------------|
| Move Left / Right             | `A` / `D`    | हिँड्नुहोस्         |
| Jump                          | `W`          | उफ्रनुहोस्         |
| Crouch                        | `S`          | झुक्नुहोस्         |
| Punch (−10 HP)                | `J`          | मुक्का             |
| Kick (−10 HP, bigger knockback)| `K`         | गुडा              |
| Super Move (−30 HP, needs full Prana) | `L`  | महाप्रहार         |

- **Health: स्वास्थ्य** (0–100). At 0 → round KO.
- **Prana: प्राण** (0–100) builds by dealing/taking hits and regenerates slowly; at 100 the golden meter pulses and `L` unleashes the super.
- Match end shows **विजयी! (Victory!)** / **पराजित! (Defeated!)**, with a **Rematch (फेरि लड्नुहोस्)** button.

---

## 🏛️ Nepali Government Bodies Roster (Satirical)

Every fighter slot represents a fictionalised version of a real Nepali state institution (Player 1 = *The Veteran*, crimson red; Player 2 = *The Youth*, deep blue):

Office of the President · Office of the PM & Council of Ministers · House of Representatives (प्रतिनिधि सभा) · National Assembly (राष्ट्रिय सभा) · Supreme Court of Nepal (सर्वोच्च अदालत) · Election Commission of Nepal (निर्वाचन आयोग) · CIAAST (विमान उडान अनुसन्धान आयोग) · Attorney General's Office (महान्यायाधिवक्ता) · Nepali Army (नेपाली सेना) · Nepal Police (नेपाल प्रहरी) · Armed Police Force (सशस्त्र प्रहरी बल) · Office of the Auditor General (महालेखा नियन्त्रक) · National Planning Commission (राष्ट्रिय योजना आयोग) · Secretariat to the Government of Nepal (सचिवालय) · Language Commission (भाषा आयोग) · Press Council Nepal (प्रेस काउन्सिल नेपाल)

The full machine-readable list is served at **`GET /api/roster`**.

---

## 🌐 Architecture Notes

- **Authoritative server:** all physics, hitboxes, damage, knockback and round logic run in `server.js` at a fixed 30 Hz tick. Clients only send inputs and render interpolated snapshots (`x, y, health, prana, anim, facing, attack…`) — this prevents desync and trivial cheating.
- **Rooms:** `room:host` generates a unique 4-char code (no look-alike glyphs like `0/O`, `1/I`); rooms hold max 2 players; empty/stale rooms are garbage-collected after 30 min idle.
- **Disconnect handling:** leaving mid-round awards the round to the remaining player; closing both sockets deletes the room; clients show a friendly toast in English + Nepali.
- **Debug endpoints:** `/api/health`, `/api/rooms`, `/api/roster`.

## 🎨 Asset Handling (placeholders → real art)

No image assets ship yet — everything is drawn with Phaser primitives (`this.add.rectangle`, `this.add.circle`, `Graphics`). In `public/game.js` you'll find clearly marked blocks showing exactly where to swap them out:

```js
// In BootScene.preload():
this.load.image('bg-maitighar', 'assets/bg/maitighar_mandala.png');
this.load.spritesheet('veteran', 'assets/sprites/veteran.png', { frameWidth: 96, frameHeight: 170 });
this.load.spritesheet('youth',   'assets/sprites/youth.png',   { frameWidth: 96, frameHeight: 170 });
```

Drop files into `public/assets/` and replace the primitives flagged with `>>> REPLACE LATER <<<` markers in `drawStage()` and `createFighterPlaceholder()`.

---

## ☁️ Deploying

**Render / Railway / Fly.io (recommended — WebSockets need sticky-friendly infra):**
1. Create a Node.js service from this repo.
2. Build command: `npm install` · Start command: `npm start`.
3. Respect the platform-injected `PORT` env var (already handled in `server.js`).
4. Ensure WebSocket support is enabled (it is by default on Render/Railway).

**Heroku:**
```bash
heroku create maitighar-mayhem
echo "web: node server.js" > Procfile && git add Procfile
git commit -m "Procfile" && git push heroku main
```

**VPS (Ubuntu) with nginx + HTTPS (Socket.io prefers WSS in production):**
```bash
sudo apt install nodejs npm && npm install && pm2 start server.js --name mayhem && pm2 save
# then proxy_pass http://localhost:3000 with upgrade headers for /socket.io/
```

⚠️ Free static hosts (GitHub Pages, Netlify-only frontends) **cannot** run the Socket.io backend — you need a Node host.

---

## ✅ Verified Working

The room flow, input stream, punch/kick damage, knockback, Prana gain, best-of-3 rounds, localized victory/defeat payloads and graceful disconnects were validated end-to-end against the running server (`P1 hosted → P2 joined → 2-0 match → विजयी!/पराजित! delivered → opponent-left handled`).

**Known simplifications & next steps**
- Single shared keyboard layout for both players (fine for local testing; add per-side keybinds or gamepad support for same-keyboard play).
- Add blocking (hold back + guard), round intro announcer, sound effects (`this.load.audio` hooks already sketched), character-select screen wired to `/api/roster`, and client-side rollback prediction for high-latency matches.

*Built with HTML5 · CSS3 · Phaser 3 · Node.js · Express · Socket.io — शुभकामना!* 🇳🇵
