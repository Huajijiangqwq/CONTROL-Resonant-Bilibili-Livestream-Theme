/* Keep the real property inputs and their history; add precise editing peers. */
(() => {
  'use strict';
  function decorate(root) {
    for (const input of root.querySelectorAll(
      'input[type=range][data-prop],input[type=color][data-prop],input[type=color][data-part-prop]',
    )) {
      if (input.dataset.preciseInput) continue;
      input.dataset.preciseInput = 'true';
      const color = input.type === 'color',
        pair = document.createElement('div'),
        number = document.createElement('input');
      pair.className = color ? 'color-field' : 'range-field';
      input.replaceWith(pair);
      pair.append(input, number);
      number.type = color ? 'text' : 'number';
      number.disabled = input.disabled;
      number.setAttribute(
        'aria-label',
        (input.getAttribute('aria-label') || '参数') + (color ? '色值' : '数值'),
      );
      number.dataset.propertyPeer = input.dataset.prop || input.dataset.partProp;
      if (color) {
        number.maxLength = 7;
        number.spellcheck = false;
        number.autocomplete = 'off';
      } else for (const key of ['min', 'max', 'step']) number[key] = input[key];
      number.value = input.value;
      const valid = () =>
        color
          ? /^#[0-9a-f]{6}$/i.test(number.value)
          : number.value.trim() !== '' && Number.isFinite(+number.value);
      number.onfocus = () => input.dispatchEvent(new FocusEvent('focus'));
      number.oninput = () => {
        if (!valid()) return;
        input.value = number.value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      };
      number.onchange = () => {
        if (valid()) input.dispatchEvent(new Event('change', { bubbles: true }));
        number.value = input.value;
      };
      number.onblur = () => (number.value = input.value);
      input.addEventListener('input', () => {
        if (document.activeElement !== number) number.value = input.value;
      });
    }
  }
  window.ThemePropertyInputs = { decorate };
})();
