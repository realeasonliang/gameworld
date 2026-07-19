(function(){
"use strict";
//==================================================================
//  航天模拟器 — 单文件 2D 空间飞行模拟（灵感来自 SFS）
//  特性：多体太阳系 / 多级分离 / 对接 / 丰富零件 / 大气气动 / 漫游车
//==================================================================

const G0 = 9.81;

//==================================================================
//  天体系统（多体，层级轨道；距离为可玩压缩尺度）
//==================================================================
const SUN = { name:'SUN', nameZh:'太阳', nameEn:'Sun', R:600000, mu:1.2e14, color:'#ffcf6b', color2:'#ff8a1f',
              atmo:0, parent:null, a:0, phase:0 };
const TERRA = { name:'TERRA', nameZh:'泰拉(母星)', nameEn:'Terra (Home)', R:200000, mu:G0*200000*200000, color:'#3a7bd5', color2:'#1c4a8a',
              atmo:14000, parent:SUN, a:8.0e6, phase:0 };
const LUNA = { name:'LUNA', nameZh:'月球', nameEn:'Luna', R:50000, mu:1.62*50000*50000, color:'#b9b4a8', color2:'#6e6a60',
              atmo:0, parent:TERRA, a:600000, phase:1.7 };
const VESTA = { name:'VESTA', nameZh:'维斯塔', nameEn:'Vesta', R:120000, mu:3.71*120000*120000, color:'#c0623a', color2:'#7a3a20',
              atmo:0, parent:SUN, a:14.0e6, phase:3.4 };
const JOVE = { name:'JOVE', nameZh:'朱庇特', nameEn:'Jove', R:500000, mu:24.79*500000*500000, color:'#caa46b', color2:'#8a6a3a',
              atmo:800000, parent:SUN, a:26.0e6, phase:5.1 };
const IO = { name:'IO', nameZh:'伊奥', nameEn:'Io', R:80000, mu:1.8*80000*80000, color:'#d9c24a', color2:'#9a8030',
              atmo:0, parent:JOVE, a:1.2e6, phase:0.6 };
const BODIES = [SUN, TERRA, LUNA, VESTA, JOVE, IO];
const LANDABLE = [TERRA, LUNA, VESTA, JOVE, IO]; // 可从表面起飞

// 每帧按层级递归求天体位置/速度（惯性系，日心）
function bodyState(b, t){
  if(!b.parent) return { x:0, y:0, vx:0, vy:0 };
  const p = bodyState(b.parent, t);
  const pm = b.parent.mu;
  const omega = Math.sqrt(pm / (b.a*b.a*b.a));
  const ang = b.phase + omega*t;
  const x = p.x + Math.cos(ang)*b.a;
  const y = p.y + Math.sin(ang)*b.a;
  const v = omega*b.a;
  const vx = p.vx + (-Math.sin(ang))*v;
  const vy = p.vy + ( Math.cos(ang))*v;
  return { x, y, vx, vy };
}
function updateBodies(t){
  for(const b of BODIES){
    const s = bodyState(b, t);
    b.x = s.x; b.y = s.y; b.vx = s.vx; b.vy = s.vy;
  }
  // 预置空间站：绕泰拉圆轨道
  const ts = bodyState(TERRA, t);
  const omega = Math.sqrt(TERRA.mu / (STATION.a*STATION.a*STATION.a));
  const ang = STATION.phase + omega*t;
  STATION.x = ts.x + Math.cos(ang)*STATION.a;
  STATION.y = ts.y + Math.sin(ang)*STATION.a;
  const v = omega*STATION.a;
  STATION.vx = ts.vx + (-Math.sin(ang))*v;
  STATION.vy = ts.vy + ( Math.cos(ang))*v;
}
const STATION = { name:'STATION', nameZh:'空间站', nameEn:'Space Station', a:340000, phase:2.2, x:0, y:0, vx:0, vy:0, R:40 };

//==================================================================
//  零件定义（尺寸单位：米）
//==================================================================
const PARTS = {
  pod:    { name:'指令舱', nameEn:'Command Pod', w:10, h:12, mass:800, color:'#e74c3c', role:'pod', elec:60 },
  probe:  { name:'探测核心', nameEn:'Probe Core', w:8, h:8, mass:300, color:'#9b59b6', role:'pod', elec:40 },
  tankS:  { name:'小燃料罐', nameEn:'Small Tank', w:9, h:16, mass:200, fuel:700, color:'#f1c40f', role:'tank' },
  tankL:  { name:'大燃料罐', nameEn:'Large Tank', w:11, h:28, mass:400, fuel:2000, color:'#f39c12', role:'tank' },
  engS:   { name:'小引擎', nameEn:'Small Engine', w:12, h:10, mass:300, thrust:90000, isp:250, color:'#95a5a6', role:'engine' },
  engL:   { name:'大引擎', nameEn:'Large Engine', w:15, h:14, mass:600, thrust:220000, isp:300, color:'#7f8c8d', role:'engine' },
  sasM:   { name:'姿态控制', nameEn:'SAS Module', w:8, h:8, mass:120, color:'#3498db', role:'sas', elecUse:2 },
  rcs:    { name:'RCS推进器', nameEn:'RCS Thruster', w:9, h:8, mass:150, color:'#1abc9c', role:'rcs', rcsFuel:220, rcsThrust:7000, elecUse:1 },
  decoupler:{ name:'分离器', nameEn:'Decoupler', w:11, h:5, mass:60, color:'#e67e22', role:'decoupler' },
  dock:   { name:'对接端口', nameEn:'Docking Port', w:9, h:6, mass:120, color:'#16a085', role:'dock' },
  leg:    { name:'着陆架', nameEn:'Landing Leg', w:14, h:9, mass:200, color:'#bdc3c7', role:'leg' },
  wheel:  { name:'轮子', nameEn:'Wheel', w:14, h:9, mass:250, color:'#34495e', role:'wheel' },
  solar:  { name:'太阳能板', nameEn:'Solar Panel', w:18, h:4, mass:120, color:'#2980b9', role:'solar', elecGen:10, elec:20 },
  battery:{ name:'电池', nameEn:'Battery', w:9, h:9, mass:150, color:'#27ae60', role:'battery', elec:200 },
  fairing:{ name:'整流罩', nameEn:'Fairing', w:13, h:18, mass:150, color:'#ecf0f1', role:'fairing' },
};
// 建造面板分组
const PALETTE_GROUPS = [
  { title:'核心', titleEn:'Core', items:['pod','probe','tankS','tankL','engS','engL'] },
  { title:'分级 / 对接', titleEn:'Staging / Dock', items:['decoupler','dock','fairing'] },
  { title:'姿态 / 电源', titleEn:'Attitude / Power', items:['sasM','rcs','solar','battery'] },
  { title:'着陆 / 漫游', titleEn:'Landing / Rover', items:['leg','wheel'] },
];

//==================================================================
//  全局状态
//==================================================================
const G = {
  state:'menu',
  parts:['pod','tankL','engL'],   // 顶部→底部
  flips:['pod','tankL','engL'].map(()=>({h:false,v:false})), // 与 parts 一一对应的翻转状态
  selPart:-1,                     // 建造台当前选中的零件下标
  launchBody: TERRA.name,
  ship:null,
  station: STATION,
  docked:false,
  debris:[],
  camera:{x:0,y:0,scale:0.09, targetScale:0.09},
  time:0,
  warp:1, warpIdx:0,
  WARPS:[1,2,5,10,50,200,1000],
  sas:false,
  throttle:0,
  roverDrive:false,
  mapMode:false,
  particles:[],
  stars:[],
  lastT:0,
};

//==================================================================
//  画布
//==================================================================
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let W=0, H=0, DPR=1;
function resize(){
  DPR = Math.min(window.devicePixelRatio||1, 2);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = W*DPR; canvas.height = H*DPR;
  canvas.style.width = W+'px'; canvas.style.height = H+'px';
  ctx.setTransform(DPR,0,0,DPR,0,0);
}
window.addEventListener('resize', resize);
resize();

for(let i=0;i<220;i++){
  G.stars.push({x:Math.random(), y:Math.random(), r:Math.random()*1.4+0.2, a:Math.random()*0.6+0.3});
}

//==================================================================
//  火箭属性计算
//==================================================================
function rocketStats(parts){
  let dry=0, fuel=0, thrust=0, ispNum=0, height=0, width=0;
  let rcsFuel=0, rcsThrust=0, elecCap=0, elecUse=0, elecGen=0;
  let hasLeg=false, hasWheel=false, hasSolar=false, hasDock=false, hasRcs=false;
  let stages=1;
  for(const p of parts){
    const d = PARTS[p];
    dry += d.mass;
    if(d.fuel) fuel += d.fuel;
    if(d.thrust){ thrust += d.thrust; ispNum += d.thrust/d.isp; }
    if(d.rcsFuel){ rcsFuel += d.rcsFuel; rcsThrust += d.rcsThrust; hasRcs=true; }
    if(d.elec)   elecCap += d.elec;
    if(d.elecUse) elecUse += d.elecUse;
    if(d.elecGen) { elecGen += d.elecGen; hasSolar=true; }
    if(d.role==='leg') hasLeg=true;
    if(d.role==='wheel') hasWheel=true;
    if(d.role==='dock') hasDock=true;
    if(d.role==='decoupler') stages++;
    height += d.h;
    if(d.w > width) width = d.w;
  }
  const ispAvg = ispNum>0 ? thrust/ispNum : 0;
  const wet = dry + fuel;
  const twr = thrust>0 ? thrust/(wet*TERRA.mu/(TERRA.R*TERRA.R)) : 0;
  const dv = (ispAvg>0 && fuel>0) ? ispAvg*G0*Math.log(wet/dry) : 0;
  // 分级后（抛掉第一个分离器以下）粗略 Δv 增益
  const dvStaged = estimateStagedDv(parts);
  const burn = (thrust>0 && ispAvg>0) ? fuel/(thrust/(ispAvg*G0)) : 0;
  // 气动阻力面积：以最大宽度估计的迎风截面积（m²），避免过大导致无法起飞
  const dragArea = Math.max(6, width*width*0.05);
  return { dry, fuel, thrust, ispAvg, height, width, wet, twr, dv, dvStaged, burn, dragArea,
           rcsFuel, rcsThrust, hasRcs, elecCap, elecUse, elecGen, hasLeg, hasWheel, hasSolar, hasDock, stages };
}
function estimateStagedDv(parts){
  // 找出最低分离器，把其下部分当作第一级（先烧完再抛），估算二级总 Δv
  let idx=-1;
  for(let i=parts.length-1;i>=0;i--){ if(PARTS[parts[i]].role==='decoupler'){ idx=i; break; } }
  if(idx<0) return 0;
  const lower = parts.slice(idx);
  const upper = parts.slice(0, idx);
  if(upper.length===0) return 0;
  function massOf(list){ let d=0,f=0,t=0,n=0; for(const p of list){ const x=PARTS[p];
    d+=x.mass; if(x.fuel)f+=x.fuel; if(x.thrust){t+=x.thrust;n+=x.thrust/x.isp;} }
    return { dry:d, fuel:f, isp:t>0?t/n:0 }; }
  const L=massOf(lower), U=massOf(upper);
  if(U.isp<=0) return 0;
  // 两级串列 Δv（粗略）
  const dv1 = L.isp>0&&L.fuel>0 ? L.isp*G0*Math.log((L.dry+L.fuel+U.dry+U.fuel)/(L.dry+U.dry+U.fuel)) : 0;
  const dv2 = U.isp*G0*Math.log((U.dry+U.fuel)/U.dry);
  return dv1+dv2;
}

function recomputeShip(sh){
  const s = rocketStats(sh.parts);
  sh.dry = s.dry; sh.thrust = s.thrust; sh.ispAvg = s.ispAvg; sh.height = s.height; sh.dragArea = s.dragArea;
  sh.rcsThrust = s.rcsThrust; sh.hasRcs = s.hasRcs; sh.hasLeg = s.hasLeg; sh.hasWheel = s.hasWheel;
  sh.hasSolar = s.hasSolar; sh.hasDock = s.hasDock;
  // 燃料/电量按比例保留（分级时外部已扣减）
  if(sh.fuel> sh.fuelMax){ sh.fuelMax = sh.fuel; }
  if(sh.rcsFuel> sh.rcsFuelMax){ sh.rcsFuelMax = sh.rcsFuel; }
  sh.radius = sh.height/2;
}

//==================================================================
//  建造模式渲染
//==================================================================
const buildCanvas = document.getElementById('buildCanvas');
const bctx = buildCanvas.getContext('2d');
function buildPartRects(){
  const bw=buildCanvas.width, bh=buildCanvas.height;
  const s=rocketStats(G.parts);
  const scale=3.0;
  const totalH=s.height*scale;
  let y=bh/2 + totalH/2;
  const cx=bw/2;
  const rects=[];
  for(let i=0;i<G.parts.length;i++){
    const d=PARTS[G.parts[i]];
    const ph=d.h*scale, pw=d.w*scale;
    const py=y-ph;
    rects.push({i, key:G.parts[i], cx, py, ph, pw, cy:py+ph/2});
    y=py;
  }
  return rects;
}
// 根据画布内纵坐标判断新零件插入到哪个位置（下标 0 = 底部，越大越靠上）
function insertIndexAt(y){
  const rects=buildPartRects();
  for(let i=0;i<rects.length;i++){ if(y>rects[i].cy) return i; }
  return rects.length;
}
function drawBuild(){
  const bw = buildCanvas.width, bh = buildCanvas.height;
  bctx.clearRect(0,0,bw,bh);
  bctx.fillStyle='#070b14'; bctx.fillRect(0,0,bw,bh);
  const s = rocketStats(G.parts);
  const scale = 3.0;
  const totalH = s.height*scale;
  let y = bh/2 + totalH/2;
  const cx = bw/2;
  bctx.fillStyle='#10233f';
  bctx.fillRect(0, bh-28, bw, 28);
  const rects = buildPartRects();
  for(const r of rects){
    const d = PARTS[r.key];
    const flip = G.flips[r.i] || {h:false,v:false};
    drawPartShape(bctx, r.cx, r.py, r.pw, r.ph, d, 1, flip);
    // 分离器画一条分割线
    if(d.role==='decoupler'){
      bctx.strokeStyle='#ff9a3c'; bctx.lineWidth=2;
      bctx.beginPath(); bctx.moveTo(r.cx-r.pw/2-3, r.py+r.ph/2); bctx.lineTo(r.cx+r.pw/2+3, r.py+r.ph/2); bctx.stroke();
    }
  }
  // 选中高亮
  if(G.selPart>=0 && rects[G.selPart]){
    const r=rects[G.selPart];
    bctx.strokeStyle='#ffd23c'; bctx.lineWidth=2.5;
    bctx.strokeRect(r.cx-r.pw/2-3, r.py-2, r.pw+6, r.ph+4);
  }
  bctx.strokeStyle='rgba(120,160,220,.25)';
  bctx.setLineDash([4,4]);
  bctx.beginPath(); bctx.moveTo(cx, bh-28); bctx.lineTo(cx, bh/2 - totalH/2); bctx.stroke();
  bctx.setLineDash([]);
  updateBuildStats(s);
}
function drawPartShape(c, cx, py, pw, ph, d, alpha, flip){
  c.save(); c.globalAlpha = alpha;
  if(flip && (flip.h||flip.v)){
    const cy = py+ph/2;
    c.translate(cx, cy); c.scale(flip.h?-1:1, flip.v?-1:1); c.translate(-cx, -cy);
  }
  c.fillStyle = d.color;
  roundRect(c, cx-pw/2, py, pw, ph, 3); c.fill();
  c.strokeStyle='rgba(0,0,0,.4)'; c.lineWidth=1; c.stroke();
  if(d.role==='pod'){
    c.fillStyle='rgba(255,255,255,.85)'; c.fillRect(cx-2, py+2, 4, 4);
  } else if(d.role==='tank'){
    c.fillStyle='rgba(0,0,0,.18)';
    c.fillRect(cx-pw/2, py+ph*0.35, pw, 2);
    c.fillRect(cx-pw/2, py+ph*0.6, pw, 2);
  } else if(d.role==='engine'){
    c.fillStyle='rgba(0,0,0,.55)';
    c.beginPath(); c.moveTo(cx-pw/2, py+ph); c.lineTo(cx+pw/2, py+ph);
    c.lineTo(cx+pw*0.3, py+ph+6); c.lineTo(cx-pw*0.3, py+ph+6); c.closePath(); c.fill();
  } else if(d.role==='sas'){
    c.fillStyle='rgba(255,255,255,.6)'; c.fillRect(cx-pw*0.2, py+ph*0.2, pw*0.4, ph*0.6);
  } else if(d.role==='rcs'){
    c.fillStyle='rgba(255,255,255,.5)'; c.fillRect(cx-pw*0.5, py+ph*0.3, 3, ph*0.4);
    c.fillRect(cx+pw*0.5-3, py+ph*0.3, 3, ph*0.4);
  } else if(d.role==='leg'){
    c.strokeStyle='rgba(255,255,255,.7)'; c.lineWidth=2;
    c.beginPath(); c.moveTo(cx-pw*0.3, py+ph); c.lineTo(cx-pw*0.5, py+ph+4);
    c.moveTo(cx+pw*0.3, py+ph); c.lineTo(cx+pw*0.5, py+ph+4); c.stroke();
  } else if(d.role==='wheel'){
    c.fillStyle='#111'; c.beginPath(); c.arc(cx-pw*0.3, py+ph, 3, 0, 7); c.fill();
    c.beginPath(); c.arc(cx+pw*0.3, py+ph, 3, 0, 7); c.fill();
  } else if(d.role==='dock'){
    c.strokeStyle='#16a085'; c.lineWidth=2; c.strokeRect(cx-pw*0.4, py+ph*0.2, pw*0.8, ph*0.6);
  } else if(d.role==='solar'){
    c.fillStyle='rgba(120,200,255,.8)'; c.fillRect(cx-pw/2, py, pw, ph);
  } else if(d.role==='decoupler'){
    c.fillStyle='#ff9a3c'; c.fillRect(cx-pw/2, py+ph/2-1, pw, 2);
  } else if(d.role==='fairing'){
    c.fillStyle='rgba(255,255,255,.5)'; c.beginPath();
    c.moveTo(cx-pw/2,py); c.quadraticCurveTo(cx,py-ph*0.6,cx+pw/2,py); c.fill();
  }
  c.restore();
}
function roundRect(c,x,y,w,h,r){
  r=Math.min(r,w/2,h/2);
  c.beginPath();
  c.moveTo(x+r,y); c.arcTo(x+w,y,x+w,y+h,r); c.arcTo(x+w,y+h,x,y+h,r);
  c.arcTo(x,y+h,x,y,r); c.arcTo(x,y,x+w,y,r); c.closePath();
}
function updateBuildStats(s){
  const el = document.getElementById('buildStats');
  G.lastBuildStats = s;
  const twrCls = s.twr>=1.0 ? 'ok' : 'warn';
  const dvShow = s.dvStaged>0 ? `${fmt(s.dv)} (${i18n.t('sfs_staged')} ${fmt(s.dvStaged)})` : fmt(s.dv);
  const has = i18n.t('sfs_yes'), none = i18n.t('sfs_no');
  el.innerHTML =
    `${i18n.t('sfs_total_mass')}：<b>${fmt(s.wet)} kg</b> （${i18n.t('sfs_dry')} ${fmt(s.dry)} + ${i18n.t('sfs_fuel')} ${fmt(s.fuel)}）<br>`+
    `${i18n.t('sfs_thrust')}：<b>${fmt(s.thrust)} N</b><br>`+
    `${i18n.t('sfs_twr')}：<span class="${twrCls}">${s.twr.toFixed(2)}</span> ${s.twr<1?'（'+i18n.t('sfs_twr_low')+'）':''}<br>`+
    `${i18n.t('sfs_isp')}：<b>${s.ispAvg.toFixed(0)} s</b><br>`+
    `Δv ${i18n.t('sfs_dv')}：<b>${dvShow} m/s</b><br>`+
    `${i18n.t('sfs_burn')}：<b>${s.burn.toFixed(1)} s</b><br>`+
    `${i18n.t('sfs_stages')}：<b>${s.stages}</b> · RCS${i18n.t('sfs_fuel')}：<b>${fmt(s.rcsFuel)}</b><br>`+
    `${i18n.t('sfs_elec_cap')}：<b>${fmt(s.elecCap)}</b> · ${i18n.t('sfs_elec_gen')}：<b>${s.elecGen}/s</b><br>`+
    `${i18n.t('sfs_leg')}：${s.hasLeg?has:none} · ${i18n.t('sfs_wheel')}：${s.hasWheel?has:none} · ${i18n.t('sfs_dock_port')}：${s.hasDock?has:none}<br>`+
    `${i18n.t('sfs_height')}：<b>${s.height.toFixed(0)} m</b>`;
}
function fmt(n){ return Math.round(n).toLocaleString('en-US'); }

// 发射天体选择
const bodySel = document.getElementById('bodySel');
function bodyName(b){ return i18n.lang==='zh' ? (b.nameZh||b.name) : (b.nameEn||b.name); }
function partName(p){ return i18n.lang==='zh' ? (p.name||p.nameEn) : (p.nameEn||p.name); }
function buildBodySel(){
  bodySel.innerHTML='';
  LANDABLE.forEach(b=>{
    const el=document.createElement('div');
    el.className='bb'+(b.name===G.launchBody?' on':'');
    el.textContent=bodyName(b);
    el.onclick=()=>{ G.launchBody=b.name; [...bodySel.children].forEach(c=>c.classList.remove('on')); el.classList.add('on'); };
    bodySel.appendChild(el);
  });
}
buildBodySel();

// 零件按钮
const partList = document.getElementById('partList');
function addPart(key, index){
  if(index===undefined || index<0 || index>G.parts.length) index=G.parts.length;
  G.parts.splice(index,0,key);
  G.flips.splice(index,0,{h:false,v:false});
  drawBuild();
}
function buildPartList(){
  partList.innerHTML='';
  PALETTE_GROUPS.forEach(grp=>{
    const h=document.createElement('div'); h.className='grp'; h.textContent = i18n.lang==='zh'?grp.title:grp.titleEn; partList.appendChild(h);
    grp.items.forEach(key=>{
      const d=PARTS[key];
      const b=document.createElement('div'); b.className='partBtn'; b.draggable=true;
      let info=`质量 ${d.mass}`;
      if(d.fuel) info+=` · 燃料 ${d.fuel}`;
      if(d.thrust) info+=` · 推力 ${fmt(d.thrust)}N`;
      if(d.rcsFuel) info+=` · RCS ${d.rcsFuel}`;
      if(d.elec) info+=` · 电 ${d.elec}`;
      if(d.elecGen) info+=` · +${d.elecGen}/s`;
      b.innerHTML=`<span>${partName(d)}</span><small>${info}</small>`;
      b.title='拖拽到火箭上添加（或点击加入顶部）';
      b.ondragstart=(e)=>{ e.dataTransfer.setData('text/plain', key); e.dataTransfer.effectAllowed='copy'; };
      b.onclick=()=>{ addPart(key, -1); };
      partList.appendChild(b);
    });
  });
}
buildPartList();
// 建造画布：拖放添加 + 点击选中
buildCanvas.ondragover=(e)=>{ e.preventDefault(); e.dataTransfer.dropEffect='copy'; buildCanvas.classList.add('drop'); };
buildCanvas.ondragleave=()=>{ buildCanvas.classList.remove('drop'); };
buildCanvas.ondrop=(e)=>{
  e.preventDefault(); buildCanvas.classList.remove('drop');
  const key=e.dataTransfer.getData('text/plain');
  if(!PARTS[key]) return;
  const rect=buildCanvas.getBoundingClientRect();
  const y=(e.clientY-rect.top)*(buildCanvas.height/rect.height);
  const idx=insertIndexAt(y);
  addPart(key, idx); G.selPart=idx; drawBuild();
};
buildCanvas.onclick=(e)=>{
  const rect=buildCanvas.getBoundingClientRect();
  const y=(e.clientY-rect.top)*(buildCanvas.height/rect.height);
  const rects=buildPartRects();
  let sel=-1;
  for(const r of rects){ if(y>=r.py && y<=r.py+r.ph){ sel=r.i; break; } }
  G.selPart=sel; drawBuild();
};
function flipSel(axis){
  const idx = G.selPart>=0 ? G.selPart : G.parts.length-1;
  if(idx<0) return;
  G.flips[idx]=G.flips[idx]||{h:false,v:false};
  G.flips[idx][axis]=!G.flips[idx][axis];
  drawBuild();
}
document.getElementById('flipVBtn').onclick=()=>flipSel('v');
document.getElementById('flipHBtn').onclick=()=>flipSel('h');
document.getElementById('removeBtn').onclick=()=>{
  const idx = G.selPart>=0 ? G.selPart : G.parts.length-1;
  if(G.parts.length>1 && G.parts[idx]!=='pod' && G.parts[idx]!=='probe'){
    G.parts.splice(idx,1); G.flips.splice(idx,1);
    if(G.selPart>=G.parts.length) G.selPart=G.parts.length-1;
    drawBuild();
  }
};
document.getElementById('clearBtn').onclick=()=>{ G.parts=['pod']; G.flips=[{h:false,v:false}]; G.selPart=-1; drawBuild(); };

//==================================================================
//  发射 → 飞行状态
//==================================================================
function findBody(name){ return BODIES.find(b=>b.name===name) || TERRA; }
function startFlight(){
  updateBodies(G.time);
  const body = findBody(G.launchBody);
  const s = rocketStats(G.parts);
  const halfH = s.height/2;
  // 朝外法线：相对父天体（行星相对太阳，卫星相对行星），保证贴在天体表面正确法线
  const px = body.parent ? body.parent.x : 0;
  const py = body.parent ? body.parent.y : 0;
  let out = { x: body.x - px, y: body.y - py };
  const ol = Math.hypot(out.x, out.y) || 1;
  out.x/=ol; out.y/=ol;
  const angle = Math.atan2(out.x, -out.y); // 使 fdir=(sin,-cos) 指向外
  const ship = {
    x: body.x + out.x*(body.R + halfH + 4),
    y: body.y + out.y*(body.R + halfH + 4),
    vx: body.vx, vy: body.vy,
    angle, angVel:0,
    parts: G.parts.slice(),
    flips: G.flips.slice(),
    dry:0, fuel:s.fuel, fuelMax:s.fuel, thrust:0, ispAvg:0,
    rcsFuel:s.rcsFuel, rcsFuelMax:s.rcsFuel, rcsThrust:0,
    elec:s.elecCap, elecMax:s.elecCap, elecUse:s.elecUse, elecGen:s.elecGen,
    height:s.height, radius:halfH,
    hasLeg:s.hasLeg, hasWheel:s.hasWheel, hasSolar:s.hasSolar, hasDock:s.hasDock,
    onGround:false, alive:true,
  };
  recomputeShip(ship);
  G.ship = ship;
  G.debris = [];
  G.particles = [];
  G.time = 0;
  G.warp = 1; G.warpIdx = 0;
  G.throttle = 0; G.sas = false; G.roverDrive=false; G.docked=false;
  G.camera.x = ship.x; G.camera.y = ship.y;
  G.camera.scale = 0.09; G.camera.targetScale = 0.09;
  G.state = 'flight';
  showState();
}

//==================================================================
//  物理：多体引力 + 推力 + 积分
//==================================================================
function gravityAt(x,y, soft){
  let ax=0, ay=0;
  const eps = soft||1;
  for(const b of BODIES){
    const dx=b.x-x, dy=b.y-y;
    let r2=dx*dx+dy*dy; if(r2<1) r2=1;
    const r=Math.sqrt(r2);
    const a=b.mu/(r2+eps*eps);
    ax+=a*dx/r; ay+=a*dy/r;
  }
  return {ax, ay};
}
function dominantBody(x,y){
  let best=null, bestG=-1;
  for(const b of BODIES){
    if(b===SUN) continue;
    const dx=b.x-x, dy=b.y-y; const r2=dx*dx+dy*dy;
    const g=b.mu/r2;
    if(g>bestG){ bestG=g; best=b; }
  }
  return best;
}

function physicsStep(dt){
  const sh = G.ship;
  if(!sh || !sh.alive) return;
  if(G.docked) return; // 对接时由对接逻辑驱动

  // 着陆后点火起飞
  if(sh.onGround && G.throttle>0 && sh.fuel>0 && sh.thrust>0 && !G.roverDrive){
    sh.onGround=false; G.state='flight';
  }

  // 旋转控制
  const rotAuth = (sh.parts.includes('sasM')||sh.parts.includes('pod')||sh.parts.includes('probe')) ? 2.6 : 1.5;
  if(keys.left)  sh.angVel -= rotAuth*dt;
  if(keys.right) sh.angVel += rotAuth*dt;
  if(G.sas && sh.elec>0){
    sh.angVel *= Math.pow(0.02, dt);
    sh.angle  *= Math.pow(0.2, dt);
  } else if(!G.sas){
    sh.angVel *= Math.pow(0.5, dt);
  }
  sh.angVel = Math.max(-2.5, Math.min(2.5, sh.angVel));
  sh.angle += sh.angVel*dt;

  const g = gravityAt(sh.x, sh.y);
  let ax=g.ax, ay=g.ay;
  const curMass = sh.dry + sh.fuel;
  const fdir = { x:Math.sin(sh.angle), y:-Math.cos(sh.angle) };
  const right= { x:Math.cos(sh.angle), y: Math.sin(sh.angle) };

  // 主引擎推力
  let thrusting=false;
  const engineOn = (G.throttle>0 && sh.fuel>0 && sh.thrust>0 && !(sh.onGround&&G.roverDrive));
  if(engineOn){
    const F=G.throttle*sh.thrust;
    ax += F*fdir.x/curMass; ay += F*fdir.y/curMass;
    const burnRate = sh.thrust/(sh.ispAvg*G0);
    sh.fuel=Math.max(0, sh.fuel - burnRate*G.throttle*dt);
    thrusting=true;
    spawnExhaust(fdir, dt, G.throttle);
  }

  // RCS 平移
  if(sh.hasRcs && sh.rcsFuel>0 && sh.elec>0 && (keys.tup||keys.tdown||keys.tleft||keys.tright)){
    const F = sh.rcsThrust;
    let dx=0, dy=0;
    if(keys.tup){ dx+=fdir.x; dy+=fdir.y; }
    if(keys.tdown){ dx-=fdir.x; dy-=fdir.y; }
    if(keys.tright){ dx+=right.x; dy+=right.y; }
    if(keys.tleft){ dx-=right.x; dy-=right.y; }
    const m=Math.hypot(dx,dy)||1;
    ax += F*(dx/m)/curMass; ay += F*(dy/m)/curMass;
    sh.rcsFuel=Math.max(0, sh.rcsFuel - 6*dt);
    sh.elec=Math.max(0, sh.elec - sh.elecUse*dt);
    spawnRCS(fdir, dt);
  }

  // 漫游车驾驶
  if(sh.onGround && sh.hasWheel && G.roverDrive){
    const drive = 5000;
    if(keys.up){ ax += right.x*drive/curMass; ay += right.y*drive/curMass; }
    if(keys.down){ ax -= right.x*drive/curMass; ay -= right.y*drive/curMass; }
  }

  // 电量：SAS / 发电
  if(G.sas && sh.elec>0) sh.elec=Math.max(0, sh.elec - sh.elecUse*dt);
  if(sh.hasSolar && isSunlit(sh.x, sh.y)){
    sh.elec=Math.min(sh.elecMax, sh.elec + sh.elecGen*dt);
  }

  // 大气阻力（使用相对天体的速度，避免发射时轨道速度造成虚假阻力；并数值钳制防发散）
  const dom = dominantBody(sh.x, sh.y);
  if(dom && dom.atmo>0){
    const dx=sh.x-dom.x, dy=sh.y-dom.y; const r=Math.hypot(dx,dy);
    if(r < dom.R + dom.atmo){
      const altFrac = Math.max(0, (r-dom.R)/dom.atmo); // 0 表面 → 1 顶部
      const rho = 0.4*Math.pow(1-altFrac, 2.2);        // 密度随高度衰减（较稀薄，保证可发射）
      const rvx = sh.vx - dom.vx, rvy = sh.vy - dom.vy; // 相对天体速度
      const sp = Math.hypot(rvx, rvy);
      if(sp>0){
        const Cd=0.18, A=sh.dragArea;
        let aDrag = 0.5*rho*sp*sp*Cd*A/curMass;
        const maxDec = sp/dt*0.5;     // 单步最多减当前相对速度的一半，防止显式欧拉发散
        if(aDrag>maxDec) aDrag=maxDec;
        const dec = aDrag*dt;
        ax -= dec*(rvx/sp); ay -= dec*(rvy/sp);
        if(sp>300) spawnAero(sp);
      }
    }
  }

  // 积分（半隐式欧拉）
  sh.vx += ax*dt; sh.vy += ay*dt;
  sh.x  += sh.vx*dt; sh.y += sh.vy*dt;

  // 地面约束（相对天体速度）
  if(sh.onGround){
    const dx=sh.x-dom.x, dy=sh.y-dom.y; const r=Math.hypot(dx,dy)||1;
    const out={x:dx/r, y:dy/r};
    let rvx=sh.vx-dom.vx, rvy=sh.vy-dom.vy;
    const vn = rvx*out.x + rvy*out.y;
    if(vn<0){ rvx -= vn*out.x; rvy -= vn*out.y; } // 取消向心相对速度
    // 漫游车限速
    if(G.roverDrive){
      const ts=Math.hypot(rvx,rvy);
      if(ts>30){ const k=30/ts; rvx*=k; rvy*=k; }
    }
    sh.vx = dom.vx + rvx; sh.vy = dom.vy + rvy;
    // 贴回表面
    sh.x = dom.x + out.x*(dom.R+sh.radius);
    sh.y = dom.y + out.y*(dom.R+sh.radius);
  }

  // 碰撞 / 着陆 / 坠毁
  for(const b of BODIES){ if(!sh.alive) break; checkCollision(b); }
  // 对接检测
  if(sh.alive && sh.hasDock && !sh.onGround) checkDock();
}

function checkCollision(body){
  const sh=G.ship;
  const dx=sh.x-body.x, dy=sh.y-body.y;
  const r=Math.hypot(dx,dy);
  const surf=body.R+sh.radius;
  if(r<surf){
    const out={x:dx/r, y:dy/r};
    // 用相对天体的速度判定着陆/坠毁（天体自身在轨道上高速运动）
    const rvx=sh.vx-body.vx, rvy=sh.vy-body.vy;
    const speed=Math.hypot(rvx,rvy);
    const up={x:Math.sin(sh.angle), y:-Math.cos(sh.angle)};
    const align=up.x*out.x+up.y*out.y;
    const vn=rvx*out.x+rvy*out.y;
    // 着陆容差：有着陆架更宽松
    const maxSpeed = sh.hasLeg ? 110 : 60;
    const minAlign = sh.hasLeg ? 0.45 : 0.85;
    if(speed<maxSpeed && align>minAlign){
      sh.x=body.x+out.x*surf; sh.y=body.y+out.y*surf;
      if(vn<0){ sh.vx-=vn*out.x; sh.vy-=vn*out.y; }
      sh.onGround=true;
      const lifting=(G.throttle>0 && sh.fuel>0 && sh.thrust>0 && !G.roverDrive);
      if(lifting){ G.state='flight'; }
      else if(G.state==='flight'){ G.state='landed'; }
    } else {
      crash(body);
    }
  }
}

function crash(body){
  const sh=G.ship;
  sh.alive=false;
  for(let i=0;i<60;i++){
    const a=Math.random()*Math.PI*2; const sp=Math.random()*120+20;
    G.particles.push({ x:sh.x, y:sh.y, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp,
      life:1, max:1, size:Math.random()*4+2, color: Math.random()<0.5?'#ff7b3a':'#ffd24a' });
  }
  G.state='crashed';
  showEnd(false, body);
}

function isSunlit(x,y){
  const sx=SUN.x, sy=SUN.y;
  const sdx=sx-x, sdy=sy-y; const sl=Math.hypot(sdx,sdy)||1;
  const sunDir={x:sdx/sl, y:sdy/sl};
  for(const b of BODIES){
    if(b===SUN) continue;
    const dx=b.x-x, dy=b.y-y;
    const t=dx*sunDir.x+dy*sunDir.y;
    if(t<=0) continue;
    const px=dx-t*sunDir.x, py=dy-t*sunDir.y;
    if(Math.hypot(px,py) < b.R) return false;
  }
  return true;
}

// 尾焰
function spawnExhaust(fdir, dt, thr){
  const sh=G.ship;
  const bx=sh.x - fdir.x*(sh.height/2);
  const by=sh.y - fdir.y*(sh.height/2);
  const n=Math.ceil(thr*6);
  for(let i=0;i<n;i++){
    const spread=(Math.random()-0.5)*0.5; const ca=Math.cos(spread), sa=Math.sin(spread);
    const dx=fdir.x*ca - fdir.y*sa, dy=fdir.x*sa + fdir.y*ca;
    const sp=(Math.random()*60+80)*thr;
    G.particles.push({ x:bx, y:by, vx:dx*sp+sh.vx, vy:dy*sp+sh.vy,
      life:0.6, max:0.6, size:Math.random()*3+2, color:'#ffb24a' });
  }
}
function spawnRCS(fdir, dt){
  const sh=G.ship;
  for(let i=0;i<2;i++){
    const a=Math.random()*Math.PI*2;
    G.particles.push({ x:sh.x, y:sh.y, vx:Math.cos(a)*40+sh.vx, vy:Math.sin(a)*40+sh.vy,
      life:0.4, max:0.4, size:2, color:'#9fffe0' });
  }
}
function spawnAero(sp){
  const sh=G.ship;
  for(let i=0;i<2;i++){
    const a=Math.random()*Math.PI*2;
    G.particles.push({ x:sh.x+ (Math.random()-0.5)*20, y:sh.y+(Math.random()-0.5)*20,
      vx:Math.cos(a)*sp*0.2, vy:Math.sin(a)*sp*0.2, life:0.5, max:0.5,
      size:Math.random()*3+2, color:'#ff9a5a' });
  }
}
function updateParticles(dt){
  for(let i=G.particles.length-1;i>=0;i--){
    const p=G.particles[i];
    p.x+=p.vx*dt; p.y+=p.vy*dt;
    p.vx*=Math.pow(0.4,dt); p.vy*=Math.pow(0.4,dt);
    p.life-=dt;
    if(p.life<=0) G.particles.splice(i,1);
  }
  if(G.particles.length>1400) G.particles.splice(0, G.particles.length-1400);
}

//==================================================================
//  多级分离
//==================================================================
function stage(){
  const sh=G.ship; if(!sh||!sh.alive) return;
  // 找最低分离器
  let idx=-1;
  for(let i=sh.parts.length-1;i>=0;i--){ if(PARTS[sh.parts[i]].role==='decoupler'){ idx=i; break; } }
  if(idx<0){
    // 若无分离器，尝试抛掉最底部的整流罩
    if(sh.parts.length>1 && PARTS[sh.parts[sh.parts.length-1]].role==='fairing'){
      const li=sh.parts.length-1;
      jettison(sh.parts.slice(li), sh.parts.slice(0, li), (sh.flips||[]).slice(li), (sh.flips||[]).slice(0, li));
    }
    return;
  }
  const dropParts = sh.parts.slice(idx);          // 含分离器及以下
  const keepParts = sh.parts.slice(0, idx);
  const dropFlips = (sh.flips||[]).slice(idx);
  const keepFlips = (sh.flips||[]).slice(0, idx);
  jettison(dropParts, keepParts, dropFlips, keepFlips);
}
function jettison(dropParts, keepParts, dropFlips, keepFlips){
  const sh=G.ship;
  // 计算被抛部分的质量/燃料
  let dm=0, df=0, dr=0;
  for(const p of dropParts){ const d=PARTS[p]; dm+=d.mass; if(d.fuel) df+=d.fuel; if(d.rcsFuel) dr+=d.rcsFuel; }
  // 残骸
  const fdir={x:Math.sin(sh.angle), y:-Math.cos(sh.angle)};
  const kick=10;
  G.debris.push({ parts:dropParts, flips:dropFlips||[], x:sh.x, y:sh.y,
    vx:sh.vx - fdir.x*kick, vy:sh.vy - fdir.y*kick,
    angle:sh.angle, angVel:0.4, life:9999 });
  if(G.debris.length>14) G.debris.shift();
  // 主动飞船更新
  sh.parts = keepParts;
  sh.flips = (keepFlips && keepFlips.length===keepParts.length) ? keepFlips : keepParts.map(()=>({h:false,v:false}));
  recomputeShip(sh);
  sh.fuel = Math.max(0, sh.fuel - df);
  sh.fuelMax = sh.fuel;
  sh.rcsFuel = Math.max(0, sh.rcsFuel - dr);
  sh.rcsFuelMax = sh.rcsFuel;
  sh.elecMax = rocketStats(keepParts).elecCap;
}
function updateDebris(dt){
  for(let i=G.debris.length-1;i>=0;i--){
    const d=G.debris[i];
    const g=gravityAt(d.x,d.y);
    d.vx+=g.ax*dt; d.vy+=g.ay*dt; d.x+=d.vx*dt; d.y+=d.vy*dt; d.angle+=d.angVel*dt;
    // 撞天体则消失
    let hit=false;
    for(const b of BODIES){ if(Math.hypot(d.x-b.x,d.y-b.y) < b.R){ hit=true; break; } }
    if(hit) G.debris.splice(i,1);
  }
}

//==================================================================
//  对接
//==================================================================
function checkDock(){
  const sh=G.ship; const st=G.station;
  const dx=st.x-sh.x, dy=st.y-sh.y; const dist=Math.hypot(dx,dy);
  if(dist>DOCK_RANGE) return;
  const relvx=sh.vx-st.vx, relvy=sh.vy-st.vy;
  const relsp=Math.hypot(relvx,relvy);
  // 端口朝向：简化判定——火箭“上”方向指向空间站
  const toSt={x:dx/dist, y:dy/dist};
  const up={x:Math.sin(sh.angle), y:-Math.cos(sh.angle)};
  const align=up.x*toSt.x+up.y*toSt.y;
  if(relsp<6 && align>0.6){
    G.docked=true; G.dockMsg=i18n.t('sfs_docked')+' '+bodyName(st)+' · '+i18n.t('sfs_undock');
  }
}
function dockKeep(){
  const sh=G.ship; const st=G.station;
  sh.x=st.x; sh.y=st.y; sh.vx=st.vx; sh.vy=st.vy;
}
function undock(){
  const sh=G.ship;
  G.docked=false; G.dockMsg='';
  const fdir={x:Math.sin(sh.angle), y:-Math.cos(sh.angle)};
  sh.x += fdir.x*60; sh.y += fdir.y*60;
  sh.vx += fdir.x*3; sh.vy += fdir.y*3;
}
const DOCK_RANGE=45;

//==================================================================
//  轨道根数（相对主导天体）
//==================================================================
function orbitInfo(body){
  const sh=G.ship;
  const rx=sh.x-body.x, ry=sh.y-body.y;
  const r=Math.hypot(rx,ry);
  const vx=sh.vx-body.vx, vy=sh.vy-body.vy;
  const v=Math.hypot(vx,vy);
  const energy=v*v/2 - body.mu/r;
  if(energy>=0) return { escape:true };
  const a=-body.mu/(2*energy);
  const h=rx*vy - ry*vx;
  const e=Math.sqrt(Math.max(0, 1 + 2*energy*h*h/(body.mu*body.mu)));
  const ap=a*(1+e)-body.R;
  const pe=a*(1-e)-body.R;
  return { a, e, ap, pe, escape:false };
}

//==================================================================
//  轨迹预测（无推力，天体位置固定）
//==================================================================
function predictPath(steps, dt){
  const sh=G.ship;
  let x=sh.x, y=sh.y, vx=sh.vx, vy=sh.vy;
  const pts=[{x,y}];
  for(let i=0;i<steps;i++){
    const g=gravityAt(x,y,1);
    vx+=g.ax*dt; vy+=g.ay*dt; x+=vx*dt; y+=vy*dt;
    pts.push({x,y});
    let stop=false;
    for(const b of BODIES){ if(Math.hypot(x-b.x,y-b.y) < b.R){ stop=true; break; } }
    if(stop) break;
  }
  return pts;
}

//==================================================================
//  渲染
//==================================================================
function worldToScreen(wx,wy){
  const cx=W/2, cy=H/2;
  return { x: cx+(wx-G.camera.x)*G.camera.scale, y: cy+(wy-G.camera.y)*G.camera.scale };
}
function render(){
  ctx.clearRect(0,0,W,H);
  for(const st of G.stars){
    ctx.globalAlpha=st.a; ctx.fillStyle='#fff';
    ctx.fillRect(st.x*W, st.y*H, st.r, st.r);
  }
  ctx.globalAlpha=1;
  if(G.state==='menu') return;

  const sc=G.camera.scale;
  for(const b of BODIES) drawBody(b, sc, b===SUN||b===TERRA||b===JOVE);
  drawStation(sc);

  if(G.mapMode){
    // 天体轨道
    for(const b of BODIES){
      if(!b.parent) continue;
      const c0=worldToScreen(b.parent.x, b.parent.y);
      ctx.strokeStyle='rgba(150,170,210,.30)'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.arc(c0.x, c0.y, b.a*sc, 0, Math.PI*2); ctx.stroke();
    }
    // 空间站轨道（绕泰拉）
    const tc=worldToScreen(TERRA.x, TERRA.y);
    ctx.strokeStyle='rgba(120,220,160,.35)';
    ctx.beginPath(); ctx.arc(tc.x, tc.y, STATION.a*sc, 0, Math.PI*2); ctx.stroke();
    // 轨迹预测
    const path=predictPath(2500, 3);
    ctx.strokeStyle='rgba(80,230,255,.9)'; ctx.lineWidth=1.5;
    ctx.beginPath();
    for(let i=0;i<path.length;i++){ const s=worldToScreen(path[i].x,path[i].y);
      if(i===0) ctx.moveTo(s.x,s.y); else ctx.lineTo(s.x,s.y); }
    ctx.stroke();
  }

  // 残骸
  for(const d of G.debris) drawDebris(d, sc);

  // 粒子
  for(const p of G.particles){
    const s=worldToScreen(p.x,p.y);
    ctx.globalAlpha=Math.max(0,p.life/p.max);
    ctx.fillStyle=p.color;
    const sz=p.size*Math.max(0.4, sc*8);
    ctx.fillRect(s.x-sz/2, s.y-sz/2, sz, sz);
  }
  ctx.globalAlpha=1;

  if(G.ship && G.ship.alive) drawShip();
}
function drawBody(b, sc, isBig){
  const s=worldToScreen(b.x,b.y);
  const rad=b.R*sc;
  if(s.x+rad<-80 && s.y+rad<-80) return;
  if(rad<0.6) return;
  if(b.atmo>0 && rad+b.atmo*sc>1){
    const g=ctx.createRadialGradient(s.x,s.y,rad, s.x,s.y, rad+b.atmo*sc);
    g.addColorStop(0,'rgba(120,170,255,.22)'); g.addColorStop(1,'rgba(120,170,255,0)');
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(s.x,s.y, rad+b.atmo*sc, 0, Math.PI*2); ctx.fill();
  }
  const g2=ctx.createRadialGradient(s.x-rad*0.3, s.y-rad*0.3, rad*0.1, s.x, s.y, rad);
  g2.addColorStop(0, b.color); g2.addColorStop(1, b.color2);
  ctx.fillStyle=g2; ctx.beginPath(); ctx.arc(s.x,s.y,rad,0,Math.PI*2); ctx.fill();
  if(isBig){ ctx.strokeStyle='rgba(180,210,255,.25)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.arc(s.x,s.y,rad,0,Math.PI*2); ctx.stroke(); }
  // 名称
  if(rad>6){ ctx.fillStyle='rgba(220,235,255,.7)'; ctx.font='11px sans-serif';
    ctx.textAlign='center'; ctx.fillText(b.name, s.x, s.y-rad-6); ctx.textAlign='left'; }
}
function drawStation(sc){
  const st=G.station; const s=worldToScreen(st.x,st.y); const r=Math.max(3, st.R*sc);
  ctx.save(); ctx.translate(s.x,s.y);
  ctx.strokeStyle='#7fffb0'; ctx.fillStyle='rgba(40,80,60,.8)'; ctx.lineWidth=2;
  ctx.fillRect(-r, -r*0.4, r*2, r*0.8);
  ctx.strokeRect(-r, -r*0.4, r*2, r*0.8);
  ctx.beginPath(); ctx.moveTo(-r,-r*0.4); ctx.lineTo(-r*1.6, -r); ctx.lineTo(-r*1.6, r); ctx.lineTo(-r,r*0.4); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(r,-r*0.4); ctx.lineTo(r*1.6, -r); ctx.lineTo(r*1.6, r); ctx.lineTo(r,r*0.4); ctx.stroke();
  ctx.fillStyle='#7fffb0'; ctx.font='10px sans-serif'; ctx.textAlign='center';
  ctx.fillText(st.name, 0, -r-6); ctx.textAlign='left';
  ctx.restore();
}
function drawDebris(d, sc){
  const s=worldToScreen(d.x,d.y);
  ctx.save(); ctx.translate(s.x,s.y); ctx.rotate(d.angle);
  let yOff=0; const parts=d.parts;
  // 简化：画整体小块
  ctx.fillStyle='#888';
  const h=18*sc, w=10*sc;
  ctx.fillRect(-w/2,-h/2,w,h);
  ctx.restore();
}
function drawShip(){
  const sh=G.ship;
  const s=worldToScreen(sh.x, sh.y);
  const sc=G.camera.scale;
  ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(sh.angle);
  let yOff=sh.height/2*sc;
  for(let i=sh.parts.length-1;i>=0;i--){
    const d=PARTS[sh.parts[i]];
    const ph=d.h*sc, pw=d.w*sc;
    const py=yOff-ph/2;
    drawPartShape(ctx, 0, py, pw, ph, d, 1, (sh.flips && sh.flips[i]) || {h:false,v:false});
    yOff-=ph;
  }
  // 对接端口高亮
  ctx.restore();
}

//==================================================================
//  HUD
//==================================================================
function updateHUD(){
  if(G.state!=='flight' && G.state!=='landed') return;
  const sh=G.ship;
  const dom=dominantBody(sh.x, sh.y);
  const rx=sh.x-dom.x, ry=sh.y-dom.y;
  const r=Math.hypot(rx,ry);
  const alt=r-dom.R;
  const vx=sh.vx-dom.vx, vy=sh.vy-dom.vy;
  const speed=Math.hypot(vx,vy);
  const orb=orbitInfo(dom);
  let apTxt='—', peTxt='—';
  if(orb.escape){ apTxt='逃逸'; peTxt='逃逸'; }
  else { apTxt=(orb.ap/1000).toFixed(0)+' km'; peTxt=(orb.pe/1000).toFixed(0)+' km'; }
  const fuelPct=sh.fuelMax>0? sh.fuel/sh.fuelMax*100:0;
  const rcsPct=sh.rcsFuelMax>0? sh.rcsFuel/sh.rcsFuelMax*100:0;
  const elecPct=sh.elecMax>0? sh.elec/sh.elecMax*100:0;
  const el=document.getElementById('telemetry');
  const altCls=alt>0?'good':'bad';
  const stTxt = G.docked? '<span class="v good">'+i18n.t('sfs_docked')+'</span>'
    : sh.onGround? (G.roverDrive?'<span class="v">'+i18n.t('sfs_rover_mode')+'</span>':'<span class="v good">'+i18n.t('sfs_landed')+'</span>')
    : '<span class="v">'+i18n.t('sfs_flying')+'</span>';
  el.innerHTML =
    `<div><span class="k">${i18n.t('sfs_body')}</span> <span class="v">${bodyName(dom)}</span></div>`+
    `<div><span class="k">${i18n.t('sfs_alt')}</span> <span class="v ${altCls}">${(alt/1000).toFixed(1)} km</span></div>`+
    `<div><span class="k">${i18n.t('sfs_speed')}</span> <span class="v">${speed.toFixed(1)} m/s</span></div>`+
    `<div><span class="k">${i18n.t('sfs_ap')}</span> <span class="v">${apTxt}</span></div>`+
    `<div><span class="k">${i18n.t('sfs_pe')}</span> <span class="v">${peTxt}</span></div>`+
    `<div><span class="k">${i18n.t('sfs_fuel')}</span> <span class="v">${fuelPct.toFixed(0)}%</span></div>`+
    `<div><span class="k">${i18n.t('sfs_rcs')}</span> <span class="v">${rcsPct.toFixed(0)}%</span></div>`+
    `<div><span class="k">${i18n.t('sfs_elec')}</span> <span class="v ${elecPct<10?'bad':'good'}">${elecPct.toFixed(0)}%</span></div>`+
    `<div><span class="k">${i18n.t('sfs_attitude')}</span> <span class="v">${(sh.angle*180/Math.PI).toFixed(0)}°</span></div>`+
    `<div>${stTxt}</div>`+
    `<div><span class="k">${i18n.t('sfs_time')}</span> <span class="v">${formatTime(G.time)}</span></div>`;

  document.getElementById('throttleBar').style.height=(G.throttle*100)+'%';
  document.getElementById('throttleTxt').textContent=i18n.t('sfs_throttle')+' '+Math.round(G.throttle*100)+'%';
  document.getElementById('sasBtn').classList.toggle('on', G.sas);
  document.getElementById('sas2').classList.toggle('on', G.sas);
  document.getElementById('mapBtn').classList.toggle('on', G.mapMode);
  document.getElementById('map2').classList.toggle('on', G.mapMode);
  document.getElementById('roverBtn').classList.toggle('on', G.roverDrive);
  document.getElementById('warpBtn').textContent='×'+G.warp;
  const dm=document.getElementById('dockMsg');
  dm.textContent = G.dockMsg || (G.docked? i18n.t('sfs_docked')+' '+bodyName(G.station):'');
}
function formatTime(t){
  const h=Math.floor(t/3600), m=Math.floor((t%3600)/60), s=Math.floor(t%60);
  return (h>0? h+'h':'')+m+'m'+s+'s';
}

//==================================================================
//  输入
//==================================================================
const keys={left:false,right:false,up:false,down:false,tup:false,tdown:false,tleft:false,tright:false};
window.addEventListener('keydown', e=>{
  const k=e.key.toLowerCase();
  if(k==='a'||k==='arrowleft') keys.left=true;
  if(k==='d'||k==='arrowright') keys.right=true;
  if(k==='w'||k==='arrowup') keys.up=true;
  if(k==='s'||k==='arrowdown') keys.down=true;
  if(k==='i') keys.tup=true;
  if(k==='k') keys.tdown=true;
  if(k==='j') keys.tleft=true;
  if(k==='l') keys.tright=true;
  if(k==='z') toggleSAS();
  if(k==='m') toggleMap();
  if(k==='r') resetToBuild();
  if(k==='g') toggleRover();
  if(k===' '){ e.preventDefault(); if(G.docked) undock(); else stage(); }
  if(k===',') changeWarp(-1);
  if(k==='.') changeWarp(1);
  if((k==='enter') && G.state==='build'){ startFlight(); }
});
window.addEventListener('keyup', e=>{
  const k=e.key.toLowerCase();
  if(k==='a'||k==='arrowleft') keys.left=false;
  if(k==='d'||k==='arrowright') keys.right=false;
  if(k==='w'||k==='arrowup') keys.up=false;
  if(k==='s'||k==='arrowdown') keys.down=false;
  if(k==='i') keys.tup=false;
  if(k==='k') keys.tdown=false;
  if(k==='j') keys.tleft=false;
  if(k==='l') keys.tright=false;
});
canvas.addEventListener('wheel', e=>{
  e.preventDefault();
  const f=e.deltaY>0?0.9:1.1;
  G.camera.targetScale=Math.max(0.0003, Math.min(0.6, G.camera.targetScale*f));
  G.camera.scale=G.camera.targetScale;
}, {passive:false});

function bindHold(id, on, off){
  const el=document.getElementById(id);
  const start=e=>{ e.preventDefault(); on(); };
  const end=e=>{ e.preventDefault(); if(off) off(); };
  el.addEventListener('mousedown',start); el.addEventListener('touchstart',start,{passive:false});
  el.addEventListener('mouseup',end); el.addEventListener('mouseleave',end);
  el.addEventListener('touchend',end);
}
bindHold('rotL', ()=>keys.left=true, ()=>keys.left=false);
bindHold('rotR', ()=>keys.right=true, ()=>keys.right=false);
bindHold('thrUp', ()=>keys.up=true, ()=>keys.up=false);
bindHold('thrDn', ()=>keys.down=true, ()=>keys.down=false);
document.getElementById('sasBtn').onclick=toggleSAS;
document.getElementById('sas2').onclick=toggleSAS;
document.getElementById('mapBtn').onclick=toggleMap;
document.getElementById('map2').onclick=toggleMap;
document.getElementById('stageBtn').onclick=()=>{ if(G.docked) undock(); else stage(); };
document.getElementById('roverBtn').onclick=toggleRover;
document.getElementById('warpBtn').onclick=()=>changeWarp(1);
document.getElementById('resetBtn').onclick=resetToBuild;

function toggleSAS(){ G.sas=!G.sas; }
function toggleMap(){ G.mapMode=!G.mapMode; if(G.mapMode) G.camera.targetScale=Math.min(G.camera.targetScale,0.0009); }
function toggleRover(){ if(G.ship&&G.ship.onGround&&G.ship.hasWheel) G.roverDrive=!G.roverDrive; }
function changeWarp(dir){
  G.warpIdx=Math.max(0, Math.min(G.WARPS.length-1, G.warpIdx+dir));
  G.warp=G.WARPS[G.warpIdx];
}

//==================================================================
//  状态切换 / UI
//==================================================================
function showState(){
  document.getElementById('menu').classList.toggle('hidden', G.state!=='menu');
  document.getElementById('buildUI').classList.toggle('hidden', G.state!=='build');
  document.getElementById('hud').classList.toggle('hidden', !(G.state==='flight'||G.state==='landed'));
  document.getElementById('endOverlay').classList.add('hidden');
}
function toBuild(){ G.state='build'; G.selPart=-1; drawBuild(); showState(); }
function resetToBuild(){ G.particles=[]; G.debris=[]; toBuild(); }
function showEnd(win, body){
  const ov=document.getElementById('endOverlay');
  ov.className='overlay '+(win?'win':'lose');
  document.getElementById('endTitle').textContent=win?i18n.t('sfs_win'):i18n.t('sfs_crash');
  if(win) document.getElementById('endMsg').textContent=i18n.t('sfs_win_msg').replace('{body}', bodyName(body));
  else document.getElementById('endMsg').textContent=i18n.t('sfs_crash_msg').replace('{body}', bodyName(body||{name:'星球',nameZh:'星球',nameEn:'planet'}));
  document.getElementById('hud').classList.add('hidden');
  ov.classList.remove('hidden');
}
document.getElementById('endRetry').onclick=()=>startFlight();
document.getElementById('endBuild').onclick=()=>toBuild();
document.getElementById('startBtn').onclick=()=>toBuild();
document.getElementById('launchBtn').onclick=()=>startFlight();
document.getElementById('backMenuBtn').onclick=()=>{ G.state='menu'; showState(); };

//==================================================================
//  主循环
//==================================================================
function loop(t){
  const realDt=Math.min(0.05, (t-G.lastT)/1000 || 0);
  G.lastT=t;

  if(G.state==='flight' || G.state==='landed'){
    // 油门
    if(keys.up)   G.throttle=Math.min(1, G.throttle+realDt*0.8);
    if(keys.down) G.throttle=Math.max(0, G.throttle-realDt*0.8);

    const simDt=realDt*G.warp;
    const maxSub=0.04;
    let steps=Math.ceil(simDt/maxSub); steps=Math.min(steps,4000);
    const sub=simDt/steps;
    if(G.state==='flight' || G.state==='landed'){
      for(let i=0;i<steps;i++){
        physicsStep(sub);
        if(G.docked) dockKeep();
        if(!G.ship.alive) break;
      }
      if(!G.docked) updateDebris(sub*steps);
    }
    G.time+=simDt;
    updateParticles(realDt);
    updateBodies(G.time);

    G.camera.x+=(G.ship.x-G.camera.x)*Math.min(1,realDt*8);
    G.camera.y+=(G.ship.y-G.camera.y)*Math.min(1,realDt*8);
    G.camera.scale+=(G.camera.targetScale-G.camera.scale)*Math.min(1,realDt*6);
    updateHUD();
  } else {
    updateParticles(realDt);
    updateBodies(G.time);
  }

  render();
  if(G.state==='build') drawBuild();
  requestAnimationFrame(loop);
}

// 初始
updateBodies(0);
showState();
drawBuild();
requestAnimationFrame(loop);

//==================================================================
//  国际化（双语：中文 / 英文）
//==================================================================
i18n.init({
  dict: {
    zh: {
      sfs_menu_title:'航天模拟器', sfs_menu_sub:'SPACE FLIGHT SIMULATOR · 建造 · 发射 · 入轨 · 登陆星球 · 对接 · 漫游车',
      sfs_start_build:'开始建造火箭', sfs_launch_body:'发射天体', sfs_part_lib:'零件库',
      sfs_remove:'删除零件', sfs_clear:'清空', sfs_flip_v:'↕ 上下翻转', sfs_flip_h:'↔ 左右翻转',
      sfs_build_hint:'拖拽零件到火箭上添加（落点决定上/下位置）· 点击火箭零件选中 · 用翻转按钮调整方向',
      sfs_launch:'🚀 发射', sfs_back_menu:'返回菜单',
      sfs_map:'星图 (M)', sfs_sas:'SAS (Z)', sfs_stage:'分级 (Space)', sfs_rover:'漫游车 (G)', sfs_reset:'重置 (R)',
      sfs_controls:'W/S 油门 · A/D 转向 · Z SAS · M 星图 · , . 时间加速 · Space 分级 · IJKL 平移 · G 漫游车 · R 重置',
      sfs_throttle:'油门', sfs_retry:'重新飞行', sfs_to_build:'回建造台',
      sfs_body:'天体', sfs_alt:'高度', sfs_speed:'速度(相对)', sfs_ap:'远地点 Ap', sfs_pe:'近地点 Pe',
      sfs_fuel:'燃料', sfs_rcs:'RCS', sfs_elec:'电量', sfs_attitude:'姿态', sfs_time:'时间',
      sfs_docked:'已对接', sfs_rover_mode:'漫游车模式', sfs_landed:'已着陆 · W点火 / G漫游车', sfs_flying:'飞行中',
      sfs_undock:'按 G 或 Space 脱离',
      sfs_win:'任务成功', sfs_crash:'坠毁！',
      sfs_win_msg:'你成功抵达 {body} 表面。', sfs_crash_msg:'撞击速度过快或姿态错误，火箭在 {body} 表面解体。',
      sfs_total_mass:'总质量', sfs_dry:'干', sfs_thrust:'总推力', sfs_twr:'推重比(母星)', sfs_twr_low:'<1，无法起飞',
      sfs_isp:'比冲', sfs_dv:'总冲量', sfs_staged:'分级后 ≈', sfs_burn:'理论燃烧', sfs_stages:'分级数',
      sfs_elec_cap:'电量容量', sfs_elec_gen:'发电', sfs_leg:'着陆架', sfs_wheel:'轮子', sfs_dock_port:'对接端口',
      sfs_yes:'有', sfs_no:'无', sfs_height:'火箭高度'
    },
    en: {
      sfs_menu_title:'Space Flight Sim', sfs_menu_sub:'SPACE FLIGHT SIMULATOR · Build · Launch · Orbit · Land · Dock · Rover',
      sfs_start_build:'Build Rocket', sfs_launch_body:'Launch Body', sfs_part_lib:'Parts',
      sfs_remove:'Remove', sfs_clear:'Clear', sfs_flip_v:'Flip ↕', sfs_flip_h:'Flip ↔',
      sfs_build_hint:'Drag parts onto the rocket (drop point sets position) · click a part to select · use flip buttons to orient',
      sfs_launch:'🚀 Launch', sfs_back_menu:'Back to Menu',
      sfs_map:'Map (M)', sfs_sas:'SAS (Z)', sfs_stage:'Stage (Space)', sfs_rover:'Rover (G)', sfs_reset:'Reset (R)',
      sfs_controls:'W/S throttle · A/D steer · Z SAS · M map · , . time warp · Space stage · IJKL translate · G rover · R reset',
      sfs_throttle:'Throttle', sfs_retry:'Retry', sfs_to_build:'To Build',
      sfs_body:'Body', sfs_alt:'Altitude', sfs_speed:'Speed (rel)', sfs_ap:'Apoapsis', sfs_pe:'Periapsis',
      sfs_fuel:'Fuel', sfs_rcs:'RCS', sfs_elec:'Power', sfs_attitude:'Attitude', sfs_time:'Time',
      sfs_docked:'Docked', sfs_rover_mode:'Rover Mode', sfs_landed:'Landed · W thrust / G rover', sfs_flying:'In Flight',
      sfs_undock:'Press G or Space to undock',
      sfs_win:'Mission Success', sfs_crash:'Crashed!',
      sfs_win_msg:'You have arrived at the surface of {body}.', sfs_crash_msg:'Impact too fast or wrong attitude; the rocket broke apart on {body}\'s surface.',
      sfs_total_mass:'Total mass', sfs_dry:'dry', sfs_thrust:'Thrust', sfs_twr:'TWR (home)', sfs_twr_low:'<1, cannot lift off',
      sfs_isp:'Isp', sfs_dv:'Δv', sfs_staged:'after staging ≈', sfs_burn:'Burn', sfs_stages:'Stages',
      sfs_elec_cap:'Power cap', sfs_elec_gen:'Gen', sfs_leg:'Legs', sfs_wheel:'Wheels', sfs_dock_port:'Dock port',
      sfs_yes:'yes', sfs_no:'no', sfs_height:'Height'
    }
  },
  onLang: function(){
    buildBodySel();
    buildPartList();
    if(G.lastBuildStats) updateBuildStats(G.lastBuildStats);
  }
});

// 测试钩子（供自动化冒烟测试调用）
if(typeof globalThis!=='undefined'){
  globalThis.__t={G,startFlight,physicsStep,orbitInfo,predictPath,render,gravityAt,stage,checkDock,dominantBody,updateBodies,rocketStats,BODIES,findBody,keys,loop,updateHUD,addPart,flipSel,buildPartRects,insertIndexAt,drawBuild,bodyName,partName};
}

})();
