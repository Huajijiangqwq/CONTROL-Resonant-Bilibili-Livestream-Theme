/* Two staggered material-coordinate fields. Their samples are blended while
   each field transports the same details through the local velocity field. */
((root) => {
  'use strict';
  // Transfer in logical pixels, preserving material size across aspect changes.
  function createTransfer(gl, vertex) {
    const shaders = [],
      program = gl.createProgram();
    try {
      const fragment = `#version 300 es
  precision highp float;
  uniform sampler2D oldField;
  uniform vec2 oldSize,newSize,newGrid;
  out vec4 outColor;
  void main(){vec2 p=vec2(gl_FragCoord.x/newGrid.x,1.-gl_FragCoord.y/newGrid.y)*newSize;
   if(p.x>=oldSize.x||p.y>=oldSize.y){outColor=vec4(0.);return;}
   outColor=texture(oldField,vec2(p.x/oldSize.x,1.-p.y/oldSize.y));}`;
      for (const [type, code] of [
        [gl.VERTEX_SHADER, vertex],
        [gl.FRAGMENT_SHADER, fragment],
      ]) {
        const shader = gl.createShader(type);
        shaders.push(shader);
        gl.shaderSource(shader, code);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
          throw Error(gl.getShaderInfoLog(shader));
        gl.attachShader(program, shader);
      }
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw Error(gl.getProgramInfoLog(program));
      const u = Object.fromEntries(
        ['oldField', 'oldSize', 'newSize', 'newGrid'].map((k) => [
          k,
          gl.getUniformLocation(program, k),
        ]),
      );
      let disposed = false;
      return {
        run(texture, framebuffer, oldSize, newSize, grid) {
          if (disposed) return;
          gl.useProgram(program);
          gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
          gl.viewport(0, 0, ...grid);
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.uniform1i(u.oldField, 0);
          gl.uniform2f(u.oldSize, ...oldSize);
          gl.uniform2f(u.newSize, ...newSize);
          gl.uniform2f(u.newGrid, ...grid);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        },
        dispose() {
          if (disposed) return;
          disposed = true;
          gl.deleteProgram(program);
        },
      };
    } catch (error) {
      gl.deleteProgram(program);
      throw error;
    } finally {
      for (const shader of shaders) gl.deleteShader(shader);
    }
  }
  function create(gl, options) {
    if (!options.enabled) return null;
    let program = null,
      fields = [],
      read = 0,
      disposed = false;
    const shaders = [],
      locations = {};
    const fragment = `#version 300 es
 precision highp float;
 uniform sampler2D previousFlow;
 uniform vec2 logicalSize,fieldSize;
 uniform vec4 card;
 uniform float time,delta,reset;
 out vec4 outColor;
 ${options.common}
 void main(){
  vec2 p=vec2(gl_FragCoord.x/fieldSize.x,1.-gl_FragCoord.y/fieldSize.y)*logicalSize;
  vec2 previous=backtrace(p,time,delta,card);
  vec2 uv=clamp(previous/logicalSize,vec2(.001),vec2(.999));
  vec4 history=texture(previousFlow,vec2(uv.x,1.-uv.y));
  vec2 travel=previous-p;
  vec2 a=history.xy+travel,b=history.zw+travel;
  vec2 seed=backtrace(backtrace(p,time,1.5,card),time-1.5,1.5,card)-p;
  if(reset>.5||floor(time/3.2)!=floor((time-delta)/3.2))a=seed;
  if(reset>.5||floor((time+1.6)/3.2)!=floor((time-delta+1.6)/3.2))b=seed;
  outColor=vec4(a,b);
 }`;
    function dispose() {
      if (disposed) return;
      disposed = true;
      for (const f of fields) {
        gl.deleteTexture(f.texture);
        gl.deleteFramebuffer(f.framebuffer);
      }
      fields = [];
      if (program) gl.deleteProgram(program);
      program = null;
    }
    try {
      for (const [type, code] of [
        [gl.VERTEX_SHADER, options.vertex],
        [gl.FRAGMENT_SHADER, fragment],
      ]) {
        const shader = gl.createShader(type);
        shaders.push(shader);
        gl.shaderSource(shader, code);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
          throw new Error(gl.getShaderInfoLog(shader));
      }
      program = gl.createProgram();
      for (const shader of shaders) gl.attachShader(program, shader);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw new Error(gl.getProgramInfoLog(program));
      for (const name of [
        'previousFlow',
        'logicalSize',
        'fieldSize',
        'card',
        'time',
        'delta',
        'reset',
      ])
        locations[name] = gl.getUniformLocation(program, name);
      gl.activeTexture(gl.TEXTURE3);
      for (let i = 0; i < 2; i++) {
        const f = { texture: gl.createTexture(), framebuffer: gl.createFramebuffer() };
        fields.push(f);
        gl.bindTexture(gl.TEXTURE_2D, f.texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA16F,
          options.fieldWidth,
          options.fieldHeight,
          0,
          gl.RGBA,
          gl.HALF_FLOAT,
          null,
        );
        gl.bindFramebuffer(gl.FRAMEBUFFER, f.framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, f.texture, 0);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
          throw new Error('Material flow buffer unavailable');
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return {
        step(time, delta, reset, card) {
          if (disposed) return;
          gl.useProgram(program);
          gl.bindFramebuffer(gl.FRAMEBUFFER, fields[1 - read].framebuffer);
          gl.viewport(0, 0, options.fieldWidth, options.fieldHeight);
          gl.activeTexture(gl.TEXTURE3);
          gl.bindTexture(gl.TEXTURE_2D, fields[read].texture);
          gl.uniform1i(locations.previousFlow, 3);
          gl.uniform2f(locations.logicalSize, options.width, options.height);
          gl.uniform2f(locations.fieldSize, options.fieldWidth, options.fieldHeight);
          gl.uniform4f(locations.card, card.x, card.y, card.w, card.h);
          gl.uniform1f(locations.time, time);
          gl.uniform1f(locations.delta, delta);
          gl.uniform1f(locations.reset, reset ? 1 : 0);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          read = 1 - read;
        },
        resize(width, height, fieldWidth = options.fieldWidth, fieldHeight = options.fieldHeight) {
          if (disposed) return false;
          if (
            width === options.width &&
            height === options.height &&
            fieldWidth === options.fieldWidth &&
            fieldHeight === options.fieldHeight
          )
            return true;
          if (options.transfer) {
            const old = fields,
              oldRead = read;
            let fresh = [];
            try {
              if (fieldWidth !== options.fieldWidth || fieldHeight !== options.fieldHeight) {
                for (let i = 0; i < 2; i++) {
                  const f = { texture: gl.createTexture(), framebuffer: gl.createFramebuffer() };
                  fresh.push(f);
                  gl.activeTexture(gl.TEXTURE3);
                  gl.bindTexture(gl.TEXTURE_2D, f.texture);
                  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                  gl.texImage2D(
                    gl.TEXTURE_2D,
                    0,
                    gl.RGBA16F,
                    fieldWidth,
                    fieldHeight,
                    0,
                    gl.RGBA,
                    gl.HALF_FLOAT,
                    null,
                  );
                  gl.bindFramebuffer(gl.FRAMEBUFFER, f.framebuffer);
                  gl.framebufferTexture2D(
                    gl.FRAMEBUFFER,
                    gl.COLOR_ATTACHMENT0,
                    gl.TEXTURE_2D,
                    f.texture,
                    0,
                  );
                  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
                    throw Error('SC resized flow buffer unavailable');
                }
              }
              const target = fresh.length ? fresh[0] : fields[1 - read];
              options.transfer.run(
                old[oldRead].texture,
                target.framebuffer,
                [options.width, options.height],
                [width, height],
                [fieldWidth, fieldHeight],
              );
              if (fresh.length) {
                fields = fresh;
                read = 0;
                for (const f of old) {
                  gl.deleteTexture(f.texture);
                  gl.deleteFramebuffer(f.framebuffer);
                }
              } else read = 1 - read;
            } catch (error) {
              for (const f of fresh) {
                gl.deleteTexture(f.texture);
                gl.deleteFramebuffer(f.framebuffer);
              }
              console.warn('SC material resize unavailable:', error.message);
              return false;
            }
          }
          options.width = width;
          options.height = height;
          options.fieldWidth = fieldWidth;
          options.fieldHeight = fieldHeight;
          return true;
        },
        bind(unit = 3) {
          if (disposed) return;
          gl.activeTexture(gl.TEXTURE0 + unit);
          gl.bindTexture(gl.TEXTURE_2D, fields[read].texture);
        },
        dispose,
      };
    } catch (error) {
      dispose();
      console.warn('SC detail transport unavailable:', error.message);
      return null;
    } finally {
      for (const shader of shaders) gl.deleteShader(shader);
    }
  }
  root.SCFlowField = { create, createTransfer };
})(globalThis);
