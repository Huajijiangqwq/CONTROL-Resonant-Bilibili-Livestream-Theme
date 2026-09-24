((root) => {
  'use strict';
  function create(
    send,
    { limit = 200, timeout = 15000, setTimer = setTimeout, clearTimer = clearTimeout } = {},
  ) {
    let sequence = 0;
    const pending = new Map();
    function settle(receipt, accepted) {
      const entry = pending.get(receipt);
      if (!entry) return;
      pending.delete(receipt);
      clearTimer(entry.timer);
      entry.resolve(accepted === true);
    }
    return {
      send(item) {
        if (pending.size >= limit) return false;
        return new Promise((resolve) => {
          const receipt = ++sequence,
            timer = setTimer(() => settle(receipt, false), timeout);
          pending.set(receipt, { resolve, timer });
          try {
            send(receipt, item);
          } catch {
            settle(receipt, false);
          }
        });
      },
      acknowledge(receipt, accepted) {
        settle(receipt, accepted);
      },
      has(receipt) {
        return pending.has(receipt);
      },
      clear() {
        for (const receipt of pending.keys()) settle(receipt, false);
      },
      get size() {
        return pending.size;
      },
    };
  }
  const api = { create };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LiveDelivery = api;
})(globalThis);
