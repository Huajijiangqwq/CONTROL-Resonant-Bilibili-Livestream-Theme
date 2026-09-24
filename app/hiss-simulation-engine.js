/* Local message-stream renderer. SC material follows the standalone preview;
   this module adapts scene/card compositing and message lifetime. */
(() => {
  'use strict';
  const entranceDuration = 1000,
    entranceModelDuration = 520;
  const easeBetween = (a, b, v) => {
    const x = Math.max(0, Math.min(1, (v - a) / (b - a)));
    return x * x * (3 - 2 * x);
  };
  const referenceCurve = [
    0, 0.3385, 0.5231, 0.6615, 0.7692, 0.8462, 0.9154, 0.9692, 1.0154, 1.0462, 1.0615, 1.0846,
    1.0923, 1.1, 1.1, 1.0923, 1.0923, 1.0846, 1.0692, 1.0462, 1.0154, 0.9692, 0.9231, 0.9538,
    0.9769, 0.9846, 0.9923, 1, 1,
  ];
  const motionTiming = [0];
  for (let i = 1; i < referenceCurve.length; i++)
    motionTiming.push(motionTiming[i - 1] + Math.abs(referenceCurve[i] - referenceCurve[i - 1]));
  const totalMotion = motionTiming[motionTiming.length - 1];
  for (let i = 0; i < motionTiming.length; i++) motionTiming[i] /= totalMotion;
  const motionTangents = motionTiming.map((v, i) => {
    if (i === 0) return motionTiming[1] - v;
    if (i === motionTiming.length - 1) return 0;
    const a = v - motionTiming[i - 1],
      b = motionTiming[i + 1] - v;
    return a * b <= 0 ? 0 : (2 * a * b) / (a + b);
  });
  function timingAtJS(phase) {
    phase = Math.max(0, Math.min(28, phase));
    const i = Math.min(27, Math.floor(phase)),
      x = phase - i,
      x2 = x * x,
      x3 = x2 * x;
    return (
      (2 * x3 - 3 * x2 + 1) * motionTiming[i] +
      (x3 - 2 * x2 + x) * motionTangents[i] +
      (-2 * x3 + 3 * x2) * motionTiming[i + 1] +
      (x3 - x2) * motionTangents[i + 1]
    );
  }
  const fract = (n) => n - Math.floor(n);
  function sourceNoise(x, y) {
    function hash(a, b) {
      a = fract(a * 123.34);
      b = fract(b * 456.21);
      const d = a * (a + 45.32) + b * (b + 45.32);
      a += d;
      b += d;
      return fract(a * b);
    }
    const ix = Math.floor(x),
      iy = Math.floor(y),
      a = fract(x),
      b = fract(y),
      u = a * a * (3 - 2 * a),
      v = b * b * (3 - 2 * b);
    return (
      (hash(ix, iy) * (1 - u) + hash(ix + 1, iy) * u) * (1 - v) +
      (hash(ix, iy + 1) * (1 - u) + hash(ix + 1, iy + 1) * u) * v
    );
  }
  const vert = `#version 300 es
 layout(location=0) in vec2 aPosition;
 void main(){gl_Position=vec4(aPosition,0.,1.);}`;
  const fluidCommon = `
 uniform float uTransport,uTurn;
 float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
 float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.)),f.x),f.y);}
 float fbm(vec2 p){return .57*noise(p)+.28*noise(p*2.07+17.)+.15*noise(p*4.13-8.);}
 float boxDistance(vec2 p,vec2 halfSize){vec2 q=abs(p)-halfSize;return length(max(q,0.))+min(max(q.x,q.y),0.);}
 float turnPressure(){return uTurn<0.?0.:smoothstep(.02,.48,uTurn)*(1.-smoothstep(.54,1.,uTurn));}
 float turnRadius(vec2 p,vec4 card){vec2 r=abs((p-card.xy-card.zw*.5)/(card.zw*.5));return mix(max(r.x,r.y),length(r)*.76,.16)+(fbm(p*.042+vec2(4.,9.))-.5)*.18;}
 float turnFront(){return mix(1.65,-.20,turnPressure());}
 float turnReveal(vec2 p,vec4 card){return uTurn<0.?1.:1.-smoothstep(turnFront()-.045,turnFront()+.045,turnRadius(p,card));}
 float releaseSurge(float s){return smoothstep(.200,.254,s)*(1.-smoothstep(.266,.350,s));}
 float earlyUnrest(float s){return smoothstep(.005,.025,s)*(1.-smoothstep(.045,.145,s));}
 vec2 vortex(vec2 p,vec2 center,float radius,float speed){vec2 d=(p-center)/radius;return vec2(-d.y,d.x)*exp(-dot(d,d)*1.8)*speed;}
 vec2 fineCurrent(vec2 p,float t){
  vec2 q=p*.020+vec2(t*.037,-t*.025);float e=.065;
  float dy=noise(q+vec2(0.,e))-noise(q-vec2(0.,e));
  float dx=noise(q+vec2(e,0.))-noise(q-vec2(e,0.));
  return vec2(dy,-dx)*(9./(2.*e));
 }
 vec2 velocity(vec2 p,float t,vec4 card){
  vec2 c=card.xy+card.zw*.5;
  vec2 v=vec2(16.+5.*sin(p.y*.012+t*.09),4.*sin(p.x*.013-t*.14));
  v+=vortex(p,card.xy+vec2(card.z*.22,-12.+sin(t*.08)*12.),100.,48.);
  v+=vortex(p,card.xy+vec2(card.z*.83,card.w+8.),112.,-54.);
  v+=vortex(p,vec2(card.x-16.,c.y),88.,-44.);
  v+=vortex(p,vec2(card.x+card.z+15.,c.y-22.),106.,45.);
  return v+fineCurrent(p-c,t);
 }
 vec2 backtrace(vec2 p,float t,float dt,vec4 card){vec2 v=velocity(p,t,card);return p-velocity(p-v*dt*.5,t-dt*.5,card)*dt;}
 float sideWeight(vec2 p,vec4 card){vec2 r=abs(p-card.xy-card.zw*.5)/card.zw;return smoothstep(.3,.55,r.x)*(1.-smoothstep(.28,.58,r.y));}
 `;
  const emitterMotion = `
 const float entryDuration=${(entranceModelDuration / 1000).toFixed(3)};
 const float timingKeys[29]=float[29](${motionTiming.map((n) => n.toFixed(5)).join(',')});
 const float timingTangents[29]=float[29](${motionTangents.map((n) => n.toFixed(5)).join(',')});
 float timingAt(float phase){
  phase=clamp(phase,0.,28.);
  int i=min(27,int(floor(phase)));
  float x=phase-float(i),x2=x*x,x3=x2*x;
  return (2.*x3-3.*x2+1.)*timingKeys[i]+(x3-2.*x2+x)*timingTangents[i]
       +(-2.*x3+3.*x2)*timingKeys[i+1]+(x3-x2)*timingTangents[i+1];
 }
 float emitterOpening(float s){return clamp(timingAt(clamp((s-.045)/.200,0.,1.)*13.)/timingKeys[13],0.,1.);}
 `;
  const advect = `#version 300 es
 precision highp float;
 uniform sampler2D uPrevious;
 uniform vec2 uSize,uFieldPixels;
 uniform vec4 uCard;
 uniform float uTime,uDelta,uFlowDelta,uReset,uEntrance,uExit;
 out vec4 outColor;
 ${fluidCommon}
 ${emitterMotion}
 vec2 emittedFlow(vec2 p,float t){
  vec2 base=velocity(p,t,uCard);
  if(uTurn>=0.){vec2 radial=p-uCard.xy-uCard.zw*.5;float pressure=turnPressure();base+=normalize(radial+vec2(.01))*pressure*(uTurn<.5?-90.:72.);base+=vortex(p,uCard.xy+uCard.zw*vec2(.34,.53),125.,95.)*pressure;}
  if(uExit>=0.){
   vec2 radial=p-uCard.xy-uCard.zw*.5;
   float drawIn=smoothstep(.100,.340,uExit)*(1.-smoothstep(.680,.960,uExit));
   float flicker=smoothstep(0.,.070,uExit)*(1.-smoothstep(.18,.32,uExit));
   return base*(1.+flicker*.45)-radial*min(3.8,240./max(length(radial),1.))*drawIn;
  }
  float activity=earlyUnrest(uEntrance)*1.15+releaseSurge(uEntrance)*1.8;
  if(activity<.0001)return base;
  vec2 center=uCard.xy+uCard.zw*.5;
  vec2 spread=vec2(min(uCard.z*.28,110.),min(uCard.w*.30,60.))*mix(.25,1.,smoothstep(.080,.280,uEntrance));
  float radius=clamp(uCard.w*.42,34.,84.);
  vec2 local=vortex(p,center+vec2(-spread.x,-spread.y),radius,180.);
  local+=vortex(p,center+vec2(spread.x,spread.y*.4),radius*1.1,-220.);
  local+=vortex(p,center+vec2(-spread.x*.2,spread.y),radius*.8,144.);
  return base+local*activity;
 }
 void main(){
  vec2 p=vec2(gl_FragCoord.x/uFieldPixels.x,1.-gl_FragCoord.y/uFieldPixels.y)*uSize;
  // Advect only the carried density through local currents. The material's
  // coordinates, scale and emission paths in the final compositor stay fixed.
  vec2 firstVelocity=emittedFlow(p,uTime);
  vec2 previousPoint=p-emittedFlow(p-firstVelocity*uFlowDelta*.5,uTime-uFlowDelta*.5)*uFlowDelta;
  vec2 previous=clamp(previousPoint/uSize,vec2(.001),vec2(.999));
  vec3 carried=texture(uPrevious,vec2(previous.x,1.-previous.y)).rgb;
  // Each angular source advances at its own time. Existing density remains in
  // screen coordinates; only new emissions follow these center-outward paths.
  vec2 fromCenter=p-uCard.xy-uCard.zw*.5;
  float radius=length(fromCenter);
  vec2 ray=fromCenter/max(radius,.01);
  vec2 halfSize=max(uCard.zw*.5,vec2(1.));
  float angularGroup=noise(ray*2.3+vec2(13.,7.));
  float birthDelay=(angularGroup-.35)*.045;
  float sourcePhase=uEntrance-birthDelay;
  float opening=.60*emitterOpening(sourcePhase)+.27*smoothstep(.200,.285,sourcePhase)+.13*smoothstep(.275,.410,sourcePhase);
  float ellipseRadius=1./max(length(ray/halfSize),.001);
  float boxRadius=1./max(max(abs(ray.x)/halfSize.x,abs(ray.y)/halfSize.y),.001);
  float shape=.84+.26*noise(ray*1.7+vec2(3.1,8.4));
  float settling=smoothstep(.270,.450,uEntrance);
  float targetRadius=mix(ellipseRadius*shape,boxRadius,settling);
  float flutter=(noise(p*.036+vec2(uEntrance*9.,-uEntrance*13.))-.5)*18.*releaseSurge(uEntrance);
  float emittedDistance=radius-targetRadius*opening+flutter;
  float stableDistance=boxDistance(fromCenter,halfSize);
  float sd=mix(emittedDistance,stableDistance,settling);
  float drift=noise(p*.007+vec2(-uTime*.035,.0));
  float spread=smoothstep(.12,.44,uEntrance);
  float sourceWidth=mix(10.,24.+drift*27.,spread);
  float envelope=exp(-pow((sd-mix(0.,5.+(drift-.5)*35.,spread))/sourceWidth,2.));
  float ignition=smoothstep(.002,.015,uEntrance);
  // Uneven emission groups interrupt an otherwise mechanical rectangular front.
  // These gates change only new density; existing wisps are never cut away.
  float emissionSector=.12+.88*smoothstep(.22,.66,noise(ray*2.4+vec2(5.3,8.7)));
  float emitterGroups=(.32+.68*smoothstep(.31,.62,noise(p*.025+vec2(11.,7.))))*emissionSector;
  float grouped=smoothstep(.035,.10,uEntrance)*(1.-smoothstep(.24,.46,uEntrance));
  float seed=1.+1.3*(1.-smoothstep(.045,.095,uEntrance));
  envelope*=ignition*seed*mix(1.,emitterGroups,grouped)*(1.+releaseSurge(uEntrance)*.70);
  vec2 q=backtrace(p,uTime,1.3,uCard);
  float side=sideWeight(p,uCard);
  float cloud=fbm(q*vec2(.008,.026)+vec2(-uTime*.052,drift));
  float thread=mix(fbm(q*vec2(.017,.105)+vec2(-uTime*.10,cloud*1.8)),fbm(q.yx*vec2(.017,.105)+vec2(-uTime*.10,cloud*1.8)),side);
  vec3 source=vec3((.18+.75*cloud)*envelope,pow(thread,2.2)*envelope,cloud);
  float settle=smoothstep(.29,entryDuration,uEntrance);
  float injection=12.+20.*(1.-smoothstep(.035,.09,uEntrance))+releaseSurge(uEntrance)*12.;
  // Injection adds new wisps without replacing the previous frame's density.
  // Their longer residence leaves irregular internal trails behind the sources.
  vec3 emitted=carried*exp(-uDelta*5.5)+source*(1.-exp(-uDelta*injection))*.60;
  vec3 steady=mix(carried*exp(-uDelta*.12),source,1.-exp(-uDelta*.75));
  vec3 density=mix(emitted,steady,settle);
  if(uExit>=0.){
   // The emission points retreat, while existing density follows its own currents.
   // No scaling of the texture, canvas or previously emitted material.
   float retreat=smoothstep(.120,.730,uExit);
   float sectorDelay=(noise(ray*2.6+vec2(7.,12.))-.5)*.090;
   float sourceRadius=boxRadius*(1.-smoothstep(.120+sectorDelay,.730+sectorDelay,uExit));
   float distance=radius-sourceRadius+(noise(p*.031+vec2(uExit*.8,7.))-.5)*13.;
   float width=mix(27.,8.,retreat);
   float shell=exp(-pow(distance/width,2.));
   float breathing=1.+.75*smoothstep(.0,.075,uExit)*(1.-smoothstep(.17,.32,uExit));
   float release=1.-smoothstep(.620,.820,uExit);
   vec3 inward=vec3((.18+.75*cloud)*shell,pow(thread,2.2)*shell,cloud);
   float extinction=mix(2.2,18.,smoothstep(.45,1.0,uExit));
   float feed=mix(1.1,3.5,smoothstep(.08,.32,uExit))*release;
   density=carried*exp(-uDelta*extinction)+inward*(1.-exp(-uDelta*feed))*breathing;
  }
  if(uTurn>=0.){float edge=exp(-pow((turnRadius(p,uCard)-turnFront())/.16,2.));density+=vec3(.24+.42*cloud,pow(thread,2.2)*.76,cloud*.18)*edge*turnPressure()*(1.-exp(-uDelta*14.));}
  if(uReset>.5)density=uEntrance>=entryDuration?source:vec3(0.);
  outColor=vec4(density,1.);
 }`;
  const frag = `#version 300 es
 precision highp float;
 uniform sampler2D uImage,uFluid,uContext,uFlow;
 uniform vec2 uSize,uPixels,uNameBand,uContextShift;
 uniform vec4 uCard;
 uniform float uTime,uStrength,uReach,uText,uRed,uDispersion,uGhost,uEntrance,uExit;
 uniform vec4 uProgress,uProgressColor;
 uniform float uProgressRatio,uTransparent;
 const float entryDuration=${(entranceModelDuration / 1000).toFixed(3)};
 out vec4 outColor;
 ${fluidCommon}
 float inCard(vec2 p){vec2 q=p-uCard.xy;return step(0.,q.x)*step(q.x,uCard.z)*step(0.,q.y)*step(q.y,uCard.w);}
 vec3 rawAt(vec2 p){return texture(uImage,clamp(p/uSize,vec2(.001),vec2(.999))).rgb;}
 vec2 aftershockOrigin(){return uCard.xy+uCard.zw*.5;}
 float exitRadius(vec2 p){
  vec2 relative=abs((p-aftershockOrigin())/(uCard.zw*.5));
  return mix(max(relative.x,relative.y),length(relative)*.72,.12)+(fbm(p*.038+vec2(3.,7.))-.5)*.075;
 }
 float exitFront(){return mix(1.12,-.15,smoothstep(.100,.670,uExit));}
 float aftershockAt(vec2 p){
  float radius=length((p-aftershockOrigin())/(uCard.zw*.5+vec2(24.)));
  float extent=1.41421356;
  float irregularity=(noise(p*vec2(.055,.13))-.5)*.014;
  return .270+.100*radius/extent+irregularity;
 }
 vec3 sampleAt(vec2 p){
  vec3 scene=rawAt(p);
  if(inCard(p)>.5){
   vec4 panel=texture(uContext,clamp(p/uSize,vec2(.001),vec2(.999)));
   // This thin line changes with the display clock; cached text stays untouched.
   // Compose before optical sampling so it shares the card's refraction/reveal.
   if(uProgress.z>0.&&uProgressRatio>0.){
    float length=uProgress.z*uProgressRatio;
    vec2 d=abs(p-uProgress.xy-vec2(length*.5,0.))-vec2(length,uProgress.w)*.5;
    vec2 coverage=clamp(vec2(.5)-d*uPixels/uSize,0.,1.);
    panel.rgb=mix(panel.rgb,uProgressColor.rgb,coverage.x*coverage.y*uProgressColor.a);
   }
   float reveal=uEntrance>=entryDuration?1.:uEntrance<.270?0.:smoothstep(aftershockAt(p),aftershockAt(p)+.014,uEntrance);
   if(uExit>=0.)reveal*=1.-smoothstep(exitFront()-.035,exitFront()+.035,exitRadius(p));
   reveal*=turnReveal(p,uCard);scene=mix(scene,panel.rgb,reveal*panel.a);
  }
  return scene;
 }
 float alphaAt(vec2 p){
  if(uTransparent<.5)return 1.;
  float a=texture(uImage,clamp(p/uSize,vec2(.001),vec2(.999))).a;
  if(inCard(p)>.5){float reveal=uEntrance>=entryDuration?1.:uEntrance<.270?0.:smoothstep(aftershockAt(p),aftershockAt(p)+.014,uEntrance);
   if(uExit>=0.)reveal*=1.-smoothstep(exitFront()-.035,exitFront()+.035,exitRadius(p));
   reveal*=turnReveal(p,uCard);float panel=texture(uContext,clamp(p/uSize,vec2(.001),vec2(.999))).a*reveal;a=panel+a*(1.-panel);}
  return a;
 }
 vec3 fluidAt(vec2 p){vec2 uv=clamp(p/uSize,vec2(.001),vec2(.999));return texture(uFluid,vec2(uv.x,1.-uv.y)).rgb;}
 float screenEdge(vec2 p){return smoothstep(1.,42.,min(p.x,uSize.x-p.x))*smoothstep(1.,34.,min(p.y,uSize.y-p.y));}
 float entryEnergy(float s){
  if(s<=0.||s>=entryDuration)return 0.;
  return max(earlyUnrest(s)*.75,releaseSurge(s));
 }
 float entrySurge(float s){
  return smoothstep(.012,.065,s)*(1.-smoothstep(.280,.480,s));
 }
 float strandAt(vec2 q,float warp,float side,float t){
  return mix(fbm(vec2(q.x*.022-t*.025,(q.y+warp)*.31)),fbm(vec2(q.y*.022-t*.025,(q.x+warp)*.31)),side);
 }
 void main(){
  vec2 p=vec2(gl_FragCoord.x/uPixels.x,1.-gl_FragCoord.y/uPixels.y)*uSize;
  float sd=boxDistance(p-uCard.xy-uCard.zw*.5,uCard.zw*.5);
  float surge=entrySurge(uEntrance);
  float release=releaseSurge(uEntrance);
  float unrest=max(earlyUnrest(uEntrance),release);
  float exitPressure=uExit<0.?0.:smoothstep(0.,.085,uExit)*(1.-smoothstep(.25,.62,uExit));
  float turnover=turnPressure();
  float reach=uReach*1.2+25.;
  float vicinity=1.-smoothstep(0.,reach,max(sd,0.));
  float edgeFade=screenEdge(p);
  if(uStrength<.0001||vicinity*edgeFade<.0001){outColor=vec4(sampleAt(p),alphaAt(p));return;}
  float arrival=1.;
  float energy=entryEnergy(uEntrance);
  float t=uTime;
  vec2 normal=normalize((p-aftershockOrigin())/(uCard.zw*.5+vec2(24.))+vec2(.01));
  // Screen-space material: no bank translation, clipping, or entrance rescaling.
  vec3 density=fluidAt(p);
  vec2 gradient=vec2(fluidAt(p+vec2(3.,0.)).r-fluidAt(p-vec2(3.,0.)).r,fluidAt(p+vec2(0.,3.)).r-fluidAt(p-vec2(0.,3.)).r);
  float generated=clamp(density.r*4.+density.g*3.,0.,1.);
  float lens=generated*surge;
  float travel=1.5;
  vec2 advected=backtrace(backtrace(p,t,travel,uCard),t-travel,travel,uCard);
  float broad=fbm(advected*.010+vec2(-t*.014,.0));
  float small=fbm(advected*vec2(.055,.083)+vec2(t*.025,0.));
  float outside=smoothstep(-12.,9.,sd);
  float textMask=uText*(.35+.55*small);
  float local=vicinity*edgeFade*mix(textMask,.72,outside);
  float opticalArrival=mix(generated,1.,smoothstep(.29,entryDuration,uEntrance));
  if(uExit>=0.)opticalArrival=generated;
  float motionGain=pow(uStrength,.68)*opticalArrival*(1.+surge*(.28+1.50*unrest)+release*.65);
  motionGain*=1.+exitPressure*.65+turnover*1.5;
  vec2 current=velocity(p,t,uCard)/34.;
  vec2 ripples=vec2(broad-.5,small-.5);
  vec2 displacement=(current*.7+gradient*21.+ripples*1.4)*motionGain*8.*local;
  displacement+=(gradient*44.+ripples*7.+normal*3.)*turnover*vicinity*edgeFade;
  // Small independent shears settle into a coherent charge before the release.
  vec2 shiver=vec2(0.);
  if(surge>0.)shiver=vec2(noise(p*vec2(.075,.12)+vec2(uEntrance*13.,-uEntrance*8.)),noise(p*vec2(.10,.08)+vec2(-uEntrance*11.,uEntrance*14.)+23.))-.5;
  displacement+=shiver*(2.+19.*unrest+release*7.)*lens*vicinity*edgeFade*sqrt(uStrength)*mix(.22,1.,outside);
  // The pressure peak and the reveal are the same front at each position.
  float shock=uEntrance>=entryDuration?0.:exp(-pow((uEntrance-aftershockAt(p)-.007)/.012,2.))*smoothstep(.26,.276,uEntrance)*vicinity;
  if(uExit>=0.)shock=exp(-pow((exitRadius(p)-exitFront())/.08,2.))*exitPressure*generated;
  if(uTurn>=0.)shock+=exp(-pow((turnRadius(p,uCard)-turnFront())/.14,2.))*turnover*generated*.38;
  displacement+=normal*shock*(uExit>=0.?-6.:3.5)*edgeFade*sqrt(uStrength);
  vec2 pos=p+displacement;
  vec2 direction=normalize(gradient*14.+current*.32+shiver*lens*.8+vec2(.18,.05));
  // Keep the card interior neutral. Dispersion builds outside its boundary,
  // then dies away with the same finite field as the red refraction.
  float stableRim=smoothstep(-4.,38.,sd);
  // Before the card forms, use the perimeter of the emitted density itself.
  // A low-density shoulder plus its gradient confines color to wisps' edges.
  float sourceRim=smoothstep(.004,.055,density.r)*(1.-smoothstep(.13,.40,density.r))*smoothstep(.001,.020,length(gradient));
  float outerRim=mix(sourceRim,stableRim,smoothstep(.270,.450,uEntrance));
  float optical=vicinity*edgeFade*(uText*.06+(.33+.17*small)*outerRim)*opticalArrival;
  float spectralGain=pow(uDispersion,1.15);
  float opticalPatch=.65+.65*smoothstep(.27,.7,small);
  vec2 chroma=direction*(spectralGain*3.8)*sqrt(uStrength)*optical*opticalPatch*(1.+surge*(1.2+2.*unrest));
  // Unequal wavelength offsets leave warm and cool edges around readable text.
  vec3 col=vec3(sampleAt(pos+chroma*.72).r,sampleAt(pos+chroma*.36).g,sampleAt(pos-chroma).b);
  vec2 echoOffset=(current*3.+gradient*55.)*local*motionGain;
  float echo=uGhost*.18*vicinity*edgeFade*opticalArrival*(1.+surge*unrest);
  vec3 ghostColor=vec3(sampleAt(pos+echoOffset+chroma*.72).r,sampleAt(pos+echoOffset+chroma*.36).g,sampleAt(pos+echoOffset-chroma).b);
  col=mix(col,max(col*.88,ghostColor*.90),echo);
  vec2 materialA=advected,materialB=advected;
  float materialMix=0.;
  if(uTransport>.5){
   vec2 flowUV=clamp(p/uSize,vec2(.001),vec2(.999));
   vec4 offsets=texture(uFlow,vec2(flowUV.x,1.-flowUV.y));
   float settled=smoothstep(.290,entryDuration,uEntrance);
   materialA=mix(advected,p+offsets.xy,settled);
   materialB=mix(advected,p+offsets.zw,settled);
   materialMix=1.-abs(fract(t/3.2)*2.-1.);
  }
  vec2 materialPoint=mix(materialB,materialA,materialMix);
  float side=sideWeight(p,uCard);
  float warp=(broad-.5)*37.+density.g*19.;
  float threadsA=strandAt(materialA,warp,side,t),threadsB=strandAt(materialB,warp,side,t);
  float threads=mix(threadsB,threadsA,materialMix);
  float carriedThreads=pow(clamp(density.g/max(density.r,.025)*.52,0.,1.),1./2.2);
  threads=mix(threads,carriedThreads,.16*smoothstep(.290,entryDuration,uEntrance));
  float fineA=mix(noise(vec2(materialA.x*.047-t*.035,(materialA.y+warp)*.85)),noise(vec2(materialA.y*.047-t*.035,(materialA.x+warp)*.85)),side);
  float fineB=mix(noise(vec2(materialB.x*.047-t*.035,(materialB.y+warp)*.85)),noise(vec2(materialB.y*.047-t*.035,(materialB.x+warp)*.85)),side);
  float fine=mix(fineB,fineA,materialMix);
  float rough=fbm(materialPoint*.24+vec2(broad*7.,small*3.));
  float grain=hash(floor(materialPoint*1.35));
  float body=clamp(density.r*1.75,0.,1.);
  float carry=.16*smoothstep(.290,entryDuration,uEntrance);
  float wisps=mix(pow(mix(threadsB,carriedThreads,carry),3.8),pow(mix(threadsA,carriedThreads,carry),3.8),materialMix)*2.0+mix(pow(fineB,6.),pow(fineA,6.),materialMix)*.27;
  float diffuse=body*.08*(.6+.7*rough)+density.g*(.16+.17*rough);
  float fibers=body*.43*wisps*(.6+.7*rough);
  // During the impulse, light collects into uneven fine fibers, leaving air gaps.
  float gaps=smoothstep(.25,.70,fbm(materialPoint*.051+vec2(broad*2.,small*2.)));
  float field=diffuse*(1.-energy*.55)+fibers*mix(1.,.28+1.40*gaps,energy);
  vec2 hotPosition=(p-uCard.xy-vec2(uCard.z-18.,8.))/85.;
  float hot=exp(-dot(hotPosition,hotPosition)*1.3);
  float redGain=mix(.95,1.2,uStrength)*sqrt(uRed)*edgeFade*vicinity*(.92+.9*hot)*arrival*(1.+shock*.85+energy*energy*.16);
  redGain*=1.+surge*(.65+earlyUnrest(uEntrance)*.60)+release*.95;
  redGain*=1.+exitPressure*.70+turnover*1.35;
  float glyph=max(col.r,max(col.g,col.b));
  float protect=1.-smoothstep(.14,.75,glyph)*.92;
  float red=field*redGain*protect;
  // Broad density carries fine strands. No sine isolines or closed luminous contours.
  col+=vec3(.94,.009,.004)*red;
  col+=vec3(.32,.006,.003)*body*pow(grain,5.)*.09*redGain*protect;
  // The passing pressure briefly exposes bright cores in the existing fibers.
  // Keep the surrounding haze dark and protect the revealed glyphs.
  float core=mix(pow(threadsB,8.),pow(threadsA,8.),materialMix)*5.+mix(pow(fineB,14.),pow(fineA,14.),materialMix)*.16;
  float pressureLight=core*body*(shock+surge*.07+release*.42)*sqrt(uStrength*uRed)*edgeFade*vicinity*arrival*protect;
  col+=vec3(1.,.50,.48)*pressureLight;
  // Split the same moving fibers, including where the source image is dark.
  // Subtract their shared light so the field stays dark between colored edges.
  if(uDispersion>.0001){
   vec2 fiberNormal=normalize(mix(vec2(.16,1.),vec2(1.,.16),side)+gradient*2.);
   vec2 spread=fiberNormal*spectralGain*(1.2+1.8*sqrt(uStrength));
   float warm=mix(strandAt(materialB+spread,warp,side,t),strandAt(materialA+spread,warp,side,t),materialMix);
   float cool=mix(strandAt(materialB-spread,warp,side,t),strandAt(materialA-spread,warp,side,t),materialMix);
   vec2 bands=smoothstep(vec2(.44),vec2(.80),vec2(warm,cool));
   float shared=min(bands.x,bands.y);
   vec3 fringe=vec3(.88,.63,.06)*(bands.x-shared)+vec3(.025,.50,1.12)*(bands.y-shared);
   float patches=smoothstep(.40,.67,broad+small*.15);
   float prism=body*spectralGain*(.16+1.35*patches*patches)*edgeFade*vicinity*sqrt(uStrength)*outerRim*.55;
   col+=fringe*prism*protect*arrival*(1.+surge*.85);
  }
  float tint=body*.07*uRed*edgeFade*protect*arrival;
  col=mix(col,col*vec3(1.,.76,.77),tint);
  float a=uTransparent>.5?max(alphaAt(pos),clamp(red*2.8+pressureLight+body*.16*edgeFade*vicinity,0.,.92)):1.;
  outColor=vec4(col,a);
 }`;
  function occupied(age, height, fx) {
    if (age >= 1000) return 1;
    const lag = 75 * (1 - easeBetween(780, 1000, age)),
      phase = Math.max(0, age - lag) * 0.00052;
    const half = height * 0.5,
      settle = easeBetween(0.27, 0.45, phase),
      ignition = easeBetween(0.002, 0.015, phase),
      halo = Math.max(6, fx.reach * 0.075);
    let sum = 0;
    for (const direction of [-1, 1]) {
      const delayed = phase - (sourceNoise(13, 7 + direction * 2.3) - 0.35) * 0.045;
      const first =
        timingAtJS(Math.max(0, Math.min(1, (delayed - 0.045) / 0.2)) * 13) / motionTiming[13];
      const opening =
        0.6 * first +
        0.27 * easeBetween(0.2, 0.285, delayed) +
        0.13 * easeBetween(0.275, 0.41, delayed);
      const shape = 0.84 + 0.26 * sourceNoise(3.1, 8.4 + direction * 1.7);
      const radius = half * ((shape * (1 - settle) + settle) * opening * (1 - settle) + settle);
      const aura = (6 + (halo - 6) * easeBetween(0.12, 0.44, phase)) * ignition;
      sum += Math.min(
        1,
        Math.max(
          fx.strength > 0 ? (radius * ignition + aura) / (half + halo) : 0,
          easeBetween(0.27, 0.39, phase),
        ),
      );
    }
    return sum * 0.5;
  }
  function createLayer(options) {
    let W = options.width + 112,
      H = options.height + 320,
      q = Math.min(options.quality, 4096 / H);
    const card = { x: 83, y: 160, w: options.width - 54, h: options.height };
    const screen = document.createElement('canvas'),
      base = document.createElement('canvas'),
      panel = document.createElement('canvas');
    for (const c of [screen, base, panel]) {
      c.width = Math.round(W * q);
      c.height = Math.round(H * q);
    }
    const ink = base.getContext('2d', { alpha: true }),
      panelInk = panel.getContext('2d');
    let state = options.fx;
    let progress = options.progress
      ? { ...options.progress, x: card.x + options.progress.x, y: card.y + options.progress.y }
      : null;
    let gl = null,
      final,
      fluid,
      flowField,
      resizePass,
      buffer,
      tex,
      cardTex,
      fields = [],
      textures = [],
      framebuffers = [],
      read = 0,
      lastTime = 0,
      lastEntrance = 0,
      lastExit = -1,
      reset = true,
      disposed = false,
      ready = false,
      contextLost = false,
      lastSecond = -1,
      lastPaintVersion,
      panelDirty = true;
    let fieldWidth = options.quality >= 1.5 ? 384 : 256,
      fieldHeight = Math.min(1024, Math.max(128, Math.round((fieldWidth * H) / W)));
    const fieldCell = W / fieldWidth;
    let preciseFlow = false;
    let fallback = null;
    let carriedTime = options.seed,
      previousAge = null;
    function ensureFallback() {
      if (!fallback) {
        fallback = document.createElement('canvas');
        fallback.width = screen.width;
        fallback.height = screen.height;
      }
    }
    function forgetResources() {
      ready = false;
      final = fluid = flowField = resizePass = buffer = tex = cardTex = null;
      fields = [];
      textures = [];
      framebuffers = [];
      read = 0;
      lastTime = lastEntrance = 0;
      lastExit = -1;
      reset = true;
      panelDirty = true;
    }
    function releaseResources() {
      if (gl && !contextLost) {
        flowField?.dispose();
        resizePass?.dispose();
        for (const tx of textures) gl.deleteTexture(tx);
        for (const fb of framebuffers) gl.deleteFramebuffer(fb);
        if (buffer) gl.deleteBuffer(buffer);
        if (final) gl.deleteProgram(final.p);
        if (fluid) gl.deleteProgram(fluid.p);
      }
      forgetResources();
    }
    function shader(type, code) {
      const s = gl.createShader(type);
      try {
        gl.shaderSource(s, code);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
        return s;
      } catch (error) {
        gl.deleteShader(s);
        throw error;
      }
    }
    function program(code, names) {
      let v, f, p;
      try {
        v = shader(gl.VERTEX_SHADER, vert);
        f = shader(gl.FRAGMENT_SHADER, code);
        p = gl.createProgram();
        gl.attachShader(p, v);
        gl.attachShader(p, f);
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
        return { p, l: Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(p, n)])) };
      } catch (error) {
        if (p) gl.deleteProgram(p);
        throw error;
      } finally {
        if (v) gl.deleteShader(v);
        if (f) gl.deleteShader(f);
      }
    }
    function freeDensity(items) {
      for (const f of items) {
        gl.deleteTexture(f.tex);
        gl.deleteFramebuffer(f.fb);
        textures = textures.filter((t) => t !== f.tex);
        framebuffers = framebuffers.filter((b) => b !== f.fb);
      }
    }
    function densityTargets(width, height) {
      const result = [];
      try {
        for (let i = 0; i < 2; i++) {
          const tx = gl.createTexture(),
            fb = gl.createFramebuffer();
          textures.push(tx);
          framebuffers.push(fb);
          result.push({ tex: tx, fb });
          gl.activeTexture(gl.TEXTURE1);
          gl.bindTexture(gl.TEXTURE_2D, tx);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            preciseFlow ? gl.RGBA16F : gl.RGBA8,
            width,
            height,
            0,
            gl.RGBA,
            preciseFlow ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE,
            null,
          );
          gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tx, 0);
          if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
            throw Error('Incomplete resized density buffer');
          gl.clearColor(0, 0, 0, 1);
          gl.clear(gl.COLOR_BUFFER_BIT);
        }
        return result;
      } catch (error) {
        freeDensity(result);
        throw error;
      }
    }
    function resizeFields(width, height) {
      if (!ready || !resizePass || (width === W && height === H)) return;
      const nw = Math.max(64, Math.min(1024, Math.ceil(width / fieldCell))),
        nh = Math.max(64, Math.min(1024, Math.ceil(height / fieldCell))),
        old = fields;
      let fresh = [];
      try {
        if (nw !== fieldWidth || nh !== fieldHeight) fresh = densityTargets(nw, nh);
        const target = fresh.length ? fresh[0] : fields[1 - read];
        resizePass.run(fields[read].tex, target.fb, [W, H], [width, height], [nw, nh]);
        if (fresh.length) {
          fields = fresh;
          read = 0;
          freeDensity(old);
        } else read = 1 - read;
        fieldWidth = nw;
        fieldHeight = nh;
        if (flowField && !flowField.resize(width, height, nw, nh)) {
          flowField.dispose();
          flowField = null;
        }
      } catch (error) {
        freeDensity(fresh);
        console.warn('SC density resize unavailable:', error.message);
      }
    }
    function initialize() {
      if (disposed || !gl) return;
      try {
        preciseFlow = !!gl.getExtension('EXT_color_buffer_float');
        final = program(frag, [
          'uTurn',
          'uTransparent',
          'uTransport',
          'uFlow',
          'uImage',
          'uFluid',
          'uContext',
          'uSize',
          'uPixels',
          'uCard',
          'uNameBand',
          'uEntrance',
          'uExit',
          'uTime',
          'uStrength',
          'uReach',
          'uText',
          'uRed',
          'uDispersion',
          'uGhost',
          'uProgress',
          'uProgressRatio',
          'uProgressColor',
        ]);
        fluid = program(advect, [
          'uTurn',
          'uPrevious',
          'uSize',
          'uFieldPixels',
          'uCard',
          'uTime',
          'uDelta',
          'uFlowDelta',
          'uReset',
          'uEntrance',
          'uExit',
        ]);
        buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        function texture() {
          const tx = gl.createTexture();
          textures.push(tx);
          gl.bindTexture(gl.TEXTURE_2D, tx);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          return tx;
        }
        gl.activeTexture(gl.TEXTURE0);
        tex = texture();
        gl.activeTexture(gl.TEXTURE2);
        cardTex = texture();
        fields = densityTargets(fieldWidth, fieldHeight);
        resizePass = globalThis.SCFlowField?.createTransfer(gl, vert);
        flowField = globalThis.SCFlowField?.create(gl, {
          enabled: preciseFlow,
          vertex: vert,
          common: fluidCommon,
          transfer: resizePass,
          width: W,
          height: H,
          fieldWidth,
          fieldHeight,
        });
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        ready = true;
      } catch (error) {
        releaseResources();
        ensureFallback();
        console.warn('SC simulation uses simplified rendering:', error.message);
      }
    }
    function lost(event) {
      if (disposed) return;
      event.preventDefault();
      contextLost = true;
      forgetResources();
      ensureFallback();
    }
    function restored() {
      if (disposed) return;
      contextLost = false;
      initialize();
    }
    screen.addEventListener('webglcontextlost', lost);
    screen.addEventListener('webglcontextrestored', restored);
    try {
      gl = screen.getContext('webgl2', {
        alpha: true,
        premultipliedAlpha: false,
        antialias: false,
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance',
      });
    } catch {}
    if (gl) initialize();
    else ensureFallback();
    function step(time, dt, phase, flowDt, clear = false, exit = -1) {
      const l = fluid.l;
      gl.useProgram(fluid.p);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fields[1 - read].fb);
      gl.viewport(0, 0, fieldWidth, fieldHeight);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, fields[read].tex);
      gl.uniform1i(l.uPrevious, 1);
      gl.uniform2f(l.uSize, W, H);
      gl.uniform2f(l.uFieldPixels, fieldWidth, fieldHeight);
      gl.uniform4f(l.uCard, card.x, card.y, card.w, card.h);
      gl.uniform1f(l.uTime, time);
      gl.uniform1f(l.uDelta, dt);
      gl.uniform1f(l.uFlowDelta, flowDt);
      gl.uniform1f(l.uReset, clear ? 1 : 0);
      gl.uniform1f(l.uEntrance, phase);
      gl.uniform1f(l.uExit, exit);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      read = 1 - read;
      flowField?.step(time, flowDt, clear, card);
    }
    function draw(
      context,
      left,
      top,
      age,
      remaining,
      sourceQuality,
      exitAge = -1,
      turn = -1,
      motionAge = age,
    ) {
      if (disposed) return;
      // A backwards editor seek is a new evaluation, not forward advection.
      // Ordinary edits preserve previousAge via reconfigure and keep the live field.
      if (previousAge !== null && age < previousAge - 0.01) {
        carriedTime = options.seed + ((Math.max(0, age) / 1000) * state.speed) / 36;
        reset = true;
        lastExit = -1;
      } else if (options.continuousTime)
        carriedTime +=
          ((Math.max(0, previousAge === null ? age : age - previousAge) / 1000) * state.speed) / 36;
      previousAge = age;
      const phase = Math.min(1000, Math.max(0, motionAge)) * 0.00052,
        time = options.continuousTime
          ? carriedTime
          : options.seed + ((Math.max(0, age) / 1000) * state.speed) / 36,
        exit = exitAge < 0 ? -1 : exitAge / 1000;
      ink.setTransform(q, 0, 0, q, 0, 0);
      if (options.transparent) ink.clearRect(0, 0, W, H);
      else {
        ink.fillStyle = options.background || '#0e100f';
        ink.fillRect(0, 0, W, H);
      }
      ink.drawImage(
        context.canvas,
        0,
        0,
        context.canvas.width,
        context.canvas.height,
        -left,
        -top,
        context.canvas.width / sourceQuality,
        context.canvas.height / sourceQuality,
      );
      if (options.progressAt) {
        const current = options.progressAt();
        progress = current ? { ...current, x: card.x + current.x, y: card.y + current.y } : null;
      }
      const progressRatio =
        progress && !(progress.delay > 0 && motionAge < 520 + progress.delay)
          ? Math.max(
              0,
              Math.min(1, remaining / (progress.duration || options.progress?.duration || 1)),
            )
          : 0;
      const second = Math.ceil(remaining),
        paintVersion = options.paintVersion?.();
      if (second !== lastSecond || paintVersion !== lastPaintVersion) {
        panelInk.setTransform(1, 0, 0, 1, 0, 0);
        panelInk.clearRect(0, 0, panel.width, panel.height);
        panelInk.setTransform(q, 0, 0, q, 0, 0);
        panelInk.textBaseline = 'top';
        options.paint(panelInk, card, remaining);
        lastSecond = second;
        lastPaintVersion = paintVersion;
        panelDirty = true;
      }
      if (!ready) {
        const c = fallback.getContext('2d');
        c.setTransform(1, 0, 0, 1, 0, 0);
        if (options.transparent) c.clearRect(0, 0, c.canvas.width, c.canvas.height);
        c.drawImage(base, 0, 0);
        if (phase >= 0.27) {
          c.save();
          c.beginPath();
          let r =
            exit >= 0
              ? Math.max(0, 1 - easeBetween(0.1, 0.67, exit))
              : Math.min(1.5, ((phase - 0.27) / 0.1) * 1.414);
          if (turn >= 0) r *= 1 - easeBetween(0.02, 0.48, turn) * (1 - easeBetween(0.54, 1, turn));
          c.ellipse(
            (card.x + card.w * 0.5) * q,
            (card.y + card.h * 0.5) * q,
            (card.w * 0.5 + 24) * q * r,
            (card.h * 0.5 + 24) * q * r,
            0,
            0,
            Math.PI * 2,
          );
          c.clip();
          c.drawImage(panel, 0, 0);
          if (progress && progressRatio > 0) {
            c.strokeStyle = progress.color || '#f1493c';
            c.globalAlpha = progress.opacity ?? 1;
            c.lineWidth = progress.height * q;
            c.beginPath();
            c.moveTo(progress.x * q, progress.y * q);
            c.lineTo((progress.x + progress.width * progressRatio) * q, progress.y * q);
            c.stroke();
          }
          c.restore();
        }
        c.setTransform(q, 0, 0, q, 0, 0);
        c.strokeStyle = 'rgba(200,32,24,.28)';
        c.lineWidth = 2;
        if (phase > 0 && exit < 1) {
          const ratio =
            exit < 0 ? occupied(motionAge, card.h, state) : 1 - easeBetween(0.12, 0.8, exit);
          for (let i = 0; i < 20; i++) {
            const a = (i * Math.PI) / 10,
              x = card.x + card.w * 0.5 + Math.cos(a) * card.w * 0.52 * ratio,
              y = card.y + card.h * 0.5 + Math.sin(a) * card.h * 0.55 * ratio;
            c.beginPath();
            c.moveTo(x - 8, y);
            c.quadraticCurveTo(x, y - 4, x + 11, y + 2);
            c.stroke();
          }
        }
        if (options.transparent) context.clearRect(left, top, W, H);
        context.drawImage(fallback, left, top, W, H);
        return;
      }
      gl.useProgram(fluid.p);
      gl.uniform1f(fluid.l.uTurn, turn);
      if (reset || phase < lastEntrance) {
        step(time, 0, phase >= 0.52 ? 0.52 : 0, 0, true);
        lastEntrance = phase >= 0.52 ? 0.52 : 0;
        lastTime = time;
        reset = false;
      }
      const change = phase - lastEntrance;
      if (exit >= 0) {
        const previous = Math.max(0, lastExit),
          real = Math.min(1.1, Math.max(0, exit - previous)),
          steps = Math.ceil(real * 90),
          dt = real / Math.max(1, steps);
        for (let i = 0; i < steps; i++)
          step(
            time - ((steps - 1 - i) * dt * state.speed) / 36,
            dt,
            phase,
            dt * Math.max(0.45, state.speed / 36),
            false,
            previous + (i + 1) * dt,
          );
      } else if (change > 0) {
        const real = change / 0.52,
          steps = Math.ceil(real * 90),
          dt = real / steps;
        for (let i = 0; i < steps; i++)
          step(
            time - ((steps - 1 - i) * dt * state.speed) / 36,
            dt,
            lastEntrance + (change * (i + 1)) / steps,
            (dt * state.speed) / 36,
          );
      } else {
        const dt = Math.min(0.18, Math.max(0, time - lastTime)),
          steps = Math.ceil(dt / 0.06);
        for (let i = 0; i < steps; i++)
          step(time - dt + ((i + 1) * dt) / steps, dt / steps, phase, dt / steps);
      }
      lastTime = time;
      lastEntrance = phase;
      lastExit = exit;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, base);
      if (panelDirty) {
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, cardTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, panel);
        panelDirty = false;
      }
      const l = final.l;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, screen.width, screen.height);
      gl.useProgram(final.p);
      gl.uniform1f(l.uTurn, turn);
      gl.uniform1f(final.l.uTransparent, options.transparent ? 1 : 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, fields[read].tex);
      gl.uniform1i(l.uImage, 0);
      gl.uniform1i(l.uFluid, 1);
      gl.uniform1i(l.uContext, 2);
      gl.uniform1i(l.uFlow, 3);
      gl.uniform1f(l.uTransport, flowField ? 1 : 0);
      if (flowField) flowField.bind(3);
      else {
        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, fields[read].tex);
      }
      gl.uniform4f(
        l.uProgress,
        progress?.x || 0,
        progress?.y || 0,
        progress?.width || 0,
        progress?.height || 0,
      );
      gl.uniform1f(l.uProgressRatio, progressRatio);
      const rgb = (progress?.color || '#f1493c')
        .slice(1)
        .match(/.{2}/g)
        .map((v) => parseInt(v, 16) / 255);
      gl.uniform4f(l.uProgressColor, ...rgb, progress?.opacity ?? 1);
      gl.uniform2f(l.uSize, W, H);
      gl.uniform2f(l.uPixels, screen.width, screen.height);
      gl.uniform4f(l.uCard, card.x, card.y, card.w, card.h);
      gl.uniform2f(l.uNameBand, card.y + options.nameBand[0], card.y + options.nameBand[1]);
      gl.uniform1f(l.uEntrance, phase);
      gl.uniform1f(l.uExit, exit);
      gl.uniform1f(l.uTime, time);
      gl.uniform1f(l.uStrength, state.strength / 100);
      gl.uniform1f(l.uReach, state.reach);
      gl.uniform1f(l.uText, state.textWarp / 100);
      gl.uniform1f(l.uRed, state.red / 100);
      gl.uniform1f(l.uDispersion, state.dispersion / 100);
      gl.uniform1f(l.uGhost, state.ghost / 100);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (options.transparent) context.clearRect(left, top, W, H);
      context.drawImage(screen, left, top, W, H);
    }
    // Parameter editing must not replace the transport field or advance its clock.
    // Keep this separate from card geometry and ink changes, including paused QA.
    function updateFX(next) {
      if (!disposed && next) {
        state = next;
        options.fx = next;
      }
    }
    function reconfigure(next, age) {
      if (disposed) return;
      // Keep the programs and both carried fields. A layout change only changes
      // the logical card and output raster, never the fluid clock or shader setup.
      const nextW = next.width + 112,
        nextH = next.height + 320;
      resizeFields(nextW, nextH);
      options = next;
      state = options.fx;
      W = nextW;
      H = nextH;
      q = Math.min(options.quality, 4096 / H);
      card.w = options.width - 54;
      card.h = options.height;
      progress = options.progress
        ? { ...options.progress, x: card.x + options.progress.x, y: card.y + options.progress.y }
        : null;
      for (const c of [screen, base, panel, fallback])
        if (c) {
          const w = Math.round(W * q),
            h = Math.round(H * q);
          if (c.width !== w) c.width = w;
          if (c.height !== h) c.height = h;
        }
      flowField?.resize(W, H);
      carriedTime = lastTime || options.seed;
      previousAge = age;
      lastSecond = -1;
      lastPaintVersion = undefined;
      panelDirty = true;
    }
    function dispose() {
      if (disposed) return;
      disposed = true;
      screen.removeEventListener('webglcontextlost', lost);
      screen.removeEventListener('webglcontextrestored', restored);
      releaseResources();
      if (gl && !contextLost) gl.getExtension('WEBGL_lose_context')?.loseContext();
      gl = null;
      for (const c of [screen, base, panel, fallback])
        if (c) {
          c.width = 0;
          c.height = 0;
        }
    }
    return {
      draw,
      reconfigure,
      updateFX,
      dispose,
      get kind() {
        return ready ? 'native' : 'fallback';
      },
      get materialState() {
        return {
          fx: { ...state },
          time: lastTime,
          age: previousAge,
          entrance: lastEntrance,
          exit: lastExit,
          width: W,
          height: H,
          grid: [fieldWidth, fieldHeight],
          resources: { textures: textures.length, framebuffers: framebuffers.length },
          ready,
        };
      },
    };
  }
  window.HissSimulation = { createLayer, occupied, padding: 160 };
})();
