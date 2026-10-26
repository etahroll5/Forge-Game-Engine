// ============================================================================
// AppJet Forge — schema registry
// Every node type, behavior, trigger, condition and action the engine knows
// about is declared here as data. The inspector, the event-sheet UI and the
// runtime are all driven from these definitions, so adding a new capability is
// a single data entry (plus a runtime handler).
// ============================================================================

export const KEY_OPTIONS = [
  { value: 'ArrowLeft', label: 'Left Arrow' },
  { value: 'ArrowRight', label: 'Right Arrow' },
  { value: 'ArrowUp', label: 'Up Arrow' },
  { value: 'ArrowDown', label: 'Down Arrow' },
  { value: 'Space', label: 'Space' },
  { value: 'KeyW', label: 'W' },
  { value: 'KeyA', label: 'A' },
  { value: 'KeyS', label: 'S' },
  { value: 'KeyD', label: 'D' },
  { value: 'KeyE', label: 'E' },
  { value: 'KeyF', label: 'F' },
  { value: 'KeyQ', label: 'Q' },
  { value: 'KeyR', label: 'R' },
  { value: 'ShiftLeft', label: 'Shift' },
  { value: 'Enter', label: 'Enter' },
  { value: 'Escape', label: 'Escape' },
  { value: 'Digit1', label: '1' },
  { value: 'Digit2', label: '2' },
  { value: 'Digit3', label: '3' },
];

export const OP_OPTIONS = [
  { value: '==', label: '==' },
  { value: '!=', label: '!=' },
  { value: '>', label: '>' },
  { value: '<', label: '<' },
  { value: '>=', label: '>=' },
  { value: '<=', label: '<=' },
];

// ---------------------------------------------------------------------------
// Field helpers
// ---------------------------------------------------------------------------
const f = (key, label, type, extra = {}) => ({ key, label, type, ...extra });

const TRANSFORM = () => [
  f('x', 'Position X', 'number', { step: 1 }),
  f('y', 'Position Y', 'number', { step: 1 }),
  f('rotation', 'Rotation°', 'number', { step: 1 }),
  f('scaleX', 'Scale X', 'number', { step: 0.1 }),
  f('scaleY', 'Scale Y', 'number', { step: 0.1 }),
];

const BOX = () => [
  f('w', 'Width', 'number', { min: 0, step: 1 }),
  f('h', 'Height', 'number', { min: 0, step: 1 }),
];

const PHYS = () => [
  f('solid', 'Solid', 'bool', { hint: 'Nodes with Solid collide with moving behaviors' }),
  f('visible', 'Visible', 'bool'),
];

