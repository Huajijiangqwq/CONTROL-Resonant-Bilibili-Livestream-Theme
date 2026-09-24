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
  // Persistent particle positions with time-sampled trails. No complete curve is stamped into the scene.
  const W = 1280,
    H = 148,
    N = 12288,
    SW = 256,
    SH = 48,
    TRAIL = 64,
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
float sourceX(float ribbon){return 12.+1256.*(ribbon+.5)/12288.;}
float weightedOrigin(float u){int lo=0,hi=239;for(int k=0;k<8;k++){int mid=(lo+hi)/2;if(emissionCDF[mid]<u)lo=mid+1;else hi=mid;}int i=min(lo,239);float a=i>0?emissionCDF[i-1]:0.;float t=clamp((u-a)/max(.00001,emissionCDF[i]-a),0.,1.);return 12.+1256.*(float(i)+t)/240.;}
float rawHeight(float x){return 148.*pow(energyAt(x),.64);}
float contourHeight(float x){
 float h=rawHeight(x);
 h=max(h,max(rawHeight(x-7.),rawHeight(x+7.))-18.);
 h=max(h,max(rawHeight(x-14.),rawHeight(x+14.))-42.);
 return min(limitAt(x),max(0.,h));
}
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
vec2 materialVelocity(vec2 q,float depth){
 float h=max(5.,limitAt(q.x));
 float hp=0.;
 float r=clamp(q.y/h,0.,1.),angle=r*3.14159265;
 float m=sin(angle),dm=3.14159265*cos(angle);
 float g=h/(h+18.),gx=hp*18./((h+18.)*(h+18.));
 // Elongated vortices are part of the velocity field, not a scale of rendered pixels.
 vec3 broad=flowNoise(vec2(q.x*.060+7.,q.y*.021+3.),phases.x);
 vec3 detail=flowNoise(vec2(q.x*.147+23.,q.y*.054+19.),phases.y);
 float psi=broad.z+detail.z*.12;
 float psiX=broad.x*.060+detail.x*.147*.12;
 float psiY=broad.y*.021+detail.y*.054*.12;
 // Curl of a boundary-aware stream function: stored particles circulate in slender folds.
 float dy=g*(psiY*m+psi*dm/h);
 float dx=(gx*psi+g*psiX)*m-g*psi*dm*r*hp/h;
 vec2 v=vec2(dy,-dx)*420.*(depth<.26?.62:depth>.94?1.2:.9);
 // Open paths pass through the field instead of orbiting a spectrum-shaped wall.
 float transport=(depth<.26?-10.:16.)*smoothstep(0.,6.,q.y);
 v+=vec2(sin(q.x*.014+phases.z)*6.,transport);
 return v*min(1.,300./max(.001,length(v)));
}
void main(){
 ivec2 ij=ivec2(gl_FragCoord.xy);int id=ij.y*256+ij.x;
 float key=float(id)*1.137,origin=sourceX(float(id));
 vec4 p=texelFetch(positions,ij,0),a=texelFetch(attributes,ij,0);a.x+=1./120.;
 float e=energyAt(a.y>0.?p.z:origin);
 if(a.y>0.&&e>a.z*1.6+.03&&hash(key+float(tick)*.917)<.20)a.y=a.x;
 if(a.y<=0.||a.x>=a.y){
  if(hash(key+201.)<.94)origin=weightedOrigin(hash(key+a.w*.773+202.));
  e=energyAt(origin);
  if(peak<=.012||e<=.008||hash(key+float(tick)*.738)>.30){newPosition=vec4(origin,0,origin,0);newAttribute=vec4(-1,0,0,a.w);return;}
  float h=contourHeight(origin),ratio=pow(hash(key+a.w*.73+19.),.92),y=.7+(h+2.)*ratio;
  float x=origin+(hash(key+a.w*.39+23.)-.5)*23.*pow(1.-ratio,.7);
  y=min(y,max(1.,contourHeight(x)+2.));
  // Store coherent material density at emission; it then travels with the particle.
  float material=smoothstep(-.45,.50,flowNoise(vec2(x*.055+41.,y*.025+7.),phases.x*.55).z);
  p=vec4(x,y,origin,.24+1.55*material);a=vec4(0,.75+.65*hash(key+a.w+51.),e,a.w+1.);
 }else{
  float depth=hash(key+91.);int band=int(clamp((p.z-12.)/1256.*239.,0.,239.));
  float step=(1.+hits[band]*.35)/120.;
  vec2 v=materialVelocity(p.xy,depth);
  p.xy+=materialVelocity(p.xy+v*step*.5,depth)*step;
  if(p.y<0.||p.y>max(5.,contourHeight(p.x)+4.)+2.)a.y=a.x;

 }
 newPosition=p;newAttribute=a;
}`;
  // Store three particle history blocks in one draw. Each quad writes one
  // column; this keeps the texture below common 4096-pixel GPU limits.
  const historyVertex = `#version 300 es
