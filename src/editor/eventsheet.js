// Construct-style event sheet: "When <trigger> → if <conditions> → do <actions>".

import { el, clear } from '../util.js';
import { TRIGGERS, TRIGGER_ORDER, CONDITIONS, CONDITION_ORDER, ACTIONS, ACTION_ORDER, paramsFor, createEvent } from '../schema.js';
import { createField } from './fields.js';

export function initEventSheet(rootEl, store) {
  function ctx() {
    return { scene: store.scene(), scenes: store.project.scenes, assets: store.project.assets };
  }

  function currentEvent(eventId) {
    return store.scene().events.find((e) => e.id === eventId);
  }

  function inlineField(field, value, onChange) {
    const holder = createField(field, value, onChange, ctx());
    const control = holder.lastChild;
    const width = field.type === 'text' ? 128 : field.type === 'color' ? 96 : field.type === 'bool' ? 30 : field.type === 'number' ? 78 : 108;
    control.style.width = `${width}px`;
    control.style.minWidth = `${Math.min(width, 60)}px`;
    return el('div', { style: { display: 'flex', alignItems: 'center', gap: '5px' } }, [
      el('span', { style: { color: '#6b81a3', fontSize: '10.5px', whiteSpace: 'nowrap' }, text: field.label }),
      control,
    ]);
  }

  function registrySelect(registry, order, value, onChange) {
    const select = el('select', { style: { width: 'auto', minWidth: '112px' } });
    for (const key of order) select.appendChild(el('option', { value: key, text: registry[key].label }));
    select.value = value;
    select.addEventListener('change', () => onChange(select.value));
    return select;
  }

  function paramRow(registry, item, onChange, extraClass = '') {
    const def = registry[item.type];
    const fields = def ? def.fields : [];
    return el('div', { class: `event-row ${extraClass}` }, [
      registrySelect(registry, item.kind === 'trigger' ? TRIGGER_ORDER : item.registryOrder, item.type, (type) => {
        onChange({ ...item, type, params: paramsFor(item.kind, type) });
      }),
      ...fields.map((field) =>
        inlineField(field, item.params?.[field.key], (value) =>
          onChange({ ...item, params: { ...(item.params || {}), [field.key]: value } }),
        ),
      ),
    ]);
  }

  function addRowButtons(event) {
    const addCondition = el('button', { class: 'btn tiny', text: '+ Condition' });
    addCondition.addEventListener('click', () => {
      store.updateEvent(event.id, (e) => {
        const type = CONDITION_ORDER[0];
        e.conditions.push({ id: `cd_${Math.random().toString(36).slice(2, 8)}`, type, params: paramsFor('condition', type) });
      });
    });
    const addAction = el('button', { class: 'btn tiny', text: '+ Action' });
    addAction.addEventListener('click', () => {
      store.updateEvent(event.id, (e) => {
        const type = ACTION_ORDER[0];
        e.actions.push({ id: `ac_${Math.random().toString(36).slice(2, 8)}`, type, params: paramsFor('action', type) });
      });
    });
    return el('div', { style: { display: 'flex', gap: '5px', marginTop: '4px' } }, [addCondition, addAction]);
  }

  function conditionRow(event, condition, index) {
    const select = el('select', { style: { width: 'auto', minWidth: '112px' } });
    for (const key of CONDITION_ORDER) select.appendChild(el('option', { value: key, text: CONDITIONS[key].label }));
    select.value = condition.type;
    select.addEventListener('change', () => {
      store.updateEvent(event.id, (e) => {
        const target = e.conditions[index];
        target.type = select.value;
        target.params = paramsFor('condition', select.value);
      });
    });

    const fields = (CONDITIONS[condition.type]?.fields) || [];
    return el('div', { class: 'event-row cond' }, [
      el('span', { class: 'lbl', text: index === 0 ? 'If' : 'and' }),
      select,
      ...fields.map((field) =>
        inlineField(field, condition.params?.[field.key], (value) => {
          store.updateEvent(event.id, (e) => {
            e.conditions[index].params = { ...e.conditions[index].params, [field.key]: value };
          });
        }),
      ),
      el('button', {
        class: 'row-x',
        text: '×',
        title: 'Remove condition',
        on: {
          click: () => store.updateEvent(event.id, (e) => e.conditions.splice(index, 1)),
        },
      }),
    ]);
  }

  function actionRow(event, action, index) {
    const select = el('select', { style: { width: 'auto', minWidth: '112px' } });
    for (const key of ACTION_ORDER) select.appendChild(el('option', { value: key, text: ACTIONS[key].label }));
    select.value = action.type;
    select.addEventListener('change', () => {
      store.updateEvent(event.id, (e) => {
        const target = e.actions[index];
        target.type = select.value;
        target.params = paramsFor('action', select.value);
      });
    });

    const fields = (ACTIONS[action.type]?.fields) || [];
    return el('div', { class: 'event-row act' }, [
      el('span', { class: 'lbl', text: index === 0 ? 'Do' : 'and' }),
      select,
      ...fields.map((field) =>
        inlineField(field, action.params?.[field.key], (value) => {
          store.updateEvent(event.id, (e) => {
            e.actions[index].params = { ...e.actions[index].params, [field.key]: value };
          });
        }),
      ),
      el('button', {
        class: 'row-x',
        text: '×',
        title: 'Remove action',
        on: {
          click: () => store.updateEvent(event.id, (e) => e.actions.splice(index, 1)),
        },
      }),
    ]);
  }

  function render() {
    clear(rootEl);
    const scene = store.scene();
    const events = scene.events || [];

    const toolbar = el('div', { style: { display: 'flex', gap: '6px', marginBottom: '8px', alignItems: 'center' } }, [
      el('button', {
        class: 'btn tiny primary',
        text: '+ Add event',
        on: { click: () => store.addEvent(createEvent()) },
      }),
      el('span', { style: { color: '#5f7291', fontSize: '11px' }, text: `${events.length} event(s) on “${scene.name}”` }),
      el('span', { style: { marginLeft: 'auto', color: '#5f7291', fontSize: '11px' }, text: 'Events run every frame while playing' }),
    ]);
    rootEl.appendChild(toolbar);

    if (!events.length) {
      rootEl.appendChild(
        el('div', { class: 'tree-empty' }, [
          'No events yet.',
          el('br'),
          'Add one to react to keys, collisions, timers or clicks.',
        ]),
      );
      return;
    }

    events.forEach((event, index) => {
      const card = el('div', { class: `event-card${event.enabled === false ? ' disabled' : ''}` });
      const main = el('div', { class: 'event-main' });

      const triggerSelect = registrySelect(TRIGGERS, TRIGGER_ORDER, event.trigger, (value) => {
        store.updateEvent(event.id, (e) => {
          e.trigger = value;
          e.triggerParams = paramsFor('trigger', value);
        });
      });
      const triggerFields = TRIGGERS[event.trigger]?.fields || [];
      main.appendChild(
        el('div', { class: 'event-row' }, [
          el('span', { class: 'lbl', text: 'When' }),
          triggerSelect,
          ...triggerFields.map((field) =>
            inlineField(field, event.triggerParams?.[field.key], (value) => {
              store.updateEvent(event.id, (e) => {
                e.triggerParams = { ...(e.triggerParams || {}), [field.key]: value };
              });
            }),
          ),
        ]),
      );

      event.conditions.forEach((condition, i) => main.appendChild(conditionRow(event, condition, i)));
      const actions = el('div', { class: 'event-actions' });
      event.actions.forEach((action, i) => actions.appendChild(actionRow(event, action, i)));
      main.appendChild(actions);
      main.appendChild(addRowButtons(event));

      const side = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' } }, [
        el('label', { class: 'chk', title: 'Enable / disable' }, [
          (() => {
            const cb = el('input', { type: 'checkbox' });
            cb.checked = event.enabled !== false;
            cb.addEventListener('change', () => {
              store.updateEvent(event.id, (e) => {
                e.enabled = cb.checked;
              });
            });
            return cb;
          })(),
        ]),
        el('div', { style: { display: 'flex', gap: '2px' } }, [
          el('button', { class: 'btn tiny', text: '↑', title: 'Move up', on: { click: () => store.moveEvent(event.id, -1) } }),
          el('button', { class: 'btn tiny', text: '↓', title: 'Move down', on: { click: () => store.moveEvent(event.id, 1) } }),
          el('button', { class: 'btn tiny danger', text: '🗑', title: 'Delete event', on: { click: () => store.removeEvent(event.id) } }),
        ]),
      ]);

      card.append(main, side);
      rootEl.appendChild(card);
      void index;
    });
  }

  store.subscribe((reason) => {
    if (reason === 'transform') return;
    render();
  });
  render();
  return { render };
}
