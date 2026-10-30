/* =====================================================================
 * MAITIGHAR MAYHEM — public/game.js
 * Phaser 3 client: lobby wiring, Socket.io sync, and the "Maitighar
 * Mandala" fight scene. All visuals are drawn with Phaser Graphics /
 * primitives because there are no image assets yet.
 *
 * >>> ASSET REPLACEMENT GUIDE (do this when real art arrives) <<<
 *   In BootScene.preload() you would add, e.g.:
 *     this.load.image('bg-maitighar', 'assets/bg/maitighar.png');
 *     this.load.spritesheet('p1-veteran', 'assets/sprites/veteran.png',
 *                           { frameWidth: 96, frameHeight: 170 });
 *     this.load.spritesheet('p2-youth',  'assets/sprites/youth.png',
 *                           { frameWidth: 96, frameHeight: 170 });
 *   Then in FightScene.create()/drawFighter(), replace each
 *   this.add.rectangle(...) / this.add.circle(...) placeholder with a
 *   this.add.image(...).setTexture('p1-veteran') or an animated sprite
 *   driven by this.anims.generateFrameNumbers(). The markers below say
 *   exactly which primitive to swap out.
 * ===================================================================== */

'use strict';

/* ------------------------------------------------------------------ *
 * Shared constants (kept in sync with server.js — single source of   *
 * truth is the server; these mirror it for rendering only)           *
 * ------------------------------------------------------------------ */
const WORLD = { width: 1280, height: 720, groundY: 620 };
const FIGHTER = { w: 90, hStand: 170, hCrouch: 110 };
const ATTACK_VISUAL = {
  punch: { reach: 96, hbH: 44, offsetY: -96 },
  kick:  { reach: 120, hbH: 52, offsetY: -58 },
  super: { reach: 190, hbH: 150, offsetY: -90 }
};
const CRIMSON = 0xdc143c; // Player 1 (The Veteran)
const DEEPBLUE = 0x1e3a8a; // Player 2 (The Youth)
const GOLD = 0xd4af37;

/* ------------------------------------------------------------------ *
 * Global socket + session info (populated by the lobby code below)   *
 * ------------------------------------------------------------------ */
let socket = null;
const session = {
  side: null,        // 0 = P1 host, 1 = P2 guest
  code: null,
  youAre: '',
  latestState: null, // most recent authoritative snapshot from server
  gameOver: false
};