precision highp float;uniform int head;
void main(){
 vec2 corners[6]=vec2[6](vec2(0,0),vec2(1,0),vec2(0,1),vec2(0,1),vec2(1,0),vec2(1,1));
 vec2 c=corners[gl_VertexID];
 gl_Position=vec4((float(head+gl_InstanceID*64)+c.x)/192.*2.-1.,c.y*2.-1.,0,1);
}`;
  const remember =
    common +
    `out vec4 saved;
void main(){
 int id=int(gl_FragCoord.y)+(int(gl_FragCoord.x)/64)*4096;
 float key=float(id)*1.137;vec4 p=texelFetch(positions,address(id),0),a=texelFetch(attributes,address(id),0);
 float response=clamp(energyAt(p.z)/(.025+a.z),0.,1.3);
 float life=smoothstep(0.,.025,a.x)*(1.-smoothstep(a.y*.72,a.y,a.x));
 float depth=hash(key+91.);
 float light=(.52+.35*hash(key+71.))*life*pow(max(.001,a.z),.2)*response;
 light*=depth>.94?3.2:depth<.26?.65:.85;
 light*=(.25+.75*smoothstep(0.,2.5,p.y))*p.w*.87;
 saved=vec4(p.xy,a.y>0.&&a.x<a.y?light:-1.,a.w);
}`;
  const lines =
    common +
    `
out vec4 color;out vec2 lineCoord;flat out float radius;
vec4 pointAt(int column,int id){return texelFetch(history,ivec2(column+(id/4096)*64,id%4096),0);}
void main(){
 int id=gl_InstanceID/31,lag=(gl_InstanceID%31)*2;
 vec4 a=pointAt((head-lag+64)%64,id),b=pointAt((head-lag-2+128)%64,id);
 if(a.z<0.||b.z<0.||a.w!=b.w){gl_Position=vec4(3,3,0,1);color=vec4(0);return;}
 vec2 d=b.xy-a.xy;float len=length(d);
 if(len<.001||len>24.){gl_Position=vec4(3,3,0,1);color=vec4(0);return;}
 float key=float(id)*1.137,depth=hash(key+91.);
 vec4 current=texelFetch(attributes,address(id),0),pos=texelFetch(positions,address(id),0);
 if(a.w!=current.w){gl_Position=vec4(3,3,0,1);color=vec4(0);return;}
 float liveGate=clamp(energyAt(pos.z)/(.02+current.z),0.,1.);
 float retire=smoothstep(0.,.08,current.y-current.x);
 float bright=(a.z+b.z)*.5*exp(-float(lag)*.045)*liveGate*retire;
 float ceiling=min(limitAt(a.x),limitAt(b.x));bright*=1.-smoothstep(ceiling-7.,ceiling-1.,max(a.y,b.y));
 float taper=.45+.55*sqrt(clamp(bright,0.,1.));
 radius=glowPass==1?(depth<.26?2.8:.85):(depth>.94?.11:depth<.26?.29:.09)*taper;
 if(glowPass==1)bright*=depth<.26?.22:.09;
 vec2 axis=d/len,normal=vec2(-axis.y,axis.x);
 vec2 corners[6]=vec2[6](vec2(0,-1),vec2(1,-1),vec2(0,1),vec2(0,1),vec2(1,-1),vec2(1,1));
 vec2 c=corners[gl_VertexID];lineCoord=vec2(c.x*len,c.y*(radius+.5));
 vec2 world=a.xy+axis*lineCoord.x+normal*lineCoord.y;
 gl_Position=vec4(world.x/640.-1.,1.-(132.-world.y)/74.,0,1);
 color=vec4(depth>.94?vec3(0,0,1):(depth<.26?vec3(1,0,0):vec3(0,1,0)),bright);
}`;
  const ink = `#version 300 es
