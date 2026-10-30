/**
 * =====================================================================
 *  MAITIGHAR MAYHEM (Kathmandu Kombat) - Authoritative Game Server
 *  Node.js + Express + Socket.io
 * =====================================================================
 *  Responsibilities:
 *   1. Room system: generate 4-character alphanumeric room codes and
 *      seat a maximum of 2 players per room.
 *   2. Input relay: accept player inputs and feed them into the sim.
 *   3. AUTHORITATIVE simulation at a fixed 30 Hz tick: movement,
 *      jumping, crouching, punch/kick hitboxes, knockback, damage,
 *      Prana meter gain, Super Move (L), KO / round win, best-of-3
 *      match completion and rematches.
 *   4. State sync: broadcast positions (x,y), health (0-100),
 *      Prana (0-100) and animation state to both clients every tick.
 *   5. Graceful disconnect handling (opponent leaves -> automatic
 *      round award, socket cleanup, empty-room garbage collection).
 *
 *  NEPALI GOVERNMENT BODY FLAVOUR (satirical roster):
 *   Every fighter archetype is drawn from a fictionalised, satirical
 *   version of a real Nepali government institution - Office of the
 *   President, Office of the Prime Minister & Council of Ministers,
 *   House of Representatives (प्रतिनिधि सभा), National Assembly
 *   (राष्ट्रिय सभा), Supreme Court of Nepal (नेपालको सर्वोच्च अदालत),
 *   Election Commission of Nepal (निर्वाचन आयोग), CIAAST, Attorney
 *   General's Office (महान्यायाधिवक्ता), Nepali Army (नेपाली सेना),
 *   Nepal Police (नेपाल प्रहरी), Armed Police Force (सशस्त्र प्रहरी बल),
 *   Office of the Auditor General (महालेखा नियन्त्रक), National
 *   Planning Commission (राष्ट्रिय योजना आयोग), the Secretariat
 *   (सचिवालय), Language Commission (भाषा आयोग) and Press Council
 *   Nepal (प्रेस काउन्सिल नेपाल).
 *   All characters, parties and institutions are used purely for satire
 *   and parody. No real person is endorsed or defamed.
 * =====================================================================
 */

'use strict';

/* ------------------------------------------------------------------ *
 * External dependencies (npm install express socket.io)              *
 * ------------------------------------------------------------------ */
const path = require('path');
const http = require('http');
const os = require('os');
const express = require('express');
const { Server } = require('socket.io');

/* ------------------------------------------------------------------ *
 * Configuration                                                      *
 * ------------------------------------------------------------------ */
const PORT = process.env.PORT || 3000;
const HOST_BIND = process.env.HOST_BIND || '0.0.0.0';
const TICK_RATE = 30; // authoritative simulation ticks per second
const TICK_MS = Math.round(1000 / TICK_RATE);

/* ------------------------------------------------------------------ *
 * Fighter Roster - Nepali Government Bodies (Satirical)              *
 * P1 flavour = "The Veteran" (Crimson Red)                           *
 * P2 flavour = "The Youth"    (Deep Blue)                            *
 * UI accents follow the Nepali flag palette: crimson + gold.         *
 * ------------------------------------------------------------------ */