/* ================= BOOTSTRAP: DOM + SOCKET LOBBY ==================== */
document.addEventListener('DOMContentLoaded', function () {
  const $ = function (id) { return document.getElementById(id); };

  const landing = $('landing');
  const gameScreen = $('game-screen');
  const statusBox = $('statusBox');
  const codeBox = $('codeBox');
  const roomCodeDisplay = $('roomCodeDisplay');
  const seatInfo = $('seatInfo');
  const startGameBtn = $('startGameBtn');
  const roomInput = $('roomInput');
  const rematchBtn = $('rematchBtn');

  function setStatus(msg, kind) {
    statusBox.className = 'status' + (kind ? ' ' + kind : '');
    statusBox.innerHTML = msg;
  }

  /* ---- Connect to Socket.io (served by our own Node backend) ---- */
  socket = io();

  socket.on('connect', function () {
    setStatus('Connected to server &middot; <span class="ne">सेर्भरसँग जोडियो</span>', 'ok');
  });

  socket.on('server:hello', function (h) {
    console.log('[MM] hello from server:', h);
  });

  socket.on('disconnect', function (reason) {
    setStatus('Connection lost (' + reason + '). <span class="ne">सम्पर्क टुट्यो</span>', 'error');
    if (session.code && !session.gameOver) {
      showToast('Opponent connection lost &mdash; सम्पर्क टुट्यो');
    }
  });

  socket.on('connect_error', function () {
    setStatus('Cannot reach the game server. Is <code>npm start</code> running? <span class="ne">सेर्भर भेटिएन</span>', 'error');
  });

  /* ---- Host button ---- */
  $('hostBtn').addEventListener('click', function () {
    setStatus('Creating room&hellip; <span class="ne">कोठ बनाउँदै&hellip;</span>');
    socket.emit('room:host');
  });

  /* ---- Join form ---- */
  $('joinForm').addEventListener('submit', function (ev) {
    ev.preventDefault();
    const code = roomInput.value.trim().toUpperCase();
    if (!/^[A-Z0-9]{4}$/.test(code)) {
      setStatus('Enter a valid 4-character Room Code. <span class="ne">४ अक्षरको कोड हाल्नुहोस्</span>', 'error');
      return;
    }
    setStatus('Joining ' + code + '&hellip; <span class="ne">सामेल हुँदै&hellip;</span>');
    socket.emit('room:join', code);
  });

  /* ---- Room created / joined ---- */
  function onRoomOk(payload) {
    session.code = payload.code;
    session.side = payload.side;
    session.youAre = payload.youAre || '';
    roomCodeDisplay.textContent = payload.code;
    $('hudRoomCode').textContent = payload.code;
    codeBox.classList.remove('hidden');
    setStatus('You are ' + session.youAre + '. Share the code! <span class="ne">यो कोड साथीलाई पठाउनुहोस्</span>', 'ok');
  }
  socket.on('room:created', onRoomOk);
  socket.on('room:joined', onRoomOk);

  socket.on('room:error', function (err) {
    setStatus('&#9888; ' + (err.message || err.error || 'Could not join room.'), 'error');
  });

  /* ---- Seat updates ---- */
  socket.on('room:update', function (u) {
    if (!u || u.code !== session.code) return;
    const filled = (u.seats || []).filter(function (s) { return s.filled && s.connected; }).length;
    seatInfo.textContent = 'Seats: ' + filled + '/2' + (filled < 2 ? ' — waiting for opponent… प्रतिपक्षीको प्रतीक्षा…' : ' — arena ready! अखाडा तयार!');
    if (filled >= 2) startGameBtn.classList.remove('hidden');
  });

  /* ---- Copy code ---- */
  $('copyCodeBtn').addEventListener('click', function () {
    if (!session.code) return;
    navigator.clipboard.writeText(session.code).then(function () {
      $('copyCodeBtn').textContent = 'Copied!';
      setTimeout(function () { $('copyCodeBtn').textContent = 'Copy'; }, 1200);
    });
  });

  /* ---- Countdown then launch Phaser ---- */
  let phaserGame = null;
  socket.on('match:countdown', function (d) {
    setStatus('Match starting in ' + d.seconds + '&hellip; <span class="ne">खेल सुरु हुँदैछ&hellip;</span>', 'ok');
  });

  function enterArena() {
    landing.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    if (!phaserGame) {
      const config = {
        type: Phaser.AUTO,
        parent: 'phaser-root',
        width: WORLD.width,
        height: WORLD.height,
        backgroundColor: '#1a0b10',
        scale: {
          mode: Phaser.Scale.FIT,             // canvas scales for desktop browsers
          autoCenter: Phaser.Scale.CENTER_BOTH
        },
        scene: [BootScene, FightScene]
      };
      phaserGame = new Phaser.Game(config);
    }
  }

  startGameBtn.addEventListener('click', function () {
    socket.emit('match:ready');
    enterArena();
  });
  // Also auto-enter when the server starts the round (guest who just joined)
  socket.on('round:start', function () {
    if (!gameScreen.classList.contains('hidden')) return;
    if (session.code) enterArena();
  });

  /* ---- Leave match ---- */
  $('leaveBtn').addEventListener('click', function () {
    location.reload(); // simplest graceful exit: drop socket, back to lobby
  });

  /* ---- Rematch ---- */
  rematchBtn.addEventListener('click', function () {
    rematchBtn.classList.add('hidden');
    session.gameOver = false;
    socket.emit('match:rematch');
  });

  /* ---- Game over / round messages via toast ---- */
  socket.on('round:end', function (d) {
    if (!d) return;
    const won = d.winnerSide === session.side;
    const label = d.reason === 'KO' ? 'K.O.!' : d.reason === 'TIMEOUT' ? 'Time Up!' : 'Opponent Left!';
    showToast(label + ' ' + (won ? 'Round won — जित!' : 'Round lost — हार!'));
  });

  socket.on('round:draw', function () { showToast('Draw — बराबरी!'); });

  socket.on('game:over', function (d) {
    session.gameOver = true;
    const iWon = d.winnerSide === session.side;
    const big = iWon ? d.victoryText : d.defeatText; // विजयी! / पराजित!
    showBanner(big + '  ' + (iWon ? d.winnerName : d.loserName || ''), iWon);
    rematchBtn.classList.remove('hidden');
  });

  socket.on('opponent:left', function () {
    showToast('Opponent disconnected — प्रतिपक्षी गए');
  });

  /* ---- HUD helpers (DOM overlay reads the same synced state) ---- */
  window.MM_HUD = {
    update: function (state) {
      if (!state || !state.players) return;
      const p1 = state.players.find(function (p) { return p.side === 0; });
      const p2 = state.players.find(function (p) { return p.side === 1; });
      const set = function (id, v) { const el = document.getElementById(id); if (el) el.textContent = v; };
      const bar = function (id, pct) { const el = document.getElementById(id); if (el) el.style.width = Math.max(0, Math.min(100, pct)) + '%'; };

      if (p1) {
        set('p1Name', p1.name);
        set('p1HpText', p1.health);
        bar('p1HpBar', p1.health);
        set('p1PranaText', p1.prana);
        bar('p1PranaBar', p1.prana);
        document.querySelector('.hud-left .bar.prana').classList.toggle('full', p1.prana >= 100);
      }
      if (p2) {
        set('p2Name', p2.name);
        set('p2HpText', p2.health);
        bar('p2HpBar', p2.health);
        set('p2PranaText', p2.prana);
        bar('p2PranaBar', p2.prana);
        document.querySelector('.hud-right .bar.prana').classList.toggle('full', p2.prana >= 100);
      }
      set('matchTimer', state.timer);
      set('roundLabel', 'Round ' + state.round);
      if (p1 && p2) set('scoreLabel', p1.wins + ' – ' + p2.wins);
    }
  };

  function showToast(msg) {
    const t = document.getElementById('toast');
    t.innerHTML = msg;
    t.classList.remove('hidden');
    clearTimeout(showToast._tm);
    showToast._tm = setTimeout(function () { t.classList.add('hidden'); }, 2000);
  }

  function showBanner(msg, isVictory) {
    const t = document.getElementById('toast');
    t.innerHTML = '<div style="font-size:2.6rem;color:' + (isVictory ? '#f9cd3d' : '#ef5a72') + '">' + msg + '</div>' +
      '<div style="font-size:1rem;margin-top:6px;">यो खेल पूर्ण रूपमा काल्पनिक र व्यङ्गात्मक हो।</div>';
    t.classList.remove('hidden');
  }
});

