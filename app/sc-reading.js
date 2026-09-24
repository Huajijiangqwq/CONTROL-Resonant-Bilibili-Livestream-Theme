/* Fit long SC text into readable, fixed-height pages without shrinking type. */
((root) => {
  'use strict';
  function build(lines, { bodyY, lineHeight, viewportHeight, halo, enabled = true, paragraphs }) {
    const content = lines.length ? lines : [''];
    const available = enabled ? Math.max(211, viewportHeight - 2 * halo - 24) : Infinity;
    const limit = Math.min(
      content.length,
      Math.max(1, Math.floor((available - bodyY - 57) / lineHeight)),
    );
    const pages = [];
    let page = [];
    const flush = () => {
      if (page.length) {
        pages.push(page);
        page = [];
      }
    };
    for (const group of paragraphs?.length ? paragraphs : [content]) {
      if (group.length <= limit) {
        if (page.length + group.length > limit) flush();
        page.push(...group);
      } else {
        flush();
        for (let i = 0; i < group.length; i += limit) {
          page = group.slice(i, i + limit);
          if (page.length === limit) flush();
        }
      }
    }
    flush();
    const rows = Math.max(...pages.map((p) => p.length));
    const durations = pages.map((page) =>
      Math.min(12000, Math.max(6500, 2500 + Array.from(page.join('')).length * 75)),
    );
    return {
      pages,
      rows,
      height: Math.max(211, bodyY + rows * lineHeight + 57),
      durations,
      cycle: durations.reduce((sum, n) => sum + n, 0),
    };
  }
  function indexAt(reading, age) {
    if (reading.pages.length < 2) return 0;
    let time = Math.max(0, age - 1100) % reading.cycle;
    for (let i = 0; i < reading.durations.length; i++) {
      if (time < reading.durations[i]) return i;
      time -= reading.durations[i];
    }
    return 0;
  }
  const api = { build, indexAt };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SCReading = api;
})(globalThis);