const ROSTER = [
  { id: 'president',          nameEn: 'Office of the President',                  nameNe: 'राष्ट्रपतिको कार्यालय',                        veteran: 'The Veteran',              youth: 'The Youth' },
  { id: 'pmcm',               nameEn: 'Office of the PM and Council of Ministers', nameNe: 'प्रधानमन्त्री तथा मन्त्रिपरिषद्को कार्यालय',   veteran: 'The Old Guard',            youth: 'The Young Turk' },
  { id: 'pratinidhisabha',    nameEn: 'House of Representatives',                 nameNe: 'प्रतिनिधि सभा',                                 veteran: 'The Speaker',              youth: 'The Backbencher' },
  { id: 'rastriyasabha',      nameEn: 'National Assembly',                        nameNe: 'राष्ट्रिय सभा',                                 veteran: 'The Chairman',             youth: 'The Electoral College Rep' },
  { id: 'supremecourt',       nameEn: 'Supreme Court of Nepal',                   nameNe: 'नेपालको सर्वोच्च अदालत',                     veteran: 'The Chief Justice',          youth: 'The PIL Petitioner' },
  { id: 'eci',                nameEn: 'Election Commission of Nepal',             nameNe: 'निर्वाचन आयोग, नेपाल',                         veteran: 'Chief Election Commissioner', youth: 'The Ballot Box Brawler' },
  { id: 'ciaast',             nameEn: 'Commission to Study the Flight of Aircraft (CIAAST)', nameNe: 'विमान उडान अनुसन्धान आयोग',       veteran: 'The Flying-Saucer Investigator', youth: 'The Sky Watcher' },
  { id: 'ag',                 nameEn: "Attorney General's Office",                nameNe: 'महान्यायाधिवक्ताको कार्यालय',                  veteran: 'The Attorney General',       youth: 'The Additional AG' },
  { id: 'na',                 nameEn: 'Nepali Army',                              nameNe: 'नेपाली सेना',                                   veteran: 'Chief of Army Staff',        youth: 'The Colonel' },
  { id: 'np',                 nameEn: 'Nepal Police',                             nameNe: 'नेपाल प्रहरी',                                  veteran: 'The IGP',                    youth: 'The Constable' },
  { id: 'apf',                nameEn: 'Armed Police Force',                       nameNe: 'सशस्त्र प्रहरी बल, नेपाल',                    veteran: 'APF Inspector General',      youth: 'The Garrison Commander' },
  { id: 'oag',                nameEn: 'Office of the Auditor General',            nameNe: 'महालेखा नियन्त्रकको कार्यालय',                veteran: 'The Auditor General',        youth: 'The Compliance Officer' },
  { id: 'npc',                nameEn: 'National Planning Commission',             nameNe: 'राष्ट्रिय योजना आयोग',                          veteran: 'The Deputy Chairperson',     youth: 'The Five-Year Planner' },
  { id: 'secretariat',        nameEn: 'Secretariat to the Government of Nepal',   nameNe: 'मन्त्रिपरिषद् सचिवालय',                       veteran: 'The Cabinet Secretary',      youth: 'The Joint Secretary' },
  { id: 'languagecommission', nameEn: 'Language Commission',                      nameNe: 'भाषा आयोग',                                    veteran: 'The Purist Grammarian',      youth: 'The Mother-Tongue Advocate' },
  { id: 'presscouncil',       nameEn: 'Press Council Nepal',                      nameNe: 'प्रेस काउन्सिल नेपाल',                          veteran: 'The Editor-in-Chief',        youth: 'The Citizen Journalist' }
];

/* ------------------------------------------------------------------ *
 * World / physics constants                                          *
 * ------------------------------------------------------------------ */
const WORLD = {
  width: 1280,
  height: 720,
  groundY: 620,          // y coordinate where fighters stand (feet line)
  leftWall: 60,
  rightWall: 1220,
  gravity: 2200,         // px/s^2
  moveSpeed: 340,        // px/s horizontal
  jumpVelocity: -980,    // initial vy on W
  maxFallSpeed: 1400
};

const FIGHTER = {
  w: 90,                 // collision box width
  hStand: 170,           // standing height
  hCrouch: 110,          // crouching height (S)
  startHealth: 100,
  maxPrana: 100,
  pranaOnHitDealt: 12,   // gain when your attack connects
  pranaOnHitTaken: 8,    // gain when you get hit (comeback mechanic)
  pranaOnWhiff: 4,       // small gain when an attack misses
  pranaRegenPerSec: 2.5  // slow passive regen
};

