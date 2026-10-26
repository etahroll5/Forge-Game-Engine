// ============================================================================
// AppJet Forge runtime — a small 2D engine: fixed scene graph, AABB physics,
// behavior components, event-sheet evaluation, per-node scripts and a camera.
// ============================================================================

import { num, clamp, lerp, clone, uid } from './util.js';
import { flatten, halfExtents, worldAABB, overlaps, pointInInst, hitTest, drawInstances } from './render.js';
import { createNode } from './project.js';
import { logGame, logError } from './console.js';

const KEY_FALLBACK = {
  ArrowLeft: ['ArrowLeft', 'KeyA'],
  ArrowRight: ['ArrowRight', 'KeyD'],
  ArrowUp: ['ArrowUp', 'KeyW'],
  ArrowDown: ['ArrowDown', 'KeyS'],
};

export class Engine {
  constructor(options) {
    this.project = options.project;
    this.sourceScene = options.scene;
    this.canvas = options.canvas;
    this.ctx = this.canvas.getContext('2d');
    this.onSceneSwitch = options.onSceneSwitch || null;
    this.onEnd = options.onEnd || null;

    this.scene = clone(options.scene);
    this.running = false;
    this.time = 0;
    this.frame = 0;
    this.keys = new Set();
    this.prevKeys = new Set();
    this.clicks = [];
    this.mouse = { sx: 0, sy: 0, wx: 0, wy: 0, down: false };
    this.vars = { ...(this.scene.vars || {}) };
    this.camera = { x: this.scene.width / 2, y: this.scene.height / 2, zoom: 1 };
    this.instances = [];
    this.byId = new Map();
    this.solids = [];
    this.eventTimers = new Map();
    this.reportedErrors = new Set();
    this.audio = null;
    this.frameStats = { fps: 0, fpsAccum: 0, fpsFrames: 0 };
    this.cameraInit = false;

    this._loop = this._loop.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._onBlur = this._onBlur.bind(this);
  }

