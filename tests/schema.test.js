import test from 'node:test';
import assert from 'node:assert/strict';

import {
  NODE_TYPES,
  NODE_TYPE_ORDER,
  BEHAVIORS,
  BEHAVIOR_ORDER,
  TRIGGERS,
  TRIGGER_ORDER,
  CONDITIONS,
  CONDITION_ORDER,
  ACTIONS,
  ACTION_ORDER,
  KEY_OPTIONS,
  OP_OPTIONS,
  paramsFor,
  createEvent,
} from '../src/schema.js';

const FIELD_TYPES = new Set(['number', 'text', 'color', 'bool', 'select', 'key', 'node', 'var', 'asset', 'tags', 'textarea', 'scene']);

function checkFields(fields, label) {
  for (const field of fields) {
    assert.ok(field.key, `${label}: field without key`);
    assert.ok(field.label, `${label}: ${field.key} has no label`);
    assert.ok(FIELD_TYPES.has(field.type), `${label}: ${field.key} has invalid type ${field.type}`);
    if (field.type === 'select') {
      assert.ok(Array.isArray(field.options) && field.options.length, `${label}: ${field.key} select has no options`);
    }
  }
}

test('every node type has defaults and valid fields', () => {
  for (const type of NODE_TYPE_ORDER) {
    const def = NODE_TYPES[type];
    assert.ok(def, `${type} missing from NODE_TYPES`);
    assert.ok(def.label && def.icon, `${type} needs label + icon`);
    checkFields(def.fields, type);
    assert.equal(typeof def.defaults, 'object');
  }
  assert.equal(NODE_TYPE_ORDER.length, Object.keys(NODE_TYPES).length);
});

test('no node type declares the same field key twice', () => {
  for (const type of NODE_TYPE_ORDER) {
    const keys = NODE_TYPES[type].fields.map((f) => f.key);
    assert.equal(new Set(keys).size, keys.length, `${type} has duplicate field keys: ${keys.join(', ')}`);
  }
});

test('every behavior has defaults and valid fields', () => {
  for (const type of BEHAVIOR_ORDER) {
    const def = BEHAVIORS[type];
    assert.ok(def.label, `${type} needs a label`);
    checkFields(def.fields, `behavior:${type}`);
    assert.equal(typeof def.defaults, 'object', `${type} needs defaults`);
  }
});

test('every trigger, condition and action declares valid fields', () => {
  for (const key of TRIGGER_ORDER) checkFields(TRIGGERS[key].fields, `trigger:${key}`);
  for (const key of CONDITION_ORDER) checkFields(CONDITIONS[key].fields, `condition:${key}`);
  for (const key of ACTION_ORDER) checkFields(ACTIONS[key].fields, `action:${key}`);
});

test('paramsFor produces a numeric or typed default for every field', () => {
  for (const key of TRIGGER_ORDER) {
    const params = paramsFor('trigger', key);
    for (const field of TRIGGERS[key].fields) {
      assert.ok(field.key in params, `trigger ${key} missing param ${field.key}`);
      if (field.type === 'number') assert.equal(typeof params[field.key], 'number');
    }
  }
  for (const key of CONDITION_ORDER) assert.equal(typeof paramsFor('condition', key), 'object');
  for (const key of ACTION_ORDER) assert.equal(typeof paramsFor('action', key), 'object');
  assert.deepEqual(paramsFor('action', 'nope'), {});
});

test('key and operator options are well formed', () => {
  for (const opt of KEY_OPTIONS) assert.ok(opt.value.startsWith('Key') || opt.value.startsWith('Arrow') || /^[A-Z]/.test(opt.value));
  assert.equal(OP_OPTIONS.length, 6);
});

test('createEvent returns a runnable event', () => {
  const event = createEvent();
  assert.ok(TRIGGERS[event.trigger], 'default trigger must exist');
  for (const action of event.actions) assert.ok(ACTIONS[action.type], 'default action must exist');
  for (const condition of event.conditions) assert.ok(CONDITIONS[condition.type]);
  assert.equal(event.enabled, true);
  assert.ok(event.triggerParams && typeof event.triggerParams === 'object');
});
