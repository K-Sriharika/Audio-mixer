let creating = null;

async function ensureOffscreen(){
  const existing = await chrome.offscreen.hasDocument();
  if(existing) return;
  if(creating){ await creating; return; }
  creating = chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['USER_MEDIA'],
    justification: 'Real-time audio separation engine'
  });
  await creating;
  creating = null;
}

chrome.runtime.onMessage.addListener((msg, sender, reply)=>{
  if(msg.target !== 'background') return;
  (async()=>{
    try{
      if(msg.action === 'start'){
        await ensureOffscreen();
        const [tab] = await chrome.tabs.query({active:true, currentWindow:true});
        const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
        // small delay so the offscreen listener is definitely ready
        await new Promise(r=>setTimeout(r,150));
        const r = await chrome.runtime.sendMessage({target:'offscreen', action:'start', streamId});
        reply(r);
      } else {
        const r = await chrome.runtime.sendMessage({target:'offscreen', action:msg.action, voice:msg.voice, bgm:msg.bgm, sharp:msg.sharp, width:msg.width});
        reply(r);
      }
    }catch(e){ reply({ok:false, error:e.message}); }
  })();
  return true;
});
