let audioCtx, node, voiceGain, bgmGain, stream, running=false;
let cur = { voice:1, bgm:1, sharp:3, width:0.21 };

async function start(streamId){
  if(running) return;
  stream = await navigator.mediaDevices.getUserMedia({
    audio: { mandatory: { chromeMediaSource:'tab', chromeMediaSourceId: streamId } }
  });
  audioCtx = new AudioContext();
  await audioCtx.audioWorklet.addModule('separator-worklet.js');
  const source = audioCtx.createMediaStreamSource(stream);
  node = new AudioWorkletNode(audioCtx,'pan-separator',{
    numberOfInputs:1, numberOfOutputs:2, outputChannelCount:[2,2]
  });
  voiceGain = audioCtx.createGain();
  bgmGain = audioCtx.createGain();
  voiceGain.gain.value = cur.voice;
  bgmGain.gain.value = cur.bgm;
  source.connect(node);
  node.connect(voiceGain,0);
  node.connect(bgmGain,1);
  voiceGain.connect(audioCtx.destination);
  bgmGain.connect(audioCtx.destination);
  node.port.postMessage({sharp:cur.sharp, width:cur.width});
  running = true;
}

function stop(){
  if(stream) stream.getTracks().forEach(t=>t.stop());
  if(audioCtx) audioCtx.close();
  audioCtx=node=voiceGain=bgmGain=stream=null;
  running=false;
}

chrome.runtime.onMessage.addListener((msg, sender, reply)=>{
  if(msg.target!=='offscreen') return;
  (async()=>{
    try{
      if(msg.action==='start'){ await start(msg.streamId); reply({ok:true}); }
      else if(msg.action==='stop'){ stop(); reply({ok:true}); }
      else if(msg.action==='gains'){
        cur.voice=msg.voice; cur.bgm=msg.bgm;
        if(voiceGain) voiceGain.gain.value=msg.voice;
        if(bgmGain) bgmGain.gain.value=msg.bgm;
        reply({ok:true});
      }
      else if(msg.action==='sharp'){
        cur.sharp=msg.sharp; cur.width=msg.width;
        if(node) node.port.postMessage({sharp:msg.sharp, width:msg.width});
        reply({ok:true});
      }
      else if(msg.action==='status'){
        reply({running, voice:cur.voice, bgm:cur.bgm, sharp:cur.sharp});
      }
    }catch(e){ reply({ok:false, error:e.message}); }
  })();
  return true;
});
