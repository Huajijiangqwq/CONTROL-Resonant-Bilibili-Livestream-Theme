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
/* Live-frame recording treatment. No reference pixels or stored noise frames are
   used by these passes. The simulation approximates visible analogue defects;
   it is not a complete NTSC/PAL encoder or a model of a particular VCR. */
(function (root) {
  'use strict';
  const W = 1920,
    H = 560,
    SW = 1920,
    SH = 560,
    clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const defaults = Object.freeze({
    strength: 1,
    softness: 1.5,
    bleed: 4.2,
    offset: 1.1,
    motion: 1,
    hue: 1,
    noise: 1,
    frequency: 1,
  });
  function settings(value = {}) {
    const out = {};
    for (const [key, range] of Object.entries({
      strength: [0, 1.5],
      softness: [0, 2.5],
      bleed: [0, 8],
      offset: [-6, 6],
      motion: [0, 2.5],
      hue: [0, 2.5],
      noise: [0, 2.5],
      frequency: [0, 3],
    })) {
      const n = Number(value[key] ?? defaults[key]);
      out[key] = Number.isFinite(n) ? clamp(n, ...range) : defaults[key];
    }
    return out;
  }
  const hash = (x) => {
    const n = Math.sin(x * 127.1 + 311.7) * 43758.5453;
    return n - Math.floor(n);
  };
  function pulse(age, duration) {
    if (age < 0 || age > duration) return 0;
    const on = Math.min(1, age / 0.025),
      off = clamp((duration - age) / 0.09, 0, 1);
    return on * off;
  }
  function stateAt(ms, config = defaults, forcedAt = -Infinity) {
    const s = settings(config),
      t = ms / 1000,
      period = s.frequency > 0 ? 8 / s.frequency : 1e9,
      cycle = Math.floor(t / period),
      seed = cycle + 29;
    const age = t - cycle * period - period * (0.2 + 0.5 * hash(seed)),
      duration = 0.23 + 0.32 * hash(seed + 4);
    let event = s.frequency > 0 ? pulse(age, duration) : 0,
      y = 45 + hash(seed + 1) * 450,
      width = 3 + hash(seed + 2) * 12,
      sign = hash(seed + 3) > 0.5 ? 1 : -1;
    const forcedAge = (ms - forcedAt) / 1000;
    if (forcedAge >= 0 && forcedAge < 0.82) {
      event = pulse(forcedAge, 0.82);
      y = 110 + forcedAge * 230;
      width = 9;
      sign = 1;
    }
    return {
      time: t,
      rollA: ((t * 25 + 170) % 760) - 100,
      rollB: ((t * 17 + 510) % 760) - 100,
      event,
      y,
      width,
      sign,
    };
  }
  const vertex = `#version 300 es
precision highp float;
out vec2 uv;
void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);uv=p;gl_Position=vec4(p*2.0-1.0,0,1);}`;
  const common = `#version 300 es
precision highp float;
in vec2 uv;out vec4 color;
uniform sampler2D source;uniform sampler2D lettering;uniform sampler2D paperSurface;uniform vec2 size;
uniform float amount,softness,bleed,offset,motion,hue,noise,time;
uniform vec2 rolls;uniform vec4 burst;
float hash(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
float field(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);}
vec3 yiq(vec3 c){return vec3(dot(c,vec3(.299,.587,.114)),dot(c,vec3(.596,-.274,-.322)),dot(c,vec3(.211,-.523,.312)));}
vec3 rgb(vec3 c){return vec3(c.x+.956*c.y+.621*c.z,c.x-.272*c.y-.647*c.z,c.x-1.106*c.y+1.703*c.z);}
vec3 unpackSignal(vec3 s){return vec3(s.r,(s.gb-vec2(128.0/255.0))*2.0);}
vec4 packSignal(vec3 s){return vec4(s.x,s.yz*.5+vec2(128.0/255.0),1);}
vec2 at(vec2 p){return clamp(p,vec2(.5)/size,vec2(1)-vec2(.5)/size);}
float band(float y,float center,float width){float d=(y-center)/width;return exp(-d*d);}
`;
  const material =
    common +
    `
// Finite, independently oriented folds are generated from stable paper-space
// coordinates. They have tapered ends, a narrow lit side and a broader shadow.
float folds(vec2 p){
 vec2 q=p+vec2(field(p*.065),field(p*.069+19.))*2.5;
 vec2 cell=floor(q/vec2(22.,15.));float total=0.;
 for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
  vec2 id=cell+vec2(x,y),local=q-(id+vec2(hash(id+7.),hash(id+19.)))*vec2(22.,15.);
  float angle=(hash(id+37.)-.5)*3.14159;
  vec2 axis=vec2(cos(angle),sin(angle)),normal=vec2(-axis.y,axis.x);
  float length=7.+hash(id+43.)*10.;
  float along=dot(local,axis),crosswise=dot(local,normal);
  crosswise-=abs(along)*((hash(id+53.)-.5)*.60);
  float taper=1.-smoothstep(length*.25,length,abs(along));
  float width=.45+hash(id+61.)*.8;
  float lit=exp(-pow(crosswise/width,2.));
  float shadow=exp(-pow((crosswise-width*1.9)/(width*2.5),2.));
  float contrast=.3+.7*hash(id+71.);
  total+=(lit*.22-shadow*.16)*taper*contrast;
 }
 return total;
}
vec3 creaseNoise(vec2 p,float alpha){
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
// Intersecting continuous creases are sampled in fixed paper coordinates.
// This surface is cached per glyph mask; time variation belongs to signal passes.
float paperHeight(vec2 p){
 vec2 warp=vec2(creaseNoise(p*.023,0.).z,creaseNoise(p*.021+19.,1.7).z);
 vec2 q=p+warp*3.;
 float a=creaseNoise(q*.036,0.).z;
 float b=creaseNoise(q*.080+37.,1.3).z;
 return abs(a)*.70+abs(b)*.30;
}
void main(){
 vec2 p=vec2(uv.x*size.x,(1.0-uv.y)*size.y);
 float mask=texture(lettering,at(uv)).a;
 float height=paperHeight(p);
 float slope=paperHeight(p+vec2(.65,.85))-paperHeight(p-vec2(.65,.85));
 float broad=field(p*vec2(.024,.047));
 float fibre=(field(p*vec2(.13,1.6))-.5)*.018;
 float micro=(field(p*vec2(.64,.73))-.5)*.14;
 vec2 pores=p*mat2(.43,.05,-.035,.13)+vec2(field(p*.073),field(p*.071+43.))*1.7;
 float mottle=(field(pores)-.5)*.18;
 float paper=clamp(.920+slope*.28-height*.020+(broad-.5)*.08+fibre+micro+mottle+folds(p*.80)*.27+folds(p*1.72+73.)*.12,.60,.99);
 color=vec4(paper*1.009,paper*.959,paper*.917,mask);
}`;
  const encode =
    common +
    `
vec3 currentFrame(vec2 p){vec4 surface=texture(paperSurface,at(p));return mix(texture(source,at(p)).rgb,surface.rgb,surface.a*min(amount,1.0));}
void main(){
 vec2 px=1.0/size;vec3 center=yiq(currentFrame(uv));
 float soft=softness*amount;float y=center.x*.26;
 y+=(yiq(currentFrame(uv+vec2(soft,0)*px)).x+yiq(currentFrame(uv-vec2(soft,0)*px)).x)*.24;
 y+=(yiq(currentFrame(uv+vec2(soft*2.0,0)*px)).x+yiq(currentFrame(uv-vec2(soft*2.0,0)*px)).x)*.06;
 y+=(yiq(currentFrame(uv+vec2(0,soft*.73)*px)).x+yiq(currentFrame(uv-vec2(0,soft*.73)*px)).x)*.07;
 // A distributed, decaying luma tail avoids a second crisp copy of the edge.
 // This is a finite-kernel approximation, not an imported VCR filter preset.
 float tail=yiq(currentFrame(uv-vec2(1.6*soft,0)*px)).x*.40;
 tail+=yiq(currentFrame(uv-vec2(3.2*soft,0)*px)).x*.30;
 tail+=yiq(currentFrame(uv-vec2(5.0*soft,0)*px)).x*.20;
 tail+=yiq(currentFrame(uv-vec2(7.5*soft,0)*px)).x*.10;
 y=mix(y,tail,.12*amount);
 // Retain a little narrow-rule energy through the limited-bandwidth response.
 // Both sides must be dark: broad text faces and ordinary edges don't qualify.
 float acrossX=max(yiq(currentFrame(uv+vec2(5.,0)*px)).x,yiq(currentFrame(uv-vec2(5.,0)*px)).x);
 float acrossY=max(yiq(currentFrame(uv+vec2(0,5.)*px)).x,yiq(currentFrame(uv-vec2(0,5.)*px)).x);
 float isolated=smoothstep(.34,.62,center.x)*smoothstep(.20,.45,center.x-min(acrossX,acrossY));
 y+=max(0.,center.x-y)*isolated*.46*min(amount,1.);
 // Preserve a narrow coloured core inside luminous strands. The surrounding
 // signal still receives the same blur and chroma tail; neutral type is not
 // sharpened. This is an appearance adjustment, not a full tape codec model.
 float emission=smoothstep(.08,.28,length(center.yz));
 y+=max(0.0,center.x-y)*.72*emission*min(amount,1.0);
 float spread=bleed*amount;vec2 c=vec2(0);
 // Asymmetric horizontal low-pass gives a soft tail, not duplicate RGB outlines.
 for(int i=-3;i<=3;i++){float k=float(i);float weight=exp(-.5*pow((k-.45)/1.45,2.0));c+=yiq(currentFrame(uv+vec2(k*spread*.65,0)*px)).yz*weight;}
 float sum=0.0;for(int i=-3;i<=3;i++)sum+=exp(-.5*pow((float(i)-.45)/1.45,2.0));
 color=packSignal(vec3(y,mix(c/sum,center.yz,.35+.45*emission)));
}`;
  const disturb =
    common +
    `
void main(){
 float row=(1.0-uv.y)*size.y;vec2 px=1.0/size;
 float moving=band(row,rolls.x,23.0)+band(row,rolls.y,11.0)*.55;
 float hit=band(row,burst.y,burst.z)*burst.x;
 float lineTick=floor(time*24.0);
 float rowError=(field(vec2(row*.16,lineTick))-.5)*.55;
 float head= smoothstep(531.0,548.0,row)*(field(vec2(row*.7,lineTick))-.5)*1.4;
 float shift=(rowError+moving*.8+hit*burst.w*(3.8+hash(vec2(lineTick,row)))*motion+head)*amount;
 vec2 point=at(uv-vec2(shift,0)*px);
 vec3 signal=unpackSignal(texture(source,point).rgb);
 float colorShift=(offset+(field(vec2(row*.023,time*.47))-.5)*motion*2.4+moving*motion*2.5+hit*motion*burst.w*6.0)*amount;
 vec2 chroma=unpackSignal(texture(source,at(point-vec2(colorShift,0)*px)).rgb).yz;
 // Retain a little aligned high-frequency colour in thin luminous details.
 // The delayed low-frequency colour still drifts and bleeds. This avoids
 // converting fine saturated strands into pale luma with a detached red edge.
 vec2 nearLeft=unpackSignal(texture(source,at(point-vec2(1.5,0)*px)).rgb).yz;
 vec2 nearRight=unpackSignal(texture(source,at(point+vec2(1.5,0)*px)).rgb).yz;
 float fineColour=smoothstep(.006,.05,length(signal.yz-(nearLeft+nearRight)*.5));
 float colouredCore=smoothstep(.025,.12,length(signal.yz));
 float broadShift=smoothstep(2.0,6.0,abs(colorShift));
 float alignment=.90*fineColour*(1.0-.75*min(hit,1.0))*(1.0-mix(.8,.36,colouredCore)*broadShift);
 chroma=mix(chroma,signal.yz,alignment);

 float phase=((field(vec2(row*.009,time*.33))-.5)*.055+hit*.13*burst.w+moving*.028)*hue*amount;
 chroma=mat2(cos(phase),sin(phase),-sin(phase),cos(phase))*chroma;
 float chromaDrop=hit*step(.52,hash(vec2(floor(uv.x*14.0),lineTick)))*.52*amount;
 chroma*=max(0.0,1.0-chromaDrop);
 // High-frequency luma crosstalk adds tiny, broken colour traces at neutral edges.
 float left=unpackSignal(texture(source,at(point-vec2(1.4,0)*px)).rgb).x;
 float right=unpackSignal(texture(source,at(point+vec2(1.4,0)*px)).rgb).x;
 float edge=clamp(abs(right-left)+abs(left+right-2.0*signal.x)*.5,0.0,1.0);
 float carrier=uv.x*size.x*1.67+floor(row)*1.24+floor(time*30.0)*.91;
 chroma+=vec2(cos(carrier),sin(carrier))*edge*.021*amount*(.35+moving+hit);
 // Small decoder luma leakage gives warm and cool transition fringes. It is
 // derived from this frame's edges, never a shifted copy of a text layer.
 chroma+=vec2(.160,-.022)*(right-left)*amount*hue*(.92+.08*field(vec2(row*.08,time*.7)));
 signal.x*=1.0-hit*.035;
 color=packSignal(vec3(signal.x,chroma));
}`;
  const record =
    common +
    `
precision highp int;
// Native-resolution noise is band-limited by a small asymmetric raster kernel,
// rather than enlarging an interpolated low-resolution noise grid.
float grainHash(ivec2 p,uint seed){
 uint n=uint(p.x)*0x9e3779b9u^uint(p.y)*0x85ebca6bu^seed*0xc2b2ae35u;
 n^=n>>16u;n*=0x7feb352du;n^=n>>15u;n*=0x846ca68bu;n^=n>>16u;
 return float(n>>8u)/16777216.;
}
float recordingGrain(vec2 pixel,float fieldTime){
 ivec2 p=ivec2(floor(pixel));float sum=0.;
 for(int y=-2;y<=2;y++)for(int x=-4;x<=4;x++){
  int ax=abs(x),ay=abs(y);
  float wx=(ax==0?70.:ax==1?56.:ax==2?28.:ax==3?8.:1.)/256.;
  float wy=(ay==0?6.:ay==1?4.:1.)/16.;
  sum+=grainHash(p+ivec2(x,y),uint(fieldTime))*wx*wy;
 }
 return (sum-.5)*1.53;
}

// Sparse RF-loss segments live for several recording fields. Each segment has
// its own start, length, row and lifetime; no scrolling noise image is used.
vec4 lossSegment(vec2 p,float dense){
 float fieldIndex=floor(time*23.976);
 float rowCell=floor(p.y/3.2);
 float rowOffset=hash(vec2(rowCell,71.0))*83.0;
 vec2 cell=vec2(floor((p.x+rowOffset)/91.0),rowCell);
 float life=mix(2.0,1.0,dense)+floor(hash(cell+19.0)*mix(4.0,3.0,dense));
 float slot=floor((fieldIndex+floor(hash(cell+7.0)*8.0))/life);
 vec2 seed=cell+vec2(slot*17.13,slot*3.71);
 float present=step(mix(.963,.14,dense),hash(seed));
 float start=cell.x*91.0-rowOffset+hash(seed+11.0)*18.0;
 float length=mix(3.0+pow(hash(seed+23.0),1.6)*68.0,8.0+pow(hash(seed+23.0),.72)*70.0,dense);
 float along=p.x-start;
 float edge=smoothstep(-.55,.65,along)*(1.0-smoothstep(length*.64,length+1.1,along));
 float center=cell.y*3.2+.5+hash(seed+31.0)*2.1;
 float width=mix(mix(.38,1.05,hash(seed+43.0)),mix(.65,1.32,hash(seed+43.0)),dense);
 float cover=present*edge*band(p.y,center,width);
 float quality=hash(seed+61.0);
 return vec4(cover,quality,clamp(along/max(length,1.0),0.0,1.0),hash(seed+83.0));
}
void main(){
 vec3 s=unpackSignal(texture(source,at(uv)).rgb);float row=(1.0-uv.y)*size.y;
 vec2 pixel=vec2(uv.x*size.x,row);float tick=floor(time*48.0);
 float grain=hash(pixel+vec2(tick*13.7,tick*.731))+hash(pixel*.73+vec2(tick*3.1,17.0))-1.0;
 float correlated=field(vec2(pixel.x*.32+tick*13.7,row*.91+tick*.731))-.5;
 float fine=(grain*.012+correlated*.016)*(.20+sqrt(max(s.x,0.0))*.65);
 // The dark field has short horizontal correlation and a skewed amplitude
 // distribution: soft fine grain plus infrequent brighter signal excursions.
 // New recording fields regenerate it; no enlarged source texture is needed.
 float fieldTime=floor(time*29.97);
 float middle=recordingGrain(pixel,fieldTime);
 float shadowWeight=1.-smoothstep(.10,.45,s.x);
 float activity=.875+.25*field(vec2(pixel.x*.009,row*.021+floor(time*8.)*11.));
 float bright=max(0.,middle-.025);
 float shade=((middle*.058+bright*bright*.45)*activity+.0015)*shadowWeight;
 float packetTime=floor(time*11.988);
 shade+=(field(vec2(pixel.x*.075+packetTime*13.11,row*.14+packetTime*.47))-.5)*.010*shadowWeight;
 float moving=band(row,rolls.x,23.0)+band(row,rolls.y,11.0)*.55;
 float tracking=band(row,rolls.x-14.0,1.2)+band(row,rolls.y+5.0,.9)*.5;
 float scan=sin(row*2.094-time*1.13)*.006;
 // Coherent horizontal gain loss is sampled from tape coordinates. It crawls
 // across cover, type and spectrum together; the glyph material never warps.
 float tapeRow=row+time*2.7;
 float streak=field(vec2(pixel.x*.006+tapeRow*.017,tapeRow*.39));
 float coarse=field(vec2(pixel.x*.004-time*.11,tapeRow*.086));
 float oxide=(streak-.5)*.090+(coarse-.5)*.13;
 s.x*=1.0+oxide*amount*noise;
 s.x+=(fine+shade)*noise*amount;
 s.x=s.x*(1.0-scan*amount-moving*.018*amount)+tracking*.014*amount;
 // Slowly creeping sync defects have thin broken cores and softer adjacent
 // rows, not a screen-shaped semi-transparent image moving over the artwork.
 float syncA=mod(72.0+time*1.65,520.0)+15.0;
 float syncB=mod(307.0+time*.71,520.0)+15.0;
 float drift=(field(vec2(pixel.x*.003,time*.17))-.5)*.65;
 float rowA=syncA-uv.x*5.0+drift,rowB=syncB+uv.x*2.0+drift*.5;
 float seam=band(row,rowA,.64)+band(row,rowB,.65)*.85;
 float shoulder=band(row,rowA+1.15,1.1)+band(row,rowB+1.1,1.1)*.6;
 float segments=field(vec2(pixel.x*.065,floor(time*15.)*2.7));
 float packet=field(vec2(pixel.x*.011+floor(time*7.)*.67,9.));
 // The fine sync carrier is reconstructed per recording field. Short gaps
 // and bright cores replace the continuous coloured rule, without a texture.
 float syncCarrier=field(vec2(pixel.x*.36,mod(floor(time*29.97),4093.)+rowA*.03));
 seam*=.10+.90*smoothstep(.30,.65,syncCarrier);
 float seamGain=(.14+segments*.34)*(.30+packet*.70);
 s.x+=amount*noise*(seam*(seamGain*(1.-s.x)-s.x*.060)-shoulder*.024);
 float seamPhase=field(vec2(pixel.x*.025,floor(time*12.)*1.73))*6.283;
 s.yz+=vec2(cos(seamPhase),sin(seamPhase))*.050*seam*amount*hue*noise*(.4+packet*.6);
 // Partial compensation borrows a nearby scan line from the current signal.
 // It therefore catches cover and glyph edges, rather than painting the same
 // bright dash over every pixel. Rare uncompensated bursts retain a short tail.
 vec4 loss=lossSegment(pixel,0.0);
 vec3 current=unpackSignal(texture(source,at(uv)).rgb);
 vec3 held=unpackSignal(texture(source,at(uv+vec2(-.3,1.0+floor(loss.w*2.0))/size)).rgb);
 float mask=clamp(loss.x*amount*noise,0.0,1.0);
 float failed=step(.82,loss.y);
 float residual=(.022+failed*(.06+loss.w*.19))*(1.0-loss.z*.62);
 s.x+=mask*((held.x-current.x)*.92-(s.x-.025)*(.035+failed*.11)+residual);
 s.yz=mix(s.yz,held.yz*(.48+.3*loss.w),mask*.63);
 float saturation=length(s.yz);
 vec2 colorNoise=vec2(field(vec2(pixel.x*.06+tick*4.0,row*.4)),field(vec2(pixel.x*.06-tick*2.0,row*.4+31.0)))-.5;
 s.yz+=colorNoise*.024*smoothstep(.015,.15,saturation)*(1.0-s.x)*noise*amount;
 // Head switching is a packet of interrupted short RF traces, not a clean
 // solid dash. Packet envelopes persist briefly; their fine carrier changes
 // each recording field. All coordinates and noise are generated this frame.
 float fieldIndex=floor(time*59.94);
 float rowCell=floor(row/2.4);
 float rowOffset=hash(vec2(rowCell,71.0))*63.;
 float cellX=floor((pixel.x+rowOffset)/72.);
 vec2 cell=vec2(cellX,rowCell);
 float life=2.+floor(hash(cell+19.)*5.);
 float slot=floor((fieldIndex+floor(hash(cell+7.)*8.))/life);
 vec2 seed=cell+4093.*vec2(grainHash(ivec2(cell),uint(slot)),grainHash(ivec2(cell)+ivec2(17,47),uint(slot)));
 float start=cellX*72.-rowOffset+hash(seed+11.)*12.;
 float length=16.+hash(seed+23.)*49.;
 float along=pixel.x-start;
 float envelope=smoothstep(-1.,2.,along)*(1.-smoothstep(length*.58,length+2.,along));
 float lineCenter=rowCell*2.4+.35+hash(seed+31.)*1.65;
 float lineWidth=.70+hash(seed+43.)*.85;
 float carrier=field(vec2(along*.20+seed.x*13.,seed.y*1.79));
 float breaks=smoothstep(.30,.66,carrier);
 float flutter=field(vec2(along*.48+seed.x*3.7,mod(fieldIndex,4093.)+rowCell*11.));
 float headCenter=535.+floor(field(vec2(time*3.7,4))*3.);
 float headRegion=band(row,headCenter,8.0);
 float headMask=clamp(envelope*breaks*band(row,lineCenter,lineWidth)*headRegion*amount*noise*1.8,0.,1.);
 float quality=hash(seed+61.);
 float headWhite=.055+pow(quality,.7)*(.40+flutter*.35)+.13*smoothstep(.80,1.0,quality);
 s.x=mix(s.x,headWhite,headMask);
 float phase=hash(seed+83.)*6.283;
 vec2 rfColor=vec2(cos(phase),sin(phase))*(.010+.018*quality);
 s.yz=mix(s.yz,rfColor,headMask*.66*hue);
 // Match the reference's recorded black pedestal and compressed whites. This
 // transfer is applied to the entire current frame, including its dark gaps.
 s.x=s.x*(1.0-.100*amount)+.028*amount;
 color=vec4(clamp(rgb(s),0.0,1.0),1);
}`;
  const copy = common + `void main(){color=texture(source,at(uv));}`;
  class SignalProcessor {
    constructor(target) {
      this.canvas = target;
      this.gl = target.getContext('webgl2', {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        premultipliedAlpha: false,
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance',
      });
      if (!this.gl) throw Error('此窗口暂不可用 WebGL 2，录像测试需要开启浏览器图形加速。');
      this.lost = false;
      this.frames = 0;
      this.config = settings();
      this.initialize();
      this.onLost = (e) => {
        e.preventDefault();
        this.lost = true;
      };
      this.onRestore = () => {
        this.initialize();
        this.lost = false;
      };
      target.addEventListener('webglcontextlost', this.onLost);
      target.addEventListener('webglcontextrestored', this.onRestore);
    }
    initialize() {
      const gl = this.gl;
      this.float = !!gl.getExtension('EXT_color_buffer_float');
      this.programs = [];
      this.textures = [];
      this.buffers = [];
      this.vao = gl.createVertexArray();
      gl.bindVertexArray(this.vao);
      for (const fragment of [material, encode, disturb, record, copy]) {
        const shaders = [gl.VERTEX_SHADER, gl.FRAGMENT_SHADER].map((type, i) => {
          const shader = gl.createShader(type);
          gl.shaderSource(shader, i ? fragment : vertex);
          gl.compileShader(shader);
          if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            const error = gl.getShaderInfoLog(shader);
            gl.deleteShader(shader);
            throw Error(error);
          }
          return shader;
        });
        const program = gl.createProgram();
        shaders.forEach((s) => gl.attachShader(program, s));
        gl.linkProgram(program);
        shaders.forEach((s) => gl.deleteShader(s));
        if (!gl.getProgramParameter(program, gl.LINK_STATUS))
          throw Error(gl.getProgramInfoLog(program));
        const uniforms = {};
        for (const key of [
          'source',
          'lettering',
          'paperSurface',
          'size',
          'amount',
          'softness',
          'bleed',
          'offset',
          'motion',
          'hue',
          'noise',
          'time',
          'rolls',
          'burst',
        ])
          uniforms[key] = gl.getUniformLocation(program, key);
        this.programs.push({ program, uniforms });
      }
      for (let i = 0; i < 4; i++) {
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          i && this.float ? gl.RGBA16F : gl.RGBA,
          i > 1 ? SW : W,
          i > 1 ? SH : H,
          0,
          gl.RGBA,
          i && this.float ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE,
          null,
        );
        this.textures.push(texture);
        if (i) {
          const buffer = gl.createFramebuffer();
          gl.bindFramebuffer(gl.FRAMEBUFFER, buffer);
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
          if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
            throw Error('录像处理缓冲区初始化失败。');
          this.buffers.push(buffer);
        }
      }
      this.letterTexture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.letterTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      this.letterSource = null;
      this.paperDirty = true;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.disable(gl.BLEND);
      gl.disable(gl.DEPTH_TEST);
      gl.viewport(0, 0, W, H);
    }
    draw(sourceCanvas, ms, config = {}, forcedAt = -Infinity, lettering = null) {
      if (this.lost) return false;
      const gl = this.gl,
        s = (this.config = settings(config)),
        event = (this.lastState = stateAt(ms, s, forcedAt));
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, this.letterTexture);
      if (lettering !== this.letterSource) {
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        if (lettering)
          gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, lettering);
        else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        this.letterSource = lettering;
        this.paperDirty = true;
      }
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.textures[1]);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.textures[0]);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, sourceCanvas);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.bindVertexArray(this.vao);
      if (s.strength === 0) {
        const { program, uniforms: u } = this.programs[4];
        gl.useProgram(program);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, W, H);
        gl.uniform1i(u.source, 0);
        gl.uniform2f(u.size, W, H);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        this.frames++;
        return true;
      }
      for (let i = 0; i < 4; i++) {
        if (i === 0 && !this.paperDirty) continue;
        gl.viewport(0, 0, i === 1 || i === 2 ? SW : W, i === 1 || i === 2 ? SH : H);
        const { program, uniforms: u } = this.programs[i];
        gl.useProgram(program);
        gl.bindFramebuffer(gl.FRAMEBUFFER, i < 3 ? this.buffers[i] : null);
        gl.bindTexture(gl.TEXTURE_2D, this.textures[i === 1 ? 0 : i]);
        gl.uniform1i(u.source, 0);
        gl.uniform1i(u.lettering, 2);
        gl.uniform1i(u.paperSurface, 1);
        gl.uniform2f(u.size, W, H);
        for (const key of ['softness', 'bleed', 'offset', 'motion', 'hue', 'noise'])
          gl.uniform1f(u[key], s[key]);
        gl.uniform1f(u.amount, s.strength);
        gl.uniform1f(u.time, event.time);
        gl.uniform2f(u.rolls, event.rollA, event.rollB);
        gl.uniform4f(u.burst, event.event, event.y, event.width, event.sign);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      this.paperDirty = false;
      this.frames++;
      return true;
    }
    dispose() {
      const gl = this.gl;
      for (const { program } of this.programs) gl.deleteProgram(program);
      this.textures.forEach((t) => gl.deleteTexture(t));
      gl.deleteTexture(this.letterTexture);
      this.buffers.forEach((f) => gl.deleteFramebuffer(f));
      gl.deleteVertexArray(this.vao);
      this.canvas.removeEventListener('webglcontextlost', this.onLost);
      this.canvas.removeEventListener('webglcontextrestored', this.onRestore);
    }
  }
  class SignalRenderer {
    constructor(target) {
      if (!root.RecordingSource) throw Error('画面来源模块未加载，请刷新测试页。');
      this.source = document.createElement('canvas');
      this.source.width = W;
      this.source.height = H;
      this.base = new root.RecordingSource(this.source);
      this.originalMaterial = this.base.material;
      // Only this test instance bypasses V67's scan/grain overlay. Its glyph mask
      // receives procedurally generated paper; every element enters the signal path.
      this.base.material = Object.create(this.originalMaterial);
      this.base.material.rim = document.createElement('canvas');
      this.base.material.rim.width = W;
      this.base.material.rim.height = H;
      const rim = this.base.material.rim.getContext('2d');
      // A thin printed rule is composed as source geometry. Chips belong to that
      // rule; its blur, colour leakage and line errors still use the full pipeline.
      const vertices = [
        [10, 10],
        [1916, 6],
        [1916, 550],
        [10, 550],
        [10, 10],
      ];
      const ink = (x, seed) => {
        const n = Math.floor(x),
          f = x - n,
          w = f * f * (3 - 2 * f);
        return hash(n + seed) * (1 - w) + hash(n + 1 + seed) * w;
      };
      for (let edge = 0; edge < 4; edge++) {
        const a = vertices[edge],
          b = vertices[edge + 1],
          dx = b[0] - a[0],
          dy = b[1] - a[1],
          length = Math.hypot(dx, dy),
          nx = -dy / length,
          ny = dx / length;
        // Small variations are printed into the source rule, not moved as an overlay.
        // Every changing scan-line and chroma error is produced later by the signal.
        for (let d = 0; d < length; d += 1) {
          const seed = edge * 313.7,
            body = ink(d * 0.16, seed + 11),
            pit = ink(d * 0.63, seed + 81),
            wander = (ink(d * 0.11, seed + 3) - 0.5) * 0.32;
          const tone = 165 + body * 95 - (pit > 0.71 ? (pit - 0.71) * 180 : 0);
          rim.strokeStyle = `rgb(${tone + 8},${tone + 3},${tone - 7})`;
          rim.lineWidth = 2.05 + body * 0.65;
          rim.beginPath();
          rim.moveTo(
            a[0] + (dx * d) / length + nx * wander,
            a[1] + (dy * d) / length + ny * wander,
          );
          rim.lineTo(
            a[0] + (dx * Math.min(length, d + 1.12)) / length + nx * wander,
            a[1] + (dy * Math.min(length, d + 1.12)) / length + ny * wander,
          );
          rim.stroke();
        }
        for (let n = 0; n < length * 0.2; n++) {
          const seed = edge * 1171 + n * 5.31,
            u = hash(seed + 8),
            d = u * length,
            cross = (hash(seed + 12) - 0.5) * 2.2;
          rim.save();
          rim.translate(
            a[0] + (dx * d) / length + nx * cross,
            a[1] + (dy * d) / length + ny * cross,
          );
          rim.rotate(Math.atan2(dy, dx));
          rim.fillStyle = `rgba(9,9,9,${0.3 + hash(seed + 22) * 0.45})`;
          rim.fillRect(0, -0.3, 0.4 + hash(seed + 5) * 2.6, 0.4 + hash(seed + 7) * 0.6);
          rim.restore();
        }
      }
      const owner = this.base;
      this.base.material.typography = function (title, titleBox, artist, artistBox) {
        const mask = document.createElement('canvas');
        mask.width = W;
        mask.height = H;
        const ctx = mask.getContext('2d');
        const titleText = owner.track?.hasSong ? owner.track.title : '等待音乐',
          artistText = owner.track?.hasSong ? owner.track.artist : '打开播放器，开始播放';
        const tBox = { ...titleBox, x: 599, y: titleBox.y + 17, width: 1270 };
        const aBox = { ...artistBox, x: 614, y: artistBox.y + 9, height: artistBox.height };
        const latin = (text) =>
          /^[\p{Script=Latin}\p{Number}\p{Punctuation}\p{Separator}\p{Mark}\p{Symbol}]+$/u.test(
            text,
          );
        const nextTitle = NowPlayingType.layout(ctx, titleText, {
          ...tBox,
          maxSize: 234,
          minSize: 70,
          maxLines: 2,
        });
        const artistWidth = latin(artistText) ? 1.25 : 1;
        const nextArtist = NowPlayingType.layout(ctx, artistText, {
          ...aBox,
          width: aBox.width / artistWidth,
          maxSize: latin(artistText) ? 62 : 100,
          minSize: 30,
          maxLines: 2,
        });
        if (latin(titleText) && nextTitle.lines.length === 1 && nextTitle.size > 170) {
          ctx.letterSpacing = -nextTitle.size * 0.0124 + 'px';
          ctx.wordSpacing = -nextTitle.size * 0.0769 + 'px';
        }
        NowPlayingType.draw(ctx, nextTitle, { ...tBox, color: '#fff' });
        ctx.letterSpacing = '0px';
        ctx.wordSpacing = '0px';
        ctx.save();
        ctx.scale(artistWidth, 1);
        NowPlayingType.draw(ctx, nextArtist, {
          ...aBox,
          x: aBox.x / artistWidth,
          width: aBox.width / artistWidth,
          color: '#fff',
        });
        ctx.restore();
        return mask;
      };
      this.base.material.finish = function (out, scene) {
        out.drawImage(scene, 0, 0);
        out.drawImage(this.rim, 0, 0);
      };
      if (root.FieldFilaments) this.base.hiss = new root.FieldFilaments();
      else if (root.RecordedFilaments) this.base.hiss = new root.RecordedFilaments();
      this.effect = new SignalProcessor(target);
      this.canvas = target;
    }
    setTrack(...args) {
      this.base.setTrack(...args);
      this.canvas.setAttribute('aria-label', args[0].title + ' / ' + args[0].artist);
    }
    draw(now, levels, config, position, signal, forcedAt) {
      this.base.hiss.time = now / 1000;
      this.base.draw(now, levels, config, position);
      return this.effect.draw(this.source, now, signal, forcedAt, this.base.typeLayer);
    }
    replay(now) {
      this.base.replay(now);
    }
    dispose() {
      this.base.hiss.dispose?.();
      this.effect.dispose();
    }
  }
  root.NowPlayingSignal = {
    defaults,
    settings,
    stateAt,
    Processor: SignalProcessor,
    Renderer: SignalRenderer,
  };
})(window);