  // ------------------------------------------------------------------ setup
  start() {
    this.build();
    this.instances.forEach((inst) => this.compileScript(inst));
    this.attachInput();
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this._loop);
    logGame(`▶ Scene "${this.scene.name}" started (${this.instances.length} nodes)`);
  }

  stop() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.detachInput();
    if (this.audio && this.audio.close) {
      try { this.audio.close(); } catch { /* ignore */ }
      this.audio = null;
    }
  }

  build() {
    this.instances = [];
    this.byId.clear();
    const walk = (def, parent) => {
      const inst = this.makeInstance(def, parent);
      for (const child of def.children || []) walk(child, inst);
      return inst;
    };
    this.roots = (this.scene.nodes || []).map((def) => walk(def, null));
    this.refreshSolids();
  }

  makeInstance(def, parent) {
    const sx = parent ? Math.abs(parent.wsx ?? 1) : 1;
    const sy = parent ? Math.abs(parent.wsy ?? 1) : 1;
    const inst = {
      def,
      id: def.id || uid('rt'),
      parent: parent || null,
      children: [],
      wx: num(def.x, 0) * sx + (parent ? parent.wx : 0),
      wy: num(def.y, 0) * sy + (parent ? parent.wy : 0),
      wrot: num(def.rotation, 0) + (parent ? parent.wrot : 0),
      wsx: num(def.scaleX, 1) * (parent ? parent.wsx : 1),
      wsy: num(def.scaleY, 1) * (parent ? parent.wsy : 1),
      vx: 0,
      vy: 0,
      grounded: false,
      rotOffset: 0,
      flashAlpha: 1,
      alive: true,
      data: {},
      behaviors: (def.behaviors || []).map((b) => ({ ...b })),
      script: null,
    };
    inst.spawnX = inst.wx;
    inst.spawnY = inst.wy;
    if (parent) parent.children.push(inst);
    this.instances.push(inst);
    this.byId.set(inst.id, inst);
    return inst;
  }

  syncChildren(inst) {
    for (const child of inst.children) {
      child.wx = num(child.def.x, 0) * Math.abs(inst.wsx ?? 1) + inst.wx;
      child.wy = num(child.def.y, 0) * Math.abs(inst.wsy ?? 1) + inst.wy;
      child.wrot = num(child.def.rotation, 0) + inst.wrot;
      this.syncChildren(child);
    }
  }

  refreshSolids() {
    this.solids = this.instances.filter((i) => i.alive && i.def.solid && i.def.type !== 'camera' && i.def.type !== 'group');
  }

  // ------------------------------------------------------------------ input
  attachInput() {
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    this.canvas.addEventListener('pointermove', this._onPointerMove);
    this.canvas.addEventListener('pointerdown', this._onPointerDown);
    window.addEventListener('pointerup', this._onPointerUp);
  }

  detachInput() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    this.canvas.removeEventListener('pointermove', this._onPointerMove);
    this.canvas.removeEventListener('pointerdown', this._onPointerDown);
    window.removeEventListener('pointerup', this._onPointerUp);
  }

  _onKeyDown(e) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    this.keys.add(e.code);
    if (e.code === 'Escape' && this.onEnd) this.onEnd();
  }

  _onKeyUp(e) {
    this.keys.delete(e.code);
  }

  _onBlur() {
    this.keys.clear();
    this.mouse.down = false;
  }

  _onPointerMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.sx = e.clientX - rect.left;
    this.mouse.sy = e.clientY - rect.top;
    const world = this.screenToWorld(this.mouse.sx, this.mouse.sy);
    this.mouse.wx = world.x;
    this.mouse.wy = world.y;
  }

  _onPointerDown(e) {
    this._onPointerMove(e);
    this.mouse.down = true;
    const hits = this.instances
      .filter((i) => i.alive && i.def.visible !== false && pointInInst(i, this.mouse.wx, this.mouse.wy))
      .map((i) => i.def.name);
    this.clicks.push({ x: this.mouse.wx, y: this.mouse.wy, names: hits });
  }

  _onPointerUp() {
    this.mouse.down = false;
  }

  isDown(key) {
    if (this.keys.has(key)) return true;
    const alternatives = KEY_FALLBACK[key] || [];
    return alternatives.some((k) => this.keys.has(k));
  }

  // ------------------------------------------------------------- projection
  viewScale() {
    const rect = this.canvas.getBoundingClientRect();
    const w = rect.width || this.canvas.width;
    const h = rect.height || this.canvas.height;
    return Math.min(w / this.scene.width, h / this.scene.height) * this.camera.zoom;
  }

  screenToWorld(px, py) {
    const rect = this.canvas.getBoundingClientRect();
    const w = rect.width || this.canvas.width;
    const h = rect.height || this.canvas.height;
    const scale = Math.min(w / this.scene.width, h / this.scene.height) * this.camera.zoom || 1;
    return { x: (px - w / 2) / scale + this.camera.x, y: (py - h / 2) / scale + this.camera.y };
  }

  // ------------------------------------------------------------------ loop
  _loop(ts) {
    if (!this.running) return;
    const dt = clamp((ts - this.last) / 1000, 0, 0.05);
    this.last = ts;
    this.time += dt;
    this.frameStats.fpsAccum += dt;
    this.frameStats.fpsFrames += 1;
    if (this.frameStats.fpsAccum >= 0.5) {
      this.frameStats.fps = Math.round(this.frameStats.fpsFrames / this.frameStats.fpsAccum);
      this.frameStats.fpsAccum = 0;
      this.frameStats.fpsFrames = 0;
    }

    try {
      this.update(dt);
      this.render();
    } catch (err) {
      logError(`Runtime error: ${err.message}`);
      this.stop();
      return;
    }

    this.prevKeys = new Set(this.keys);
    this.clicks.length = 0;
    this.frame += 1;
    this.raf = requestAnimationFrame(this._loop);
  }

  update(dt) {
    this.refreshSolids();
    this.runBehaviors(dt);
    for (const root of this.roots) this.syncChildren(root);
    this.runScripts(dt);
    this.runEvents(dt);
    this.updateCamera(dt);
    this.cleanup();
  }

  // -------------------------------------------------------------- behaviors
  moveAxis(inst, dx, dy) {
    inst.wx += dx;
    inst.wy += dy;
    const h = halfExtents(inst);
    for (const solid of this.solids) {
      if (solid === inst || !solid.alive) continue;
      if (!overlaps(inst, solid)) continue;
      const sh = halfExtents(solid);
      if (dx !== 0) {
        inst.wx = dx > 0 ? solid.wx - sh.hw - h.hw : solid.wx + sh.hw + h.hw;
        inst.vx = 0;
      }
      if (dy !== 0) {
        if (dy > 0) {
          inst.wy = solid.wy - sh.hh - h.hh;
          inst.grounded = true;
        } else {
          inst.wy = solid.wy + sh.hh + h.hh;
        }
        inst.vy = 0;
      }
    }
  }

  runBehaviors(dt) {
    for (const inst of this.instances) {
      if (!inst.alive) continue;
      for (const b of inst.behaviors) {
        try {
          this.applyBehavior(inst, b, dt);
        } catch (err) {
          this.reportError(inst, err, `behavior:${b.type}`);
        }
      }
    }
    // Reset anything that fell off the world back to its spawn point.
    for (const inst of this.instances) {
      if (!inst.alive) continue;
      if (!inst.behaviors.some((b) => b.type === 'platformer')) continue;
      if (inst.wy - halfExtents(inst).hw > this.scene.height + 400) {
        inst.wx = inst.spawnX;
        inst.wy = inst.spawnY;
        inst.vx = 0;
        inst.vy = 0;
      }
    }
  }

  applyBehavior(inst, b, dt) {
    switch (b.type) {
      case 'platformer': {
        const speed = num(b.speed, 230);
        const gravity = num(b.gravity, 1700);
        let dir = 0;
        if (this.isDown('ArrowLeft')) dir -= 1;
        if (this.isDown('ArrowRight')) dir += 1;
        inst.vx = dir * speed;
        if (this.isDown('ArrowUp') && inst.grounded) {
          inst.vy = -num(b.jump, 560);
          inst.grounded = false;
        }
        inst.vy = Math.min(inst.vy + gravity * dt, num(b.maxFall, 1300));
        this.moveAxis(inst, inst.vx * dt, 0);
        inst.grounded = false;
        this.moveAxis(inst, 0, inst.vy * dt);
        break;
      }
      case 'topdown': {
        const speed = num(b.speed, 220);
        let dx = 0;
        let dy = 0;
        if (this.isDown('ArrowLeft')) dx -= 1;
        if (this.isDown('ArrowRight')) dx += 1;
        if (this.isDown('ArrowUp')) dy -= 1;
        if (this.isDown('ArrowDown')) dy += 1;
        const len = Math.hypot(dx, dy) || 1;
        inst.vx = (dx / len) * speed;
        inst.vy = (dy / len) * speed;
        this.moveAxis(inst, inst.vx * dt, inst.vy * dt);
        break;
      }
      case 'follow': {
        const target = this.find(b.target);
        if (!target) break;
        const smooth = clamp(num(b.smoothing, 0.2), 0.01, 1);
        const k = 1 - Math.pow(1 - smooth, dt * 60);
        inst.wx = lerp(inst.wx, target.wx + num(b.offsetX, 0), k);
        inst.wy = lerp(inst.wy, target.wy + num(b.offsetY, 0), k);
        break;
      }
      case 'patrol': {
        const axis = b.axis === 'y' ? 'y' : 'x';
        const dist = Math.max(1, num(b.distance, 160));
        const speed = num(b.speed, 90);
        const key = `patrol_${axis}`;
        if (inst.data[key] === undefined) inst.data[key] = 1;
        const dir = inst.data[key];
        const home = axis === 'x' ? inst.spawnX : inst.spawnY;
        if (axis === 'x') inst.wx += dir * speed * dt;
        else inst.wy += dir * speed * dt;
        const pos = axis === 'x' ? inst.wx : inst.wy;
        if (pos > home + dist) inst.data[key] = -1;
        if (pos < home - dist) inst.data[key] = 1;
        break;
      }
      case 'bullet': {
        this.moveAxis(inst, num(b.speedX, 520) * dt, num(b.speedY, 0) * dt);
        const h = halfExtents(inst);
        const margin = 80;
        if (inst.wx < -margin || inst.wx > this.scene.width + margin || inst.wy < -margin || inst.wy > this.scene.height + margin) {
          this.destroy(inst);
          break;
        }
        if (b.hitsSolids) {
          const hit = this.solids.find((s) => s !== inst && overlaps(inst, s));
          if (hit) {
            void h;
            this.destroy(inst);
          }
        }
        break;
      }
      case 'rotate':
        inst.rotOffset += num(b.speed, 90) * dt;
        break;
      case 'sine': {
        inst.data.sineT = (inst.data.sineT || 0) + dt;
        const phase = inst.data.sineT * num(b.frequency, 1.2) * Math.PI * 2 + num(b.phase, 0);
        const offset = Math.sin(phase) * num(b.amplitude, 16);
        if (b.axis === 'x') inst.wx = inst.spawnX + offset;
        else inst.wy = inst.spawnY + offset;
        break;
      }
      case 'bounce': {
        let vx = inst.data.bvx ?? num(b.speedX, 210);
        let vy = inst.data.bvy ?? num(b.speedY, 170);
        inst.wx += vx * dt;
        inst.wy += vy * dt;
        const h = halfExtents(inst);
        if (inst.wx - h.hw < 0) { inst.wx = h.hw; vx = Math.abs(vx); }
        if (inst.wx + h.hw > this.scene.width) { inst.wx = this.scene.width - h.hw; vx = -Math.abs(vx); }
        if (inst.wy - h.hh < 0) { inst.wy = h.hh; vy = Math.abs(vy); }
        if (inst.wy + h.hh > this.scene.height) { inst.wy = this.scene.height - h.hh; vy = -Math.abs(vy); }
        inst.data.bvx = vx;
        inst.data.bvy = vy;
        break;
      }
      case 'collectible': {
        if (inst.data.collected) break;
        const tag = String(b.tag || 'player').trim();
        const target = this.instances.find(
          (o) => o.alive && o !== inst && this.hasTag(o, tag) && overlaps(o, inst),
        );
        if (!target) break;
        inst.data.collected = true;
        const name = String(b.variable || 'score');
        this.vars[name] = num(this.vars[name], 0) + num(b.value, 10);
        if (b.log) logGame(`${inst.def.name} collected → ${name} = ${this.vars[name]}`);
        this.tone(880, 0.07);
        this.destroy(inst);
        break;
      }
      case 'drag': {
        if (this.mouse.down) {
          if (!inst.data.dragging) {
            const hit = hitTest(this.instances, this.mouse.wx, this.mouse.wy);
            if (hit === inst) {
              inst.data.dragging = true;
              inst.data.grabX = inst.wx - this.mouse.wx;
              inst.data.grabY = inst.wy - this.mouse.wy;
            }
          } else {
            inst.wx = this.mouse.wx + inst.data.grabX;
            inst.wy = this.mouse.wy + inst.data.grabY;
          }
        } else {
          inst.data.dragging = false;
        }
        break;
      }
      case 'wrap': {
        const margin = num(b.margin, 24);
        const h = halfExtents(inst);
        if (inst.wx + h.hw < -margin) inst.wx = this.scene.width + h.hw;
        if (inst.wx - h.hw > this.scene.width + margin) inst.wx = -h.hw;
        if (inst.wy + h.hh < -margin) inst.wy = this.scene.height + h.hh;
        if (inst.wy - h.hh > this.scene.height + margin) inst.wy = -h.hh;
        break;
      }
      case 'timerDestroy': {
        inst.data.life = (inst.data.life || 0) + dt;
        if (inst.data.life >= num(b.life, 2)) this.destroy(inst);
        break;
      }
      case 'hitFlash': {
        if (inst.data.flash > 0) {
          inst.data.flash = Math.max(0, inst.data.flash - dt);
          inst.flashAlpha = inst.data.flash > 0 ? 0.45 : 1;
        }
        break;
      }
      default:
        break;
    }
  }

  hasTag(inst, tag) {
    if (!tag) return false;
    return String(inst.def.tags || '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
      .includes(tag);
  }

  // ---------------------------------------------------------------- scripts
  compileScript(inst) {
    const code = String(inst.def.script || '').trim();
    if (!code) return;
    try {
      // eslint-disable-next-line no-new-func
      const factory = new Function(
        'node',
        'api',
        'dt',
        `"use strict";\n${code}\n;return { onStart: typeof onStart === 'function' ? onStart : null, onUpdate: typeof onUpdate === 'function' ? onUpdate : null };`,
      );
      const api = this.makeApi(inst);
      const handlers = factory(inst, api, 0) || {};
      inst.script = { handlers, api };
      if (typeof handlers.onStart === 'function') handlers.onStart.call(inst, inst, api);
    } catch (err) {
      this.reportError(inst, err, 'script compile');
      inst.script = null;
    }
  }

  runScripts(dt) {
    for (const inst of this.instances) {
      if (!inst.alive || !inst.script) continue;
      const { handlers, api } = inst.script;
      if (typeof handlers.onUpdate !== 'function') continue;
      try {
        handlers.onUpdate.call(inst, inst, api, dt);
      } catch (err) {
        this.reportError(inst, err, 'script update');
      }
    }
  }

  makeApi(inst) {
    const engine = this;
    return {
      node: inst,
      scene: () => engine.scene,
      engine,
      vars: engine.vars,
      time: () => engine.time,
      delta: () => engine.lastDt || 0,
      find: (name) => engine.find(name),
      findTag: (tag) => engine.findTag(tag),
      findType: (type) => engine.instances.filter((i) => i.alive && i.def.type === type),
      spawn: (type, x, y, props) => engine.spawn(type, x, y, props),
      destroy: (target) => engine.destroy(target),
      setColor: (target, color) => {
        const n = engine.resolve(target);
        if (n) n.def.color = color;
      },
      setText: (target, text) => {
        const n = engine.resolve(target);
        if (n) n.def.text = String(text);
      },
      setVisible: (target, visible) => {
        const n = engine.resolve(target);
        if (n) n.def.visible = Boolean(visible);
      },
      moveBy: (target, dx, dy) => {
        const n = engine.resolve(target);
        if (n) {
          n.wx += num(dx);
          n.wy += num(dy);
        }
      },
      setPosition: (target, x, y) => {
        const n = engine.resolve(target);
        if (n) {
          n.wx = num(x);
          n.wy = num(y);
        }
      },
      keyDown: (key) => engine.isDown(key),
      clickOn: (target) => engine.clicks.some((c) => c.names.includes(engine.nameOf(target))),
      tone: (freq, dur) => engine.tone(freq, dur),
      log: (message) => logGame(message),
      rand: (a = 0, b = 1) => a + Math.random() * (b - a),
      randInt: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
      camera: engine.camera,
      count: (type) => engine.instances.filter((i) => i.alive && i.def.type === type).length,
    };
  }

  // ----------------------------------------------------------------- events
  runEvents(dt) {
    for (const event of this.scene.events || []) {
      if (event.enabled === false) continue;
      if (!this.triggerFires(event, dt)) continue;
      if (!this.conditionsPass(event)) continue;
      for (const action of event.actions || []) {
        try {
          this.runAction(action);
        } catch (err) {
          this.reportError(null, err, `action:${action.type}`);
        }
      }
    }
  }

  triggerFires(event, dt) {
    const p = event.triggerParams || {};
    switch (event.trigger) {
      case 'start':
        return this.frame === 0;
      case 'tick':
        return true;
      case 'keyDown':
        return Boolean(p.key) && this.isDown(p.key);
      case 'keyPressed':
        return Boolean(p.key) && this.isDown(p.key) && !this.prevKeys.has(p.key);
      case 'click':
        return this.clicks.some((c) => !p.node || c.names.includes(p.node));
      case 'collide': {
        const a = this.find(p.a);
        const b = this.find(p.b);
        return Boolean(a && b && a.alive && b.alive && overlaps(a, b));
      }
      case 'timer': {
        const interval = Math.max(0.05, num(p.interval, 1));
        const acc = (this.eventTimers.get(event.id) || 0) + dt;
        if (acc >= interval) {
          this.eventTimers.set(event.id, acc - interval);
          return true;
        }
        this.eventTimers.set(event.id, acc);
        return false;
      }
      default:
        return false;
    }
  }

  conditionsPass(event) {
    for (const condition of event.conditions || []) {
      if (!this.checkCondition(condition)) return false;
    }
    return true;
  }

  checkCondition(condition) {
    const p = condition.params || {};
    switch (condition.type) {
      case 'variable':
        return compare(this.vars[p.name], this.parseValue(p.value), p.op);
      case 'keyDown':
        return Boolean(p.key) && this.isDown(p.key);
      case 'nodeExists': {
        const n = this.find(p.node);
        return Boolean(n && n.alive);
      }
      case 'nodeVisible': {
        const n = this.find(p.node);
        return Boolean(n && n.alive && n.def.visible !== false);
      }
      case 'distance': {
        const a = this.find(p.a);
        const b = this.find(p.b);
        if (!a || !b) return false;
        return compare(Math.hypot(a.wx - b.wx, a.wy - b.wy), num(p.value, 0), p.op);
      }
      case 'chance':
        return Math.random() * 100 < num(p.percent, 50);
      default:
        return false;
    }
  }

  runAction(action) {
    const p = action.params || {};
    switch (action.type) {
      case 'setVar':
        this.vars[p.name] = this.parseValue(p.value);
        break;
      case 'addVar':
        this.vars[p.name] = num(this.vars[p.name], 0) + num(p.value, 0);
        break;
      case 'setPos': {
        const n = this.find(p.node);
        if (n) {
          n.wx = num(p.x, n.wx);
          n.wy = num(p.y, n.wy);
        }
        break;
      }
      case 'moveBy': {
        const n = this.find(p.node);
        if (n) {
          n.wx += num(p.dx, 0);
          n.wy += num(p.dy, 0);
        }
        break;
      }
      case 'setVelocity': {
        const n = this.find(p.node);
        if (n) {
          n.vx = num(p.vx, 0);
          n.vy = num(p.vy, 0);
        }
        break;
      }
      case 'destroy': {
        const n = this.find(p.node);
        if (n) this.destroy(n);
        break;
      }
      case 'spawn':
        this.spawn(p.type || 'rect', num(p.x, this.scene.width / 2), num(p.y, this.scene.height / 2), p.name ? { name: p.name } : {});
        break;
      case 'setVisible': {
        const n = this.find(p.node);
        if (n) n.def.visible = p.visible !== false;
        break;
      }
      case 'setColor': {
        const n = this.find(p.node);
        if (n) n.def.color = p.color || '#38bdf8';
        break;
      }
      case 'setText': {
        const n = this.find(p.node);
        if (n) n.def.text = this.interpolate(p.text);
        break;
      }
      case 'switchScene':
        if (this.onSceneSwitch) this.onSceneSwitch(p.scene);
        break;
      case 'playTone':
        this.tone(num(p.freq, 440), num(p.duration, 0.12));
        break;
      case 'log':
        logGame(this.interpolate(p.message));
        break;
      default:
        break;
    }
  }

  interpolate(text) {
    return String(text ?? '').replace(/\{(\w+)\}/g, (m, key) => (key in this.vars ? String(this.vars[key]) : m));
  }

  parseValue(value) {
    if (typeof value === 'number') return value;
    if (typeof value === 'boolean') return value;
    const str = String(value ?? '').trim();
    if (str === '') return 0;
    if (str === 'true') return true;
    if (str === 'false') return false;
    if (Object.prototype.hasOwnProperty.call(this.vars, str)) return this.vars[str];
    const n = Number(str);
    return Number.isFinite(n) ? n : str;
  }

  // ------------------------------------------------------------ node access
  find(nameOrId) {
    if (!nameOrId) return null;
    const byName = this.instances.find((i) => i.alive && i.def.name === nameOrId);
    if (byName) return byName;
    return this.byId.get(nameOrId) || null;
  }

  resolve(target) {
    if (!target) return null;
    if (typeof target === 'object') return target;
    return this.find(target);
  }

  nameOf(target) {
    const inst = this.resolve(target);
    return inst ? inst.def.name : String(target ?? '');
  }

  findTag(tag) {
    return this.instances.filter((i) => i.alive && this.hasTag(i, tag));
  }

  spawn(type, x, y, props = {}) {
    const def = createNode(type, { x, y, ...props });
    def.id = uid('rt');
    const inst = this.makeInstance(def, null);
    this.roots.push(inst);
    for (const child of def.children || []) {
      const childInst = this.makeInstance(child, inst);
      this.compileScript(childInst);
    }
    this.compileScript(inst);
    this.refreshSolids();
    return inst;
  }

  destroy(target) {
    const inst = this.resolve(target);
    if (!inst || !inst.alive) return false;
    inst.alive = false;
    inst.def.alive = false;
    for (const child of inst.children) this.destroy(child);
    return true;
  }

  cleanup() {
    if (this.instances.every((i) => i.alive)) return;
    const dead = this.instances.filter((i) => !i.alive);
    for (const inst of dead) {
      this.byId.delete(inst.id);
      if (inst.parent) {
        const idx = inst.parent.children.indexOf(inst);
        if (idx >= 0) inst.parent.children.splice(idx, 1);
      }
    }
    this.instances = this.instances.filter((i) => i.alive);
    this.roots = this.roots.filter((i) => i.alive);
    this.solids = this.solids.filter((i) => i.alive);
  }

  // ---------------------------------------------------------------- camera
  updateCamera(dt) {
    const cam = this.instances.find((i) => i.alive && i.def.type === 'camera');
    if (!cam) {
      this.camera.zoom = 1;
      this.camera.x = this.scene.width / 2;
      this.camera.y = this.scene.height / 2;
      return;
    }
    this.camera.zoom = clamp(num(cam.def.zoom, 1), 0.1, 6);
    const target = cam.def.follow ? this.find(cam.def.follow) : null;
    const tx = target ? target.wx : cam.wx;
    const ty = target ? target.wy : cam.wy;

    if (!this.cameraInit) {
      this.camera.x = tx;
      this.camera.y = ty;
      this.cameraInit = true;
    }
    const smooth = clamp(num(cam.def.smoothing, 0.15), 0.01, 1);
    const k = 1 - Math.pow(1 - smooth, dt * 60);
    this.camera.x = lerp(this.camera.x, tx, k);
    this.camera.y = lerp(this.camera.y, ty, k);

    const rect = this.canvas.getBoundingClientRect();
    const fit = Math.min((rect.width || 960) / this.scene.width, (rect.height || 540) / this.scene.height);
    const scale = fit * this.camera.zoom || 1;
    const viewW = (rect.width || 960) / scale;
    const viewH = (rect.height || 540) / scale;
    this.camera.x = this.scene.width > viewW ? clamp(this.camera.x, viewW / 2, this.scene.width - viewW / 2) : this.scene.width / 2;
    this.camera.y = this.scene.height > viewH ? clamp(this.camera.y, viewH / 2, this.scene.height - viewH / 2) : this.scene.height / 2;
  }

  // ---------------------------------------------------------------- render
  render() {
    const canvas = this.canvas;
    const ctx = this.ctx;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.width / dpr;
    const H = canvas.height / dpr;
    if (W <= 0 || H <= 0) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#060b14';
    ctx.fillRect(0, 0, W, H);

    const fit = Math.min(W / this.scene.width, H / this.scene.height);
    const scale = (fit * this.camera.zoom) || 1;

    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(scale, scale);
    ctx.translate(-this.camera.x, -this.camera.y);

    ctx.fillStyle = this.scene.bg || '#0b1020';
    ctx.fillRect(0, 0, this.scene.width, this.scene.height);
    drawInstances(ctx, this.instances, this.project, { time: this.time });
    ctx.restore();
  }

  // ----------------------------------------------------------------- audio
  tone(freq, duration) {
    try {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return;
      if (!this.audio) this.audio = new AudioCtor();
      const osc = this.audio.createOscillator();
      const gain = this.audio.createGain();
      osc.type = 'square';
      osc.frequency.value = clamp(num(freq, 440), 40, 4000);
      gain.gain.value = 0.05;
      osc.connect(gain);
      gain.connect(this.audio.destination);
      osc.start();
      osc.stop(this.audio.currentTime + clamp(num(duration, 0.12), 0.02, 2));
    } catch {
      /* audio is a nice-to-have */
    }
  }

  // ----------------------------------------------------------------- errors
  reportError(inst, err, phase) {
    const where = inst ? inst.def.name : 'event sheet';
    const key = `${where}:${phase}:${err.message}`;
    if (this.reportedErrors.has(key)) return;
    this.reportedErrors.add(key);
    logError(`${where} — ${phase}: ${err.message}`);
  }
}

export function compare(a, b, op = '==') {
  const na = typeof a === 'number' ? a : Number(a);
  const nb = typeof b === 'number' ? b : Number(b);
  const numeric = Number.isFinite(na) && Number.isFinite(nb);
  if (numeric) {
    switch (op) {
      case '==': return na === nb;
      case '!=': return na !== nb;
      case '>': return na > nb;
      case '<': return na < nb;
      case '>=': return na >= nb;
      case '<=': return na <= nb;
      default: return false;
    }
  }
  switch (op) {
    case '==': return String(a) === String(b);
    case '!=': return String(a) !== String(b);
    default: return false;
  }
}

export { flatten, drawInstances, halfExtents, worldAABB, overlaps, hitTest };
