'use strict';
// Small dependency-free DOM fixture with real reparenting, identity, selectors,
// bubbling and queued observers. It tests UI wiring, never pixel layout.
function createDocument(html) {
  const observers = new Set();
  const document = { activeElement: null, events: new Map() };
  function notify(target, type, attributeName) {
    for (const observer of observers) for (const entry of observer.targets) {
      if (target !== entry.node && !(entry.options.subtree && entry.node.contains(target))) continue;
      if (!entry.options[type] || (type === 'attributes' && entry.options.attributeFilter && !entry.options.attributeFilter.includes(attributeName))) continue;
      observer.records.push({ target, type, attributeName });
      if (!observer.pending) { observer.pending = true; queueMicrotask(() => { observer.pending = false; const records = observer.records.splice(0); if (records.length && observers.has(observer)) observer.callback(records); }); }
    }
  }
  class Text {
    constructor(value) { this.nodeType = 3; this.value = String(value); this.parentElement = null; }
    get textContent() { return this.value; }
    set textContent(value) { this.value = String(value); if (this.parentElement) notify(this.parentElement, 'childList'); }
    remove() { if (this.parentElement) this.parentElement.detach(this); }
  }
  function simple(element, selector) {
    for (const part of selector.matchAll(/:not\(([^)]+)\)/g)) if (simple(element, part[1])) return false;
    selector = selector.replace(/:not\([^)]+\)/g, '');
    if (selector === '*') return true;
    const tag = /^[a-zA-Z][\w-]*/.exec(selector)?.[0];
    if (tag && element.tagName !== tag.toUpperCase()) return false;
    for (const id of selector.matchAll(/#([\w-]+)/g)) if (element.id !== id[1]) return false;
    for (const part of selector.matchAll(/\.([\w-]+)/g)) if (!element.classList.contains(part[1])) return false;
    for (const attr of selector.matchAll(/\[([\w-]+)(?:=['"]?([^\]'"]*)['"]?)?\]/g)) {
      if (element.getAttribute(attr[1]) === null) return false;
      if (attr[2] !== undefined && element.getAttribute(attr[1]) !== attr[2]) return false;
    }
    return true;
  }
  function matches(element, selector) {
    return selector.split(',').some(group => {
      const parts = group.trim().split(/\s+/); let node = element;
      if (!simple(node, parts.pop())) return false;
      while (parts.length) { const wanted = parts.pop(); node = node.parentElement; while (node && !simple(node, wanted)) node = node.parentElement; if (!node) return false; }
      return true;
    });
  }
  class Element {
    constructor(tag) {
      this.tagName = tag.toUpperCase(); this.nodeType = 1; this.childNodes = []; this.parentElement = null;
      this.attrs = new Map(); this.events = new Map(); this.dataset = {}; this.style = {}; this.checked = false; this.disabled = false; this._value = undefined;
      this.classList = { contains: name => this.className.split(/\s+/).includes(name), add: (...names) => this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...names])].join(' '), remove: (...names) => this.className = this.className.split(/\s+/).filter(name => !names.includes(name)).join(' '), toggle: (name, force) => { const yes = force ?? !this.classList.contains(name); yes ? this.classList.add(name) : this.classList.remove(name); return yes; } };
    }
    get id() { return this.getAttribute('id') || ''; } set id(value) { this.setAttribute('id', value); }
    get className() { return this.getAttribute('class') || ''; } set className(value) { this.setAttribute('class', value); }
    get children() { return this.childNodes.filter(node => node.nodeType === 1); }
    get firstChild() { return this.childNodes[0] || null; }
    get nextElementSibling() { const children = this.parentElement?.children || []; return children[children.indexOf(this) + 1] || null; }
    get parentNode() { return this.parentElement; }
    get isConnected() { return tree.contains(this); }
    get textContent() { return this.childNodes.map(node => node.textContent).join(''); }
    set textContent(value) { this.replaceChildren(...(value == null || value === '' ? [] : [new Text(value)])); }
    get value() { return this._value ?? this.getAttribute('value') ?? (this.tagName === 'SELECT' ? this.children[0]?.value || '' : ''); }
    set value(value) { this._value = String(value); }
    get hidden() { return this.attrs.has('hidden'); } set hidden(value) { value ? this.setAttribute('hidden', '') : this.removeAttribute('hidden'); }
    get open() { return this.attrs.has('open'); } set open(value) { const before = this.open; value ? this.setAttribute('open', '') : this.removeAttribute('open'); if (before !== !!value) queueMicrotask(() => this.dispatchEvent({ type: 'toggle', bubbles: false })); }
    get href() { return new URL(this.getAttribute('href') || '', 'http://localhost:19041/theme-editor.html').href; } set href(value) { this.setAttribute('href', value); }
    get innerHTML() { return this.textContent; } set innerHTML(value) { this.replaceChildren(); parse(value, this); }
    setAttribute(name, value) { this.attrs.set(name, String(value)); if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, x) => x.toUpperCase())] = String(value); notify(this, 'attributes', name); }
    getAttribute(name) { return this.attrs.has(name) ? this.attrs.get(name) : null; }
    removeAttribute(name) { if (this.attrs.delete(name)) notify(this, 'attributes', name); }
    detach(node) { const at = this.childNodes.indexOf(node); if (at >= 0) { this.childNodes.splice(at, 1); node.parentElement = null; notify(this, 'childList'); } }
    insertBefore(node, before) { if (typeof node === 'string') node = new Text(node); node.remove(); const at = before ? this.childNodes.indexOf(before) : -1; this.childNodes.splice(at < 0 ? this.childNodes.length : at, 0, node); node.parentElement = this; notify(this, 'childList'); return node; }
    append(...nodes) { for (const node of nodes) this.insertBefore(node, null); }
    prepend(...nodes) { const before = this.firstChild; for (const node of nodes) this.insertBefore(node, before); }
    add(option) { this.append(option); }
    before(...nodes) { const parent = this.parentElement; if (parent) for (const node of nodes) parent.insertBefore(node, this); }
    after(...nodes) { const parent = this.parentElement; if (!parent) return; const next = parent.childNodes[parent.childNodes.indexOf(this) + 1] || null; for (const node of nodes) parent.insertBefore(node, next); }
    replaceChildren(...nodes) { const preserve = [...nodes]; for (const child of [...this.childNodes]) this.detach(child); this.append(...preserve); }
    remove() { this.parentElement?.detach(this); }
    contains(node) { return node === this || this.children.some(child => child.contains(node)); }
    matches(selector) { return matches(this, selector); }
    closest(selector) { let node = this; while (node) { if (node.matches(selector)) return node; node = node.parentElement; } return null; }
    querySelectorAll(selector) { return this.children.flatMap(child => [child, ...child.querySelectorAll('*')]).filter(node => node.matches(selector)); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    addEventListener(type, handler, options = false) { if (!this.events.has(type)) this.events.set(type, []); this.events.get(type).push({ handler, capture: options === true || !!options.capture }); }
    dispatchEvent(event) {
      event.target ||= this; event.preventDefault ||= function() { this.defaultPrevented = true; }; event.stopPropagation ||= function() { this.stopped = true; }; event.stopImmediatePropagation ||= function() { this.stopped = true; this.immediate = true; };
      const path = []; let at = this; while (at) { path.push(at); at = at.parentElement; }
      const invoke = (node, capture) => {
        event.currentTarget = node;
        for (const item of node.events.get(event.type) || []) { if (event.immediate) break; if (item.capture === capture) item.handler(event); }
        if (!capture && !event.immediate) node['on' + event.type]?.(event);
      };
      invoke(document, true);
      for (const node of path.slice().reverse()) { if (event.stopped) break; invoke(node, true); }
      if (!event.stopped) invoke(this, false);
      if (event.bubbles) { for (const node of path.slice(1)) { if (event.stopped) break; invoke(node, false); } if (!event.stopped) invoke(document, false); }
      return !event.defaultPrevented;
    }
    click() { if (!this.disabled) this.dispatchEvent({ type: 'click', bubbles: true, button: 0 }); }
    focus() {
      if (!this.isConnected) return;
      let node = this;
      while (node) {
        if (node.hidden || (node.tagName === 'DIALOG' && !node.open)) return;
        if (node.parentElement?.tagName === 'DETAILS' && !node.parentElement.open && node.tagName !== 'SUMMARY') return;
        node = node.parentElement;
      }
      document.activeElement = this;
    }
    select() { this.selected = true; }
    showModal() { this.returnFocus = document.activeElement; this.open = true; (this.querySelector('[autofocus]') || this.querySelector('button,input,select,textarea,summary'))?.focus(); }
    close() { this.open = false; document.activeElement = document.body; this.returnFocus?.focus(); this.dispatchEvent({ type: 'close' }); }
  }
  function parse(html, target) {
    const stack = [target], voids = new Set(['INPUT','IMG','META','LINK','BR','HR','SOURCE','AREA','WBR']);
    for (const token of String(html).match(/<!--[\s\S]*?-->|<![^>]*>|<\/?[^>]+>|[^<]+/g) || []) {
      if (token.startsWith('<!')) continue;
      if (token.startsWith('</')) { if (stack.length > 1) stack.pop(); continue; }
      if (token.startsWith('<')) {
        const tag = /^<([\w-]+)/.exec(token)?.[1]; if (!tag) continue;
        const node = new Element(tag);
        for (const attr of token.slice(tag.length + 1).matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) node.setAttribute(attr[1], attr[2] ?? attr[3] ?? attr[4] ?? '');
        if (node.attrs.has('checked')) node.checked = true;
        if (node.attrs.has('disabled')) node.disabled = true;
        stack.at(-1).append(node); if (!voids.has(node.tagName) && !token.endsWith('/>')) stack.push(node);
      } else stack.at(-1).append(new Text(token));
    }
  }
  const tree = new Element('document'); parse(html, tree);
  document.documentElement = tree.querySelector('html') || tree; document.body = tree.querySelector('body');
  document.getElementById = id => tree.querySelectorAll('[id]').find(node => node.id === id) || null;
  document.createElement = tag => new Element(tag); document.createElementNS = (ns, tag) => { const node = new Element(tag); node.namespaceURI = ns; return node; };
  document.createTextNode = value => new Text(value);
  document.querySelector = selector => tree.querySelector(selector); document.querySelectorAll = selector => tree.querySelectorAll(selector);
  document.addEventListener = (type, handler, options = false) => { if (!document.events.has(type)) document.events.set(type, []); document.events.get(type).push({ handler, capture: options === true || !!options.capture }); };
  const MutationObserver = class { constructor(callback) { this.callback = callback; this.targets = []; this.records = []; this.pending = false; } observe(node, options) { this.targets.push({ node, options }); observers.add(this); } disconnect() { observers.delete(this); this.targets = []; this.records = []; } };
  return { document, MutationObserver, dispose() { for (const observer of observers) observer.disconnect(); }, Element };
}
module.exports = { createDocument };