precision highp float;in vec4 color;in vec2 lineCoord;flat in float radius;uniform highp int glowPass;out vec4 painted;
void main(){painted=vec4(color.rgb,color.a*(glowPass==1?exp(-2.2*lineCoord.y*lineCoord.y/(radius*radius)):clamp(radius+.5-abs(lineCoord.y),0.,1.)));}`;
  // Scattering is recomputed from the moving strand densities on every frame.
  // It never samples a reference image or a retained screenshot.
  const scatterInk = `#version 300 es
precision highp float;uniform sampler2D positions;uniform vec2 scatterAxis;out vec4 painted;
void main(){
 ivec2 p=ivec2(gl_FragCoord.xy),bounds=textureSize(positions,0)-1;vec3 sum=vec3(0);float weight=0.;
 for(int i=-5;i<=5;i++){float w=exp(-float(i*i)/10.5);ivec2 q=clamp(p+ivec2(scatterAxis*float(i)),ivec2(0),bounds);sum+=texelFetch(positions,q,0).rgb*w;weight+=w;}
 painted=vec4(sum/weight,1.);
}`;
  const resolveInk = `#version 300 es
precision highp float;uniform sampler2D positions,scattered;uniform float heightLimits[48];out vec4 painted;
vec3 fetchLayer(ivec2 p){return texelFetch(positions,clamp(p,ivec2(0),textureSize(positions,0)-1),0).rgb;}
void main(){
 ivec2 p=ivec2(gl_FragCoord.xy);vec3 core=fetchLayer(p),soft=texelFetch(scattered,p,0).rgb;
 vec3 near=(fetchLayer(p+ivec2(1,0))+fetchLayer(p-ivec2(1,0))+fetchLayer(p+ivec2(0,1))+fetchLayer(p-ivec2(0,1)))*.25;
 float mid=core.g*.70+near.g*.30,front=core.b*.85+near.b*.15;
 float transmission=exp(-mid*.35-front*.18);
 vec3 back=vec3(.34,.009,.015)*(1.-exp(-soft.r*2.8))*transmission;
 vec3 middle=vec3(.55,.041,.028)*(1.-exp(-mid*1.05));
 vec3 highlight=vec3(1.1,.32,.20)*(1.-exp(-front*3.2));
 // Only narrow bright strands scatter into their immediate surroundings.
 vec3 halo=vec3(.42,.031,.016)*(1.-exp(-soft.b*.65));
 vec3 result=back+middle+highlight+halo;
 float b=clamp(gl_FragCoord.x/2560.*48.-.5,0.,47.);int k=int(floor(b));float ceiling=min(heightLimits[k],heightLimits[min(k+1,47)]);
 float height=gl_FragCoord.y*.5-16.;float roof=1.-smoothstep(ceiling-4.,ceiling,height);
 painted=vec4((1.-exp(-result*1.65))*roof,1.);
}`;
  class ParticleFilaments {
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
          'scatterAxis',
          'scattered',
        ])
          u[n] = gl.getUniformLocation(p, n);
        return { p, u };
      };
      this.solve = program(full, solver);
      this.save = program(historyVertex, remember);
      this.paint = program(lines, ink);
      this.resolve = program(full, resolveInk);
      this.scatter = program(full, scatterInk);
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
      this.history = tex(TRAIL * 3, 4096);
      this.historyFbo = frame([this.history]);
      this.accumulation = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.accumulation);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, W * 2, H * 2, 0, gl.RGBA, gl.HALF_FLOAT, null);
      this.textures.push(this.accumulation);
      this.accumulationFbo = frame([this.accumulation]);
      this.scattering = [0, 1].map(() => {
        const t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, W * 2, H * 2, 0, gl.RGBA, gl.HALF_FLOAT, null);
        this.textures.push(t);
        return { texture: t, fbo: frame([t]) };
      });
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
      gl.viewport(0, 0, TRAIL * 3, 4096);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, 3);
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
        sum += 0.005 + Math.pow(this.bands[i], 0.64);
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
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, N * 31);
      gl.uniform1i(this.paint.u.glowPass, 0);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, N * 31);
      gl.disable(gl.BLEND);
      gl.useProgram(this.scatter.p);
      gl.uniform1i(this.scatter.u.positions, 0);
      gl.activeTexture(gl.TEXTURE0);
      for (let pass = 0; pass < 2; pass++) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.scattering[pass].fbo);
        gl.bindTexture(gl.TEXTURE_2D, pass === 0 ? this.accumulation : this.scattering[0].texture);
        gl.uniform2f(this.scatter.u.scatterAxis, pass === 0 ? 1.5 : 0, pass === 1 ? 1.5 : 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.useProgram(this.resolve.p);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.accumulation);
      gl.uniform1i(this.resolve.u.positions, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.scattering[1].texture);
      gl.uniform1i(this.resolve.u.scattered, 1);
      gl.uniform1fv(this.resolve.u['heightLimits[0]'], this.limits);
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
      for (const o of [this.solve, this.save, this.paint, this.resolve, this.scatter])
        gl.deleteProgram(o.p);
      this.textures.forEach((t) => gl.deleteTexture(t));
      this.fbos.forEach((f) => gl.deleteFramebuffer(f));
      gl.deleteVertexArray(this.vao);
      this.canvas.removeEventListener('webglcontextlost', this.onLost);
      this.canvas.removeEventListener('webglcontextrestored', this.onRestored);
    }
  }
  class FieldFilaments {
    constructor() {
      this.particles = new ParticleFilaments();
      this.contours = new root.ContourFilaments();
      this.density = new root.DensityFilaments();
      this.canvas = document.createElement('canvas');
      this.canvas.width = W * 2;
      this.canvas.height = H * 2;
      this.ctx = this.canvas.getContext('2d', { alpha: false });
      this.sink = { save() {}, restore() {}, drawImage() {} };
    }
    get gl() {
      return this.particles.gl;
    }
    get tick() {
      return this.particles.tick;
    }
    get clock() {
      return this.particles.clock;
    }
    set clock(v) {
      this.particles.clock = v;
      this.contours.clock = v;
      this.density.clock = v;
    }
    get lost() {
      return this.particles.lost || this.contours.lost || this.density.lost;
    }
    reset() {
      this.particles.reset();
      this.contours.reset();
      this.density.reset();
      this.time = undefined;
    }
    draw(ctx, levels, dt, speed) {
      for (const r of [this.particles, this.contours, this.density]) {
        r.time = this.time;
        r.heightLimits = this.heightLimits;
        r.maxHeight = this.maxHeight;
        r.draw(this.sink, levels, dt, speed);
      }
      this.inputBandCount = levels.length;
      const g = this.ctx;
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
      g.fillStyle = '#000';
      g.fillRect(0, 0, this.canvas.width, this.canvas.height);
      g.globalCompositeOperation = 'screen';
      g.globalAlpha = 0.45;
      g.drawImage(this.density.canvas, 0, 0);
      g.globalAlpha = 0.65;
      g.drawImage(this.particles.canvas, 0, 0);
      g.globalAlpha = 0.38;
      g.drawImage(this.contours.canvas, 0, 0);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.drawImage(this.canvas, 590, 319, W, H);
      ctx.restore();
    }
    snapshot() {
      const p = this.particles.snapshot();
      p.contourPositions = this.contours.snapshot().positions;
      p.material = this.density.snapshot().material;
      return p;
    }
    getErrors() {
      return [
        this.particles.gl.getError(),
        this.contours.gl.getError(),
        this.density.gl.getError(),
      ];
    }
    dispose() {
      this.particles.dispose();
      this.contours.dispose();
      this.density.dispose();
      this.canvas.width = 1;
    }
  }
  root.FieldFilaments = FieldFilaments;
})(window);
