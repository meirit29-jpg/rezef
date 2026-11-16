/* זיהוי מספר רישוי מתמונה – הועבר כמות שהוא מהגרסה הקודמת (car/index.html), ללא שינוי לוגיקה */
let tessLoad;
export function loadTesseract(){
  if(window.Tesseract) return Promise.resolve();
  return tessLoad ||= new Promise((res, rej)=>{
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
    s.onload = res; s.onerror = ()=>{ tessLoad = null; rej(new Error("טעינת מנוע הזיהוי נכשלה")); };
    document.head.appendChild(s);
  });
}
export function loadImage(file){
  return new Promise((res, rej)=>{
    const img = new Image(); img.onload = ()=>res(img); img.onerror = rej;
    img.src = URL.createObjectURL(file);
  });
}
/* OCR_START */
const mkCanvas = (w,h) => { const c = document.createElement("canvas"); c.width=Math.max(1,Math.round(w)); c.height=Math.max(1,Math.round(h)); return c; };
const isYellow = (r,g,b) => r>150 && g>110 && b<110 && r-b>70 && g-b>50;
const lumOf = (r,g,b) => 0.3*r+0.59*g+0.11*b;

// מאתר את הלוחית הצהובה, מנקה רקע, מיישר זווית ומחזיר כמה גרסאות מוטות לזיהוי
function preparePlate(img){
  const sc = Math.min(1, 1400/img.width);
  const W = Math.round(img.width*sc), H = Math.round(img.height*sc);
  const c = mkCanvas(W,H), x = c.getContext("2d");
  x.drawImage(img,0,0,W,H);
  const d = x.getImageData(0,0,W,H).data;

  // 1. רשת 4px – הרכיב הצהוב הגדול ביותר
  const C=4, gw=Math.floor(W/C), gh=Math.floor(H/C), grid=new Uint8Array(gw*gh);
  for(let gy=0;gy<gh;gy++) for(let gx=0;gx<gw;gx++){
    let n=0; for(let yy=0;yy<C;yy++) for(let xx=0;xx<C;xx++){ const p=((gy*C+yy)*W+gx*C+xx)*4; if(isYellow(d[p],d[p+1],d[p+2])) n++; }
    grid[gy*gw+gx] = n > C*C*0.3 ? 1 : 0;
  }
  const seen=new Uint8Array(gw*gh); let best=null;
  for(let i=0;i<grid.length;i++){
    if(!grid[i]||seen[i]) continue;
    const q=[i]; seen[i]=1; let n=0,x0=1e9,y0=1e9,x1=-1,y1=-1;
    while(q.length){ const k=q.pop(); n++; const kx=k%gw, ky=(k/gw)|0;
      if(kx<x0)x0=kx; if(kx>x1)x1=kx; if(ky<y0)y0=ky; if(ky>y1)y1=ky;
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){ const nx=kx+dx, ny=ky+dy;
        if(nx>=0&&ny>=0&&nx<gw&&ny<gh){ const j=ny*gw+nx; if(grid[j]&&!seen[j]){ seen[j]=1; q.push(j); } } } }
    if(!best||n>best.n) best={n,x0,y0,x1,y1};
  }
  if(!best || best.n < 20) return {found:false, variants:[c], preview:c};

  // 2. בתוך הלוחית: כל עמודה – רק מה שבין הקצה העליון לתחתון של הצהוב; כהה=שחור
  const bx=best.x0*C, by=best.y0*C, bw=(best.x1-best.x0+1)*C, bh=(best.y1-best.y0+1)*C;
  const clean = mkCanvas(bw,bh), cx=clean.getContext("2d");
  const out = cx.createImageData(bw,bh); out.data.fill(255);
  const xs=[], tops=[];
  for(let i=0;i<bw;i++){
    let t=-1,b=-1;
    for(let j=0;j<bh;j++){ const p=((by+j)*W+bx+i)*4; if(isYellow(d[p],d[p+1],d[p+2])){ if(t<0)t=j; b=j; } }
    if(t<0 || b-t<4) continue;
    xs.push(i); tops.push(t);
    for(let j=t;j<=b;j++){ const p=((by+j)*W+bx+i)*4; const v = lumOf(d[p],d[p+1],d[p+2])<110 ? 0 : 255; const o=(j*bw+i)*4; out.data[o]=out.data[o+1]=out.data[o+2]=v; }
  }
  cx.putImageData(out,0,0);

  // 3. זווית מהקצה העליון (רגרסיה) ויישור
  let ang=0;
  if(xs.length>10){
    const n=xs.length, mx=xs.reduce((a,b)=>a+b)/n, my=tops.reduce((a,b)=>a+b)/n;
    let num=0,den=0; for(let k=0;k<n;k++){ num+=(xs[k]-mx)*(tops[k]-my); den+=(xs[k]-mx)**2; }
    ang = Math.atan(num/den);
  }
  const cos=Math.abs(Math.cos(ang)), sin=Math.abs(Math.sin(ang));
  const rw=bw*cos+bh*sin, rh=bw*sin+bh*cos;
  const rot=mkCanvas(rw,rh), rx=rot.getContext("2d");
  rx.fillStyle="#fff"; rx.fillRect(0,0,rot.width,rot.height);
  rx.translate(rot.width/2,rot.height/2); rx.rotate(-ang); rx.drawImage(clean,-bw/2,-bh/2);

  // 4. חיתוך לשורת הספרות (הפס עם הכי הרבה פיקסלים שחורים)
  const rd=rx.getImageData(0,0,rot.width,rot.height).data, RW=rot.width, RH=rot.height;
  const rows=new Array(RH).fill(0);
  for(let j=0;j<RH;j++) for(let i=0;i<RW;i++) if(rd[(j*RW+i)*4]<128) rows[j]++;
  const mxr=Math.max(...rows); let s=rows.indexOf(mxr), e=s;
  while(s>0 && rows[s-1]>mxr*0.2) s--; while(e<RH-1 && rows[e+1]>mxr*0.2) e++;
  const pad=Math.round((e-s)*0.12); s=Math.max(0,s-pad); e=Math.min(RH-1,e+pad);
  const bandH=e-s+1;

  // 5. כמה גרסאות של תיקון הטיה (פרספקטיבה), בגובה ~100px
  const target=100/bandH, variants=[];
  for(const sh of [0, 0.25, 0.45, -0.25]){
    const w0=RW+Math.abs(sh)*bandH, P=30;
    const v=mkCanvas(w0*target+2*P, bandH*target+2*P), vx=v.getContext("2d");
    vx.fillStyle="#fff"; vx.fillRect(0,0,v.width,v.height);
    vx.translate(P,P); vx.scale(target,target);
    vx.transform(1,0,-sh,1,0,0); // הטיה אופקית
    vx.drawImage(rot,0,s,RW,bandH, sh>0 ? sh*bandH : 0, 0, RW, bandH);
    variants.push(v);
  }
  return {found:true, variants, preview:variants[0]};
}

function extractPlate(text){
  const cands = (text.match(/\d[\d\s\-–·.:]{5,14}\d/g)||[]).map(s=>s.replace(/\D/g,""));
  return cands.find(s=>s.length===8) || cands.find(s=>s.length===7) || null;
}

export async function recognizePlate(img, TesseractLib, workerOpts){
  const prep = preparePlate(img);
  const worker = await TesseractLib.createWorker("eng", 1, workerOpts||{});
  try{
    await worker.setParameters({tessedit_char_whitelist:"0123456789-", tessedit_pageseg_mode: prep.found ? "7" : "11"});
    const votes={};
    for(const v of prep.variants){
      const {data} = await worker.recognize(v.toBuffer ? v.toBuffer("image/png") : v);
      const p = extractPlate(data.text.replace(/\n/g," "));
      if(p){ votes[p]=(votes[p]||0)+ (p.length===8?1.1:1); }
    }
    const plate = Object.entries(votes).sort((a,b)=>b[1]-a[1])[0]?.[0] || null;
    return {plate, votes, preview: prep.preview};
  } finally { await worker.terminate(); }
}