const ATTACKS = {
  punch: { // J
    dmg: 10, startup: 0.10, active: 0.12, recovery: 0.22,
    reach: 96, hbH: 44, offsetY: -96, kbX: 300, kbY: -120, hitstun: 0.34,
    pranaCost: 0, super: false
  },
  kick: { // K
    dmg: 10, startup: 0.16, active: 0.14, recovery: 0.34,
    reach: 120, hbH: 52, offsetY: -58, kbX: 470, kbY: -230, hitstun: 0.46,
    pranaCost: 0, super: false
  },
  super: { // L - requires a FULL Prana meter
    dmg: 30, startup: 0.26, active: 0.26, recovery: 0.55,
    reach: 190, hbH: 150, offsetY: -90, kbX: 980, kbY: -560, hitstun: 0.95,
    pranaCost: 100, super: true
  }
};

const ROUND_TIME = 99;   // seconds
const ROUNDS_TO_WIN = 2; // best of 3

/* ------------------------------------------------------------------ *
 * Helpers                                                            *
 * ------------------------------------------------------------------ */
function makeRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no look-alike glyphs
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function now() { return Date.now(); }

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function createFighterBody(side) {
  const x = side === 0 ? 380 : 900;
  return {
    x: x, y: WORLD.groundY, vx: 0, vy: 0,
    facing: side === 0 ? 1 : -1,
    onGround: true, crouching: false, anim: 'idle'
  };
}

function blankInput() {
  return { left: false, right: false, up: false, down: false, punch: false, kick: false, super: false };
}

function createPlayerState(socketId, side) {
  const identity = side === 0
    ? { name: 'Player 1 (The Veteran)', color: 0xDC143C } // Crimson Red
    : { name: 'Player 2 (The Youth)',   color: 0x1E3A8A }; // Deep Blue

  const p = Object.assign({}, identity, createFighterBody(side), {
    socketId: socketId,
    side: side,
    input: blankInput(),
    prevInput: blankInput(),
    health: FIGHTER.startHealth,
    prana: 0,
    stun: 0,
    attack: null,        // { type, t, hasHit }
    wins: 0,
    stats: { hits: 0, supers: 0 },
    disconnected: false
  });
  return p;
}

function createRoom(code, hostId) {
  return {
    code: code,
    players: [{ socketId: hostId }],
    gameState: 'lobby',  // lobby | fighting | roundEnd | gameOver
    round: 1,
    timer: ROUND_TIME,
    winnerSocketId: null,
    lastEvent: null,
    interval: null,
    createdAt: now(),
    p0: null,
    p1: null
  };
}

/* ------------------------------------------------------------------ *
 * Room Manager                                                       *
 * ------------------------------------------------------------------ */
class RoomManager {
  constructor(io) {
    this.io = io;
    this.rooms = new Map();   // code -> room
    this.sockets = new Map(); // socket.id -> { code, side }
  }

  getRoomBySocket(socketId) {
    const entry = this.sockets.get(socketId);
    if (!entry) return null;
    return this.rooms.get(entry.code) || null;
  }

  getPlayerBySocket(room, socketId) {
    if (!room) return null;
    if (room.p0 && room.p0.socketId === socketId) return room.p0;
    if (room.p1 && room.p1.socketId === socketId) return room.p1;
    return null;
  }

  /* ------------------------- Rooms ------------------------- */
  hostRoom(socketId) {
    let code;
    do { code = makeRoomCode(); } while (this.rooms.has(code));
    const room = createRoom(code, socketId);
    this.rooms.set(code, room);
    this.sockets.set(socketId, { code: code, side: 0 });
    room.p0 = createPlayerState(socketId, 0);
    console.log('[ROOM] ' + code + ' created by ' + socketId);
    return { code: code, side: 0, room: room };
  }

  joinRoom(socketId, rawCode) {
    const code = String(rawCode || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{4}$/.test(code)) {
      return { error: 'INVALID_CODE', message: 'Room code must be 4 letters/numbers. कोड ४ अक्षरको हुनुपर्छ।' };
    }
    const room = this.rooms.get(code);
    if (!room) return { error: 'NOT_FOUND', message: 'Room "' + code + '" not found. यो कोड भेटिएन।' };
    if (room.players.length >= 2) {
      return { error: 'FULL', message: 'Room "' + code + '" is already full (2/2). यो कोठ भरिएको छ।' };
    }
    room.players.push({ socketId: socketId });
    this.sockets.set(socketId, { code: code, side: 1 });
    room.p1 = createPlayerState(socketId, 1);
    console.log('[ROOM] ' + socketId + ' joined ' + code + ' as P2');
    return { code: code, side: 1, room: room };
  }

