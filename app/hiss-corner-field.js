/* Local Hiss density transported through a velocity field, with a separate
   optical compositor. The scene and its game capture never move. */
((root) => {
  'use strict';
  const vertex = `#version 300 es
layout(location=0) in vec2 position;
void main(){gl_Position=vec4(position,0.,1.);}`;
  const common = `
uniform vec2 size,origin,anchor;
uniform vec4 fieldStyle;
uniform vec3 fieldColor;
uniform vec3 worldX,worldY;
uniform vec4 gameRect;
uniform float time,variant;
uniform vec2 audioDrive;
uniform vec3 audioBands;
uniform vec2 audioStyle;
float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.)),f.x),f.y);}
float fbm(vec2 p){return .57*noise(p)+.28*noise(p*2.07+17.)+.15*noise(p*4.13-8.);}
vec2 vortex(vec2 p,vec2 c,float r,float speed){vec2 d=(p-c)/r;return vec2(-d.y,d.x)*exp(-dot(d,d)*1.8)*speed;}
vec2 orient(vec2 p){return (p+origin-anchor)/max(.15,fieldStyle.z)*(variant>.5?-1.:1.);}
// A changing stream function adds divergence-free local currents between the
// large eddies, rather than making the entire sheet drift as one image.
vec2 smallCurrent(vec2 p,float t){
 vec2 q=p*.024+vec2(t*.072,-t*.053);float e=.06;
 float dy=noise(q+vec2(0.,e))-noise(q-vec2(0.,e));
 float dx=noise(q+vec2(e,0.))-noise(q-vec2(e,0.));
 return vec2(dy,-dx)*(14./(2.*e));
}
vec2 velocity(vec2 p,float t){
 vec2 q=orient(p);
 vec2 v=vec2(-12.+6.*sin(q.y*.018+t*.23),3.5*sin(q.x*.022-t*.19));
 v+=vortex(q,vec2(-34.,-14.+sin(t*.35)*16.),92.,80.);
 v+=vortex(q,vec2(12.,34.),66.,-60.);
 v+=vortex(q,vec2(-108.,-30.),83.,-45.);
 v+=smallCurrent(q,t+variant*17.)*(1.+audioBands.y*1.8);
 v+=vortex(q,vec2(-174.,-17.),128.,-110.)*audioBands.y;
 v+=smallCurrent(q,t*1.8+31.)*audioBands.z*.28;
 // Transients accelerate new material along the available frame margins.
 // The optical image itself is never scaled or shifted as a whole.
 v+=vec2(-85.,-16.)*audioDrive.y*audioBands.x*exp(-dot((q-vec2(-80.,-15.))/vec2(190.,58.),(q-vec2(-80.,-15.))/vec2(190.,58.)));
 v+=vec2(8.,72.)*audioDrive.y*audioBands.x*exp(-dot((q-vec2(12.,55.))/vec2(42.,100.),(q-vec2(12.,55.))/vec2(42.,100.)));
 return v*(variant>.5?-1.:1.)*(1.+audioBands.y*1.5+audioDrive.y*audioBands.x*.3);
}
vec2 backtrace(vec2 p,float t,float dt){return p-velocity(p-velocity(p,t)*dt*.5,t-dt*.5)*dt;}
float envelope(vec2 p){
 vec2 q=orient(p);
 vec2 warp=vec2(fbm(q*.018+vec2(time*.065,3.)),fbm(q*.023+vec2(7.,-time*.051)))-.5;
 q+=warp*50.;
 float opening=clamp(audioBands.x*(.94+audioDrive.y*.18),0.,1.);
 vec2 bank=vec2(-36.-opening*235.,-13.-opening*10.);
 vec2 span=vec2(134.+opening*160.,60.+opening*32.);
 vec2 shoulder=vec2(5.,41.+opening*148.);
 vec2 depth=vec2(43.+opening*10.,95.+opening*85.);
 float a=exp(-dot((q-bank)/span,(q-bank)/span)*1.5);
 float b=exp(-dot((q-shoulder)/depth,(q-shoulder)/depth)*1.6);
 return max(a,b*.72);
}
`;
  const advect = `#version 300 es
precision highp float;
uniform sampler2D previousField;
uniform vec2 fieldSize;
uniform float delta,reset;
out vec4 outColor;
${common}
void main(){
 vec2 p=vec2(gl_FragCoord.x/fieldSize.x,1.-gl_FragCoord.y/fieldSize.y)*size;
 vec2 uv=clamp(backtrace(p,time,delta)/size,vec2(.001),vec2(.999));
 vec3 carried=texture(previousField,vec2(uv.x,1.-uv.y)).rgb;
 vec2 q=orient(backtrace(p,time,1.8));
 float broad=fbm(q*vec2(.017,.039)+vec2(-time*.043,0.));
 float folds=fbm(q*vec2(.021,.13)+vec2(-time*.13,broad*1.8));
 // Emission changes locally; already emitted material keeps travelling.
 float pressure=.68+.70*smoothstep(.25,.72,noise(q*.018+vec2(time*.23,-time*.11)));
 float mass=envelope(p)*pressure*(1.+audioBands.x*.50+audioDrive.y*audioBands.x*.18);
 vec3 source=vec3((.22+.78*broad)*mass,folds*mass,broad);
 float injection=.72+audioBands.x*2.6+audioDrive.y*audioBands.x*3.4;
 vec3 density=mix(carried*exp(-delta*.21),source,1.-exp(-delta*injection));
 if(reset>.5)density=source;
 outColor=vec4(density,1.);
}`;
  const flowSampling = `
vec4 sampleFlow(sampler2D field,vec2 uv,vec2 dimensions){
 vec2 grid=clamp(uv*dimensions-.5,vec2(0.),dimensions-1.);
 ivec2 a=ivec2(floor(grid)),b=min(a+1,ivec2(dimensions)-1);vec2 f=fract(grid);
 return mix(mix(texelFetch(field,a,0),texelFetch(field,ivec2(b.x,a.y),0),f.x),mix(texelFetch(field,ivec2(a.x,b.y),0),texelFetch(field,b,0),f.x),f.y);
}`;
  const advectFlow = `#version 300 es
precision highp float;
uniform sampler2D previousFlow;
uniform vec2 fieldSize,resetFlow;
uniform float delta;
out vec4 outColor;
${common}
${flowSampling}
void main(){
 vec2 p=vec2(gl_FragCoord.x/fieldSize.x,1.-gl_FragCoord.y/fieldSize.y)*size;
 vec2 departure=backtrace(p,time,delta)/size;
 vec4 carried=sampleFlow(previousFlow,vec2(departure.x,1.-departure.y),fieldSize);
 vec2 seed=p/size;
 bool outside=any(lessThan(departure,vec2(0.)))||any(greaterThan(departure,vec2(1.)));
 if(resetFlow.x>.5||outside)carried.xy=seed;
 if(resetFlow.y>.5||outside)carried.zw=seed;
 outColor=carried;
}`;
  const fragment = `#version 300 es
precision highp float;
uniform sampler2D densityField,printSurface;
uniform float intensity,flowAge,flowRemainder,useFlow;
uniform sampler2D materialFlow;
uniform vec2 fieldSize;
out vec4 outColor;
${common}
${flowSampling}
vec3 densityAt(vec2 p){vec2 uv=clamp(p/size,vec2(.001),vec2(.999));return texture(densityField,vec2(uv.x,1.-uv.y)).rgb;}
vec3 paperAt(vec2 p){return texture(printSurface,clamp(p/size,vec2(.002),vec2(.998))).rgb;}
vec4 material(vec2 q,vec3 density){
 float broad=fbm(q*vec2(.018,.033)+vec2(-time*.025,0.));
 float warp=(broad-.5)*44.+density.g*25.;
 float carriedFold=clamp(density.g/max(density.r,.045)*.52,0.,1.);
 float folds=mix(fbm(vec2(q.x*.020-time*.04,(q.y+warp)*.145)),carriedFold,.35);
 float fray=audioBands.z*(fbm(q*vec2(.020,.11)+vec2(time*1.2,-time*.65))-.5)*3.;
 float fine=fbm(vec2(q.x*.041-time*.035,(q.y+warp+fray)*.51));
 float detail=fbm(q*.18+vec2(broad*7.,density.g*5.));
 return vec4(broad,folds,fine,detail);
}
void main(){
 vec2 p=vec2(gl_FragCoord.x,size.y-gl_FragCoord.y);
 vec2 screen=vec2(dot(worldX,vec3(p,1.)),dot(worldY,vec3(p,1.)));
 // Keep neighboring fragment lanes alive for the fold derivatives at the
 // capture boundary; the exact transparent cut is applied after shading.

 vec2 q=orient(backtrace(p,time,.95));
 vec3 density=densityAt(p);
 float edge=smoothstep(0.,variant>.5?3.:18.,min(min(p.x,size.x-p.x),min(p.y,size.y-p.y)));
 if(variant>.5)edge*=smoothstep(0.,32.,size.x-p.x)*smoothstep(0.,26.,size.y-p.y);
 float mass=clamp(density.r*1.7*fieldStyle.x,0.,1.);
 // Sample material coordinates transported by the flow, rather than
 // recomputing a new texture position when a frequency changes velocity.
 vec2 qa=q,qb=q;float weight=1.;
 if(useFlow>.5){
  vec2 departure=backtrace(p,time,flowRemainder)/size;
  vec4 coordinates=sampleFlow(materialFlow,vec2(departure.x,1.-departure.y),fieldSize);
  qa=orient(coordinates.xy*size);qb=orient(coordinates.zw*size);
  weight=.5-.5*cos(fract(flowAge/8.)*6.2831853);
 }
 vec4 ma=material(qa,density),mb=material(qb,density);
 float broad=mix(mb.x,ma.x,weight),folds=mix(mb.y,ma.y,weight),detail=mix(mb.w,ma.w,weight);
 float sheet=mix(smoothstep(.30,.68,mb.y),smoothstep(.30,.68,ma.y),weight);
 float rim=mix(exp(-pow((mb.y-.59)/.045,2.)),exp(-pow((ma.y-.59)/.045,2.)),weight);
 float fibers=mix(pow(mb.z,5.),pow(ma.z,5.),weight)*(.9+audioBands.z*2.1);
 float opacity=mass*(.18+sheet*.22+rim*.12)*edge*min(intensity,1.5);
 vec2 gradient=vec2(densityAt(p+vec2(3.,0.)).r-densityAt(p-vec2(3.,0.)).r,densityAt(p+vec2(0.,3.)).r-densityAt(p-vec2(0.,3.)).r);
 // The slope of each transported fold bends the local ink. This is separate
 // from colour, so a dark part of the sheet can still refract the frame.
 vec2 slope=vec2(dFdx(folds),-dFdy(folds));
 vec2 displacement=(velocity(p,time)*.14+gradient*95.+slope*155.+vec2(broad-.5,folds-.5)*10.)*mass*min(intensity,1.5)*(1.+audioStyle.x*2.4)*fieldStyle.y;
 vec3 refracted=paperAt(p+displacement);
 float optical=smoothstep(.015,.68,mass)*edge*(.34+sheet*.60)*min(intensity,1.);
 // Reconstruction contains only surface ink; it must not paint over live text.
 if(fieldStyle.w<.5&&variant<.5)optical*=1.-smoothstep(1454.,1470.,screen.x)*smoothstep(76.,95.,screen.y);
 else if(fieldStyle.w<.5)optical*=1.-smoothstep(879.,894.,screen.y);
 float fringe=mass*(1.-mass)*edge*min(intensity,1.5);
 vec2 split=(vec2(.65,-.35)+slope*10.)*fringe;
 vec3 dispersed=vec3(paperAt(p+displacement+split).r,refracted.g,paperAt(p+displacement-split).b);
 float red=mass*edge*(.035+sheet*.11+rim*.085+fibers*.16)*(.55+detail*.85)*intensity;
 vec3 tint=fieldColor*red*3.0*(1.+audioStyle.y*1.8);
 // Prismatic traces are subordinate to the red density and outer folds.
 float cool=max(0.,length(slope)-.012);
 tint+=vec3(.04,.09,.15)*cool*fringe*.14;
 float alpha=clamp(opacity+optical*(1.-opacity),0.,.91);
 vec3 color=tint+dispersed*optical*(1.-opacity);
 if(screen.x>=gameRect.x&&screen.x<=gameRect.x+gameRect.z&&screen.y>=gameRect.y&&screen.y<=gameRect.y+gameRect.w)discard;
 outColor=vec4(color/max(alpha,.001),alpha);
}`;
  // Resize the simulation domain in physical pixel coordinates. Existing folds
  // are carried across the overlap instead of scaled to fit a new rectangle.
  const transferField = `#version 300 es
precision highp float;
uniform sampler2D oldField;
uniform vec2 oldSize,newSize,oldGrid,newGrid;
uniform float flowTransfer;
out vec4 outColor;
${flowSampling}
void main(){
 vec2 p=vec2(gl_FragCoord.x/newGrid.x,1.-gl_FragCoord.y/newGrid.y)*newSize;
 vec2 uv=p/oldSize;
 bool inside=all(greaterThanEqual(uv,vec2(0.)))&&all(lessThanEqual(uv,vec2(1.)));
 vec4 value=vec4(0.);
 if(flowTransfer>.5){
  value=inside?sampleFlow(oldField,vec2(uv.x,1.-uv.y),oldGrid):vec4(uv,uv);
  value*=vec4(oldSize/newSize,oldSize/newSize);
 }else if(inside)value=texture(oldField,vec2(uv.x,1.-uv.y));
 outColor=value;
}`;
  function create(canvas, box, source) {
    let gl;
    try {
      gl = canvas.getContext('webgl2', {
        alpha: true,
        antialias: false,
        premultipliedAlpha: false,
        preserveDrawingBuffer: true,
      });
    } catch {}
    if (!gl) {
      canvas.hidden = true;
      return null;
    }
    let fieldW = Math.ceil(box.w / 1.5),
      fieldH = Math.ceil(box.h / 1.5),
      domainW = box.w,
      domainH = box.h,
      transfer = null;
    let precise = false;
    let programs = [],
      buffer = null,
      paper = null,
      fields = [],
      flows = [],
      flowAge = 0,
      ready = false,
      disposed = false,
      painted = false,
      revision = null,
      index = 0,
      previousTime = null,
      simulationTime = 0,
      lastTime = 0,
      lastIntensity = 1,
      lastAudio = { level: 0, hit: 0 };
    function release() {
      for (const p of programs) gl.deleteProgram(p.program);
      for (const f of [...fields, ...flows]) {
        gl.deleteTexture(f.texture);
        gl.deleteFramebuffer(f.framebuffer);
      }
      if (paper) gl.deleteTexture(paper);
      if (buffer) gl.deleteBuffer(buffer);
      programs = [];
      fields = [];
      flows = [];
      flowAge = 0;
      paper = buffer = null;
      ready = painted = false;
      revision = null;
      previousTime = null;
    }
    function program(fragmentCode) {
      const shaders = [];
      let p = null;
      try {
        for (const [type, code] of [
          [gl.VERTEX_SHADER, vertex],
          [gl.FRAGMENT_SHADER, fragmentCode],
        ]) {
          const s = gl.createShader(type);
          shaders.push(s);
          gl.shaderSource(s, code);
          gl.compileShader(s);
          if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
        }
        p = gl.createProgram();
        for (const s of shaders) gl.attachShader(p, s);
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
        const locations = {};
        for (const name of [
          'fieldStyle',
          'fieldColor',
          'worldX',
          'worldY',
          'gameRect',
          'size',
          'origin',
          'anchor',
          'variant',
          'time',
          'fieldSize',
          'delta',
          'reset',
          'previousField',
          'densityField',
          'printSurface',
          'intensity',
          'audioDrive',
          'audioBands',
          'audioStyle',
          'previousFlow',
          'materialFlow',
          'resetFlow',
          'flowAge',
          'flowRemainder',
          'useFlow',
          'oldField',
          'oldSize',
          'newSize',
          'oldGrid',
          'newGrid',
          'flowTransfer',
        ])
          locations[name] = gl.getUniformLocation(p, name);
        return { program: p, u: locations };
      } catch (error) {
        if (p) gl.deleteProgram(p);
        throw error;
      } finally {
        for (const s of shaders) gl.deleteShader(s);
      }
    }
    function texture() {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    }
    function setup() {
      if (disposed || gl.isContextLost()) return false;
      release();
      try {
        precise = !!gl.getExtension('EXT_color_buffer_float');
        programs.push(program(advect));
        programs.push(program(fragment));
        if (precise) programs.push(program(advectFlow));
        transfer = program(transferField);
        programs.push(transfer);
        buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.activeTexture(gl.TEXTURE0);
        paper = texture();
        for (let i = 0; i < 2; i++) {
          const f = { texture: texture(), framebuffer: gl.createFramebuffer() };
          fields.push(f);
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            precise ? gl.RGBA16F : gl.RGBA8,
            fieldW,
            fieldH,
            0,
            gl.RGBA,
            precise ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE,
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
            throw new Error('Incomplete density field');
        }
        if (precise)
          for (let i = 0; i < 2; i++) {
            const f = { texture: texture(), framebuffer: gl.createFramebuffer() };
            flows.push(f);
            // Float coordinates preserve subpixel movement even in quiet regions.
            // Manual bilinear sampling avoids a dependency on float linear filtering.
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, fieldW, fieldH, 0, gl.RGBA, gl.FLOAT, null);
            gl.bindFramebuffer(gl.FRAMEBUFFER, f.framebuffer);
            gl.framebufferTexture2D(
              gl.FRAMEBUFFER,
              gl.COLOR_ATTACHMENT0,
              gl.TEXTURE_2D,
              f.texture,
              0,
            );
            if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
              throw new Error('Incomplete material flow');
          }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        index = 0;
        ready = true;
        canvas.hidden = false;
        return true;
      } catch (error) {
        release();
        canvas.hidden = true;
        console.warn('Hiss corner unavailable:', error.message);
        return false;
      }
    }
    function resize(width, height) {
      width = Math.max(2, Math.round(width));
      height = Math.max(2, Math.round(height));
      if (width === domainW && height === domainH) return true;
      if (disposed || !ready || gl.isContextLost()) return false;
      const nextW = Math.ceil(width / 1.5),
        nextH = Math.ceil(height / 1.5),
        nextFields = [],
        nextFlows = [];
      const remove = (list) => {
        for (const f of list) {
          gl.deleteTexture(f.texture);
          gl.deleteFramebuffer(f.framebuffer);
        }
      };
      try {
        const copy = (isFlow, out) => {
          for (let i = 0; i < 2; i++) {
            const f = { texture: texture(), framebuffer: gl.createFramebuffer() };
            out.push(f);
            if (isFlow) {
              gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
              gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            }
            gl.texImage2D(
              gl.TEXTURE_2D,
              0,
              isFlow ? gl.RGBA32F : precise ? gl.RGBA16F : gl.RGBA8,
              nextW,
              nextH,
              0,
              gl.RGBA,
              isFlow ? gl.FLOAT : precise ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE,
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
              throw Error('Incomplete resized field');
            gl.useProgram(transfer.program);
            gl.uniform2f(transfer.u.oldSize, domainW, domainH);
            gl.uniform2f(transfer.u.newSize, width, height);
            gl.uniform2f(transfer.u.oldGrid, fieldW, fieldH);
            gl.uniform2f(transfer.u.newGrid, nextW, nextH);
            gl.uniform1f(transfer.u.flowTransfer, isFlow ? 1 : 0);
            gl.uniform1i(transfer.u.oldField, 0);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, (isFlow ? flows : fields)[index].texture);
            gl.viewport(0, 0, nextW, nextH);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
          }
        };
        copy(false, nextFields);
        if (precise) copy(true, nextFlows);
        remove([...fields, ...flows]);
        fields = nextFields;
        flows = nextFlows;
        fieldW = nextW;
        fieldH = nextH;
        domainW = box.w = width;
        domainH = box.h = height;
        index = 0;
        canvas.width = width;
        canvas.height = height;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        revision = null;
        draw(lastTime, lastIntensity, lastAudio);
        return true;
      } catch (error) {
        remove([...nextFields, ...nextFlows]);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        console.warn('Hiss resize retained previous field:', error.message);
        return false;
      }
    }
    function use(p, time) {
      gl.useProgram(p.program);
      const style = source?.style?.() || {},
        hex = style.flowColor || '#b80504',
        rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
      gl.uniform4f(
        p.u.fieldStyle,
        style.flowDensity ?? 1,
        style.flowWarp ?? 1,
        style.flowSpread ?? 1,
        style.free ? 1 : 0,
      );
      gl.uniform3f(p.u.fieldColor, ...rgb);
      const angle = ((style.rotation || 0) * Math.PI) / 180,
        co = Math.cos(angle),
        si = Math.sin(angle),
        m = source?.worldTransform?.() || [
          co,
          si,
          -si,
          co,
          box.x + box.w * 0.5 - co * box.w * 0.5 + si * box.h * 0.5,
          box.y + box.h * 0.5 - si * box.w * 0.5 - co * box.h * 0.5,
        ];
      gl.uniform3f(p.u.worldX, m[0], m[2], m[4]);
      gl.uniform3f(p.u.worldY, m[1], m[3], m[5]);
      const g = source?.gameRect?.() || { x: 18, y: 72, w: 1408, h: 792 };
      gl.uniform4f(p.u.gameRect, g.x, g.y, g.w, g.h);
      gl.uniform2f(p.u.size, box.w, box.h);
      gl.uniform2f(p.u.origin, box.x, box.y);
      gl.uniform2f(p.u.anchor, box.ax, box.ay);
      gl.uniform1f(p.u.variant, box.variant);
      gl.uniform1f(p.u.time, time);
      gl.uniform2f(p.u.audioDrive, lastAudio.level, lastAudio.hit);
      gl.uniform3f(p.u.audioBands, lastAudio.bass || 0, lastAudio.mid || 0, lastAudio.high || 0);
      gl.uniform2f(p.u.audioStyle, lastAudio.optics || 0, lastAudio.glow || 0);
    }
    function step(time, delta, reset) {
      const p = programs[0],
        next = 1 - index;
      use(p, time);
      gl.uniform2f(p.u.fieldSize, fieldW, fieldH);
      gl.uniform1f(p.u.delta, delta);
      gl.uniform1f(p.u.reset, reset ? 1 : 0);
      gl.uniform1i(p.u.previousField, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, fields[index].texture);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fields[next].framebuffer);
      gl.viewport(0, 0, fieldW, fieldH);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      const oldAge = flowAge;
      flowAge = reset ? 0 : flowAge + delta;
      if (precise) {
        const f = programs[2];
        use(f, time);
        gl.uniform2f(f.u.fieldSize, fieldW, fieldH);
        gl.uniform1f(f.u.delta, delta);
        gl.uniform2f(
          f.u.resetFlow,
          reset || Math.floor(oldAge / 8) !== Math.floor(flowAge / 8) ? 1 : 0,
          reset || Math.floor((oldAge + 4) / 8) !== Math.floor((flowAge + 4) / 8) ? 1 : 0,
        );
        gl.uniform1i(f.u.previousFlow, 0);
        gl.bindTexture(gl.TEXTURE_2D, flows[index].texture);
        gl.bindFramebuffer(gl.FRAMEBUFFER, flows[next].framebuffer);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      index = next;
    }
    function draw(timeMs, intensity = 1, audio = {}) {
      lastAudio = {
        level: Math.max(0, Math.min(1, Number(audio.level) || 0)),
        hit: Math.max(0, Math.min(1, Number(audio.spreadHit ?? audio.hit) || 0)),
      };
      for (const band of ['bass', 'mid', 'high', 'optics', 'glow'])
        lastAudio[band] = Math.max(0, Math.min(1, Number(audio[band]) || 0));
      lastTime = timeMs;
      lastIntensity = Math.max(0, Math.min(2, Number.isFinite(intensity) ? intensity : 1));
      if (disposed || !ready || gl.isContextLost()) return;
      const time = timeMs / 1000;
      if (lastIntensity === 0) {
        if (painted) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
          painted = false;
        }
        previousTime = null;
        return;
      }
      if (previousTime === null || time < previousTime) {
        step(time, 0, true);
        simulationTime = time;
      } else {
        // Fixed simulation steps avoid irregular extra passes at frame boundaries.
        simulationTime = Math.max(simulationTime, time - 0.12);
        for (let n = 0; n < 4 && time - simulationTime >= 1 / 30 - 0.000001; n++) {
          simulationTime += 1 / 30;
          step(simulationTime, 1 / 30, false);
        }
      }
      previousTime = time;
      const surface = source.texture();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, paper);
      if (revision !== surface.revision) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, surface.canvas);
        revision = surface.revision;
      }
      const p = programs[1];
      use(p, time);
      gl.uniform1f(p.u.intensity, lastIntensity);
      gl.uniform1i(p.u.printSurface, 0);
      gl.uniform1i(p.u.densityField, 1);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, fields[index].texture);
      const remainder = Math.max(0, Math.min(1 / 30, time - simulationTime));
      gl.uniform1f(p.u.flowAge, (flowAge + remainder) % 8);
      gl.uniform1f(p.u.flowRemainder, remainder);
      gl.uniform1f(p.u.useFlow, precise ? 1 : 0);
      gl.uniform2f(p.u.fieldSize, fieldW, fieldH);
      gl.uniform1i(p.u.materialFlow, 2);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, precise ? flows[index].texture : fields[index].texture);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, box.w, box.h);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      painted = true;
    }
    function lost(event) {
      event.preventDefault();
      programs = [];
      fields = [];
      flows = [];
      flowAge = 0;
      paper = buffer = null;
      revision = null;
      previousTime = null;
      ready = painted = false;
      canvas.hidden = true;
    }
    function restored() {
      if (setup()) draw(lastTime, lastIntensity, lastAudio);
    }
    canvas.width = box.w;
    canvas.height = box.h;
    canvas.addEventListener('webglcontextlost', lost);
    canvas.addEventListener('webglcontextrestored', restored);
    setup();
    return {
      draw,
      resize,
      get state() {
        return {
          domainW,
          domainH,
          fieldW,
          fieldH,
          flowAge,
          simulationTime,
          lastTime,
          ready,
          precise,
        };
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        canvas.removeEventListener('webglcontextlost', lost);
        canvas.removeEventListener('webglcontextrestored', restored);
        release();
        gl.getExtension('WEBGL_lose_context')?.loseContext();
      },
    };
  }
  if (typeof module === 'object' && module.exports) module.exports = { create };
  else root.HissCornerField = { create };
})(globalThis);
