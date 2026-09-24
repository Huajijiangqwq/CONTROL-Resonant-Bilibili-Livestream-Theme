/* Local file decoding is separate from the editor's captured replacement target. */
(() => {
  'use strict';
  const supported = /^(image\/(png|jpeg|webp|gif)|video\/(mp4|webm))$/;
  function validate(file) {
    if (!supported.test(file?.type)) throw Error('支持 PNG / JPG / WebP / GIF / MP4 / WebM 文件。');
    if (file.size > 8 * 1024 * 1024) throw Error('单个素材不能超过 8 MB。');
  }
  function dataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(Error('文件读取失败'));
      reader.readAsDataURL(file);
    });
  }
  function dimensions(file) {
    return new Promise((resolve, reject) => {
      const video = file.type.startsWith('video/'),
        el = video ? document.createElement('video') : new Image(),
        url = URL.createObjectURL(file);
      let done = false;
      const finish = (error) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        const width = video ? el.videoWidth : el.naturalWidth,
          height = video ? el.videoHeight : el.naturalHeight;
        el.onload = el.onloadedmetadata = el.onerror = null;
        if (video) {
          el.removeAttribute('src');
          el.load();
        }
        URL.revokeObjectURL(url);
        if (error || !width || !height) reject(Error(error || '素材没有有效尺寸'));
        else resolve({ width, height });
      };
      const timer = setTimeout(() => finish('素材读取超时'), 10000);
      el.onerror = () => finish('浏览器无法解码这个素材');
      if (video) {
        el.muted = true;
        el.preload = 'metadata';
        el.onloadedmetadata = () => finish();
      } else el.onload = () => finish();
      el.src = url;
    });
  }
  async function read(file) {
    validate(file);
    const [src, size] = await Promise.all([dataURL(file), dimensions(file)]);
    return {
      src,
      ...size,
      type: file.type.startsWith('video/') ? 'video' : 'image',
      name: file.name,
    };
  }
  window.ThemeEditorImports = { validate, read };
})();