  leaveRoom(socketId) {
    const info = this.sockets.get(socketId);
    if (!info) return;
    const room = this.rooms.get(info.code);
    this.sockets.delete(socketId);
    if (!room) return;

    const p = this.getPlayerBySocket(room, socketId);
    if (p) p.disconnected = true;

    if (room.gameState === 'fighting') {
      // Opponent walked out mid-round: award the round to whoever stayed.
      this.endRound(room, info.side === 0 ? 1 : 0, 'DISCONNECT');
    }

    const stillHere = room.players.filter(function (pl) { return this.sockets.has(pl.socketId); }, this);
    if (stillHere.length === 0) {
      clearInterval(room.interval);
      room.interval = null;
      this.rooms.delete(room.code);
      console.log('[ROOM] ' + room.code + ' deleted (empty)');
      return;
    }

    room.gameState = 'lobby';
    this.broadcastToRoom(room, 'opponent:left', { side: info.side });
    this.broadcastRoomUpdate(room);
  }

  /* ------------------------- Match flow ------------------------- */
  startMatch(room) {
    if (!room || !room.p0 || !room.p1) return;
    if (room.p0.disconnected || room.p1.disconnected) return;
    room.p0.wins = 0;
    room.p1.wins = 0;
    room.round = 1;
    this.beginRound(room);
    if (!room.interval) {
      const self = this;
      room.interval = setInterval(function () { self.tick(room); }, TICK_MS);
    }
    console.log('[MATCH] started in ' + room.code);
  }

  beginRound(room) {
    room.gameState = 'fighting';
    room.timer = ROUND_TIME;
    room.lastEvent = { type: 'ROUND_START', round: room.round };

    [room.p0, room.p1].forEach(function (p) {
      if (!p) return;
      Object.assign(p, createFighterBody(p.side));
      p.health = FIGHTER.startHealth;
      p.prana = 0;
      p.stun = 0;
      p.attack = null;
      p.stats = { hits: 0, supers: 0 };
      p.input = blankInput();
      p.prevInput = blankInput();
    });

    this.broadcastToRoom(room, 'round:start', { round: room.round, time: ROUND_TIME });
  }

  endRound(room, winnerSide, reason) {
    if (room.gameState !== 'fighting') return;
    room.gameState = 'roundEnd';

    const winner = winnerSide === 0 ? room.p0 : room.p1;
    const loser = winnerSide === 0 ? room.p1 : room.p0;
    if (winner) winner.wins++;

    room.lastEvent = { type: 'ROUND_END', round: room.round, winnerSide: winnerSide, reason: reason };

    this.broadcastToRoom(room, 'round:end', {
      round: room.round,
      winnerSide: winnerSide,
      winnerName: winner ? winner.name : null,
      reason: reason
    });

    if (winner && winner.wins >= ROUNDS_TO_WIN) {
      room.gameState = 'gameOver';
      room.winnerSocketId = winner.socketId;
      this.broadcastToRoom(room, 'game:over', {
        winnerSide: winnerSide,
        winnerName: winner.name,
        loserName: loser ? loser.name : null,
        score: room.p0.wins + '-' + room.p1.wins,
        victoryText: 'विजयी! (Victory!)',
        defeatText: 'पराजित! (Defeated!)'
      });
      console.log('[MATCH] over in ' + room.code + ': ' + winner.name +
                  ' wins ' + room.p0.wins + '-' + room.p1.wins);
    } else {
      room.round++;
      const self = this;
      setTimeout(function () {
        const live = self.rooms.get(room.code);
        if (live && live.gameState === 'roundEnd' && live.p0 && live.p1 &&
            !live.p0.disconnected && !live.p1.disconnected) {
          self.beginRound(live);
        }
      }, 2200);
    }
    this.broadcastState(room);
  }

