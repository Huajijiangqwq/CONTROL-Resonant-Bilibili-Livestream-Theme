class ControlAudioTap extends AudioWorkletProcessor {
  constructor(){super();this.data=new Float32Array(2048);this.offset=0;}
  process(inputs){
    const channels=inputs[0];if(!channels?.length)return true;
    for(let i=0;i<channels[0].length;i++){
      let sum=0;for(const channel of channels)sum+=channel[i]||0;
      this.data[this.offset++]=sum/channels.length;
      if(this.offset===this.data.length){this.port.postMessage(this.data,[this.data.buffer]);this.data=new Float32Array(2048);this.offset=0;}
    }
    return true;
  }
}
registerProcessor('control-audio-tap',ControlAudioTap);
