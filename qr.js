// 사진 속 QR코드 찾기. 브라우저 내장 BarcodeDetector가 있으면 쓰고, 없으면 jsQR(Apache-2.0)로 찾는다.
// 포스터의 QR은 작고 여러 개인 경우가 많아, 전체 → 겹치는 조각(2배 확대) 순서로 찾고 찾은 자리는 가린 뒤 다시 찾는다.
// 사진은 브라우저 밖으로 나가지 않는다.

const JSQR='https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
let jsqrLoading=null;
function loadJsQR(){
  if(window.jsQR)return Promise.resolve(window.jsQR);
  return jsqrLoading??=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=JSQR;s.onload=()=>resolve(window.jsQR);s.onerror=()=>{jsqrLoading=null;reject(Error('QR 인식기를 불러오지 못했습니다.'));};document.head.append(s);});
}
const boxOf=pts=>{const xs=pts.map(p=>p.x),ys=pts.map(p=>p.y);return {x0:Math.min(...xs),y0:Math.min(...ys),x1:Math.max(...xs),y1:Math.max(...ys)};};

async function withDetector(bitmap){
  if(!('BarcodeDetector' in window))return null;
  try{
    if(!(await BarcodeDetector.getSupportedFormats()).includes('qr_code'))return null;
    const found=await new BarcodeDetector({formats:['qr_code']}).detect(bitmap);
    return found.map(f=>({text:f.rawValue,box:boxOf(f.cornerPoints)}));
  }catch{return null;}
}

// 한 장면(canvas)에서 QR을 되풀이해 찾는다. 찾은 자리는 흰색으로 덮어 다음 QR을 찾게 한다.
function scan(jsQR,ctx,w,h,limit=6){
  const out=[];
  for(let i=0;i<limit;i++){
    const img=ctx.getImageData(0,0,w,h),r=jsQR(img.data,w,h,{inversionAttempts:'attemptBoth'});
    if(!r||!r.data)break;
    const l=r.location,pts=[l.topLeftCorner,l.topRightCorner,l.bottomRightCorner,l.bottomLeftCorner],b=boxOf(pts),pad=(b.x1-b.x0)*0.15;
    out.push({text:r.data,box:b});
    ctx.fillStyle='#fff';ctx.fillRect(b.x0-pad,b.y0-pad,b.x1-b.x0+2*pad,b.y1-b.y0+2*pad);
  }
  return out;
}

async function withJsQR(bitmap){
  const jsQR=await loadJsQR(),W=bitmap.width,H=bitmap.height,found=[];
  const seen=t=>found.some(f=>f.text===t);
  // 1) 전체를 긴 변 1600px 이하로
  const s=Math.min(1,1600/Math.max(W,H)),c=document.createElement('canvas');
  c.width=Math.round(W*s);c.height=Math.round(H*s);
  const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0,c.width,c.height);
  for(const f of scan(jsQR,ctx,c.width,c.height))if(!seen(f.text))found.push({text:f.text,box:{x0:f.box.x0/s,y0:f.box.y0/s,x1:f.box.x1/s,y1:f.box.y1/s}});
  // 2) 작은 QR: 겹치는 조각(2×3, 3×4)을 잘라 약 1100px까지(최대 4배) 키워 다시 찾는다.
  //    흐린 QR은 부드럽게 키운 쪽이, 또렷한 QR은 픽셀 그대로 키운 쪽이 잘 읽혀 둘 다 시도한다.
  const t=document.createElement('canvas'),tc=t.getContext('2d',{willReadFrequently:true});
  for(const [cols,rows] of [[2,3],[3,4]]){
    const tw=W/cols,th=H/rows,ov=0.25;
    for(let r=0;r<rows;r++)for(let q=0;q<cols;q++){
      const sx=Math.max(0,(q-ov)*tw),sy=Math.max(0,(r-ov)*th),sw=Math.min(W-sx,tw*(1+2*ov)),sh=Math.min(H-sy,th*(1+2*ov));
      const k=Math.min(4,1100/Math.max(sw,sh));if(k<1.2)continue;
      for(const smooth of [true,false]){
        t.width=Math.round(sw*k);t.height=Math.round(sh*k);
        tc.imageSmoothingEnabled=smooth;tc.imageSmoothingQuality='high';tc.drawImage(bitmap,sx,sy,sw,sh,0,0,t.width,t.height);
        const got=scan(jsQR,tc,t.width,t.height,3).filter(f=>!seen(f.text));
        for(const f of got)found.push({text:f.text,box:{x0:sx+f.box.x0/k,y0:sy+f.box.y0/k,x1:sx+f.box.x1/k,y1:sy+f.box.y1/k}});
        if(got.length)break;
      }
    }
  }
  return found;
}

export async function findQRCodes(blob){
  const bitmap=await createImageBitmap(blob);
  try{return (await withDetector(bitmap))??(await withJsQR(bitmap));}
  finally{bitmap.close();}
}

// QR 위(또는 바로 옆)에 있는 글자를 이름표로 붙인다. items: 글자 인식 결과 [{text,x0,y0,x1,y1}]
export function labelQRCodes(codes,items=[]){
  return codes.map(c=>{
    const w=c.box.x1-c.box.x0,h=c.box.y1-c.box.y0;
    const cx=(c.box.x0+c.box.x1)/2,overlap=t=>Math.min(t.x1,c.box.x1)-Math.max(t.x0,c.box.x0);
    const near=items.filter(t=>t.y1<=c.box.y0+h*0.2&&c.box.y0-t.y1<h*1.2&&overlap(t)>0.3*Math.min(w,t.x1-t.x0))
      .sort((a,b)=>(c.box.y0-a.y1+Math.abs((a.x0+a.x1)/2-cx))-(c.box.y0-b.y1+Math.abs((b.x0+b.x1)/2-cx)));
    return {...c,label:(near[0]?.text||'').trim()};
  });
}
// 신청 링크로 볼 QR: 이름표에 신청·접수·참가가 있거나, 주소가 신청서 서비스인 것
const FORM_HOST=/(^|\.)(forms\.gle|docs\.google\.com|form\.naver\.com|naver\.me|tally\.so|typeform\.com|forms\.office\.com|forms\.microsoft\.com)$/;
export function qrKind(c){
  let host='';
  try{const u=new URL(c.text);if(!/^https?:$/.test(u.protocol))return 'text';host=u.hostname;if(host==='docs.google.com'&&!u.pathname.startsWith('/forms'))host='';}catch{return 'text';}
  if(/신청|접수|참가|등록|응모|예약/.test(c.label))return 'registration';
  if(/홍보|안내|홈페이지|소개|오픈\s*채팅|카카오|인스타|문의/.test(c.label))return 'info';
  return FORM_HOST.test(host)?'registration':'info';
}