  /* ---------------- Fixed-step authoritative simulation ---------------- */
  tick(room) {
    if (!room.p0 || !room.p1) return;
    if (room.gameState !== 'fighting') { this.broadcastState(room); return; }

    const dt = TICK_MS / 1000;
    room.timer -= dt;

    if (room.timer <= 0) {
      room.timer = 0;
      let winnerSide;
      if (room.p0.health === room.p1.health) winnerSide = -1;
      else winnerSide = room.p0.health > room.p1.health ? 0 : 1;

      if (winnerSide === -1) {
        room.gameState = 'roundEnd';
        room.lastEvent = { type: 'DRAW' };
        this.broadcastToRoom(room, 'round:draw', { round: room.round });
        const self = this;
        setTimeout(function () {
          const live = self.rooms.get(room.code);
          if (live && live.gameState === 'roundEnd') self.beginRound(live);
        }, 1800);
      } else {
        this.endRound(room, winnerSide, 'TIMEOUT');
      }
      return;
    }

    this.simulateFighter(room.p0, room.p1, dt);
    this.simulateFighter(room.p1, room.p0, dt);
    this.resolveAttacks(room);
    this.separateBodies(room.p0, room.p1);
    this.broadcastState(room);
  }

  simulateFighter(p, opp, dt) {
    if (p.disconnected) return;

    const stunned = p.stun > 0;
    if (stunned) p.stun = Math.max(0, p.stun - dt);

    // Passive Prana regeneration
    p.prana = clamp(p.prana + FIGHTER.pranaRegenPerSec * dt, 0, FIGHTER.maxPrana);

    const inp = p.input;
    const canAct = !stunned && !p.attack;

    // --- Movement (A / D) ---
    let dir = 0;
    if (canAct) {
      if (inp.left) dir -= 1;
      if (inp.right) dir += 1;
      p.vx = dir * WORLD.moveSpeed;
    } else if (stunned) {
      p.vx *= 0.9; // friction keeps knockback sliding
    } else {
      p.vx = 0;    // locked while attacking
    }

    // --- Jump (W, edge triggered) ---
    if (canAct && inp.up && !p.prevInput.up && p.onGround) {
      p.vy = WORLD.jumpVelocity;
      p.onGround = false;
    }

    // --- Crouch (hold S while grounded) ---
    p.crouching = !!(canAct && inp.down && p.onGround);
    if (p.crouching) p.vx = 0;

    // --- Attacks (J punch / K kick / L super), edge triggered ---
    if (canAct) {
      if (inp.super && !p.prevInput.super && p.prana >= ATTACKS.super.pranaCost) {
        p.prana = 0;
        p.attack = { type: 'super', t: 0, hasHit: false };
        p.stats.supers++;
      } else if (inp.punch && !p.prevInput.punch) {
        p.attack = { type: 'punch', t: 0, hasHit: false };
      } else if (inp.kick && !p.prevInput.kick) {
        p.attack = { type: 'kick', t: 0, hasHit: false };
      }
    }

    // Advance the attack timeline
    if (p.attack) {
      const spec = ATTACKS[p.attack.type];
      p.attack.t += dt;
      if (p.attack.t >= spec.startup + spec.active + spec.recovery) {
        if (!p.attack.hasHit) p.prana = clamp(p.prana + FIGHTER.pranaOnWhiff, 0, FIGHTER.maxPrana);
        p.attack = null;
      }
    }

    // --- Gravity + integration ---
    p.vy += WORLD.gravity * dt;
    if (p.vy > WORLD.maxFallSpeed) p.vy = WORLD.maxFallSpeed;
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    // Ground plane
    if (p.y >= WORLD.groundY) {
      p.y = WORLD.groundY;
      p.vy = 0;
      p.onGround = true;
    } else {
      p.onGround = false;
    }

    // Arena walls
    p.x = clamp(p.x, WORLD.leftWall, WORLD.rightWall);

    // Fighters always face each other while neutral
    if (p.onGround && !p.attack) p.facing = opp.x >= p.x ? 1 : -1;

    // --- Animation label (synced to both clients) ---
    if (p.attack) {
      p.anim = p.attack.type;               // 'punch' | 'kick' | 'super'
    } else if (p.stun > 0) {
      p.anim = 'hurt';
    } else if (!p.onGround) {
      p.anim = 'jump';
    } else if (p.crouching) {
      p.anim = 'crouch';
    } else if (Math.abs(p.vx) > 1) {
      p.anim = 'walk';
    } else {
      p.anim = 'idle';
    }

    p.prevInput = Object.assign({}, p.input);
  }

