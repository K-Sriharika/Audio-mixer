const FRAME = 2048;
const HOP = 512;

function makeHann(N){
  const w = new Float32Array(N);
  for (let n=0;n<N;n++) w[n] = 0.5 - 0.5*Math.cos(2*Math.PI*n/(N-1));
  return w;
}

function fft(re, im, inv){
  const n = re.length;
  for (let i=1,j=0;i<n;i++){
    let bit=n>>1;
    for(;j&bit;bit>>=1) j^=bit;
    j^=bit;
    if(i<j){ let t=re[i];re[i]=re[j];re[j]=t; t=im[i];im[i]=im[j];im[j]=t; }
  }
  for(let len=2;len<=n;len<<=1){
    const ang=(inv?2:-2)*Math.PI/len;
    const wr=Math.cos(ang), wi=Math.sin(ang);
    const half=len>>1;
    for(let i=0;i<n;i+=len){
      let cr=1,ci=0;
      for(let k=0;k<half;k++){
        const a=i+k, b=a+half;
        const xr=re[b]*cr-im[b]*ci;
        const xi=re[b]*ci+im[b]*cr;
        re[b]=re[a]-xr; im[b]=im[a]-xi;
        re[a]+=xr; im[a]+=xi;
        const ncr=cr*wr-ci*wi; ci=cr*wi+ci*wr; cr=ncr;
      }
    }
  }
  if(inv){ for(let i=0;i<n;i++){ re[i]/=n; im[i]/=n; } }
}

class PanSeparator extends AudioWorkletProcessor {
  constructor(){
    super();
    this.win = makeHann(FRAME);
    this.olaGain = HOP / FRAME * 2;
    this.inL = new Float32Array(FRAME);
    this.inR = new Float32Array(FRAME);
    this.fill = 0;
    this.reL=new Float32Array(FRAME); this.imL=new Float32Array(FRAME);
    this.reR=new Float32Array(FRAME); this.imR=new Float32Array(FRAME);
    this.outV=new Float32Array(FRAME); this.outBL=new Float32Array(FRAME); this.outBR=new Float32Array(FRAME);
    this.qV=[]; this.qBL=[]; this.qBR=[];
    this.mask=new Float32Array(FRAME);
    this.prevMask=new Float32Array(FRAME);
    this.sharp=3.0;        // higher = tighter voice isolation
    this.width=0.18;       // center tolerance: lower = stricter center
    this.smooth=0.5;       // temporal smoothing 0..1
    this.port.onmessage = e => {
      const d=e.data||{};
      if(d.sharp!=null) this.sharp=d.sharp;
      if(d.width!=null) this.width=d.width;
    };
  }

  analyze(){
    const {win,inL,inR,reL,imL,reR,imR,outV,outBL,outBR,mask,prevMask}=this;
    for(let i=0;i<FRAME;i++){ const w=win[i]; reL[i]=inL[i]*w; imL[i]=0; reR[i]=inR[i]*w; imR[i]=0; }
    fft(reL,imL,false); fft(reR,imR,false);
    const sharp=this.sharp, width=this.width, sm=this.smooth;

    // 1. raw center coefficient per bin
    for(let k=0;k<FRAME;k++){
      const lr=reL[k],li=imL[k],rr=reR[k],ri=imR[k];
      const magL=Math.hypot(lr,li), magR=Math.hypot(rr,ri);
      const magDiff=Math.hypot(lr-rr,li-ri);
      let c=1-magDiff/(magL+magR+1e-9); if(c<0)c=0; if(c>1)c=1;
      // soft sigmoid-ish mask: smoother than pow(), less musical noise
      let m = 1/(1+Math.exp(-(c-(1-width))*8*sharp/3));
      mask[k]=m;
    }
    // 2. smooth mask across neighbouring frequency bins (kills bubbling)
    const tmp=this.reL; // reuse buffer
    tmp[0]=mask[0]; tmp[FRAME-1]=mask[FRAME-1];
    for(let k=1;k<FRAME-1;k++) tmp[k]=(mask[k-1]+2*mask[k]+mask[k+1])*0.25;
    for(let k=0;k<FRAME;k++) mask[k]=tmp[k];
    // 3. smooth mask over time (temporal stability)
    for(let k=0;k<FRAME;k++){ mask[k]=sm*prevMask[k]+(1-sm)*mask[k]; prevMask[k]=mask[k]; }

    // rebuild spectra under the smoothed mask
    fft(reL,imL,false); // NOTE: reL was clobbered by tmp reuse, refft below instead
    // recompute L/R spectra cleanly (tmp reuse destroyed reL)
    for(let i=0;i<FRAME;i++){ const w=win[i]; reL[i]=inL[i]*w; imL[i]=0; reR[i]=inR[i]*w; imR[i]=0; }
    fft(reL,imL,false); fft(reR,imR,false);

    const vRe=new Float32Array(FRAME), vIm=new Float32Array(FRAME);
    const blRe=new Float32Array(FRAME), blIm=new Float32Array(FRAME);
    const brRe=new Float32Array(FRAME), brIm=new Float32Array(FRAME);
    for(let k=0;k<FRAME;k++){
      const lr=reL[k],li=imL[k],rr=reR[k],ri=imR[k];
      const m=mask[k];
      const mr=(lr+rr)*0.5, mi=(li+ri)*0.5;
      vRe[k]=mr*m; vIm[k]=mi*m;
      blRe[k]=lr-vRe[k]; blIm[k]=li-vIm[k];
      brRe[k]=rr-vRe[k]; brIm[k]=ri-vIm[k];
    }
    fft(vRe,vIm,true); fft(blRe,blIm,true); fft(brRe,brIm,true);
    const g=this.olaGain;
    for(let i=0;i<FRAME;i++){ const w=win[i]*g; outV[i]+=vRe[i]*w; outBL[i]+=blRe[i]*w; outBR[i]+=brRe[i]*w; }
    for(let i=0;i<HOP;i++){ this.qV.push(outV[i]); this.qBL.push(outBL[i]); this.qBR.push(outBR[i]); }
    outV.copyWithin(0,HOP); outV.fill(0,FRAME-HOP);
    outBL.copyWithin(0,HOP); outBL.fill(0,FRAME-HOP);
    outBR.copyWithin(0,HOP); outBR.fill(0,FRAME-HOP);
  }

  process(inputs, outputs){
    const inp=inputs[0];
    const outV=outputs[0], outB=outputs[1];
    const N=outV[0].length;
    let c0,c1;
    if(inp && inp.length>0){ c0=inp[0]; c1=inp[1]||inp[0]; }
    if(c0){
      for(let i=0;i<N;i++){
        this.inL.copyWithin(0,1); this.inR.copyWithin(0,1);
        this.inL[FRAME-1]=c0[i]; this.inR[FRAME-1]=c1[i];
        if(++this.fill>=HOP){ this.fill=0; this.analyze(); }
      }
    }
    const vL=outV[0],vR=outV[1],bL=outB[0],bR=outB[1];
    for(let i=0;i<N;i++){
      if(this.qV.length>0){
        const s=this.qV.shift();
        vL[i]=s; if(vR)vR[i]=s;
        bL[i]=this.qBL.shift(); if(bR)bR[i]=this.qBR.shift();
      } else { vL[i]=0; if(vR)vR[i]=0; bL[i]=0; if(bR)bR[i]=0; }
    }
    return true;
  }
}
registerProcessor('pan-separator', PanSeparator);
