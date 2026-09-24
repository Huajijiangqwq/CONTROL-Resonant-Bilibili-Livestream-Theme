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
  // Persistent material curves. Audio changes new emission and forces; stored nodes are never resized.
  const W = 1280,
    H = 148,
    N = 147456,
    SW = 256,
    SH = 576,
    TRAIL = 12,
    STEP = 1 / 120;
  const full = `#version 300 es
precision highp float;void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.-1.,0,1);}`;
  const common = `#version 300 es
precision highp float;precision highp int;
uniform sampler2D positions,attributes,history;
uniform float levels[240],heightLimits[48],moment,peak;
uniform float hits[240],emissionCDF[240];uniform int tick,head,glowPass;uniform vec3 phases;
float hash(float x){uint h=floatBitsToUint(x);h^=h>>16;h*=0x7feb352du;h^=h>>15;h*=0x846ca68bu;h^=h>>16;return float(h&0xffffffu)/16777216.;}
float energyAt(float x){
 float b=clamp((x-12.)/1256.*239.,0.,239.);int i=int(floor(b));float t=fract(b);
 float p0=levels[max(0,i-1)],p1=levels[i],p2=levels[min(239,i+1)],p3=levels[min(239,i+2)];
 float m0=(p2-p0)*.5,m1=(p3-p1)*.5,d=p2-p1;
 if(abs(d)<.00001){m0=0.;m1=0.;}else{m0=sign(d)*clamp(m0*sign(d),0.,3.*abs(d));m1=sign(d)*clamp(m1*sign(d),0.,3.*abs(d));}
 return clamp((2.*t*t*t-3.*t*t+1.)*p1+(t*t*t-2.*t*t+t)*m0+(-2.*t*t*t+3.*t*t)*p2+(t*t*t-t*t)*m1,min(p1,p2),max(p1,p2));
}
float sharedEnergy(float x){return energyAt(x);}
float limitAt(float x){float b=clamp(x/1280.*48.-.5,0.,47.);int i=int(floor(b));return min(heightLimits[i],heightLimits[min(i+1,47)]);}
float sourceX(float ribbon){return 12.+1256.*(ribbon+.5)/3072.;}
float weightedOrigin(float u){int lo=0,hi=239;for(int k=0;k<8;k++){int mid=(lo+hi)/2;if(emissionCDF[mid]<u)lo=mid+1;else hi=mid;}int i=min(lo,239);float a=i>0?emissionCDF[i-1]:0.;float t=clamp((u-a)/max(.00001,emissionCDF[i]-a),0.,1.);return 12.+1256.*(float(i)+t)/240.;}
float contourHeight(float x){return min(limitAt(x),148.*pow(energyAt(x),.64));}
ivec2 address(int id){return ivec2(id%256,id/256);}
`;
  const noise = `
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

`;

  const solver =
    common +
    noise +
    `
layout(location=0)out vec4 newPosition;layout(location=1)out vec4 newAttribute;
void main(){
 ivec2 ij=ivec2(gl_FragCoord.xy);int id=ij.y*256+ij.x,ribbon=id/48;
 float node=float(id%48)/47.,key=float(ribbon)*1.137,origin=sourceX(float(ribbon));
 vec4 p=texelFetch(positions,ij,0),a=texelFetch(attributes,ij,0);a.x+=1./120.;
 float currentOrigin=a.y>0.?p.z:origin;float currentEnergy=energyAt(currentOrigin);
 if(a.y>0.&&currentEnergy>a.z*1.4+.02&&hash(key+float(tick)*.917)<.28)a.y=a.x;
 if(a.y<=0.||a.x>=a.y){
  if(hash(key+201.)<.65)origin=weightedOrigin(hash(key+a.w*.773+202.));
  float e=energyAt(origin),center=origin+(hash(key+a.w*1.9+29.)-.5)*3.;
  float h=contourHeight(center),layer=hash(key+91.);
  if(peak<=.012||e<=.008||hash(key+float(tick)*.738)>.25){newPosition=vec4(center,0,origin,0);newAttribute=vec4(-1,0,0,a.w);return;}
  float portion=.25+.75*pow(hash(key+a.w+19.),.42);
  float width=(4.5+14.*sqrt(e))*(.38+.62*hash(key+a.w+13.));
  float arch=pow(max(0.,sin(node*3.14159265)),2.0+1.0*hash(key+a.w+43.));
  float x=center+(node*2.-1.)*width,y=.7+h*portion*arch;
  vec3 n=flowNoise(vec2(x*.075+13.,y*.075+27.),phases.x);
  x+=n.y*min(1.5,h*.024);y-=n.x*min(1.,h*.015);
  // Long material curves cross multiple analysis bins; bins are not visual cells.
  if(hash(key+121.)<.34){
   x=center+(node-.5)*(24.+44.*hash(key+a.w+72.));
   y=.7+contourHeight(x)*(.13+.86*pow(hash(key+a.w+19.),.65));
  }
  float material=smoothstep(-.45,.50,flowNoise(vec2(x*.055+41.,y*.025+7.),phases.x*.55).z);
  p=vec4(x,max(.3,y),origin,.30+1.45*material);a=vec4(0,.30+.34*hash(key+a.w+51.),e,a.w+1.);
 }else{
  float roof=max(148.*pow(a.z,.64),contourHeight(p.x));
  vec3 broad=flowNoise(vec2(p.x*.058,p.y*.022),phases.x);
  vec3 middle=flowNoise(vec2(p.x*.137+23.,p.y*.049+9.),phases.x+.15*hash(key+15.));
  vec3 fine=flowNoise(vec2(p.x*.24+19.,p.y*.22+37.),phases.y);
  vec2 v=vec2(broad.y*2.1+middle.y*.7,-broad.x*5.5-middle.x*1.8);
  v*=roof/(roof+18.)*(hash(key+91.)<.26?.68:1.);v.x+=sin(p.y*.04+phases.z)*2.;
  v.y-=max(0.,p.y-roof)*4.;v.y+=max(0.,.6-p.y)*8.;
  int band=int(clamp((p.z-12.)/1256.*239.,0.,239.));v*=1.+hits[band]*.8;
  p.xy+=v/120.; // z retains this curve's emission position for its entire lifetime.
 }
 newPosition=p;newAttribute=a;
}`;
  // Store all 36 history blocks in a single draw. Each quad writes exactly one
  // column; this keeps the texture below common 4096-pixel GPU limits.
  const historyVertex = `#version 300 es
precision highp float;uniform int head;
void main(){
 vec2 corners[6]=vec2[6](vec2(0,0),vec2(1,0),vec2(0,1),vec2(0,1),vec2(1,0),vec2(1,1));
 vec2 c=corners[gl_VertexID];
 gl_Position=vec4((float(head+gl_InstanceID*12)+c.x)/432.*2.-1.,c.y*2.-1.,0,1);
}`;
  const remember =
    common +
    `out vec4 saved;
void main(){
 int id=int(gl_FragCoord.y)+(int(gl_FragCoord.x)/12)*4096,ribbon=id/48;float node=clamp(float(id%48)/47.,0.,1.),key=float(ribbon)*1.137;
 vec4 p=texelFetch(positions,address(id),0),a=texelFetch(attributes,address(id),0);
 float origin=p.z;float live=energyAt(origin);
 
 float response=clamp(live/(.025+a.z),0.,1.3);
 float life=smoothstep(0.,.035,a.x)*(1.-smoothstep(a.y*.55,a.y,a.x));
 float taper=.40+.60*pow(max(0.,sin(node*3.14159265)),.40);
 
 float light=(.25+.20*hash(key+71.))*life*taper*pow(max(.001,a.z),.24)*response;
 float grain=pow(hash(float(id)+a.w*.39),1.2);
 float travelling=.22+.78*pow(.5+.5*sin(node*15.-a.x*45.+key),2.);
 light*=hash(key+91.)>.90?4.8*travelling:(hash(key+91.)<.26?.70:(.20+.65*grain));
 float roof=148.*pow(max(.00001,a.z),.64);
 float baseFade=.18+.82*smoothstep(0.,min(3.,max(1.,roof*.05)),p.y);
 light*=baseFade*(.80+.38*smoothstep(.18,.95,p.y/max(6.,roof)))*p.w;
 saved=vec4(p.xy,a.y>0.&&a.x<a.y?light:-1.,a.w);
}`;
  const lines =
    common +
    `
out vec4 color;out vec2 lineCoord;flat out float radius;
vec4 pointAt(int column,int id){return texelFetch(history,ivec2(column+(id/4096)*12,id%4096),0);}
void main(){
 int id=gl_InstanceID/2,lag=(gl_InstanceID%2)*4;
 int column=(head-lag+12)%12;
 if(id%48==47){gl_Position=vec4(3,3,0,1);color=vec4(0);return;}
 vec4 a=pointAt(column,id),b=pointAt(column,id+1);
 if(a.z<0.||b.z<0.||a.w!=b.w){gl_Position=vec4(3,3,0,1);color=vec4(0);return;}
 vec2 d=b.xy-a.xy;float len=length(d);
 if(len<.001||len>24.){gl_Position=vec4(3,3,0,1);color=vec4(0);return;}
 float key=float(id/48)*1.137;
 float bright=(a.z+b.z)*.5*(lag==0?1.:.18);
 float ceiling=min(limitAt(a.x),limitAt(b.x));bright*=1.-smoothstep(ceiling-7.,ceiling-1.,max(a.y,b.y));
 radius=glowPass==1?(hash(key+91.)<.26?3.4:.9):(hash(key+91.)>.90?.09:(hash(key+91.)<.26?.46:.17));
 if(glowPass==1)bright*=hash(key+91.)<.26?.28:.075;vec2 axis=d/len,normal=vec2(-axis.y,axis.x);
 vec2 corners[6]=vec2[6](vec2(0,-1),vec2(1,-1),vec2(0,1),vec2(0,1),vec2(1,-1),vec2(1,1));
 vec2 c=corners[gl_VertexID];lineCoord=vec2(c.x*len,c.y*(radius+.5));
 vec2 world=a.xy+axis*lineCoord.x+normal*lineCoord.y;
 gl_Position=vec4(world.x/640.-1.,1.-(132.-world.y)/74.,0,1);
 float depth=hash(key+91.);color=vec4(depth>.90?vec3(1.,.52,.40):(depth<.26?vec3(.43,.021,.023):vec3(.78,.092,.060)),bright);
}`;
  const ink = `#version 300 es
precision highp float;in vec4 color;in vec2 lineCoord;flat in float radius;uniform highp int glowPass;out vec4 painted;
void main(){painted=vec4(color.rgb,color.a*(glowPass==1?exp(-2.2*lineCoord.y*lineCoord.y/(radius*radius)):clamp(radius+.5-abs(lineCoord.y),0.,1.)));}`;
  const resolveInk = `#version 300 es
precision highp float;uniform sampler2D positions;out vec4 painted;
void main(){ivec2 p=ivec2(gl_FragCoord.xy),bounds=textureSize(positions,0)-1;vec3 energy=texelFetch(positions,p,0).rgb*.60;
 energy+=(texelFetch(positions,clamp(p+ivec2(1,0),ivec2(0),bounds),0).rgb+texelFetch(positions,clamp(p-ivec2(1,0),ivec2(0),bounds),0).rgb)*.12;
 energy+=(texelFetch(positions,clamp(p+ivec2(0,1),ivec2(0),bounds),0).rgb+texelFetch(positions,clamp(p-ivec2(0,1),ivec2(0),bounds),0).rgb)*.08;
 painted=vec4(1.-exp(-energy*1.35),1.);}`;
  class FieldFilaments {
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
      if (!this.gl) throw Error('粒子流纹需要 WebGL 2。');
      this.bands = new Float32Array(240);
      this.emissionCDF = new Float32Array(240);
      this.limits = new Float32Array(48).fill(132);
      this.hits = new Float32Array(240);
      this.previousEnergy = new Float32Array(240);
      this.onLost = (e) => {
        e.preventDefault();
        this.lost = true;
      };
      this.onRestored = () => {
        this.initialize();
        this.lost = false;
      };
      this.canvas.addEventListener('webglcontextlost', this.onLost);
      this.canvas.addEventListener('webglcontextrestored', this.onRestored);
      this.initialize();
    }
    initialize() {
      const gl = this.gl;
      if (!gl.getExtension('EXT_color_buffer_float') || gl.getParameter(gl.MAX_TEXTURE_SIZE) < 4096)
        throw Error('显卡不支持粒子轨迹缓存。');
      this.textures = [];
      this.fbos = [];
      const program = (v, f) => {
        const p = gl.createProgram();
        for (const [kind, s] of [
          [gl.VERTEX_SHADER, v],
          [gl.FRAGMENT_SHADER, f],
        ]) {
          const shader = gl.createShader(kind);
          gl.shaderSource(shader, s);
          gl.compileShader(shader);
          if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
            throw Error(gl.getShaderInfoLog(shader));
          gl.attachShader(p, shader);
          gl.deleteShader(shader);
        }
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(p));
        const u = {};
        for (const n of [
          'positions',
          'attributes',
          'history',
          'levels[0]',
          'hits[0]',
          'emissionCDF[0]',
          'heightLimits[0]',
          'moment',
          'phases',
          'tick',
          'head',
          'peak',
          'glowPass',
        ])
          u[n] = gl.getUniformLocation(p, n);
        return { p, u };
      };
      this.solve = program(full, solver);
      this.save = program(historyVertex, remember);
      this.paint = program(lines, ink);
      this.resolve = program(full, resolveInk);
      this.vao = gl.createVertexArray();
      gl.bindVertexArray(this.vao);
      const tex = (w, h) => {
        const t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        for (const [p, v] of [
          [gl.TEXTURE_MIN_FILTER, gl.NEAREST],
          [gl.TEXTURE_MAG_FILTER, gl.NEAREST],
          [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE],
          [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE],
        ])
          gl.texParameteri(gl.TEXTURE_2D, p, v);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, null);
        this.textures.push(t);
        return t;
      };
      const frame = (ts) => {
        const f = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, f);
        ts.forEach((t, i) =>
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0),
        );
        gl.drawBuffers(ts.map((_, i) => gl.COLOR_ATTACHMENT0 + i));
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
          throw Error('粒子缓存初始化失败。');
        this.fbos.push(f);
        return f;
      };
      this.state = [0, 1].map(() => {
        const pos = tex(SW, SH),
          attr = tex(SW, SH);
        return { pos, attr, fbo: frame([pos, attr]) };
      });
      this.history = tex(TRAIL * 36, 4096);
      this.historyFbo = frame([this.history]);
      this.accumulation = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.accumulation);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, W * 2, H * 2, 0, gl.RGBA, gl.HALF_FLOAT, null);
      this.textures.push(this.accumulation);
      this.accumulationFbo = frame([this.accumulation]);
      this.reset();
    }
    reset() {
      const gl = this.gl;
      this.index = 0;
      this.head = TRAIL - 1;
      this.tick = 0;
      this.clock = 0;
      this.time = undefined;
      this.lastInput = undefined;
      this.accumulator = 0;
      this.hits.fill(0);
      this.previousEnergy.fill(0);
      gl.disable(gl.BLEND);
      gl.disable(gl.SCISSOR_TEST);
      for (const s of this.state) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, s.fbo);
        gl.clearBufferfv(gl.COLOR, 0, new Float32Array(4));
        gl.clearBufferfv(gl.COLOR, 1, new Float32Array(4));
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.historyFbo);
      gl.clearBufferfv(gl.COLOR, 0, new Float32Array([0, 0, -1, 0]));
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    configure(o) {
      const gl = this.gl;
      gl.useProgram(o.p);
      gl.uniform1fv(o.u['levels[0]'], this.bands);
      gl.uniform1fv(o.u['hits[0]'], this.hits);
      gl.uniform1fv(o.u['emissionCDF[0]'], this.emissionCDF);
      gl.uniform1fv(o.u['heightLimits[0]'], this.limits);
      gl.uniform1f(o.u.moment, this.clock);
      gl.uniform1f(o.u.peak, this.peak);
      gl.uniform3f(
        o.u.phases,
        (this.clock * 0.72) % (Math.PI * 2),
        (this.clock * 1.05) % (Math.PI * 2),
        (this.clock * 0.6) % (Math.PI * 2),
      );
      gl.uniform1i(o.u.tick, this.tick % 65536);
      gl.uniform1i(o.u.head, this.head);
      const s = this.state[this.index];
      for (const [unit, name, t] of [
        [0, 'positions', s.pos],
        [1, 'attributes', s.attr],
        [2, 'history', this.history],
      ]) {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.uniform1i(o.u[name], unit);
      }
    }
    step() {
      const gl = this.gl;
      for (let band = 0; band < 240; band++) {
        const e = this.bands[band];
        this.hits[band] = Math.min(
          1,
          this.hits[band] * Math.exp(-STEP / 0.085) +
            Math.max(0, e - this.previousEnergy[band]) * 4,
        );
        this.previousEnergy[band] = e;
      }
      this.clock += STEP;
      this.tick++;
      gl.disable(gl.BLEND);
      this.configure(this.solve);
      const next = 1 - this.index;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.state[next].fbo);
      gl.viewport(0, 0, SW, SH);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      this.index = next;
      this.head = (this.head + 1) % TRAIL;
      this.configure(this.save);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.historyFbo);
      gl.viewport(0, 0, TRAIL * 36, 4096);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, 36);
    }
    draw(ctx, levels, dt, speed) {
      if (this.lost) return;
      const gl = this.gl;
      this.peak = 0;
      this.inputBandCount = levels.length;
      // Legacy 48-band input is compatible, but interpolation adds no spectral information.
      for (let i = 0; i < 240; i++) {
        const x = (i / 239) * Math.max(0, levels.length - 1),
          a = Math.floor(x),
          t = x - a;
        this.bands[i] = Math.max(
          0,
          Math.min(
            1,
            (Number(levels[a]) || 0) * (1 - t) +
              (Number(levels[Math.min(a + 1, levels.length - 1)]) || 0) * t,
          ),
        );
        this.peak = Math.max(this.peak, this.bands[i]);
      }
      let sum = 0;
      for (let i = 0; i < 240; i++) {
        sum += 0.035 + Math.pow(this.bands[i], 0.65);
        this.emissionCDF[i] = sum;
      }
      for (let i = 0; i < 240; i++) this.emissionCDF[i] /= sum;
      for (let i = 0; i < 48; i++)
        this.limits[i] = Math.max(
          30,
          Math.min(132, Number(this.heightLimits?.[i] ?? this.maxHeight ?? 132)),
        );

      const input = this.time,
        rate = Math.max(0.05, Math.min(4, Number(speed) || 1));
      let elapsed =
        Number.isFinite(input) && Number.isFinite(this.lastInput)
          ? input - this.lastInput
          : Math.max(0, Number(dt) || 0);
      // Seeking starts a new simulation; live updates never reconstruct the past.
      if (elapsed < -0.0001 || elapsed > 5) {
        this.reset();
        this.time = input;
        elapsed = STEP;
      }
      if (Number.isFinite(input)) this.lastInput = input;
      this.accumulator += Math.max(0, Math.min(1.25, elapsed)) * rate;
      gl.bindVertexArray(this.vao);
      let steps = 0;
      while (this.accumulator + 1e-8 >= STEP && steps < 600) {
        this.step();
        this.accumulator -= STEP;
        steps++;
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.accumulationFbo);
      gl.viewport(0, 0, W * 2, H * 2);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      this.configure(this.paint);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.uniform1i(this.paint.u.glowPass, 1);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, N * 2);
      gl.uniform1i(this.paint.u.glowPass, 0);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, N * 2);
      gl.disable(gl.BLEND);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.useProgram(this.resolve.p);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.accumulation);
      gl.uniform1i(this.resolve.u.positions, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.drawImage(this.canvas, 590, 319, W, H);
      ctx.restore();
    }
    snapshot() {
      const gl = this.gl,
        p = new Float32Array(N * 4),
        a = new Float32Array(N * 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.state[this.index].fbo);
      gl.readBuffer(gl.COLOR_ATTACHMENT0);
      gl.readPixels(0, 0, SW, SH, gl.RGBA, gl.FLOAT, p);
      gl.readBuffer(gl.COLOR_ATTACHMENT1);
      gl.readPixels(0, 0, SW, SH, gl.RGBA, gl.FLOAT, a);
      gl.readBuffer(gl.COLOR_ATTACHMENT0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { positions: p, attributes: a, tick: this.tick };
    }
    dispose() {
      const gl = this.gl;
      for (const o of [this.solve, this.save, this.paint, this.resolve]) gl.deleteProgram(o.p);
      this.textures.forEach((t) => gl.deleteTexture(t));
      this.fbos.forEach((f) => gl.deleteFramebuffer(f));
      gl.deleteVertexArray(this.vao);
      this.canvas.removeEventListener('webglcontextlost', this.onLost);
      this.canvas.removeEventListener('webglcontextrestored', this.onRestored);
    }
  }
  root.ContourFilaments = FieldFilaments;
})(window);