  /** Live hurtbox (body) of a fighter. */
  hurtbox(p) {
    const h = p.crouching ? FIGHTER.hCrouch : FIGHTER.hStand;
    return { x: p.x - FIGHTER.w / 2, y: p.y - h, w: FIGHTER.w, h: h };
  }

  /** Active attack hitbox, or null when outside the active window. */
  attackHitbox(p) {
    if (!p.attack) return null;
    const spec = ATTACKS[p.attack.type];
    if (p.attack.t < spec.startup || p.attack.t > spec.startup + spec.active) return null;
    const cx = p.x + p.facing * (FIGHTER.w / 2 + spec.reach / 2);
    const cy = p.y + spec.offsetY;
    return { x: cx - spec.reach / 2, y: cy - spec.hbH / 2, w: spec.reach, h: spec.hbH, spec: spec };
  }

  resolveAttacks(room) {
    this.tryHit(room, room.p0, room.p1);
    this.tryHit(room, room.p1, room.p0);

    if (room.p0.health <= 0 || room.p1.health <= 0) {
      const winnerSide = room.p0.health <= 0 ? 1 : 0;
      const loser = winnerSide === 0 ? room.p1 : room.p0;
      loser.health = Math.max(0, loser.health);
      loser.anim = 'ko';
      this.endRound(room, winnerSide, 'KO');
    }
  }

  tryHit(room, attacker, defender) {
    if (!attacker.attack || attacker.attack.hasHit) return;
    const hb = this.attackHitbox(attacker);
    if (!hb) return;
    const db = this.hurtbox(defender);
    if (!rectsOverlap(hb, db)) return;

    attacker.attack.hasHit = true;
    const spec = hb.spec;
    const kind = attacker.attack.type;

    // Damage (health clamped 0-100)
    defender.health = clamp(defender.health - spec.dmg, 0, FIGHTER.startHealth);

    // Knockback away from the attacker
    defender.vx = attacker.facing * spec.kbX;
    defender.vy = spec.kbY;
    defender.onGround = false;
    defender.stun = spec.hitstun;
    defender.attack = null;
    defender.anim = 'hurt';

    // Prana swings: attacker gains on contact, defender gains a comeback share
    attacker.prana = clamp(attacker.prana + FIGHTER.pranaOnHitDealt, 0, FIGHTER.maxPrana);
    defender.prana = clamp(defender.prana + FIGHTER.pranaOnHitTaken, 0, FIGHTER.maxPrana);
    attacker.stats.hits++;

    const payload = {
      attackerSide: attacker.side,
      defenderSide: defender.side,
      type: kind,
      dmg: spec.dmg,
      remainingHealth: defender.health,
      x: defender.x,
      y: defender.y - 90
    };
    room.lastEvent = Object.assign({ type: 'HIT' }, payload);
    this.broadcastToRoom(room, 'hit', payload);
  }

  separateBodies(a, b) {
    const ab = this.hurtbox(a);
    const bb = this.hurtbox(b);
    if (!rectsOverlap(ab, bb)) return;
    const overlap = Math.min(ab.x + ab.w, bb.x + bb.w) - Math.max(ab.x, bb.x);
    if (overlap <= 0) return;
    const push = overlap / 2 + 0.5;
    if (a.x < b.x) { a.x -= push; b.x += push; } else { a.x += push; b.x -= push; }
    a.x = clamp(a.x, WORLD.leftWall, WORLD.rightWall);
    b.x = clamp(b.x, WORLD.leftWall, WORLD.rightWall);
  }

