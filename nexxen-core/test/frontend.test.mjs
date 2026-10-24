// Non-browser template smoke: catches rendering errors, not layout, accessibility,
// browser event behavior, or CSP enforcement. Real-browser QA remains separate.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { Store } from '../lib/store.mjs';

test('non-browser frontend smoke: all six views and declined-cycle evidence render', async () => {
  const store = new Store();
  try {
    store.cardCycle({ scenario: 'success', idempotencyKey: 'ui-smoke-success' });
    store.cardCycle({ scenario: 'gpu_failed', idempotencyKey: 'ui-smoke-decline' });
    const fixture = store.state();
    const elements = new Map();
    const element = key => {
      if (!elements.has(key)) elements.set(key, {
        textContent: '', innerHTML: '', hidden: false, open: false,
        addEventListener() {}, classList: { toggle() {} },
        setAttribute() {}, removeAttribute() {}, focus() {},
        showModal() { this.open = true; }, close() { this.open = false; },
      });
      return elements.get(key);
    };
    const context = vm.createContext({
      document: { querySelector: element, querySelectorAll: () => [], addEventListener() {} },
      location: { hash: '#overview' }, window: { addEventListener() {} },
      sessionStorage: { getItem: () => null, setItem() {} },
      fetch: async () => ({ ok: true, json: async () => fixture }),
      setTimeout: () => 0, clearTimeout() {},
      crypto: { randomUUID: () => 'ui-smoke-request-key' },
    });
    vm.runInContext(readFileSync(new URL('../public/app.js', import.meta.url), 'utf8'), context);
    await new Promise(resolve => setImmediate(resolve));
    for (const view of ['overview', 'activity', 'mandates', 'credit', 'cards', 'integrations']) {
      context.location.hash = '#' + view;
      assert.doesNotThrow(() => vm.runInContext('render()', context), view);
      assert.ok(element('#view-content').innerHTML.length > 100, `${view} has content`);
      assert.doesNotMatch(element('#view-content').innerHTML, /\bNaN\b|\bundefined\b/, `${view} has defined amounts`);
    }
    vm.runInContext("showCycleReceipt(state.cycles.find(c => c.scenario === 'gpu_failed'))", context);
    const receipt = element('#receipt-content').innerHTML;
    assert.match(receipt, /declined fixture/);
    assert.match(receipt, /4\.00 USD/);
    assert.match(receipt, /not a second owner-budget charge/i);
    assert.equal(element('#receipt-dialog').open, true);
  } finally {
    store.close();
  }
});
