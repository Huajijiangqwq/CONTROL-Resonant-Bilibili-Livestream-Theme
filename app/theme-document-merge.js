/* Three-way merge for portable theme data. Conflicts never silently overwrite. */
(function (root) {
  'use strict';
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b),
    plain = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
  function merge(base, local, remote, preference = 'local') {
    const conflicts = [];
    const theme = [base, local, remote].every(
      (doc) => doc?.format === 'control-theme' && Array.isArray(doc.layers),
    );
    const derivedGroups = theme
      ? new Set(
          [base, local, remote].flatMap((doc) =>
            doc.layers
              .filter(
                (l) => l.type === 'group' && doc.layers.some((child) => child.parent === l.id),
              )
              .map((l) => l.id),
          ),
        )
      : new Set();
    function walk(a, b, c, path) {
      if (same(b, c) || same(a, c)) return b;
      if (same(a, b)) return c;
      if (plain(b) && plain(c) && (plain(a) || a === undefined)) {
        const out = {};
        for (const key of new Set([
          ...Object.keys(a || {}),
          ...Object.keys(b),
          ...Object.keys(c),
        ])) {
          const derived =
            path.length === 2 &&
            path[0] === 'layers' &&
            b.type === 'group' &&
            c.type === 'group' &&
            derivedGroups.has(b.id) &&
            ['x', 'y', 'w', 'h'].includes(key);
          const value = derived ? b[key] : walk(a?.[key], b[key], c[key], [...path, key]);
          if (value !== undefined) out[key] = value;
        }
        return out;
      }
      if (Array.isArray(a) && Array.isArray(b) && Array.isArray(c)) {
        const all = [...a, ...b, ...c],
          identity = ['id', 'property', 'time'].find(
            (key) => all.length && all.every((x) => plain(x) && x[key] !== undefined),
          );
        if (identity) {
          const map = (rows) => new Map(rows.map((x) => [String(x[identity]), x])),
            aa = map(a),
            bb = map(b),
            cc = map(c),
            values = new Map();
          for (const id of new Set([...aa.keys(), ...bb.keys(), ...cc.keys()])) {
            const value = walk(aa.get(id), bb.get(id), cc.get(id), [...path, id]);
            if (value !== undefined) values.set(id, value);
          }
          const survivors = a
              .map((x) => String(x[identity]))
              .filter((id) => bb.has(id) && cc.has(id)),
            common = (arr) =>
              arr.map((x) => String(x[identity])).filter((id) => survivors.includes(id));
          const aOrder = survivors,
            bOrder = common(b),
            cOrder = common(c),
            localOrderChanged = !same(aOrder, bOrder),
            remoteOrderChanged = !same(aOrder, cOrder);
          let first = b,
            second = c;
          if (remoteOrderChanged && !localOrderChanged) {
            first = c;
            second = b;
          } else if (localOrderChanged && remoteOrderChanged && !same(bOrder, cOrder)) {
            conflicts.push({ path: [...path, 'order'] });
            if (preference === 'remote') {
              first = c;
              second = b;
            }
          }
          const order = first.map((x) => String(x[identity])).filter((id) => values.has(id));
          for (let i = 0; i < second.length; i++) {
            const id = String(second[i][identity]);
            if (!values.has(id) || order.includes(id)) continue;
            let before = -1;
            for (let j = i - 1; j >= 0; j--) {
              before = order.indexOf(String(second[j][identity]));
              if (before >= 0) break;
            }
            order.splice(before + 1, 0, id);
          }
          const limit =
            theme && identity === 'id'
              ? path.length === 1 && path[0] === 'layers'
                ? 100
                : path.at(-1) === 'parts'
                  ? 28
                  : 0
              : 0;
          if (limit && order.length > limit) {
            conflicts.push({ path, reason: 'capacity', limit });
            return (preference === 'remote' ? c : b)
              .filter((item) => values.has(String(item[identity])))
              .map((item) => values.get(String(item[identity])));
          }
          return order.map((id) => values.get(id));
        }
      }
      conflicts.push({ path });
      return preference === 'remote' ? c : b;
    }
    const value = structuredClone(walk(base, local, remote, []));
    if (theme)
      for (const group of value.layers.filter((l) => l.type === 'group')) {
        const children = value.layers.filter((l) => l.parent === group.id);
        if (!children.length) continue;
        const x = Math.min(...children.map((l) => l.x)),
          y = Math.min(...children.map((l) => l.y));
        Object.assign(group, {
          x,
          y,
          w: Math.max(...children.map((l) => l.x + l.w)) - x,
          h: Math.max(...children.map((l) => l.y + l.h)) - y,
        });
      }
    return { value, conflicts };
  }
  const api = { same, merge };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ThemeDocumentMerge = api;
})(globalThis);
