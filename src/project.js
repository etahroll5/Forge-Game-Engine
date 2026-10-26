// ============================================================================
// Pure project model — no DOM, no globals. Safe to unit-test under Node.
// ============================================================================

import { uid, clone } from './util.js';
import { NODE_TYPES, NODE_TYPE_ORDER, BEHAVIORS, createEvent } from './schema.js';

export const VERSION = 1;
export const STORAGE_KEY = 'appjet-forge.project.v1';

export function createNode(type, overrides = {}) {
  const schema = NODE_TYPES[type] || NODE_TYPES.rect;
  const node = {
    id: uid('n'),
    type: type in NODE_TYPES ? type : 'rect',
    name: schema.label,
    x: 0,
    y: 0,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    ...clone(schema.defaults || {}),
    behaviors: [],
    script: '',
    tags: '',
    children: [],
    ...overrides,
  };
  if (typeof node.tags !== 'string') node.tags = Array.isArray(node.tags) ? node.tags.join(', ') : '';
  if (!Array.isArray(node.children)) node.children = [];
  if (!Array.isArray(node.behaviors)) node.behaviors = [];
  return node;
}

export function createScene(name = 'Scene') {
  return {
    id: uid('sc'),
    name,
    width: 960,
    height: 540,
    bg: '#0b1020',
    nodes: [],
    events: [],
    vars: {},
  };
}

export function createProject(name = 'Untitled Game') {
  return {
    name,
    version: VERSION,
    scenes: [createScene('Level 1')],
    assets: {},
    settings: { grid: 20, showGrid: true, snap: false },
  };
}

// ---------------------------------------------------------------------------
// Tree helpers
// ---------------------------------------------------------------------------
export function walkNodes(nodes, fn, parent = null, depth = 0) {
  for (const node of nodes || []) {
    fn(node, parent, depth);
    walkNodes(node.children || [], fn, node, depth + 1);
  }
}

export function flatNodes(scene) {
  const out = [];
  walkNodes(scene.nodes, (node, parent, depth) => out.push({ node, parent, depth }));
  return out;
}

export function findNode(nodes, id) {
  if (!id) return null;
  let found = null;
  walkNodes(nodes, (node) => {
    if (!found && node.id === id) found = node;
  });
  return found;
}

export function findEntry(nodes, id, parent = null, depth = 0) {
  for (let i = 0; i < (nodes || []).length; i += 1) {
    const node = nodes[i];
    if (node.id === id) return { node, parent, siblings: nodes, index: i, depth };
    const nested = findEntry(node.children || [], id, node, depth + 1);
    if (nested) return nested;
  }
  return null;
}

export function removeNode(scene, id) {
  const entry = findEntry(scene.nodes, id);
  if (!entry) return null;
  entry.siblings.splice(entry.index, 1);
  return entry.node;
}

export function insertNode(scene, node, parentId = null, index = null) {
  let siblings = scene.nodes;
  if (parentId) {
    const parent = findNode(scene.nodes, parentId);
    if (parent) {
      if (!Array.isArray(parent.children)) parent.children = [];
      siblings = parent.children;
    }
  }
  if (index === null || index === undefined || index > siblings.length) siblings.push(node);
  else siblings.splice(Math.max(0, index), 0, node);
  return node;
}

export function isDescendant(node, candidateId) {
  if (!node) return false;
  let hit = false;
  walkNodes(node.children || [], (child) => {
    if (child.id === candidateId) hit = true;
  });
  return hit;
}

export function uniqueName(scene, base) {
  const names = new Set();
  walkNodes(scene.nodes, (n) => names.add(n.name));
  if (!names.has(base)) return base;
  let i = 2;
  while (names.has(`${base} ${i}`)) i += 1;
  return `${base} ${i}`;
}

export function findByName(scene, name) {
  let found = null;
  walkNodes(scene.nodes, (node) => {
    if (!found && node.name === name) found = node;
  });
  return found;
}

export function nodeNames(scene) {
  return flatNodes(scene).map((e) => e.node.name).filter(Boolean);
}