// ---------------------------------------------------------------------------
// Node types (Godot-ish: everything in a scene is a node in a tree)
// ---------------------------------------------------------------------------
export const NODE_TYPES = {
  group: {
    label: 'Group',
    icon: '▢',
    description: 'Container that moves its children',
    defaults: { visible: true, rotation: 0, scaleX: 1, scaleY: 1 },
    fields: [...TRANSFORM(), f('visible', 'Visible', 'bool')],
  },
  rect: {
    label: 'Rectangle',
    icon: '▭',
    description: 'Solid color box / platform',
    defaults: { w: 80, h: 80, color: '#38bdf8', opacity: 1, solid: false, visible: true, rotation: 0, scaleX: 1, scaleY: 1 },
    fields: [...TRANSFORM(), ...BOX(), f('color', 'Color', 'color'), f('opacity', 'Opacity', 'number', { min: 0, max: 1, step: 0.05 }), ...PHYS()],
  },
  circle: {
    label: 'Circle',
    icon: '◉',
    description: 'Round object — coins, balls, bullets',
    defaults: { w: 32, h: 32, color: '#fbbf24', opacity: 1, solid: false, visible: true, rotation: 0, scaleX: 1, scaleY: 1 },
    fields: [...TRANSFORM(), ...BOX(), f('color', 'Color', 'color'), f('opacity', 'Opacity', 'number', { min: 0, max: 1, step: 0.05 }), ...PHYS()],
  },
  sprite: {
    label: 'Sprite',
    icon: '🖼',
    description: 'Image from the asset library',
    defaults: { w: 64, h: 64, color: '#a78bfa', asset: '', opacity: 1, solid: false, visible: true, rotation: 0, scaleX: 1, scaleY: 1 },
    fields: [...TRANSFORM(), ...BOX(), f('asset', 'Image', 'asset'), f('color', 'Fallback color', 'color'), f('opacity', 'Opacity', 'number', { min: 0, max: 1, step: 0.05 }), ...PHYS()],
  },
  text: {
    label: 'Text',
    icon: 'T',
    description: 'Static label or HUD text',
    defaults: { text: 'Text', fontSize: 20, color: '#e2e8f0', opacity: 1, visible: true, rotation: 0, scaleX: 1, scaleY: 1, w: 0, h: 0 },
    fields: [
      f('text', 'Text', 'text'),
      ...TRANSFORM(),
      f('fontSize', 'Font size', 'number', { min: 6, max: 200, step: 1 }),
      f('color', 'Color', 'color'),
      f('opacity', 'Opacity', 'number', { min: 0, max: 1, step: 0.05 }),
      f('visible', 'Visible', 'bool'),
    ],
  },
  camera: {
    label: 'Camera',
    icon: '🎥',
    description: 'Follows a node; 1 unit = 1px of the stage',
    defaults: { follow: '', zoom: 1, smoothing: 0.15, visible: true, rotation: 0, scaleX: 1, scaleY: 1 },
    fields: [
      f('follow', 'Follow node', 'node'),
      f('zoom', 'Zoom', 'number', { min: 0.1, max: 6, step: 0.05 }),
      f('smoothing', 'Smoothing', 'number', { min: 0, max: 1, step: 0.01 }),
    ],
  },
};

export const NODE_TYPE_ORDER = ['group', 'rect', 'circle', 'sprite', 'text', 'camera'];