/* ============================ PHASER SCENES ========================= */

/**
 * BootScene — currently generates zero external assets (everything is
 * vector-drawn). This is THE place where you will later call
 * this.load.image() / this.load.spritesheet() for real Nepali fighter
 * sprites and the Maitighar background photo.
 */
class BootScene extends Phaser.Scene {
  constructor() { super('BootScene'); }

  preload() {
    // ================================================================
    // >>> REPLACE LATER WITH REAL ASSETS, e.g.:
    //   this.load.image('bg-maitighar', 'assets/bg/maitighar_mandala.png');
    //   this.load.spritesheet('veteran', 'assets/sprites/veteran.png',
    //                         { frameWidth: 96, frameHeight: 170 });
    //   this.load.spritesheet('youth',   'assets/sprites/youth.png',
    //                         { frameWidth: 96, frameHeight: 170 });
    //   this.load.audio('hit',  'assets/sfx/hit.mp3');
    //   this.load.audio('theme', 'assets/bgm/dohori_theme.mp3');
    // ================================================================

    // For now we only generate a soft radial gradient texture used by
    // the placeholder sky, purely via Graphics -> generateTexture.
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillGradientStyle(0x2b0a14, 0x2b0a14, 0x7a1230, 0xc8102e, 1);
    g.fillRect(0, 0, WORLD.width, WORLD.height);
    g.generateTexture('sky-grad', WORLD.width, WORLD.height);
    g.destroy();
  }