  /* ------------------------- Networking ------------------------- */
  broadcastState(room) {
    const s = {
      code: room.code,
      gameState: room.gameState,
      round: room.round,
      timer: Math.ceil(room.timer),
      event: room.lastEvent,
      serverTime: now(),
      players: [room.p0, room.p1].filter(Boolean).map(function (p) {
        return {
          socketId: p.socketId,
          side: p.side,
          name: p.name,
          color: p.color,
          x: Math.round(p.x * 10) / 10,
          y: Math.round(p.y * 10) / 10,
          vx: Math.round(p.vx * 10) / 10,
          vy: Math.round(p.vy * 10) / 10,
          facing: p.facing,
          health: Math.round(p.health),
          prana: Math.round(p.prana),
          anim: p.anim,
          crouching: p.crouching,
          onGround: p.onGround,
          stun: Math.round(p.stun * 100) / 100,
          attack: p.attack ? { type: p.attack.type, t: Math.round(p.attack.t * 100) / 100 } : null,
          wins: p.wins,
          disconnected: p.disconnected,
          stats: p.stats
        };
      })
    };
    this.broadcastToRoom(room, 'state', s);
  }

  broadcastRoomUpdate(room) {
    const self = this;
    const payload = {
      code: room.code,
      gameState: room.gameState,
      seats: [0, 1].map(function (side) {
        const p = side === 0 ? room.p0 : room.p1;
        return {
          side: side,
          filled: !!p,
          connected: !!p && self.sockets.has(p.socketId),
          name: p ? p.name : null
        };
      })
    };
    this.broadcastToRoom(room, 'room:update', payload);
  }

  broadcastToRoom(room, event, data) {
    if (!room || !room.code) return;
    this.io.to(room.code).emit(event, data);
  }
}

/* ------------------------------------------------------------------ *
 * Express + HTTP + Socket.io bootstrap                               *
 * ------------------------------------------------------------------ */
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingInterval: 5000,
  pingTimeout: 12000
});

app.use(express.static(path.join(__dirname, 'public')));

// Debug / tooling endpoints
app.get('/api/roster', function (req, res) { res.json(ROSTER); });
app.get('/api/rooms', function (req, res) {
  const list = [];
  rooms.rooms.forEach(function (r) {
    list.push({ code: r.code, players: r.players.length, state: r.gameState, round: r.round });
  });
  res.json(list);
});
app.get('/api/health', function (req, res) {
  res.json({ ok: true, uptime: process.uptime(), rooms: rooms.rooms.size, tickRate: TICK_RATE });
});

const rooms = new RoomManager(io);

