/* Non-periodic GLSL adaptation of psrdnoise2.glsl, 2021-12-02.
 * https://github.com/stegu/psrdnoise/blob/main/src/psrdnoise2.glsl
 * Copyright (c) 2021 Stefan Gustavson and Ian McEwan.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */
(function (root) {
  'use strict';
  // Continuously emitted scalar material, transported by a velocity field.
  // No source image, final-frame reprojection, or global scale transform is used.
  const W = 1280,
    H = 148,
    SW = 1280,
    SH = 160,
    STEP = 1 / 120;
  const vertex = `#version 300 es
precision highp float;void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.-1.,0,1);}`;
  const common = `#version 300 es
precision highp float;precision highp int;
uniform sampler2D state;uniform float levels[240],heightLimits[48],moment,peak;uniform int tick;
float energyAt(float x){
 float b=clamp((x-12.)/1256.*239.,0.,239.);int i=int(floor(b));float t=fract(b);
 float p0=levels[max(0,i-1)],p1=levels[i],p2=levels[min(239,i+1)],p3=levels[min(239,i+2)];
 float m0=(p2-p0)*.5,m1=(p3-p1)*.5,d=p2-p1;
 if(abs(d)<.00001){m0=0.;m1=0.;}else{m0=sign(d)*clamp(m0*sign(d),0.,3.*abs(d));m1=sign(d)*clamp(m1*sign(d),0.,3.*abs(d));}
 return clamp((2.*t*t*t-3.*t*t+1.)*p1+(t*t*t-2.*t*t+t)*m0+(-2.*t*t*t+3.*t*t)*p2+(t*t*t-t*t)*m1,min(p1,p2),max(p1,p2));
}
float sharedEnergy(float x){return energyAt(x);}
float limitAt(float x){float b=clamp(x/1280.*48.-.5,0.,47.);int i=int(floor(b));return min(heightLimits[i],heightLimits[min(i+1,47)]);}

vec3 flowNoise(vec2 p,float alpha){
 vec2 q=vec2(p.x+p.y*.5,p.y),cell=floor(q),f=fract(q);
 vec2 middle=f.x>=f.y?vec2(1,0):vec2(0,1);vec3 result=vec3(0);
 for(int k=0;k<3;k++){
  vec2 id=cell+(k==0?vec2(0):k==1?middle:vec2(1));
  vec2 d=p-vec2(id.x-id.y*.5,id.y);float w=max(0.,.8-dot(d,d));
  float h=mod(id.x,289.);h=mod((h*51.+2.)*h+id.y,289.);h=mod((h*34.+10.)*h,289.);
  float angle=h*.07482+alpha;vec2 g=vec2(cos(angle),sin(angle));
  float a=dot(g,d),w2=w*w,w3=w2*w,w4=w2*w2;
  result.xy+=w4*g-8.*w3*a*d;result.z+=w4*a;
 }
 return result*10.9;
}


vec4 materialAt(vec2 q){
 vec2 pixel=q-vec2(.5);ivec2 a=ivec2(floor(pixel));vec2 f=fract(pixel);ivec2 b=ivec2(1279,159);
 return mix(mix(texelFetch(state,clamp(a,ivec2(0),b),0),texelFetch(state,clamp(a+ivec2(1,0),ivec2(0),b),0),f.x),mix(texelFetch(state,clamp(a+ivec2(0,1),ivec2(0),b),0),texelFetch(state,clamp(a+ivec2(1,1),ivec2(0),b),0),f.x),f.y);
}
vec2 seedPhase(vec2 q){
 vec3 a=flowNoise(vec2(q.x*.042+5.,q.y*.044+19.),moment*.33);
 vec3 b=flowNoise(vec2(q.x*.099+17.,q.y*.066+7.),moment*.51);
 return vec2(q.x*.83+q.y*.19+a.z*4.+b.z*.8,q.x*1.71-q.y*.31+a.z*6.+b.z*1.6);
}
vec2 velocity(vec2 q){
 vec3 a=flowNoise(vec2(q.x*.035+7.,q.y*.028+3.),moment*.72);
 vec3 b=flowNoise(vec2(q.x*.099+23.,q.y*.069+19.),moment*1.05);
 vec2 v=vec2(a.y*.028+b.y*.069*.12,-a.x*.035-b.x*.099*.12)*660.;
 return v+vec2(sin(q.y*.035+moment*.7)*7.,13.*smoothstep(0.,8.,q.y));
}
`;
  const solve =
    common +
    `out vec4 result;
void main(){
 vec2 q=gl_FragCoord.xy;vec2 v=velocity(q);vec2 before=q-velocity(q-v*(.5/120.))/120.;
 vec4 old=materialAt(before);vec2 phase=seedPhase(q);
 if(tick<=1||before.x<.5||before.x>1279.5||before.y<.5||before.y>159.5)old=vec4(0);
 float e=energyAt(q.x),height=min(limitAt(q.x),148.*pow(e,.64));
 float envelope=(1.-smoothstep(max(0.,height-2.),height+2.,q.y))*smoothstep(0.,2.,q.y)*smoothstep(.008,.026,e)*pow(max(.001,e),.24);
 float variation=.22+.78*smoothstep(-.4,.55,flowNoise(vec2(q.x*.041+17.,q.y*.023+37.),moment*.39).z);
 float strand=pow(.5+.5*sin(phase.x*2.1),14.);
 float glint=pow(.5+.5*sin(phase.y*1.65),22.)*variation;
 vec3 emitted=envelope*vec3(variation*.34,strand*variation,glint);
 // Transport actual concentrations; overlapping filaments mix in the field.
 vec3 replenishment=vec3(1.)-exp(-vec3(7.,12.,22.)/120.);
 vec3 density=mix(old.rgb,emitted,replenishment);
 result=vec4(density,1.);
}`;
  const draw =
    common +
    `out vec4 result;
void main(){
 vec2 q=vec2(gl_FragCoord.x*.5,gl_FragCoord.y*.5-16.);
 if(q.y<0.||q.y>148.){result=vec4(0,0,0,1);return;}
 vec3 material=materialAt(q).rgb;
 vec3 color=vec3(.32,.008,.014)*material.r+vec3(.92,.06,.045)*material.g+vec3(1.25,.39,.24)*material.b;
 float roof=1.-smoothstep(limitAt(q.x)-4.,limitAt(q.x),q.y);
 float edge=smoothstep(0.,8.,q.x)*(1.-smoothstep(1272.,1280.,q.x));
 result=vec4((1.-exp(-color*2.8))*roof*edge,1.);
}`;
  class DensityFilaments {
    constructor() {
      this.canvas = document.createElement('canvas');
      this.canvas.width = W * 2;
      this.canvas.height = H * 2;
      this.gl = this.canvas.getContext('webgl2', {
        alpha: false,
        antialias: false,
        depth: false,
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance',
      });
      if (!this.gl) throw Error('连续材质需要 WebGL 2');
      this.bands = new Float32Array(240);
      this.limits = new Float32Array(48).fill(132);
      this.onLost = (e) => {
        e.preventDefault();
        this.lost = true;
      };
      this.onRestore = () => {
        this.initialize();
        this.lost = false;
      };
      this.canvas.addEventListener('webglcontextlost', this.onLost);
      this.canvas.addEventListener('webglcontextrestored', this.onRestore);
      this.initialize();
    }
    initialize() {
      const gl = this.gl;
      if (!gl.getExtension('EXT_color_buffer_float')) throw Error('需要浮点材质缓存');
      this.resources = [];
      const make = (src) => {
        const p = gl.createProgram();
        for (const [type, text] of [
          [gl.VERTEX_SHADER, vertex],
          [gl.FRAGMENT_SHADER, src],
        ]) {
          const s = gl.createShader(type);
          gl.shaderSource(s, text);
          gl.compileShader(s);
          if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(s));
          gl.attachShader(p, s);
          gl.deleteShader(s);
        }
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(p));
        const u = {};
        for (const name of ['state', 'levels[0]', 'heightLimits[0]', 'moment', 'peak', 'tick'])
          u[name] = gl.getUniformLocation(p, name);
        return { p, u };
      };
      this.solve = make(solve);
      this.paint = make(draw);
      this.vao = gl.createVertexArray();
      gl.bindVertexArray(this.vao);
      this.states = [0, 1].map(() => {
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        for (const [p, v] of [
          [gl.TEXTURE_MIN_FILTER, gl.NEAREST],
          [gl.TEXTURE_MAG_FILTER, gl.NEAREST],
          [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE],
          [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE],
        ])
          gl.texParameteri(gl.TEXTURE_2D, p, v);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, SW, SH, 0, gl.RGBA, gl.FLOAT, null);
        const fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
          throw Error('材质缓存初始化失败');
        return { texture, fbo };
      });
      this.reset();
    }
    reset() {
      const gl = this.gl;
      this.index = 0;
      this.clock = 0;
      this.tick = 0;
      this.accumulator = 0;
      this.lastInput = undefined;
      this.time = undefined;
      for (const s of this.states) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, s.fbo);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    bind(o) {
      const gl = this.gl;
      gl.useProgram(o.p);
      gl.uniform1fv(o.u['levels[0]'], this.bands);
      gl.uniform1fv(o.u['heightLimits[0]'], this.limits);
      gl.uniform1f(o.u.moment, this.clock);
      gl.uniform1f(o.u.peak, this.peak);
      gl.uniform1i(o.u.tick, this.tick);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.states[this.index].texture);
      gl.uniform1i(o.u.state, 0);
    }
    step() {
      const gl = this.gl;
      this.clock += STEP;
      this.tick++;
      this.bind(this.solve);
      const next = 1 - this.index;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.states[next].fbo);
      gl.viewport(0, 0, SW, SH);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      this.index = next;
    }
    draw(ctx, levels, dt, speed) {
      if (this.lost) return;
      const gl = this.gl;
      this.peak = 0;
      this.inputBandCount = levels.length;
      for (let i = 0; i < 240; i++) {
        const x = (i / 239) * Math.max(0, levels.length - 1),
          a = Math.floor(x),
          f = x - a;
        this.bands[i] = Math.max(
          0,
          Math.min(
            1,
            (Number(levels[a]) || 0) * (1 - f) +
              (Number(levels[Math.min(a + 1, levels.length - 1)]) || 0) * f,
          ),
        );
        this.peak = Math.max(this.peak, this.bands[i]);
      }
      for (let i = 0; i < 48; i++)
        this.limits[i] = Math.max(
          30,
          Math.min(132, Number(this.heightLimits?.[i] ?? this.maxHeight ?? 132)),
        );
      const input = this.time;
      let elapsed =
        Number.isFinite(input) && Number.isFinite(this.lastInput)
          ? input - this.lastInput
          : Math.max(0, Number(dt) || 0);
      if (elapsed < -0.0001 || elapsed > 5) {
        this.reset();
        this.time = input;
        elapsed = STEP;
      }
      if (Number.isFinite(input)) this.lastInput = input;
      this.accumulator +=
        Math.max(0, Math.min(1.25, elapsed)) * Math.max(0.05, Math.min(4, Number(speed) || 1));
      gl.bindVertexArray(this.vao);
      gl.disable(gl.BLEND);
      let steps = 0;
      while (this.accumulator + 1e-8 >= STEP && steps < 600) {
        this.step();
        this.accumulator -= STEP;
        steps++;
      }
      this.bind(this.paint);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, W * 2, H * 2);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.drawImage(this.canvas, 590, 319, W, H);
      ctx.restore();
    }
    snapshot() {
      const gl = this.gl,
        data = new Float32Array(SW * SH * 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.states[this.index].fbo);
      gl.readPixels(0, 0, SW, SH, gl.RGBA, gl.FLOAT, data);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { material: data, tick: this.tick };
    }
    getErrors() {
      return [this.gl.getError()];
    }
    dispose() {
      const gl = this.gl;
      for (const o of [this.solve, this.paint]) gl.deleteProgram(o.p);
      for (const s of this.states) {
        gl.deleteFramebuffer(s.fbo);
        gl.deleteTexture(s.texture);
      }
      gl.deleteVertexArray(this.vao);
      this.canvas.removeEventListener('webglcontextlost', this.onLost);
      this.canvas.removeEventListener('webglcontextrestored', this.onRestore);
    }
  }
  root.DensityFilaments = DensityFilaments;
})(window);
