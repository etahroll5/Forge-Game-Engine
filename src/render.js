// ============================================================================
// Scene flattening + canvas rendering, shared by the editor viewport and the
// runtime so what you see while editing is exactly what plays.
// ============================================================================

import { getImage } from './images.js';

/** Resolved instance: definition + world transform. */
export function flatten(scene) {
  const out = [];
  const walk = (def, parent) => {
    const inst = {
      def,
      parent,
      wx: (def.x || 0) + (parent ? parent.wx : 0),
      wy: (def.y || 0) + (parent ? parent.wy : 0),
      wrot: (def.rotation || 0) + (parent ? parent.wrot : 0),
      wsx: (def.scaleX ?? 1) * (parent ? parent.wsx : 1),
      wsy: (def.scaleY ?? 1) * (parent ? parent.wsy : 1),
      children: [],
    };
    out.push(inst);
    if (parent) parent.children.push(inst);
    for (const child of def.children || []) walk(child, inst);
  };
  for (const node of scene.nodes || []) walk(node, null);
  return out;
}

export function halfExtents(inst) {
  const d = inst.def;
  return {
    hw: (Math.abs(d.w || 0) * Math.abs(inst.wsx ?? 1)) / 2,
    hh: (Math.abs(d.h || 0) * Math.abs(inst.wsy ?? 1)) / 2,
  };
}

export function worldAABB(inst) {
  const { hw, hh } = halfExtents(inst);
  return { l: inst.wx - hw, r: inst.wx + hw, t: inst.wy - hh, b: inst.wy + hh };
}

export function overlaps(a, b) {
  if (!a || !b || a === b) return false;
  const A = worldAABB(a);
  const B = worldAABB(b);
  return A.l < B.r && A.r > B.l && A.t < B.b && A.b > B.t;
}

export function pointInInst(inst, x, y) {
  const d = inst.def;
  if (d.type === 'group' || d.type === 'camera') {
    const r = 14;
    return Math.abs(x - inst.wx) < r && Math.abs(y - inst.wy) < r;
  }
  const { hw, hh } = halfExtents(inst);
  return x >= inst.wx - hw && x <= inst.wx + hw && y >= inst.wy - hh && y <= inst.wy + hh;
}

/** Topmost instance under a world-space point. */
export function hitTest(instances, x, y, opts = {}) {
  for (let i = instances.length - 1; i >= 0; i -= 1) {
    const inst = instances[i];
    if (!opts.includeHidden && inst.def.visible === false) continue;
    if (inst.def.type === 'camera' && !opts.includeHidden) continue;
    if (pointInInst(inst, x, y)) return inst;
  }
  return null;
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, radius);
    return;
  }
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/**
 * Draws resolved instances. opts: { editor, project, selectedId, time, ghost }
 */
