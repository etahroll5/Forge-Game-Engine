// Generic schema-driven form field. Used by the inspector, the event sheet and
// the variables panel so every control looks and behaves the same.

import { el, num } from '../util.js';
import { KEY_OPTIONS, NODE_TYPES } from '../schema.js';
import { nodeNames, allTags } from '../project.js';

function wrapper(field, control, wide = false) {
  return el('div', { class: `field${wide ? ' wide' : ''}` }, [
    el('label', { text: field.label || field.key, title: field.hint || field.label || field.key }),
    control,
  ]);
}

/**
 * @param {object} field   schema field
 * @param {*} value        current value
 * @param {(value:*, live:boolean)=>void} onChange
 * @param {object} ctx     { scene, compact }
 */
export function createField(field, value, onChange, ctx = {}) {
  const scene = ctx.scene;
  const type = field.type || 'text';

  if (type === 'number') {
    const input = el('input', {
      type: 'number',
      value: value === undefined || value === null || value === '' ? '' : String(value),
      step: field.step ?? 1,
      min: field.min ?? undefined,
      max: field.max ?? undefined,
      dataset: { field: field.key },
    });
    input.addEventListener('change', () => onChange(num(input.value, 0), false));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') input.blur();
    });
    return wrapper(field, input);
  }

  if (type === 'bool') {
    const input = el('input', { type: 'checkbox' });
    input.checked = Boolean(value);
    input.addEventListener('change', () => onChange(input.checked, false));
    return wrapper(field, el('div', {}, [input]));
  }

  if (type === 'color') {
    const holder = el('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } });
    const input = el('input', { type: 'color', value: value || '#38bdf8' });
    const hex = el('input', { type: 'text', value: value || '#38bdf8', style: { flex: '1' } });
    input.addEventListener('input', () => {
      hex.value = input.value;
      onChange(input.value, true);
    });
    hex.addEventListener('change', () => {
      const v = hex.value.trim();
      if (/^#[0-9a-fA-F]{3,8}$/.test(v)) {
        input.value = v;
        onChange(v, false);
      } else {
        hex.value = input.value;
      }
    });
    holder.append(input, hex);
    return wrapper(field, holder);
  }

  if (type === 'select') {
    const select = el('select');
    for (const opt of field.options || []) {
      select.appendChild(el('option', { value: opt.value, text: opt.label ?? opt.value }));
    }
    select.value = value ?? (field.options?.[0]?.value ?? '');
    select.addEventListener('change', () => onChange(select.value, false));
    return wrapper(field, select);
  }

  if (type === 'key') {
    const select = el('select');
    for (const opt of KEY_OPTIONS) select.appendChild(el('option', { value: opt.value, text: opt.label }));
    select.value = value || 'Space';
    select.addEventListener('change', () => onChange(select.value, false));
    return wrapper(field, select);
  }

  if (type === 'node') {
    const select = el('select');
    select.appendChild(el('option', { value: '', text: '— none —' }));
    for (const name of scene ? nodeNames(scene) : []) {
      select.appendChild(el('option', { value: name, text: name }));
    }
    if (value && ![...select.options].some((o) => o.value === value)) {
      select.appendChild(el('option', { value, text: `${value} (missing)` }));
    }
    select.value = value || '';
    select.addEventListener('change', () => onChange(select.value, false));
    return wrapper(field, select);
  }

  if (type === 'scene') {
    const select = el('select');
    for (const s of ctx.scenes || []) {
      select.appendChild(el('option', { value: s.name, text: s.name }));
    }
    if (value && ![...select.options].some((o) => o.value === value)) {
      select.appendChild(el('option', { value, text: `${value} (missing)` }));
    }
    select.value = value || '';
    select.addEventListener('change', () => onChange(select.value, false));
    return wrapper(field, select);
  }

  if (type === 'var') {
    const listId = `vars_${Math.random().toString(36).slice(2, 7)}`;
    const list = el('datalist', { id: listId });
    for (const name of Object.keys(scene?.vars || {})) list.appendChild(el('option', { value: name }));
    const input = el('input', { type: 'text', value: value ?? '', list: listId });
    input.addEventListener('change', () => onChange(input.value.trim(), false));
    return wrapper(field, el('div', {}, [input, list]));
  }

  if (type === 'asset') {
    const select = el('select');
    select.appendChild(el('option', { value: '', text: '— none —' }));
    for (const [id, asset] of Object.entries(ctx.assets || {})) {
      select.appendChild(el('option', { value: id, text: asset.name || id }));
    }
    select.value = value || '';
    select.addEventListener('change', () => onChange(select.value, false));
    return wrapper(field, select);
  }

  if (type === 'tags') {
    const listId = `tags_${Math.random().toString(36).slice(2, 7)}`;
    const list = el('datalist', { id: listId });
    for (const tag of scene ? allTags(scene) : []) list.appendChild(el('option', { value: tag }));
    const input = el('input', { type: 'text', value: value ?? '', list: listId, placeholder: 'player, enemy' });
    input.addEventListener('change', () => onChange(input.value, false));
    return wrapper(field, el('div', {}, [input, list]));
  }

  if (type === 'textarea') {
    const area = el('textarea', { rows: 4 });
    area.value = value ?? '';
    area.addEventListener('change', () => onChange(area.value, false));
    return wrapper(field, area, true);
  }

  // plain text
  const input = el('input', { type: 'text', value: value ?? '', dataset: { field: field.key } });
  input.addEventListener('change', () => onChange(input.value, false));
  return wrapper(field, input);
}

export function typeLabel(type) {
  return NODE_TYPES[type]?.label || type;
}