  create() {
    this.scene.start('FightScene');
  }
}

/**
 * FightScene — renders the authoritative snapshots that arrive over
 * Socket.io. It performs NO local physics; it only interpolates toward
 * the server's positions and draws hitboxes/HUD extras.
 */
class FightScene extends Phaser.Scene {
  constructor() { super('FightScene'); }

  create() {
    this.targets = {}; // side -> {x,y} latest server pos
    this.renderers = {}; // side -> graphics object

    this.drawStage();

    // Two placeholder fighters built from rectangles/circles.
    [0, 1].forEach(this.createFighterPlaceholder, this);

    // Input capture: read keys every frame, send to server at ~30 Hz.
    this.keys = this.input.keyboard.addKeys({
      A: 'A', D: 'D', W: 'W', S: 'S', J: 'J', K: 'K', L: 'L'
    });
    // Prevent the browser scrolling with these keys while fighting.
    this.input.keyboard.addCapture('A,S,D,W,J,K,L');

    this.lastSent = 0;
    this.prevAtk = { punch: false, kick: false, super: false };

    // Receive authoritative state from the server.
    this.lastEventStamp = null;
    this.stateHandler = (state) => {
      session.latestState = state;
      if (window.MM_HUD) window.MM_HUD.update(state);
      // Fire hit FX only for a NEW hit event (server re-sends lastEvent every tick).
      const ev = state.event;
      if (ev && ev.type === 'HIT') {
        const stamp = String(ev.attackerSide) + ':' + String(ev.remainingHealth) + ':' + String(ev.x);
        if (stamp !== this.lastEventStamp) {
          this.lastEventStamp = stamp;
          this.spawnHitFx(ev);
        }
      }
    };
    socket.on('state', this.stateHandler);
    this.events.once('shutdown', () => socket.off('state', this.stateHandler));

    // Stage name banner
    this.add.text(WORLD.width / 2, WORLD.height - 24, 'मैतीघर मण्डल — Maitighar Mandala', {
      fontFamily: 'Mukta, sans-serif', fontSize: '18px', color: '#d4af37'
    }).setOrigin(0.5).setAlpha(0.8);

    this.add.text(12, 12, 'यो खेल काल्पनिक र व्यङ्गात्मक छ', {
      fontFamily: 'Mukta, sans-serif', fontSize: '13px', color: '#ffffff'
    }).setAlpha(0.4);
  }