export function drawInstances(ctx, instances, project, opts = {}) {
  const time = opts.time ?? 0;
  for (const inst of instances) {
    const d = inst.def;
    if (d.alive === false) continue;
    const hidden = d.visible === false;
    if (hidden && !opts.editor) continue;

    if (d.type === 'camera') {
      if (opts.editor) {
        ctx.save();
        ctx.translate(inst.wx, inst.wy);
        ctx.globalAlpha = 0.55;
        ctx.strokeStyle = '#38bdf8';
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.arc(0, 0, 11, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(-15, 0); ctx.lineTo(15, 0);
        ctx.moveTo(0, -15); ctx.lineTo(0, 15);
        ctx.stroke();
        ctx.restore();
      }
      continue;
    }

    ctx.save();
    ctx.translate(inst.wx, inst.wy);
    const rot = ((inst.wrot || 0) + (inst.rotOffset || 0)) * (Math.PI / 180);
    if (rot) ctx.rotate(rot);
    const alpha = (d.opacity ?? 1) * (hidden ? 0.22 : 1) * (inst.flashAlpha ?? 1);

    if (d.type === 'group') {
      if (opts.editor) {
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = '#64748b';
        ctx.beginPath();
        ctx.arc(0, 0, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      continue;
    }

    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    const w = (d.w || 0) * Math.abs(inst.wsx ?? 1);
    const h = (d.h || 0) * Math.abs(inst.wsy ?? 1);

    if (d.type === 'text') {
      ctx.fillStyle = d.color || '#e2e8f0';
      ctx.font = `600 ${Math.max(4, (d.fontSize || 16) * Math.abs(inst.wsy ?? 1))}px "Inter", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(d.text ?? '', 0, 0);
      ctx.restore();
      continue;
    }

    if (d.type === 'circle') {
      const rx = Math.max(0.5, w / 2);
      const ry = Math.max(0.5, h / 2);
      const wobble = inst.spinOffset ? 0 : 0;
      ctx.beginPath();
      ctx.ellipse(0, 0, rx + wobble, ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = d.color || '#fbbf24';
      ctx.fill();
      if (opts.editor) {
        ctx.strokeStyle = 'rgba(255,255,255,0.16)';
        ctx.lineWidth = 1.5 / (opts.zoom || 1);
        ctx.stroke();
      }
      ctx.restore();
      continue;
    }

    if (d.type === 'sprite' && d.asset && project?.assets?.[d.asset]) {
      const entry = getImage(project.assets[d.asset].dataUrl);
      if (entry && entry.loaded) {
        ctx.drawImage(entry.img, -w / 2, -h / 2, w, h);
        ctx.restore();
        continue;
      }
      // Fall through to the colored placeholder until the image decodes.
    }

    // rect / sprite fallback
    const radius = Math.min(6, Math.min(w, h) / 4);
    if (radius > 1) roundRect(ctx, -w / 2, -h / 2, w, h, radius);
    else {
      ctx.beginPath();
      ctx.rect(-w / 2, -h / 2, w, h);
    }
    ctx.fillStyle = d.color || '#38bdf8';
    ctx.fill();
    if (opts.editor) {
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.lineWidth = 1.5 / (opts.zoom || 1);
      ctx.stroke();
    }
    ctx.restore();
  }
}

/** Draw the stage bounds + grid inside a world-space transform. */
export function drawStageGuides(ctx, scene, opts = {}) {
  const zoom = opts.zoom || 1;
  if (opts.grid) {
    const step = Math.max(4, scene.grid || 20);
    ctx.save();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
    ctx.lineWidth = 1 / zoom;
    ctx.beginPath();
    for (let x = 0; x <= scene.width; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, scene.height);
    }
    for (let y = 0; y <= scene.height; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(scene.width, y);
    }
    ctx.stroke();
    ctx.restore();
  }
  ctx.save();
  ctx.strokeStyle = 'rgba(148, 197, 255, 0.35)';
  ctx.lineWidth = 2 / zoom;
  ctx.strokeRect(0, 0, scene.width, scene.height);
  ctx.restore();
}

/** Selection outline for the editor (world space, unrotated bounding box). */
export function drawSelection(ctx, inst, zoom = 1) {
  if (!inst) return;
  const d = inst.def;
  const { hw, hh } = halfExtents(inst);
  const x = inst.wx - hw;
  const y = inst.wy - hh;
  const w = Math.max(hw * 2, 12);
  const h = Math.max(hh * 2, 12);
  ctx.save();
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 1.6 / zoom;
  ctx.setLineDash([5 / zoom, 3 / zoom]);
  ctx.strokeRect(x, y, w, h);
  ctx.setLineDash([]);
  ctx.fillStyle = '#38bdf8';
  const hs = 4 / zoom;
  for (const [cx, cy] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h], [x + w / 2, y + h]]) {
    ctx.fillRect(cx - hs, cy - hs, hs * 2, hs * 2);
  }
  if (d.type === 'text' || d.type === 'group') {
    ctx.globalAlpha = 0.9;
  }
  ctx.restore();
}