export function allTags(scene) {
  const tags = new Set();
  walkNodes(scene.nodes, (node) => {
    String(node.tags || '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
      .forEach((t) => tags.add(t));
  });
  return [...tags];
}

// ---------------------------------------------------------------------------
// Mutations used by the editor
// ---------------------------------------------------------------------------
export function addNode(scene, type, parentId = null, overrides = {}) {
  const node = createNode(type, overrides);
  node.name = uniqueName(scene, overrides.name || NODE_TYPES[type]?.label || 'Node');
  insertNode(scene, node, parentId);
  return node;
}

export function duplicateNode(scene, id) {
  const entry = findEntry(scene.nodes, id);
  if (!entry) return null;
  const copy = clone(entry.node);
  const reid = (n) => {
    n.id = uid('n');
    n.children = (n.children || []).map((c) => reid(c));
    return n;
  };
  reid(copy);
  copy.name = uniqueName(scene, `${entry.node.name} copy`);
  entry.siblings.splice(entry.index + 1, 0, copy);
  return copy;
}

export function moveNode(scene, id, newParentId = null, index = null) {
  if (id === newParentId) return false;
  const entry = findEntry(scene.nodes, id);
  if (!entry) return false;
  if (newParentId) {
    const target = findNode(scene.nodes, newParentId);
    if (!target) return false;
    if (target.id === id || isDescendant(entry.node, target.id)) return false;
  }
  entry.siblings.splice(entry.index, 1);
  insertNode(scene, entry.node, newParentId, index);
  return true;
}

export function setNodeProp(scene, id, key, value) {
  const node = findNode(scene.nodes, id);
  if (!node) return false;
  node[key] = value;
  return true;
}

export function addBehavior(node, type) {
  const def = BEHAVIORS[type];
  if (!def) return null;
  if (!Array.isArray(node.behaviors)) node.behaviors = [];
  const behavior = { type, ...clone(def.defaults || {}) };
  node.behaviors.push(behavior);
  return behavior;
}

export function removeBehavior(node, index) {
  if (!Array.isArray(node.behaviors)) return false;
  if (index < 0 || index >= node.behaviors.length) return false;
  node.behaviors.splice(index, 1);
  return true;
}

// ---------------------------------------------------------------------------
// Import normalisation — tolerant of hand-edited JSON, strict about shape
// ---------------------------------------------------------------------------
export function normalizeNode(raw) {
  const type = raw && NODE_TYPES[raw.type] ? raw.type : 'rect';
  const node = createNode(type, {});
  Object.assign(node, raw || {});
  node.type = type;
  node.id = raw?.id || node.id;
  node.name = String(raw?.name || NODE_TYPES[type].label);
  node.children = Array.isArray(raw?.children) ? raw.children.map(normalizeNode) : [];
  node.behaviors = Array.isArray(raw?.behaviors)
    ? raw.behaviors.filter((b) => b && BEHAVIORS[b.type]).map((b) => ({ ...clone(BEHAVIORS[b.type].defaults || {}), ...b }))
    : [];
  node.script = typeof raw?.script === 'string' ? raw.script : '';
  node.tags = typeof raw?.tags === 'string' ? raw.tags : '';
  for (const key of ['x', 'y', 'rotation', 'scaleX', 'scaleY']) {
    const n = Number(node[key]);
    node[key] = Number.isFinite(n) ? n : key.startsWith('scale') ? 1 : 0;
  }
  return node;
}

export function normalizeProject(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Project JSON must be an object');
  if (!Array.isArray(raw.scenes) || raw.scenes.length === 0) throw new Error('Project needs at least one scene');

  const project = {
    name: String(raw.name || 'Imported Game'),
    version: VERSION,
    assets: raw.assets && typeof raw.assets === 'object' ? raw.assets : {},
    settings: { grid: 20, showGrid: true, snap: false, ...(raw.settings || {}) },
    scenes: raw.scenes.map((scene, i) => {
      const base = createScene(scene?.name || `Scene ${i + 1}`);
      return {
        ...base,
        name: String(scene?.name || base.name),
        width: Number(scene?.width) > 0 ? Math.round(Number(scene.width)) : base.width,
        height: Number(scene?.height) > 0 ? Math.round(Number(scene.height)) : base.height,
        bg: typeof scene?.bg === 'string' ? scene.bg : base.bg,
        nodes: Array.isArray(scene?.nodes) ? scene.nodes.map(normalizeNode) : [],
        events: Array.isArray(scene?.events) ? scene.events.map(normalizeEvent) : [],
        vars: scene?.vars && typeof scene.vars === 'object' ? scene.vars : {},
      };
    }),
  };
  return project;
}

export function normalizeEvent(raw) {
  const base = createEvent();
  const event = {
    id: raw?.id || base.id,
    enabled: raw?.enabled !== false,
    trigger: typeof raw?.trigger === 'string' ? raw.trigger : 'tick',
    triggerParams: raw?.triggerParams && typeof raw.triggerParams === 'object' ? raw.triggerParams : {},
    conditions: Array.isArray(raw?.conditions)
      ? raw.conditions.map((c) => ({ id: c?.id || uid('cd'), type: c?.type, params: c?.params || {} }))
      : [],
    actions: Array.isArray(raw?.actions)
      ? raw.actions.map((a) => ({ id: a?.id || uid('ac'), type: a?.type, params: a?.params || {} }))
      : [],
  };
  return event;
}

export function cloneWithNewIds(project) {
  const copy = clone(project);
  copy.scenes = copy.scenes.map((scene) => {
    scene.id = uid('sc');
    const reid = (n) => {
      n.id = uid('n');
      (n.children || []).forEach(reid);
      return n;
    };
    scene.nodes = scene.nodes.map(reid);
    scene.events = scene.events.map((e) => ({ ...e, id: uid('ev') }));
    return scene;
  });
  return copy;
}

export const NODE_MENU_ORDER = NODE_TYPE_ORDER;
