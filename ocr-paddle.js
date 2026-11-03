// 사진 글자 인식: PaddleOCR PP-OCRv5 (글자 영역 검출 + 한국어 인식)을 onnxruntime-web으로 브라우저 안에서 실행한다.
// 모델은 ocr/paddle/에 있고(Apache-2.0), 사진은 브라우저 밖으로 나가지 않는다.
// 전처리·후처리는 PaddleOCR의 DetResizeForTest / NormalizeImage / DBPostProcess / RecResizeImg / CTCLabelDecode를 따른다.

const ORT_VERSION='1.22.0';
const ORT_BASE=`https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;

function loadScript(src){
  return new Promise((resolve,reject)=>{
    const s=document.createElement('script');s.src=src;s.crossOrigin='anonymous';
    s.onload=resolve;s.onerror=()=>reject(Error('인식 엔진을 불러오지 못했습니다. 네트워크를 확인해 주세요.'));
    document.head.append(s);
  });
}
// 진행률을 알리며 내려받는다(첫 사용 때 약 18MB). 받은 모델은 Cache Storage에 두어 다음부터 바로 연다.
const CACHE='kkongbap-ocr-v1';
async function fetchBytes(url,onChunk){
  let cache=null;try{cache=await caches.open(CACHE);}catch{}
  const hit=await cache?.match(url).catch(()=>null);
  if(hit){const b=new Uint8Array(await hit.arrayBuffer());onChunk(b.length);return b;}
  const r=await fetch(url);
  if(!r.ok)throw Error('인식 모델을 내려받지 못했습니다.');
  if(cache)cache.put(url,r.clone()).catch(()=>{});
  if(!r.body)return new Uint8Array(await r.arrayBuffer());
  const reader=r.body.getReader(),parts=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;parts.push(value);size+=value.length;onChunk(value.length);}
  const out=new Uint8Array(size);let at=0;for(const p of parts){out.set(p,at);at+=p.length;}
  return out;
}

const canvasOf=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};

export async function createPaddleReader({modelBase,onProgress=()=>{}}){
  if(!window.ort){onProgress('인식 엔진 준비 중');await loadScript(`${ORT_BASE}ort.wasm.min.js`);}
  const ort=window.ort;
  ort.env.wasm.wasmPaths=ORT_BASE;
  ort.env.wasm.numThreads=self.crossOriginIsolated?Math.min(4,navigator.hardwareConcurrency||1):1;
  const files={det:'det.onnx',rec:'rec.onnx',dict:'dict.txt'},sizes={det:4826518,rec:13418787,dict:47451};
  const total=Object.values(sizes).reduce((a,b)=>a+b,0);let loaded=0;
  const tick=n=>{loaded+=n;onProgress(`한국어 인식 모델 준비 중 · ${Math.min(99,Math.round(loaded/total*100))}%`);};
  const [detBytes,recBytes,dictBytes]=await Promise.all(['det','rec','dict'].map(k=>fetchBytes(modelBase+files[k],tick)));
  onProgress('한국어 인식 모델 여는 중');
  const opts={executionProviders:['wasm'],graphOptimizationLevel:'all'};
  const det=await ort.InferenceSession.create(detBytes,opts),rec=await ort.InferenceSession.create(recBytes,opts);
  // CTC 사전: 0번은 공백 토큰(blank), 마지막은 띄어쓰기
  const chars=['',...new TextDecoder().decode(dictBytes).split(/\r?\n/).filter((c,i,a)=>c!==''||i<a.length-1),' '];

  async function detect(source,limit){
    const W0=source.width,H0=source.height,r=limit/Math.max(W0,H0);
    const W=Math.max(32,Math.round(W0*r/32)*32),H=Math.max(32,Math.round(H0*r/32)*32);
    const c=canvasOf(W,H),ctx=c.getContext('2d');ctx.drawImage(source,0,0,W,H);
    const px=ctx.getImageData(0,0,W,H).data,n=W*H,input=new Float32Array(3*n);
    // PaddleOCR는 BGR 순서 그대로 평균·표준편차를 적용한다.
    const mean=[0.485,0.456,0.406],std=[0.229,0.224,0.225];
    for(let i=0;i<n;i++){
      input[i]=(px[i*4+2]/255-mean[0])/std[0];
      input[n+i]=(px[i*4+1]/255-mean[1])/std[1];
      input[2*n+i]=(px[i*4]/255-mean[2])/std[2];
    }
    const out=await det.run({[det.inputNames[0]]:new ort.Tensor('float32',input,[1,3,H,W])});
    const prob=out[det.outputNames[0]].data;
    // 확률 0.3 이상 영역을 4방향 연결 요소로 묶는다.
    const label=new Int32Array(n),boxes=[],stack=[];let next=0;
    for(let i=0;i<n;i++){
      if(prob[i]<=0.3||label[i])continue;
      next++;label[i]=next;stack.push(i);
      let x0=W,y0=H,x1=0,y1=0,sum=0,count=0;
      while(stack.length){
        const j=stack.pop(),x=j%W,y=(j-x)/W;
        sum+=prob[j];count++;
        if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;
        for(const k of [x>0?j-1:-1,x<W-1?j+1:-1,y>0?j-W:-1,y<H-1?j+W:-1])if(k>=0&&!label[k]&&prob[k]>0.3){label[k]=next;stack.push(k);}
      }
      const w=x1-x0+1,h=y1-y0+1;
      if(Math.min(w,h)<3||sum/count<0.6)continue;
      // 축소된 글자 영역을 원래 크기로 넓힌다(unclip ratio 1.5).
      const d=w*h*1.5/(2*(w+h));
      boxes.push({x0:Math.max(0,(x0-d)*W0/W),y0:Math.max(0,(y0-d)*H0/H),x1:Math.min(W0,(x1+1+d)*W0/W),y1:Math.min(H0,(y1+1+d)*H0/H),score:sum/count});
    }
    return boxes;
  }

  async function read(source,box){
    const bw=box.x1-box.x0,bh=box.y1-box.y0,H=48;
    const vertical=bh>bw*1.5;
    const tw=vertical?bh:bw,th=vertical?bw:bh;
    const W=Math.min(3200,Math.max(16,Math.ceil(H*tw/th)));
    const c=canvasOf(W,H),ctx=c.getContext('2d');
    ctx.imageSmoothingQuality='high';
    if(vertical){ctx.translate(0,H);ctx.rotate(-Math.PI/2);ctx.drawImage(source,box.x0,box.y0,bw,bh,0,0,H,W);}
    else ctx.drawImage(source,box.x0,box.y0,bw,bh,0,0,W,H);
    const px=ctx.getImageData(0,0,W,H).data,n=W*H,input=new Float32Array(3*n);
    for(let i=0;i<n;i++){input[i]=px[i*4+2]/127.5-1;input[n+i]=px[i*4+1]/127.5-1;input[2*n+i]=px[i*4]/127.5-1;}
    const out=await rec.run({[rec.inputNames[0]]:new ort.Tensor('float32',input,[1,3,H,W])});
    const t=out[rec.outputNames[0]],[,T,C]=t.dims,p=t.data;
    let text='',last=0,conf=0,kept=0;
    for(let s=0;s<T;s++){
      let best=0,bp=-1;
      for(let k=0;k<C;k++){const v=p[s*C+k];if(v>bp){bp=v;best=k;}}
      if(best!==0&&best!==last){text+=chars[best]??'';conf+=bp;kept++;}
      last=best;
    }
    return {text:text.trim(),score:kept?conf/kept:0};
  }

  // 같은 높이의 조각을 한 줄로 잇고, 단 사이처럼 멀리 떨어진 조각은 다른 줄로 나눈다.
  function layout(items){
    items.sort((a,b)=>(a.y0+a.y1)-(b.y0+b.y1));
    const rows=[];
    for(const it of items){
      const h=it.y1-it.y0;
      const row=rows.find(r=>Math.min(r.y1,it.y1)-Math.max(r.y0,it.y0)>0.5*Math.min(h,r.y1-r.y0));
      if(row){row.items.push(it);row.y0=Math.min(row.y0,it.y0);row.y1=Math.max(row.y1,it.y1);}
      else rows.push({y0:it.y0,y1:it.y1,items:[it]});
    }
    rows.sort((a,b)=>a.y0-b.y0);
    const lines=[];
    for(const row of rows){
      row.items.sort((a,b)=>a.x0-b.x0);
      let cur=[row.items[0]];
      for(const it of row.items.slice(1)){
        const prev=cur[cur.length-1],h=Math.min(prev.y1-prev.y0,it.y1-it.y0);
        if(it.x0-prev.x1>2.5*h){lines.push(cur);cur=[it];}else cur.push(it);
      }
      lines.push(cur);
    }
    // 기호 하나뿐인 조각(아이콘·QR 무늬를 글자로 읽은 것)은 버린다.
    return lines.map(parts=>parts.map(p=>p.text).join(' ')).filter(l=>(l.match(/[가-힣A-Za-z0-9]/g)||[]).length>=2);
  }

  return {
    async recognize(blob,{limit=1280,signal}={}){
      const source=await createImageBitmap(blob);
      try{
        onProgress('글자 영역 찾는 중');
        const boxes=await detect(source,limit);
        const items=[];
        for(const [i,box] of boxes.entries()){
          if(signal?.aborted)throw new DOMException('취소','AbortError');
          onProgress(`사진 글자 읽는 중 · ${Math.round((i+1)/boxes.length*100)}%`);
          const r=await read(source,box);
          if(r.text&&r.score>=0.5)items.push({...box,...r});
        }
        const confidence=items.length?items.reduce((s,x)=>s+x.score,0)/items.length*100:0;
        return {text:layout(items).join('\n'),confidence,items};
      }finally{source.close();}
    },
    async terminate(){await Promise.allSettled([det.release?.(),rec.release?.()]);},
  };
}
