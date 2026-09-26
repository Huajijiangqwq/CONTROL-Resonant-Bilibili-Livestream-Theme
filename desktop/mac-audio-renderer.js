'use strict';
let stream,context,node,revision=0;
window.stopCapture=async()=>{revision++;stream?.getTracks().forEach(t=>t.stop());stream=null;node?.disconnect();node=null;if(context)await context.close();context=null;};
window.startCapture=async()=>{
  await window.stopCapture();const own=revision;
  try{
    const next=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:1,width:64,height:64},audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
    if(own!==revision){next.getTracks().forEach(t=>t.stop());return;}
    stream=next;if(!stream.getAudioTracks().length)throw Error('No audio');
    const ac=context=new AudioContext();await ac.audioWorklet.addModule('mac-audio-worklet.js');
    if(own!==revision)return;
    const input=ac.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
    node=new AudioWorkletNode(ac,'control-audio-tap');
    node.port.onmessage=event=>{if(own===revision)window.audioCapture.frame(event.data,ac.sampleRate);};
    const mute=ac.createGain();mute.gain.value=0;
    input.connect(node);node.connect(mute);mute.connect(ac.destination);await ac.resume();
    stream.getAudioTracks()[0].onended=()=>{if(own===revision){window.audioCapture.error();void window.stopCapture();}};
  }catch{if(own===revision){window.audioCapture.error();await window.stopCapture();}}
};