  /* ---------------- Stage drawing (placeholder art) ---------------- */
  drawStage() {
    // >>> REPLACE LATER: this.add.image(0,0,'bg-maitighar').setOrigin(0)
    this.add.image(0, 0, 'sky-grad').setOrigin(0).setAlpha(0.9);

    // Far Himalayan silhouette band
    const mtn = this.add.graphics();
    mtn.fillStyle(0x3b1129, 0.9);
    mtn.beginPath();
    mtn.moveTo(0, 300);
    [[120, 190], [240, 265], [380, 150], [520, 250], [640, 120], [760, 240], [900, 170], [1040, 260], [1160, 180], [1280, 280]]
      .forEach(p => mtn.lineTo(p[0], p[1]));
    mtn.lineTo(WORLD.width, 360); mtn.lineTo(0, 360); mtn.closePath(); mtn.fill();

    // Snow caps
    mtn.fillStyle(0xffffff, 0.85);
    [[380, 150, 26], [640, 120, 30], [900, 170, 22]].forEach(c => {
      mtn.beginPath();
      mtn.moveTo(c[0] - c[2], c[1] + c[2]);
      mtn.lineTo(c[0], c[1]);
      mtn.lineTo(c[0] + c[2], c[1] + c[2]);
      mtn.closePath(); mtn.fill();
    });
    mtn.destroy();

    // Koti-style railing blocks behind the street
    const rail = this.add.graphics();
    for (let x = 40; x < WORLD.width - 40; x += 90) {
      rail.fillStyle(0x8a5a2b, 1); rail.fillRect(x, 470, 26, 90);
      rail.fillStyle(0xb07a3e, 1); rail.fillRect(x + 4, 456, 18, 16);
    }
    rail.lineStyle(8, 0xd4af37, 1); rail.strokeRect(30, 440, WORLD.width - 60, 12);

    // Ground: Maitighar ring-road asphalt
    this.add.rectangle(WORLD.width / 2, WORLD.groundY + 50, WORLD.width, 100, 0x2e2e33);
    this.add.rectangle(WORLD.width / 2, WORLD.groundY, WORLD.width, 6, 0xd4af37, 0.9); // gold kerb line

    // Center mandala emblem on the floor
    const mandala = this.add.graphics();
    mandala.fillStyle(0xc8102e, 0.35);
    mandala.fillCircle(WORLD.width / 2, WORLD.groundY + 44, 46);
    mandala.lineStyle(3, 0xf9cd3d, 0.8);
    mandala.strokeCircle(WORLD.width / 2, WORLD.groundY + 44, 46);
    mandala.strokeCircle(WORLD.width / 2, WORLD.groundY + 44, 26);
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI / 4) * i;
      mandala.lineBetween(WORLD.width / 2 + Math.cos(a) * 26, WORLD.groundY + 44 + Math.sin(a) * 26,
                          WORLD.width / 2 + Math.cos(a) * 46, WORLD.groundY + 44 + Math.sin(a) * 46);
    }

    // A fluttering prayer-flag string across the top
    const flags = this.add.graphics();
    const cols = [0x2b6cb0, 0xffffff, 0xc8102e, 0x2f855a, 0xf9cd3d];
    for (let i = 0; i < 20; i++) {
      const fx = 60 + i * 60;
      const fy = 60 + Math.sin(i * 0.7) * 10;
      flags.fillStyle(cols[i % cols.length], 0.9);
      flags.fillTriangle(fx, fy, fx + 34, fy + 6, fx + 6, fy + 34);
    }
    flags.lineStyle(2, 0xffffff, 0.5);
    flags.beginPath();
    for (let i = 0; i <= 20; i++) flags.lineTo(60 + i * 60, 60 + Math.sin(i * 0.7) * 10);
    flags.strokePath();
  }

  /* ---------------- Fighter placeholders ---------------- */
  createFighterPlaceholder(side) {
    const color = side === 0 ? CRIMSON : DEEPBLUE;
    const spawnX = side === 0 ? 380 : 900;

    // >>> REPLACE LATER with an animated spritesheet, e.g.:
    //   this.playerSprites[side] = this.add.sprite(spawnX, WORLD.groundY, side===0?'veteran':'youth');
    const body = this.add.rectangle(spawnX, WORLD.groundY - FIGHTER.hStand / 2,
                                    FIGHTER.w, FIGHTER.hStand, color)
      .setStrokeStyle(3, 0xffd700, 0.9);

    // Head marker so facing direction reads clearly
    const head = this.add.circle(spawnX, WORLD.groundY - FIGHTER.hStand - 16, 18, color)
      .setStrokeStyle(3, 0xffd700, 0.9);

    // Floating name tag (English + Nepali flavour text)
    const tag = this.add.text(spawnX, WORLD.groundY - FIGHTER.hStand - 52,
      side === 0 ? 'P1 · The Veteran · अनुभवी' : 'P2 · The Youth · युवा', {
        fontFamily: 'Mukta, sans-serif', fontSize: '15px',
        color: side === 0 ? '#ffb3c0' : '#bcd0ff'
      }).setOrigin(0.5);

    this.renderers[side] = { body, head, tag };
    this.targets[side] = { x: spawnX, y: WORLD.groundY };
  }

  /* ---------------- Per-frame loop ---------------- */
  update(time, delta) {
    this.sendInput(time);
    this.applyServerState(delta);
  }

  sendInput(time) {
    if (!socket || !socket.connected) return;
    if (time - this.lastSent < 33) return; // ~30 Hz input stream
    this.lastSent = time;

    const k = this.keys;
    const msg = {
      left: k.A.isDown, right: k.D.isDown, up: k.W.isDown, down: k.S.isDown,
      punch: k.J.isDown, kick: k.K.isDown, super: k.L.isDown
    };
    socket.emit('input', msg);
  }

  applyServerState(delta) {
    const st = session.latestState;
    if (!st || !st.players) return;
    // Clear previous frame's hitbox overlays so they don't smear/flicker.
    if (this.hitboxGfx) this.hitboxGfx.clear();
    const dtScale = Math.min(1, delta / 1000 * 12); // smoothing factor

    st.players.forEach((p) => {
      const r = this.renderers[p.side];
      const tgt = this.targets[p.side];
      if (!r || !tgt) return;

      // Interpolate toward authoritative position
      tgt.x += (p.x - tgt.x) * dtScale;
      tgt.y += (p.y - tgt.y) * dtScale;

      const h = p.crouching ? FIGHTER.hCrouch : FIGHTER.hStand;

      // Body rectangle: repositioned + resized per animation state.
      r.body.setSize(FIGHTER.w, h);
      r.body.setPosition(tgt.x, tgt.y - h / 2);

      // Hurtbox outline tint flashes white when stunned (just got hit)
      r.body.setStrokeStyle(3, p.stun > 0 ? 0xffffff : 0xffd700, 0.9);

      // Head follows the body top
      r.head.setPosition(tgt.x + p.facing * 10, tgt.y - h - 16);

      // Name tag above head
      r.tag.setPosition(tgt.x, tgt.y - h - 56);

      // Animation-driven visual tweaks (placeholders until spritesheets):
      switch (p.anim) {
        case 'walk':
          r.body.setAngle(Math.sin(this.time.now / 90) * 3); break;
        case 'jump':
          r.body.setAngle(p.facing * 8); break;
        case 'crouch':
          r.body.setAngle(0); break;
        case 'hurt':
          r.body.setAngle(-p.facing * 12); break;
        case 'ko':
          r.body.setAngle(-p.facing * 80); r.tag.setAlpha(0.4); break;
        default:
          r.body.setAngle(0); r.tag.setAlpha(1);
      }

      // Draw live attack hitbox as a translucent gold/red rect so the
      // combat logic is visible during development.
      this.drawAttackHitbox(p);
    });
  }

  drawAttackHitbox(p) {
    if (!p.attack) return;
    if (!this.hitboxGfx) { this.hitboxGfx = this.add.graphics(); this.hitboxGfx.setDepth(5); }
    const spec = ATTACK_VISUAL[p.attack.type];
    if (!spec) return;
    const cx = p.x + p.facing * (FIGHTER.w / 2 + spec.reach / 2);
    const cy = p.y + spec.offsetY;
    const col = p.attack.type === 'super' ? 0xf9cd3d : 0xff8899;
    this.hitboxGfx.fillStyle(col, 0.45);
    this.hitboxGfx.fillRect(cx - spec.reach / 2, cy - spec.hbH / 2, spec.reach, spec.hbH);
  }

  spawnHitFx(ev) {
    // Damage popup + spark ring at the defender's position
    const txt = this.add.text(ev.x, ev.y, '-' + ev.dmg, {
      fontFamily: 'Rozha One, serif', fontSize: ev.type === 'super' ? '44px' : '30px',
      color: ev.type === 'super' ? '#f9cd3d' : '#ffffff',
      stroke: '#000000', strokeThickness: 4
    }).setOrigin(0.5).setDepth(10);

    this.tweenChain(txt, ev);
  }

  tweenChain(txt, ev) {
    this.tweens.add({
      targets: txt, y: txt.y - 60, alpha: 0, duration: 700, ease: 'Cubic.OUT',
      onComplete: () => txt.destroy()
    });
    const ring = this.add.circle(ev.x, ev.y + 40, 8, 0, 0).setStrokeStyle(4, 0xf9cd3d).setDepth(9);
    this.tweens.add({
      targets: ring, radius: 46, alpha: 0, scaleX: 5, scaleY: 5, duration: 320,
      onComplete: () => ring.destroy()
    });
    if (ev.type === 'super') {
      this.cameras.main.shake(180, 0.01);
      this.cameras.main.flash(120, 249, 205, 61);
    } else {
      this.cameras.main.shake(60, 0.004);
    }
  }
}

/* Make scenes reachable from the inline bootstrap scope */
window.BootScene = BootScene;
window.FightScene = FightScene;
