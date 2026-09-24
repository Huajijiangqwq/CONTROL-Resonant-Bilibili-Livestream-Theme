(() => {
  'use strict';
  const vertex = `attribute vec2 a_position;varying vec2 uv;void main(){uv=a_position*.5+.5;gl_Position=vec4(a_position,0.,1.);}`;
  const fragment = `precision highp float;
varying vec2 uv;uniform sampler2D u_scene;uniform vec2 u_size;uniform float u_time,u_amount,u_wear;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
vec3 yiq(vec3 c){return vec3(dot(c,vec3(.299,.587,.114)),dot(c,vec3(.596,-.274,-.322)),dot(c,vec3(.211,-.523,.312)));}
vec3 rgb(vec3 c){return vec3(c.x+.956*c.y+.621*c.z,c.x-.272*c.y-.647*c.z,c.x-1.106*c.y+1.703*c.z);}
vec3 source(vec2 p){return texture2D(u_scene,clamp(p,vec2(0.),vec2(1.))).rgb;}
void main(){
 vec4 original=texture2D(u_scene,uv);vec2 px=vec2(u_wear,1.)/u_size;float tick=floor(u_time*29.97),line=floor(uv.y*u_size.y*.5);
 float trackingY=.095+.033*sin(u_time*1.7),tracking=exp(-pow((uv.y-trackingY)/.021,2.));
 float drift=sin(uv.y*31.+u_time*4.)*.65+(hash(vec2(line,tick))-.5)*.8;
 drift+=tracking*(2.8+sin(line*.81+u_time*22.)*2.4);
 float tapeLines=min(u_size.y,576.),recordedLine=(floor(uv.y*tapeLines)+.5)/tapeLines;
 vec2 p=vec2(uv.x+drift*px.x,mix(uv.y,recordedLine,.55)+(mod(line+tick,2.)-.5)*px.y*.35);
 vec3 luma=source(p)*.30+(source(p-vec2(1.4*px.x,0.))+source(p+vec2(1.4*px.x,0.)))*.20+(source(p-vec2(3.1*px.x,0.))+source(p+vec2(3.1*px.x,0.)))*.10+source(p-vec2(6.*px.x,0.))*.10;
 vec2 delayed=p-vec2(3.6*px.x,0.);delayed.x=floor(delayed.x*u_size.x*.24)/(u_size.x*.24);
 vec3 chroma=source(delayed)*.28+(source(delayed-vec2(3.5*px.x,0.))+source(delayed+vec2(3.5*px.x,0.)))*.24+(source(delayed-vec2(8.*px.x,0.))+source(delayed+vec2(8.*px.x,0.)))*.12;
 vec3 signal=yiq(chroma);signal.x=yiq(luma).x;
 float edge=yiq(source(p+vec2(1.6*px.x,0.))).x-yiq(source(p-vec2(1.6*px.x,0.))).x;
 signal.y=signal.y*.69+edge*.14*sin(line*.26+u_time*1.4);signal.z=signal.z*.69+edge*.11*cos(line*.23-u_time*1.7);
 vec2 grainCell=floor(uv*u_size*vec2(.85,.95));float grain=hash(grainCell+vec2(tick*71.,tick*23.))-.5;
 float slowBand=sin(uv.y*5.3-u_time*2.8)*.012;
 float scan=1.-.042*u_wear*smoothstep(.2,.9,fract(uv.y*tapeLines+u_time*.13));
 float lineNoise=hash(vec2(floor(uv.x*u_size.x*.13),line+tick*7.))-.5;
 signal.x=(signal.x*.952+.012+slowBand*.45)*scan+grain*(.030+(1.-signal.x)*.042)*u_wear+lineNoise*.016*u_wear;
 signal.y+=(hash(grainCell*.6+tick)-.5)*.014;signal.z+=(hash(grainCell*.9-tick)-.5)*.011;
 float headY=trackingY+.0022*sin(uv.x*17.+u_time*7.)+.0008*sin(uv.x*73.-u_time*4.);
 float head=exp(-pow((uv.y-headY)/(.0015+hash(vec2(floor(uv.x*u_size.x*.11),tick))*.0035),2.));
 float dropoutPatch=.18+.82*smoothstep(-.3,.7,sin(uv.x*19.+u_time*2.)+sin(uv.x*43.-u_time));
 signal.x+=head*dropoutPatch*(hash(vec2(floor(uv.x*u_size.x*.53),tick))-.48)*.28*u_wear;
 float drop=step(.9975,hash(vec2(floor(uv.x*u_size.x*.19),floor(uv.y*u_size.y)+tick*103.)));
 signal.x+=drop*.19;
 vec3 tape=clamp(rgb(signal),0.,1.);gl_FragColor=vec4(mix(original.rgb,tape,u_amount),original.a);
}`;
  const states = new WeakMap();
  function create() {
    const canvas = document.createElement('canvas'),
      gl = canvas.getContext('webgl', {
        alpha: true,
        premultipliedAlpha: false,
        antialias: false,
        depth: false,
        stencil: false,
      });
    if (!gl) return null;
    const s = { canvas, gl, lost: false };
    function init() {
      const shaders = [];
      try {
        for (const [kind, source] of [
          [gl.VERTEX_SHADER, vertex],
          [gl.FRAGMENT_SHADER, fragment],
        ]) {
          const shader = gl.createShader(kind);
          shaders.push(shader);
          gl.shaderSource(shader, source);
          gl.compileShader(shader);
          if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
            throw Error(gl.getShaderInfoLog(shader));
        }
        s.program = gl.createProgram();
        for (const shader of shaders) gl.attachShader(s.program, shader);
        gl.linkProgram(s.program);
        if (!gl.getProgramParameter(s.program, gl.LINK_STATUS))
          throw Error(gl.getProgramInfoLog(s.program));
        gl.useProgram(s.program);
        s.buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, s.buffer);
        gl.bufferData(
          gl.ARRAY_BUFFER,
          new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
          gl.STATIC_DRAW,
        );
        const pos = gl.getAttribLocation(s.program, 'a_position');
        gl.enableVertexAttribArray(pos);
        gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
        s.texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, s.texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        s.size = gl.getUniformLocation(s.program, 'u_size');
        s.time = gl.getUniformLocation(s.program, 'u_time');
        s.amount = gl.getUniformLocation(s.program, 'u_amount');
        s.wear = gl.getUniformLocation(s.program, 'u_wear');
        s.lost = false;
        return true;
      } catch {
        if (s.texture) gl.deleteTexture(s.texture);
        if (s.buffer) gl.deleteBuffer(s.buffer);
        if (s.program) gl.deleteProgram(s.program);
        return false;
      } finally {
        for (const shader of shaders) gl.deleteShader(shader);
      }
    }
    if (!init()) return null;
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      s.lost = true;
    });
    canvas.addEventListener('webglcontextrestored', () => {
      s.lost = !init();
    });
    return s;
  }
  function draw(context, scene, { x, y, width, height, age, amount, wear = 1 }) {
    let state = states.get(context);
    if (state === undefined) {
      state = create();
      states.set(context, state);
    }
    if (!state || state.lost) return false;
    const { canvas, gl } = state;
    if (canvas.width !== scene.width || canvas.height !== scene.height) {
      canvas.width = scene.width;
      canvas.height = scene.height;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(state.program);
    gl.bindTexture(gl.TEXTURE_2D, state.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, scene);
    gl.uniform2f(state.size, width, height);
    gl.uniform1f(state.time, Math.max(0, age) / 1000);
    gl.uniform1f(state.amount, Math.max(0, Math.min(1, amount)));
    gl.uniform1f(state.wear, Math.max(0.5, Math.min(1.8, wear)));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    // This is a filtered replacement of the same pixels, not another layer.
    // Source-over without clearing changes alpha to a*(2-a), even at amount=0,
    // making transparent HUD content pop when the pass stops at the tail.
    context.save();
    context.globalAlpha = 1;
    context.globalCompositeOperation = 'source-over';
    context.filter = 'none';
    context.beginPath();
    context.rect(x, y, width, height);
    context.clip();
    context.clearRect(x, y, width, height);
    context.drawImage(canvas, x, y, width, height);
    context.restore();
    return true;
  }
  function dispose(context) {
    const s = states.get(context);
    if (s) {
      s.gl.deleteTexture(s.texture);
      s.gl.deleteBuffer(s.buffer);
      s.gl.deleteProgram(s.program);
      s.gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
    states.delete(context);
  }
  window.FleetVHS = { draw, dispose };
})();
