// Editor viewport: pan/zoom, stage guides, click selection and drag-to-move.

import { el, clear, clamp, num } from '../util.js';
import { flatten, drawInstances, drawStageGuides, drawSelection, hitTest } from '../render.js';
import { findEntry } from '../project.js';

export function initViewport(canvas, store, options = {}) {
  const ctx = canvas.getContext('2d');
  const hud = options.hud || null;
  const onZoom = options.onZoom || (() => {});
  const view = { x: 0, y: 0, zoom: 1 };
  let dpr = window.devicePixelRatio || 1;
  let instances = [];
  let instById = new Map();
  let active = true;
  let drag = null;
  let pan = null;
  let pointer = { sx: 0, sy: 0, wx: 0, wy: 0 };

  function canvasSize() {
    const rect = canvas.getBoundingClientRect();
    return { w: rect.width || canvas.clientWidth || 800, h: rect.height || canvas.clientHeight || 600, rect };
  }

  function resize() {
    dpr = window.devicePixelRatio || 1;
    const { w, h } = canvasSize();
    const width = Math.max(1, Math.round(w * dpr));
    const height = Math.max(1, Math.round(h * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }

  function scale() {
    const scene = store.scene();
    const { w, h } = canvasSize();
    return Math.min(w / scene.width, h / scene.height) * view.zoom || 1;
  }

  function screenToWorld(sx, sy) {
    const { w, h } = canvasSize();
    const s = scale();
    return { x: (sx - w / 2) / s + view.x, y: (sy - h / 2) / s + view.y };
  }

  function fit() {
    const scene = store.scene();
    resize();
    const { w, h } = canvasSize();
    const fitScale = Math.min((w - 48) / scene.width, (h - 48) / scene.height);
    view.zoom = clamp(fitScale / Math.min(w / scene.width, h / scene.height) || 1, 0.1, 6);
    view.x = scene.width / 2;
    view.y = scene.height / 2;
    onZoom(view.zoom);
    render();
  }

  function refreshInstances() {
    const scene = store.scene();
    instances = flatten(scene);
    instById = new Map(instances.map((i) => [i.def.id, i]));
  }

  function render() {
    resize();
    if (!active) return;
    const scene = store.scene();
    const { w, h } = canvasSize();
    const s = scale();
    refreshInstances();

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#070d18';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(s, s);
    ctx.translate(-view.x, -view.y);

    // stage
    ctx.fillStyle = scene.bg || '#0b1020';
    ctx.fillRect(0, 0, scene.width, scene.height);
    drawStageGuides(ctx, scene, { grid: store.project.settings.showGrid, zoom: s, step: store.project.settings.grid });

    drawInstances(ctx, instances, store.project, { editor: true, zoom: s });

    const selected = instances.find((i) => i.def.id === store.selectedId);
    if (selected) drawSelection(ctx, selected, s);

    ctx.restore();

    updateHud(scene);
  }

  function updateHud(scene) {
    if (!hud) return;
    clear(hud);
    const selected = store.selected();
    const chips = [
      ['Scene', scene.name],
      ['Nodes', String(instances.length)],
      ['Cursor', `${Math.round(pointer.wx)}, ${Math.round(pointer.wy)}`],
    ];
    if (selected) chips.push(['Selected', selected.name]);
    if (drag) chips.push(['Drag', `${Math.round(drag.node.x)}, ${Math.round(drag.node.y)}`]);
    for (const [k, v] of chips) {
      hud.appendChild(el('span', { class: 'hud-chip' }, [`${k}: `, el('strong', { text: v })]));
    }
  }

  // ------------------------------------------------------------- interaction
  function localPointToNode(node, worldX, worldY) {
    const entry = findEntry(scene().nodes, node.id);
    const parentInst = entry?.parent ? instById.get(entry.parent.id) : null;
    if (!parentInst) return { x: worldX, y: worldY };
    const psx = Math.abs(parentInst.wsx || 1);
    const psy = Math.abs(parentInst.wsy || 1);
    return { x: (worldX - parentInst.wx) / psx, y: (worldY - parentInst.wy) / psy };
  }

  function scene() {
    return store.scene();
  }

  function snapValue(v) {
    if (!store.project.settings.snap) return Math.round(v);
    const grid = Math.max(2, num(store.project.settings.grid, 20));
    return Math.round(v / grid) * grid;
  }

  function onPointerDown(e) {
    canvas.setPointerCapture?.(e.pointerId);
    const { rect } = canvasSize();
    pointer.sx = e.clientX - rect.left;
    pointer.sy = e.clientY - rect.top;
    const world = screenToWorld(pointer.sx, pointer.sy);
    pointer.wx = world.x;
    pointer.wy = world.y;

    if (e.button === 1 || e.button === 2 || e.altKey || e.getModifierState?.('Space')) {
      pan = { sx: pointer.sx, sy: pointer.sy, vx: view.x, vy: view.y };
      canvas.style.cursor = 'grabbing';
      return;
    }

    const hit = hitTest(instances, world.x, world.y, { includeHidden: true });
    if (!hit) {
      store.select(null);
      return;
    }
    store.select(hit.def.id);
    const node = hit.def;
    const parentEntry = findEntry(scene().nodes, node.id);
    const parentInst = parentEntry?.parent ? instById.get(parentEntry.parent.id) : null;
    drag = {
      node,
      parentInst,
      startX: node.x,
      startY: node.y,
      startWorld: world,
      moved: false,
      batchStarted: false,
      pointerId: e.pointerId,
    };
    canvas.style.cursor = 'grabbing';
  }

  function onPointerMove(e) {
    const { rect } = canvasSize();
    pointer.sx = e.clientX - rect.left;
    pointer.sy = e.clientY - rect.top;
    const world = screenToWorld(pointer.sx, pointer.sy);
    pointer.wx = world.x;
    pointer.wy = world.y;

    if (pan) {
      const s = scale();
      view.x = pan.vx - (pointer.sx - pan.sx) / s;
      view.y = pan.vy - (pointer.sy - pan.sy) / s;
      render();
      return;
    }

    if (drag) {
      const psx = drag.parentInst ? Math.abs(drag.parentInst.wsx || 1) : 1;
      const psy = drag.parentInst ? Math.abs(drag.parentInst.wsy || 1) : 1;
      const dx = (world.x - drag.startWorld.x) / psx;
      const dy = (world.y - drag.startWorld.y) / psy;
      drag.node.x = snapValue(drag.startX + dx);
      drag.node.y = snapValue(drag.startY + dy);
      drag.moved = true;
      store.type('drag');
      render();
      return;
    }

    updateHud(scene());
  }

  function onPointerUp(e) {
    canvas.releasePointerCapture?.(e.pointerId);
    canvas.style.cursor = 'crosshair';
    if (pan) {
      pan = null;
      return;
    }
    if (drag) {
      const moved = drag.moved;
      drag = null;
      if (moved) store.type('drag'); // batch already owns the pre-drag snapshot
      render();
    }
  }

  function onWheel(e) {
    e.preventDefault();
    const { rect } = canvasSize();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const before = screenToWorld(sx, sy);
    const factor = Math.exp(-e.deltaY * 0.0016);
    view.zoom = clamp(view.zoom * factor, 0.1, 8);
    const after = screenToWorld(sx, sy);
    view.x += before.x - after.x;
    view.y += before.y - after.y;
    onZoom(view.zoom);
    render();
  }

  function nudge(dx, dy) {
    const node = store.selected();
    if (!node) return;
    store.commit('nudge', () => {
      node.x = Math.round(node.x + dx);
      node.y = Math.round(node.y + dy);
    });
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  const ro = new ResizeObserver(() => render());
  ro.observe(canvas.parentElement || canvas);

  store.subscribe((reason) => {
    if (!active && reason !== 'play') return;
    if (reason === 'transform') {
      render();
      return;
    }
    render();
  });

  fit();

  return {
    render,
    fit,
    nudge,
    setActive(value) {
      active = value;
      if (value) render();
    },
    get zoom() {
      return view.zoom;
    },
    screenToWorld,
  };
}