io.on('connection', function (socket) {
  console.log('[SOCKET] connected: ' + socket.id);

  socket.emit('server:hello', {
    socketId: socket.id,
    rosterCount: ROSTER.length,
    disclaimer: 'यो खेल पूर्ण रूपमा काल्पनिक र व्यङ्गात्मक हो। (This game is purely fictional and satirical.)'
  });

  socket.on('room:host', function () {
    if (rooms.sockets.has(socket.id)) {
      socket.emit('room:error', { message: 'You are already in a room. तपाईं पहिले नै कोठमा हुनुहुन्छ।' });
      return;
    }
    const res = rooms.hostRoom(socket.id);
    socket.join(res.code);
    socket.emit('room:created', { code: res.code, side: res.side, youAre: 'Host - Player 1 (The Veteran)' });
    rooms.broadcastRoomUpdate(res.room);
  });

  socket.on('room:join', function (rawCode) {
    if (rooms.sockets.has(socket.id)) {
      socket.emit('room:error', { message: 'You are already in a room.' });
      return;
    }
    const res = rooms.joinRoom(socket.id, rawCode);
    if (res.error) { socket.emit('room:error', res); return; }

    socket.join(res.code);
    socket.emit('room:joined', { code: res.code, side: res.side, youAre: 'Guest - Player 2 (The Youth)' });
    rooms.broadcastRoomUpdate(res.room);

    // Both seats filled -> short countdown then kick off the authoritative loop
    if (res.room.players.length === 2 && res.room.gameState === 'lobby') {
      io.to(res.code).emit('match:countdown', { seconds: 3 });
      setTimeout(function () {
        const live = rooms.rooms.get(res.code);
        if (live && live.players.length === 2) rooms.startMatch(live);
      }, 3000);
    }
  });

  socket.on('match:ready', function () {
    const room = rooms.getRoomBySocket(socket.id);
    if (room && room.players.length === 2 && room.gameState === 'lobby') rooms.startMatch(room);
  });

  socket.on('match:rematch', function () {
    const room = rooms.getRoomBySocket(socket.id);
    if (room && room.players.length === 2) {
      room.gameState = 'lobby';
      rooms.startMatch(room);
    }
  });

  socket.on('input', function (data) {
    const room = rooms.getRoomBySocket(socket.id);
    const p = rooms.getPlayerBySocket(room, socket.id);
    if (!p || p.disconnected) return;
    const d = data || {};
    p.input = {
      left: !!d.left, right: !!d.right, up: !!d.up, down: !!d.down,
      punch: !!d.punch, kick: !!d.kick, super: !!d.super
    };
  });

  socket.on('disconnect', function (reason) {
    console.log('[SOCKET] disconnected: ' + socket.id + ' (' + reason + ')');
    rooms.leaveRoom(socket.id);
  });

  socket.on('error', function (err) { console.warn('[SOCKET] error: ' + err.message); });
});

/* ------------------------------------------------------------------ *
 * Periodic cleanup of stale rooms                                    *
 * ------------------------------------------------------------------ */
setInterval(function () {
  const cutoff = now() - 1000 * 60 * 30; // 30 minutes idle
  rooms.rooms.forEach(function (room, code) {
    const alive = room.players.some(function (pl) { return rooms.sockets.has(pl.socketId); });
    if (!alive || room.createdAt < cutoff) {
      clearInterval(room.interval);
      rooms.rooms.delete(code);
      console.log('[GC] removed stale room ' + code);
    }
  });
}, 60 * 1000);

/* ------------------------------------------------------------------ *
 * Startup banner                                                     *
 * ------------------------------------------------------------------ */
function lanIPs() {
  const out = [];
  const ifs = os.networkInterfaces();
  Object.keys(ifs).forEach(function (name) {
    (ifs[name] || []).forEach(function (cfg) {
      if (cfg.family === 'IPv4' && !cfg.internal) out.push(cfg.address);
    });
  });
  return out;
}

server.listen(PORT, HOST_BIND, function () {
  console.log('======================================================');
  console.log('  MAITIGHAR MAYHEM  (Kathmandu Kombat)');
  console.log('  A satirical Nepali political fighting game.');
  console.log('  यो खेल पूर्ण रूपमा काल्पनिक र व्यङ्गात्मक हो।');
  console.log('------------------------------------------------------');
  console.log('  Local:    http://localhost:' + PORT);
  lanIPs().forEach(function (ip) { console.log('  Network:  http://' + ip + ':' + PORT); });
  console.log('  Tick rate: ' + TICK_RATE + ' Hz  |  Best of ' + (ROUNDS_TO_WIN * 2 - 1) + ' rounds');
  console.log('======================================================');
});

process.on('SIGINT', function () {
  console.log('\nShutting down Maitighar Mayhem...');
  server.close(function () { process.exit(0); });
  setTimeout(function () { process.exit(0); }, 1500);
});
process.on('unhandledRejection', function (e) { console.error('[UNHANDLED REJECTION]', e); });
process.on('uncaughtException', function (e) { console.error('[UNCAUGHT]', e); });

module.exports = { app: app, server: server, io: io, ROSTER: ROSTER, RoomManager: RoomManager, WORLD: WORLD, FIGHTER: FIGHTER, ATTACKS: ATTACKS };