// ---------------------------------------------------------------------------
// Behaviors (Godot-ish: reusable logic attached to a node)
// ---------------------------------------------------------------------------
export const BEHAVIORS = {
  platformer: {
    label: 'Platformer',
    description: 'Gravity + left/right movement + jump on solid nodes',
    fields: [
      f('speed', 'Run speed', 'number', { min: 0, step: 10 }),
      f('jump', 'Jump power', 'number', { min: 0, step: 10 }),
      f('gravity', 'Gravity', 'number', { min: 0, step: 50 }),
      f('maxFall', 'Max fall speed', 'number', { min: 0, step: 50 }),
    ],
    defaults: { speed: 230, jump: 560, gravity: 1700, maxFall: 1300 },
  },
  topdown: {
    label: '8-Direction',
    description: 'Arrow/WASD movement in 8 directions',
    fields: [f('speed', 'Move speed', 'number', { min: 0, step: 10 })],
    defaults: { speed: 220 },
  },
  follow: {
    label: 'Follow',
    description: 'Smoothly follows another node',
    fields: [
      f('target', 'Target node', 'node'),
      f('offsetX', 'Offset X', 'number', { step: 1 }),
      f('offsetY', 'Offset Y', 'number', { step: 1 }),
      f('smoothing', 'Smoothing', 'number', { min: 0.01, max: 1, step: 0.01 }),
    ],
    defaults: { target: '', offsetX: 0, offsetY: 0, smoothing: 0.2 },
  },
  patrol: {
    label: 'Patrol',
    description: 'Moves back and forth along an axis',
    fields: [
      f('axis', 'Axis', 'select', { options: [{ value: 'x', label: 'Horizontal' }, { value: 'y', label: 'Vertical' }] }),
      f('distance', 'Distance', 'number', { min: 0, step: 10 }),
      f('speed', 'Speed', 'number', { min: 0, step: 10 }),
    ],
    defaults: { axis: 'x', distance: 160, speed: 90 },
  },
  bullet: {
    label: 'Bullet',
    description: 'Constant velocity; destroys itself outside the stage',
    fields: [
      f('speedX', 'Speed X', 'number', { step: 10 }),
      f('speedY', 'Speed Y', 'number', { step: 10 }),
      f('hitsSolids', 'Die on solid', 'bool'),
    ],
    defaults: { speedX: 520, speedY: 0, hitsSolids: true },
  },
  rotate: {
    label: 'Rotate',
    description: 'Spins continuously',
    fields: [f('speed', 'Degrees / sec', 'number', { step: 5 })],
    defaults: { speed: 90 },
  },
  sine: {
    label: 'Float (Sine)',
    description: 'Bobs up and down or side to side',
    fields: [
      f('axis', 'Axis', 'select', { options: [{ value: 'y', label: 'Vertical' }, { value: 'x', label: 'Horizontal' }] }),
      f('amplitude', 'Amplitude', 'number', { min: 0, step: 2 }),
      f('frequency', 'Frequency', 'number', { min: 0.05, step: 0.05 }),
      f('phase', 'Phase', 'number', { step: 0.1 }),
    ],
    defaults: { axis: 'y', amplitude: 16, frequency: 1.2, phase: 0 },
  },
  bounce: {
    label: 'Bounce',
    description: 'Bounces off the stage edges',
    fields: [
      f('speedX', 'Speed X', 'number', { step: 10 }),
      f('speedY', 'Speed Y', 'number', { step: 10 }),
    ],
    defaults: { speedX: 210, speedY: 170 },
  },
  collectible: {
    label: 'Collectible',
    description: 'Adds to a variable when touched by a tagged node',
    fields: [
      f('tag', 'Collector tag', 'text'),
      f('variable', 'Variable', 'text'),
      f('value', 'Amount', 'number', { step: 1 }),
      f('log', 'Log pickups', 'bool'),
    ],
    defaults: { tag: 'player', variable: 'score', value: 10, log: true },
  },
  drag: {
    label: 'Drag with mouse',
    description: 'Click and drag the node while playing',
    fields: [],
    defaults: {},
  },
  wrap: {
    label: 'Wrap around',
    description: 'Leaves one edge, reappears on the other',
    fields: [f('margin', 'Margin', 'number', { min: 0, step: 4 })],
    defaults: { margin: 24 },
  },
  timerDestroy: {
    label: 'Lifetime',
    description: 'Destroys the node after a number of seconds',
    fields: [f('life', 'Seconds', 'number', { min: 0.05, step: 0.1 })],
    defaults: { life: 2 },
  },
  hitFlash: {
    label: 'Hit flash',
    description: 'Flashes the node when an event damages it',
    fields: [f('duration', 'Seconds', 'number', { min: 0.05, step: 0.05 })],
    defaults: { duration: 0.18 },
  },
};

export const BEHAVIOR_ORDER = Object.keys(BEHAVIORS);

// ---------------------------------------------------------------------------
// Event sheet: triggers
// ---------------------------------------------------------------------------
export const TRIGGERS = {
  start: { label: 'On start of scene', fields: [] },
  tick: { label: 'Every frame', fields: [] },
  keyDown: { label: 'While key is held', fields: [f('key', 'Key', 'key')] },
  keyPressed: { label: 'On key pressed', fields: [f('key', 'Key', 'key')] },
  click: { label: 'On click node', fields: [f('node', 'Node', 'node')] },
  collide: {
    label: 'On collision',
    fields: [f('a', 'Node A', 'node'), f('b', 'Node B', 'node')],
  },
  timer: { label: 'Every N seconds', fields: [f('interval', 'Interval', 'number', { min: 0.05, step: 0.05 })] },
};

export const TRIGGER_ORDER = Object.keys(TRIGGERS);

// ---------------------------------------------------------------------------
// Event sheet: conditions
// ---------------------------------------------------------------------------
export const CONDITIONS = {
  variable: {
    label: 'Variable compare',
    fields: [
      f('name', 'Variable', 'var'),
      f('op', 'Operator', 'select', { options: OP_OPTIONS }),
      f('value', 'Value', 'text'),
    ],
  },
  keyDown: { label: 'Key is held', fields: [f('key', 'Key', 'key')] },
  nodeExists: { label: 'Node exists', fields: [f('node', 'Node', 'node')] },
  nodeVisible: { label: 'Node is visible', fields: [f('node', 'Node', 'node')] },
  distance: {
    label: 'Distance between nodes',
    fields: [
      f('a', 'Node A', 'node'),
      f('b', 'Node B', 'node'),
      f('op', 'Operator', 'select', { options: OP_OPTIONS }),
      f('value', 'Pixels', 'number', { step: 5 }),
    ],
  },
  chance: { label: 'Random chance', fields: [f('percent', 'Percent %', 'number', { min: 1, max: 100, step: 1 })] },
};

