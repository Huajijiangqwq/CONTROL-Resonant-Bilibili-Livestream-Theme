(function (root) {
  'use strict';
  const duration = 1100;
  const smooth = (a, b, v) => {
    const x = Math.max(0, Math.min(1, (v - a) / (b - a)));
    return x * x * (3 - 2 * x);
  };
  function remaining(message, clock, wall = Date.now()) {
    const value = message.expiresAt
      ? (message.expiresAt - wall) / 1000
      : message.duration - (clock - (message.timerStarted ?? message.born)) / 1000;
    return Math.max(0, value);
  }
  function advance(message, clock, wall = Date.now()) {
    if (message.kind !== 'sc') return false;
    if (message.exitAt === undefined && remaining(message, clock, wall) <= 0)
      message.exitAt = clock;
    return message.exitAt !== undefined && clock - message.exitAt >= duration;
  }
  function age(message, clock) {
    return message.exitAt === undefined ? -1 : Math.max(0, clock - message.exitAt);
  }
  function occupied(exitAge) {
    return exitAge < 0 ? 1 : 1 - smooth(275, 1030, exitAge);
  }
  const api = { duration, remaining, advance, age, occupied };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root.document) root.SCExit = api;
})(typeof window === 'object' ? window : globalThis);