export const CONDITION_ORDER = Object.keys(CONDITIONS);

// ---------------------------------------------------------------------------
// Event sheet: actions
// ---------------------------------------------------------------------------
export const ACTIONS = {
  setVar: {
    label: 'Set variable',
    fields: [f('name', 'Variable', 'var'), f('value', 'Value', 'text')],
  },
  addVar: {
    label: 'Add to variable',
    fields: [f('name', 'Variable', 'var'), f('value', 'Amount', 'number', { step: 1 })],
  },
  setPos: {
    label: 'Set position',
    fields: [f('node', 'Node', 'node'), f('x', 'X', 'number', { step: 1 }), f('y', 'Y', 'number', { step: 1 })],
  },
  moveBy: {
    label: 'Move by',
    fields: [f('node', 'Node', 'node'), f('dx', 'Delta X', 'number', { step: 1 }), f('dy', 'Delta Y', 'number', { step: 1 })],
  },
  setVelocity: {
    label: 'Set velocity',
    fields: [f('node', 'Node', 'node'), f('vx', 'Velocity X', 'number', { step: 10 }), f('vy', 'Velocity Y', 'number', { step: 10 })],
  },
  destroy: { label: 'Destroy node', fields: [f('node', 'Node', 'node')] },
  spawn: {
    label: 'Spawn node',
    fields: [
      f('type', 'Type', 'select', { options: NODE_TYPE_ORDER.map((t) => ({ value: t, label: NODE_TYPES[t].label })) }),
      f('name', 'Name', 'text'),
      f('x', 'X', 'number', { step: 1 }),
      f('y', 'Y', 'number', { step: 1 }),
    ],
  },
  setVisible: {
    label: 'Set visibility',
    fields: [f('node', 'Node', 'node'), f('visible', 'Visible', 'bool')],
  },
  setColor: {
    label: 'Set color',
    fields: [f('node', 'Node', 'node'), f('color', 'Color', 'color')],
  },
  setText: {
    label: 'Set text',
    fields: [f('node', 'Node', 'node'), f('text', 'Text', 'text')],
  },
  switchScene: {
    label: 'Go to scene',
    fields: [f('scene', 'Scene', 'scene')],
  },
  playTone: {
    label: 'Play tone',
    fields: [
      f('freq', 'Frequency Hz', 'number', { min: 40, max: 2000, step: 10 }),
      f('duration', 'Seconds', 'number', { min: 0.02, max: 2, step: 0.01 }),
    ],
  },
  log: { label: 'Log message', fields: [f('message', 'Message', 'text')] },
};

export const ACTION_ORDER = Object.keys(ACTIONS);

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------
export function behaviorDefaults(type) {
  const def = BEHAVIORS[type];
  if (!def) return null;
  return { type, ...def.defaults };
}

export function createEvent() {
  return {
    id: `ev_${Math.random().toString(36).slice(2, 9)}`,
    enabled: true,
    trigger: 'keyPressed',
    triggerParams: { key: 'Space' },
    conditions: [],
    actions: [{ id: `ac_${Math.random().toString(36).slice(2, 9)}`, type: 'log', params: { message: 'Hello from AppJet Forge' } }],
  };
}

export function paramsFor(kind, type) {
  const registry = kind === 'trigger' ? TRIGGERS : kind === 'condition' ? CONDITIONS : ACTIONS;
  const def = registry[type];
  if (!def) return {};
  const params = {};
  for (const field of def.fields) {
    if (field.type === 'number') params[field.key] = field.min ?? 0;
    else if (field.type === 'bool') params[field.key] = false;
    else if (field.type === 'select') params[field.key] = field.options?.[0]?.value ?? '';
    else if (field.type === 'key') params[field.key] = 'Space';
    else if (field.type === 'color') params[field.key] = '#38bdf8';
    else params[field.key] = '';
  }
  return params;
}
