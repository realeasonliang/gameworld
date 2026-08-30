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
              atmo:800000, parent:SUN, a:26.0e6, phase:5.1, rings:true };
const IO = { name:'IO', nameZh:'伊奥', nameEn:'Io', R:80000, mu:1.8*80000*80000, color:'#d9c24a', color2:'#9a8030',
              atmo:0, parent:JOVE, a:1.2e6, phase:0.6 };
const GLACIUS = { name:'GLACIUS', nameZh:'格拉修斯(冰星)', nameEn:'Glacius (Ice)', R:150000, mu:5.4*150000*150000, color:'#9fd8e8', color2:'#3f7a9e',
              atmo:9000, parent:SUN, a:11.0e6, phase:2.2 };
const EUROPA = { name:'EUROPA', nameZh:'欧罗巴(冰月)', nameEn:'Europa', R:70000, mu:1.3*70000*70000, color:'#d8ecf4', color2:'#7f9fb0',
              atmo:0, parent:JOVE, a:2.2e6, phase:2.9 };
const BODIES = [SUN, TERRA, LUNA, VESTA, GLACIUS, JOVE, IO, EUROPA];
const LANDABLE = [TERRA, LUNA, VESTA, GLACIUS, JOVE, IO, EUROPA]; // 可从表面起飞

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
  probe:  { name:'探测核心', nameEn:'Probe Core', w:8, h:8, mass:300, color:'#9b59b6', role:'probe', elec:40 },
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
  chute:  { name:'降落伞', nameEn:'Parachute', w:12, h:7, mass:100, color:'#e67e22', role:'chute' },
};
// 建造面板分组
const PALETTE_GROUPS = [
  { title:'核心', titleEn:'Core', items:['pod','probe','tankS','tankL','engS','engL'] },
  { title:'分级 / 对接', titleEn:'Staging / Dock', items:['decoupler','dock','fairing'] },
  { title:'姿态 / 电源', titleEn:'Attitude / Power', items:['sasM','rcs','solar','battery'] },
  { title:'着陆 / 漫游', titleEn:'Landing / Rover', items:['leg','wheel','chute'] },
];

//==================================================================
//  全局状态
//==================================================================
const G = {
  state:'menu',
  parts:['pod','tankL','engL'],   // 顶部→底部
  flips:['pod','tankL','engL'].map(()=>({h:false,v:false})), // 与 parts 一一对应的翻转状态
  sides:['pod','tankL','engL'].map(()=>0),  // 挂点：0=中轴堆叠，-1=左侧挂，+1=右侧挂
  sym:false,                      // 对称模式：侧向零件左右成对放置
  selPart:-1,                     // 建造台当前选中的零件下标
  ap:{ mode:'OFF', phase:'', targetAlt:0 },   // 自动驾驶状态机
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
  cheats:{ fuel:false, god:false, thrust:false },
  chuteOpen:false,
  awayHome:false,
  buildZoom:1,
  missions:null,
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
// 布局：把零件序列解析成「中轴堆叠 + 侧向挂载」的行
// 规则：side=0 的零件依次向上堆叠并决定火箭高度；side=±1 的零件挂在它前面最近的中轴零件侧面，
//       不占高度，同一侧依次向外排列。这样不保存父节点索引，插入/删除都不会错位。
function computeLayout(parts, sides){
  const rows=[];
  const center={};            // 中轴零件下标 → {py, h, w}（py = 距火箭底部的高度）
  const acc=new Map();        // 父零件下标 → 该侧已占用的宽度
  let y=0, lastCenter=-1;
  for(let i=0;i<parts.length;i++){
    const d=PARTS[parts[i]];
    const side=(sides&&sides[i])||0;
    if(side===0){
      center[i]={py:y, h:d.h, w:d.w};
      rows.push({ i, key:parts[i], side:0, ox:0, w:d.w, h:d.h, py:y });
      lastCenter=i; y+=d.h;
    } else {
      const p = lastCenter>=0 ? center[lastCenter] : {py:0, h:y||d.h, w:0};
      const a = acc.get(lastCenter) || {l:0, r:0};
      const dir = side<0 ? -1 : 1;
      const used = dir<0 ? a.l : a.r;
      const ox = dir*(p.w/2 + used + d.w/2);
      const py = p.py + Math.max(0, (p.h-d.h)/2);   // 与父零件垂直居中对齐
      rows.push({ i, key:parts[i], side:side, ox, w:d.w, h:d.h, py });
      if(dir<0) a.l+=d.w; else a.r+=d.w;
      acc.set(lastCenter, a);
    }
  }
  let halfW=0;
  for(const r of rows) halfW=Math.max(halfW, Math.abs(r.ox)+r.w/2);
  return { rows, height:y, width:halfW*2 };
}

function rocketStats(parts, sides){
  let dry=0, fuel=0, thrust=0, ispNum=0, height=0, width=0;
  let rcsFuel=0, rcsThrust=0, elecCap=0, elecUse=0, elecGen=0;
  let hasLeg=false, hasWheel=false, hasSolar=false, hasDock=false, hasRcs=false, hasCore=false;
  let stages=1;
  let torqueAcc=0, inertia=0;
  const L=computeLayout(parts, sides);
  const oxOf={};
  for(const r of L.rows) oxOf[r.i]=r.ox;
  for(let pi=0; pi<parts.length; pi++){
    const p = parts[pi];
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
    if(d.role==='pod'||d.role==='probe') hasCore=true;
    if(d.thrust) torqueAcc += d.thrust*(oxOf[pi]||0);           // 偏置推力 → 力矩
    const ox=oxOf[pi]||0;
    inertia += d.mass*(ox*ox + (d.h*d.h+d.w*d.w)/12);
  }
  height = L.height;
  width  = L.width || 0;
  const ispAvg = ispNum>0 ? thrust/ispNum : 0;
  const wet = dry + fuel;
  const twr = thrust>0 ? thrust/(wet*TERRA.mu/(TERRA.R*TERRA.R)) : 0;
  const dv = (ispAvg>0 && fuel>0) ? ispAvg*G0*Math.log(wet/dry) : 0;
  // 分级后（抛掉第一个分离器以下）粗略 Δv 增益
  const dvStaged = estimateStagedDv(parts);
  const burn = (thrust>0 && ispAvg>0) ? fuel/(thrust/(ispAvg*G0)) : 0;
  // 气动阻力面积：以最大宽度估计的迎风截面积（m²），避免过大导致无法起飞
  const dragArea = Math.max(6, width*width*0.05);
  const thrustOff = thrust>0 ? torqueAcc/thrust : 0;   // 推力合力相对中轴的横向偏置（米）
  return { dry, fuel, thrust, ispAvg, height, width, wet, twr, dv, dvStaged, burn, dragArea,
           rcsFuel, rcsThrust, hasRcs, elecCap, elecUse, elecGen, hasLeg, hasWheel, hasSolar,
           hasDock, hasCore, stages, thrustOff, inertia:Math.max(1, inertia) };
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
  const s = rocketStats(sh.parts, sh.sides);
  sh.dry = s.dry; sh.thrust = s.thrust; sh.ispAvg = s.ispAvg; sh.height = s.height; sh.dragArea = s.dragArea;
  sh.rcsThrust = s.rcsThrust; sh.hasRcs = s.hasRcs; sh.hasLeg = s.hasLeg; sh.hasWheel = s.hasWheel;
  sh.hasSolar = s.hasSolar; sh.hasDock = s.hasDock;
  sh.rows = computeLayout(sh.parts, sh.sides).rows;   // 含侧向偏移，供渲染/残骸使用
  sh.thrustOff = s.thrustOff; sh.inertia = s.inertia;
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
  const scale=3.0*G.buildZoom;
  const L=computeLayout(G.parts, G.sides);
  const totalH=L.height*scale;
  const baseY=bh/2 + totalH/2;      // 火箭底部在画布中的 y
  const cx=bw/2;
  const rects=[];
  for(const r of L.rows){
    const ph=r.h*scale, pw=r.w*scale;
    const py=baseY-(r.py+r.h)*scale;
    rects.push({ i:r.i, key:r.key, side:r.side, ox:r.ox,
                 cx:cx+r.ox*scale, py, ph, pw, cy:py+ph/2 });
  }
  return rects;
}
// 根据画布内纵坐标判断新零件插入到哪个位置（下标 0 = 底部，越大越靠上）
function insertIndexAt(y){
  const rects=buildPartRects();
  for(let i=0;i<rects.length;i++){ if(y>rects[i].cy) return i; }
  return rects.length;
}
// 拖放落点 → {index, side}：横向偏离中轴超过阈值就判定为侧向挂载
function dropTargetAt(x, y){
  const rects=buildPartRects();
  let idx=rects.length;
  for(let i=0;i<rects.length;i++){ if(y>rects[i].cy){ idx=i; break; } }
  const bw=buildCanvas.width;
  const dx=x-bw/2;
  // 阈值：参考该高度处零件的半宽，够不着就算侧向
  let thr=16;
  for(const r of rects){ if(Math.abs(x-r.cx)<=r.pw/2+10 && y>=r.py-6 && y<=r.py+r.ph+6){ thr=Math.max(thr, r.pw/2+8); break; } }
  let side=0;
  if(Math.abs(dx)>thr) side = dx<0 ? -1 : 1;
  return { index:idx, side };
}
function drawBuild(){
  const bw = buildCanvas.width, bh = buildCanvas.height;
  while(G.sides.length<G.parts.length) G.sides.push(0);
  if(G.sides.length>G.parts.length) G.sides.length=G.parts.length;
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
  c.translate(cx-pw/2, py);   // 之后在局部坐标绘制：x∈[0,pw], y∈[0,ph]
  const w=pw, h=ph;
  const lw=Math.max(0.5, Math.min(1.4, pw*0.05));
  switch(d.role){
    case 'pod':       drawPod(c,w,h,d.color,lw);       break;
    case 'probe':     drawProbe(c,w,h,d.color,lw);     break;
    case 'engine':    drawEngine(c,w,h,d.color,lw);    break;
    case 'sas':       drawSAS(c,w,h,d.color,lw);       break;
    case 'rcs':       drawRCS(c,w,h,d.color,lw);       break;
    case 'decoupler': drawDecoupler(c,w,h,d.color,lw); break;
    case 'dock':      drawDock(c,w,h,d.color,lw);      break;
    case 'leg':       drawLeg(c,w,h,d.color,lw);       break;
    case 'wheel':     drawWheel(c,w,h,d.color,lw);     break;
    case 'solar':     drawSolar(c,w,h,d.color,lw);     break;
    case 'battery':   drawBattery(c,w,h,d.color,lw);   break;
    case 'fairing':   drawFairing(c,w,h,d.color,lw);   break;
    case 'chute':     drawChute(c,w,h,d.color,lw);     break;
    default:          drawTank(c,w,h,d.color,lw);      break;  // tank
  }
  c.restore();
}
function roundRect(c,x,y,w,h,r){
  r=Math.min(r,w/2,h/2);
  c.beginPath();
  c.moveTo(x+r,y); c.arcTo(x+w,y,x+w,y+h,r); c.arcTo(x+w,y+h,x,y+h,r);
  c.arcTo(x,y+h,x,y,r); c.arcTo(x,y,x+w,y,r); c.closePath();
}

//==================================================================
//  零件精绘辅助与绘制器（局部坐标：x∈[0,w], y∈[0,h]，y 向下为火箭下方）
//==================================================================
function hexShade(hex, amt){
  const n=parseInt(hex.slice(1),16);
  let r=(n>>16)&255, g=(n>>8)&255, b=n&255;
  if(amt>=0){ r+=(255-r)*amt; g+=(255-g)*amt; b+=(255-b)*amt; }
  else { r*=1+amt; g*=1+amt; b*=1+amt; }
  return 'rgb('+Math.round(r)+','+Math.round(g)+','+Math.round(b)+')';
}
// 圆柱体横向金属渐变（左暗 → 中亮 → 右暗）
function cylGrad(c,x,w,col){
  const g=c.createLinearGradient(x,0,x+w,0);
  g.addColorStop(0,   hexShade(col,-0.55));
  g.addColorStop(0.20,hexShade(col,-0.12));
  g.addColorStop(0.42,hexShade(col, 0.55));
  g.addColorStop(0.64,hexShade(col, 0.02));
  g.addColorStop(1,   hexShade(col,-0.60));
  return g;
}
function outline(c,lw){ c.strokeStyle='rgba(10,16,28,.55)'; c.lineWidth=lw; c.stroke(); }

// 指令舱：胶囊造型 + 舷窗 + 隔热底
function drawPod(c,w,h,col,lw){
  const g=c.createLinearGradient(0,0,w,0);
  g.addColorStop(0,hexShade(col,-0.5)); g.addColorStop(0.34,hexShade(col,0.42));
  g.addColorStop(0.55,hexShade(col,0.08)); g.addColorStop(1,hexShade(col,-0.52));
  const by=h*0.30;
  c.fillStyle=g; c.beginPath();
  c.moveTo(w*0.26, h*0.02);
  c.quadraticCurveTo(w*0.5, -h*0.07, w*0.74, h*0.02);
  c.lineTo(w*0.86, by);
  c.quadraticCurveTo(w, by+h*0.16, w, h*0.72);
  c.lineTo(w, h*0.9);
  c.quadraticCurveTo(w, h, w*0.93, h);
  c.lineTo(w*0.07, h);
  c.quadraticCurveTo(0, h, 0, h*0.9);
  c.lineTo(0, h*0.72);
  c.quadraticCurveTo(0, by+h*0.16, w*0.14, by);
  c.closePath(); c.fill(); outline(c,lw);
  // 舷窗
  const wr=Math.min(w,h)*0.15, wx=w/2, wy=h*0.42;
  const wg=c.createRadialGradient(wx-wr*0.35,wy-wr*0.35,wr*0.1,wx,wy,wr);
  wg.addColorStop(0,'#cfeaff'); wg.addColorStop(0.55,'#3a7bd5'); wg.addColorStop(1,'#12365f');
  c.fillStyle=wg; c.beginPath(); c.arc(wx,wy,wr,0,Math.PI*2); c.fill();
  c.strokeStyle='rgba(255,255,255,.7)'; c.lineWidth=lw; c.stroke();
  // 侧舷条纹
  c.fillStyle='rgba(255,255,255,.30)';
  c.fillRect(w*0.06,h*0.60,w*0.09,h*0.13); c.fillRect(w*0.85,h*0.60,w*0.09,h*0.13);
  // 底部隔热层
  c.fillStyle='rgba(52,38,30,.9)';
  roundRect(c,w*0.08,h*0.88,w*0.84,h*0.12,1.5); c.fill();
}
// 探测核心：八边金箔体 + 天线
function drawProbe(c,w,h,col,lw){
  c.fillStyle=cylGrad(c,0,w,col);
  c.beginPath();
  c.moveTo(w*0.5,0); c.lineTo(w*0.86,h*0.22); c.lineTo(w*0.86,h*0.78);
  c.lineTo(w*0.5,h); c.lineTo(w*0.14,h*0.78); c.lineTo(w*0.14,h*0.22);
  c.closePath(); c.fill(); outline(c,lw);
  // 天线
  c.strokeStyle='#cfd6df'; c.lineWidth=Math.max(1,w*0.05);
  c.beginPath(); c.moveTo(w*0.5,0); c.lineTo(w*0.5,-h*0.16); c.stroke();
  c.fillStyle='#e8b64c'; c.beginPath(); c.arc(w*0.5,-h*0.18,Math.max(1,w*0.06),0,Math.PI*2); c.fill();
  // 传感器窗
  const r=Math.min(w,h)*0.13;
  const wg=c.createRadialGradient(w/2-r*0.3,h*0.52-r*0.3,r*0.1,w/2,h*0.52,r);
  wg.addColorStop(0,'#dff3ff'); wg.addColorStop(1,'#2c5f9e');
  c.fillStyle=wg; c.beginPath(); c.arc(w/2,h*0.52,r,0,Math.PI*2); c.fill();
  c.fillStyle='rgba(255,255,255,.25)'; c.fillRect(w*0.14,h*0.80,w*0.72,h*0.06);
}
// 燃料罐：白色圆柱 + 彩色环带 + 焊缝 + 高光
function drawTank(c,w,h,col,lw){
  const g=c.createLinearGradient(0,0,w,0);
  g.addColorStop(0,'#7f8898'); g.addColorStop(0.18,'#c9d1dc'); g.addColorStop(0.42,'#ffffff');
  g.addColorStop(0.64,'#c4ccd7'); g.addColorStop(1,'#737c8d');
  c.fillStyle=g; roundRect(c,0,0,w,h,Math.min(3,w*0.14)); c.fill(); outline(c,lw);
  // 端盖
  c.fillStyle='rgba(38,48,68,.55)';
  c.fillRect(0,0,w,Math.max(1,h*0.045)); c.fillRect(0,h-Math.max(1,h*0.045),w,Math.max(1,h*0.045));
  // 彩色环带（零件色）
  const sg=c.createLinearGradient(0,0,w,0);
  sg.addColorStop(0,hexShade(col,-0.35)); sg.addColorStop(0.42,hexShade(col,0.45)); sg.addColorStop(1,hexShade(col,-0.4));
  c.fillStyle=sg;
  c.fillRect(0,h*0.10,w,h*0.10); c.fillRect(0,h*0.80,w,h*0.09);
  // 焊缝
  c.fillStyle='rgba(20,28,44,.25)';
  c.fillRect(0,h*0.46,w,Math.max(1,h*0.02));
  // 纵向高光
  c.fillStyle='rgba(255,255,255,.45)';
  c.fillRect(w*0.28,h*0.06,Math.max(1,w*0.06),h*0.88);
}
// 引擎：安装座 + 万向节 + 钟形喷管 + 喷口辉光
function drawEngine(c,w,h,col,lw){
  const mg=c.createLinearGradient(0,0,w,0);
  mg.addColorStop(0,'#454f5c'); mg.addColorStop(0.42,'#b0bac7'); mg.addColorStop(1,'#3a434f');
  c.fillStyle=mg; roundRect(c,w*0.17,0,w*0.66,h*0.28,1.5); c.fill(); outline(c,lw);
  c.fillStyle=hexShade(col,0.15); c.fillRect(w*0.17,h*0.07,w*0.66,h*0.05);
  c.fillStyle='#262e3a'; c.fillRect(w*0.28,h*0.28,w*0.44,h*0.08);
  // 钟形喷管
  const bw=w*0.42;
  const bg=c.createLinearGradient(0,0,w,0);
  bg.addColorStop(0,'#1e2228'); bg.addColorStop(0.32,'#66727f'); bg.addColorStop(0.5,'#9aa8b7');
  bg.addColorStop(0.68,'#4d5867'); bg.addColorStop(1,'#171b20');
  c.fillStyle=bg; c.beginPath();
  c.moveTo(w/2-bw/2, h*0.36);
  c.quadraticCurveTo(w/2-bw*0.36, h*0.62, 0, h);
  c.lineTo(w, h);
  c.quadraticCurveTo(w/2+bw*0.36, h*0.62, w/2+bw/2, h*0.36);
  c.closePath(); c.fill(); outline(c,lw);
  // 喷口内辉光
  const ig=c.createLinearGradient(0,h*0.72,0,h);
  ig.addColorStop(0,'rgba(255,110,40,0)'); ig.addColorStop(1,'rgba(255,140,60,.5)');
  c.fillStyle=ig; c.beginPath();
  c.moveTo(w/2-w*0.30,h*0.72); c.lineTo(w/2-w*0.47,h); c.lineTo(w/2+w*0.47,h); c.lineTo(w/2+w*0.30,h*0.72);
  c.closePath(); c.fill();
}
// 姿态控制：金属块 + 蓝色灯带 + 陀螺盘
function drawSAS(c,w,h,col,lw){
  c.fillStyle=cylGrad(c,0,w,'#8d99a8');
  roundRect(c,0,0,w,h,2); c.fill(); outline(c,lw);
  c.fillStyle=hexShade(col,0.05);
  c.fillRect(0,h*0.08,w,h*0.10); c.fillRect(0,h*0.82,w,h*0.10);
  const r=h*0.30;
  const cg=c.createRadialGradient(w/2-r*0.3,h/2-r*0.3,r*0.1,w/2,h/2,r);
  cg.addColorStop(0,'#a8d8ff'); cg.addColorStop(0.6,'#2f6fd0'); cg.addColorStop(1,'#142f5c');
  c.fillStyle=cg; c.beginPath(); c.arc(w/2,h/2,r,0,Math.PI*2); c.fill();
  c.strokeStyle=hexShade(col,0.3); c.lineWidth=Math.max(1,lw); c.stroke();
}
// RCS：中央块 + 四向喷口 + 青色指示条
function drawRCS(c,w,h,col,lw){
  c.fillStyle=cylGrad(c,w*0.22,w*0.56,'#8d99a8');
  roundRect(c,w*0.22,h*0.14,w*0.56,h*0.72,2); c.fill(); outline(c,lw);
  c.fillStyle='#39424e';
  c.beginPath(); c.moveTo(w*0.24,h*0.30); c.lineTo(0,h*0.22); c.lineTo(0,h*0.52); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(w*0.76,h*0.30); c.lineTo(w,h*0.22); c.lineTo(w,h*0.52); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(w*0.36,h*0.16); c.lineTo(w*0.42,0); c.lineTo(w*0.58,0); c.lineTo(w*0.64,h*0.16); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(w*0.36,h*0.84); c.lineTo(w*0.42,h); c.lineTo(w*0.58,h); c.lineTo(w*0.64,h*0.84); c.closePath(); c.fill();
  c.fillStyle=hexShade(col,0.25); c.fillRect(w*0.22,h*0.44,w*0.56,h*0.14);
}
// 分离器：暗色环带 + 斜向警示纹 + 分离缝
function drawDecoupler(c,w,h,col,lw){
  c.fillStyle=cylGrad(c,0,w,'#525c6a');
  roundRect(c,0,0,w,h,2); c.fill();
  c.save(); roundRect(c,0,0,w,h,2); c.clip();
  c.fillStyle=hexShade(col,-0.05);
  const step=Math.max(3,h*1.1);
  for(let x=-h; x<w+h; x+=step){
    c.beginPath(); c.moveTo(x,h); c.lineTo(x+step*0.5,h); c.lineTo(x+step*0.5+h,0); c.lineTo(x+h,0); c.closePath(); c.fill();
  }
  c.restore();
  outline(c,lw);
  c.fillStyle='rgba(255,220,130,.95)';
  c.fillRect(0,h/2-Math.max(0.6,h*0.07),w,Math.max(1.2,h*0.14));
}
// 对接端口：金属盘 + 导向环 + 中心孔
function drawDock(c,w,h,col,lw){
  c.fillStyle=cylGrad(c,0,w,'#9aa5b4');
  roundRect(c,w*0.05,h*0.10,w*0.90,h*0.80,1.5); c.fill(); outline(c,lw);
  c.strokeStyle=hexShade(col,0.15); c.lineWidth=Math.max(1,h*0.16);
  c.beginPath(); c.arc(w/2,h*0.5,w*0.30,0,Math.PI*2); c.stroke();
  c.fillStyle='#161d28'; c.beginPath(); c.arc(w/2,h*0.5,w*0.15,0,Math.PI*2); c.fill();
  c.fillStyle='rgba(255,255,255,.35)'; c.fillRect(w*0.05,h*0.13,w*0.9,Math.max(0.6,h*0.06));
}
// 着陆架：安装座 + 双斜撑 + 液压杆 + 脚垫
function drawLeg(c,w,h,col,lw){
  c.fillStyle=cylGrad(c,w*0.36,w*0.28,'#8d99a8');
  roundRect(c,w*0.36,0,w*0.28,h*0.30,1.5); c.fill(); outline(c,lw);
  c.lineCap='round';
  c.strokeStyle='#cfd6df'; c.lineWidth=Math.max(1.4,w*0.09);
  c.beginPath(); c.moveTo(w*0.5,h*0.22); c.lineTo(w*0.14,h*0.74); c.stroke();
  c.beginPath(); c.moveTo(w*0.5,h*0.22); c.lineTo(w*0.86,h*0.74); c.stroke();
  c.strokeStyle='#57606e'; c.lineWidth=Math.max(1,w*0.04);
  c.beginPath(); c.moveTo(w*0.5,h*0.30); c.lineTo(w*0.16,h*0.72); c.stroke();
  c.beginPath(); c.moveTo(w*0.5,h*0.30); c.lineTo(w*0.84,h*0.72); c.stroke();
  c.fillStyle='#7d8694';
  roundRect(c,0,h*0.76,w*0.26,h*0.16,1.5); c.fill();
  roundRect(c,w*0.74,h*0.76,w*0.26,h*0.16,1.5); c.fill();
}
// 轮子：悬挂臂 + 双轮（轮胎/轮辋/辐条/轮毂）
function drawWheel(c,w,h,col,lw){
  c.strokeStyle='#8d99a8'; c.lineWidth=Math.max(1.4,w*0.07); c.lineCap='round';
  c.beginPath(); c.moveTo(w*0.5,0); c.lineTo(w*0.24,h*0.5); c.stroke();
  c.beginPath(); c.moveTo(w*0.5,0); c.lineTo(w*0.76,h*0.5); c.stroke();
  const r=Math.min(w*0.20,h*0.34);
  [[w*0.24,h*0.64],[w*0.76,h*0.64]].forEach(function(pt){
    const x=pt[0], y=pt[1];
    c.fillStyle='#14161b'; c.beginPath(); c.arc(x,y,r,0,Math.PI*2); c.fill();
    c.fillStyle='#aeb9c6'; c.beginPath(); c.arc(x,y,r*0.58,0,Math.PI*2); c.fill();
    c.strokeStyle='#39424e'; c.lineWidth=Math.max(0.8,r*0.16);
    for(let a=0;a<4;a++){ const an=a*Math.PI/4;
      c.beginPath(); c.moveTo(x-Math.cos(an)*r*0.5,y-Math.sin(an)*r*0.5); c.lineTo(x+Math.cos(an)*r*0.5,y+Math.sin(an)*r*0.5); c.stroke(); }
    c.fillStyle='#39424e'; c.beginPath(); c.arc(x,y,r*0.18,0,Math.PI*2); c.fill();
  });
}
// 太阳能板：金色边框 + 蓝色电池片网格 + 高光
function drawSolar(c,w,h,col,lw){
  c.fillStyle='#a8842f'; roundRect(c,0,0,w,h,1.5); c.fill();
  const inset=Math.max(1,h*0.18);
  const cw=w-inset*2, chh=h-inset*2;
  const cols=Math.max(3,Math.round(w/Math.max(6,h*1.6)));
  const cellW=cw/cols;
  for(let i=0;i<cols;i++){
    for(let row=0;row<2;row++){
      c.fillStyle=((i+row)%2===0)?'#2f6fd0':'#4a8ae8';
      c.fillRect(inset+i*cellW+0.6, inset+row*chh/2+0.6, cellW-1.2, chh/2-1.2);
    }
  }
  c.fillStyle='rgba(255,255,255,.28)'; c.fillRect(0,0,w,h*0.30);
  outline(c,lw);
}
// 电池：绿色金属体 + 电极柱 + 闪电标
function drawBattery(c,w,h,col,lw){
  c.fillStyle=cylGrad(c,0,w,col);
  roundRect(c,0,0,w,h,2); c.fill(); outline(c,lw);
  c.fillStyle='#d7dde5';
  roundRect(c,w*0.26,h*0.04,w*0.16,h*0.14,1); c.fill();
  roundRect(c,w*0.58,h*0.04,w*0.16,h*0.14,1); c.fill();
  c.fillStyle='rgba(255,255,255,.9)';
  c.beginPath();
  c.moveTo(w*0.47,h*0.28); c.lineTo(w*0.37,h*0.56); c.lineTo(w*0.46,h*0.56);
  c.lineTo(w*0.40,h*0.80); c.lineTo(w*0.60,h*0.46); c.lineTo(w*0.50,h*0.46);
  c.lineTo(w*0.57,h*0.28);
  c.closePath(); c.fill();
  c.fillStyle='#eaffea'; c.beginPath(); c.arc(w*0.14,h*0.5,Math.max(0.8,w*0.05),0,Math.PI*2); c.fill();
}
// 整流罩：尖锥 + 中缝 + 尖端色标
function drawFairing(c,w,h,col,lw){
  const g=c.createLinearGradient(0,0,w,0);
  g.addColorStop(0,'#929cab'); g.addColorStop(0.42,'#ffffff'); g.addColorStop(1,'#7f8899');
  c.fillStyle=g; c.beginPath();
  c.moveTo(0,h*0.88);
  c.quadraticCurveTo(w*0.02,h*0.24,w*0.5,0);
  c.quadraticCurveTo(w*0.98,h*0.24,w,h*0.88);
  c.quadraticCurveTo(w*0.5,h*1.0,0,h*0.88);
  c.closePath(); c.fill(); outline(c,lw);
  c.strokeStyle='rgba(20,28,44,.3)'; c.lineWidth=Math.max(0.7,lw*0.8);
  c.beginPath(); c.moveTo(w*0.5,h*0.02); c.lineTo(w*0.5,h*0.88); c.stroke();
  c.fillStyle='#e74c3c'; c.beginPath(); c.arc(w*0.5,h*0.05,Math.max(1,w*0.08),0,Math.PI*2); c.fill();
}
// 降落伞（收纳态）：金属伞包 + 捆扎条纹 + 橙色色带
function drawChute(c,w,h,col,lw){
  c.fillStyle=cylGrad(c,0,w,'#b9c2cc');
  roundRect(c,w*0.18,h*0.25,w*0.64,h*0.75,2); c.fill(); outline(c,lw);
  c.fillStyle=hexShade(col,-0.15);
  c.fillRect(w*0.18,h*0.25,w*0.64,h*0.15);
  c.fillStyle=hexShade(col,0.1);
  c.fillRect(w*0.30,h*0.62,w*0.40,h*0.11);
  c.fillStyle='rgba(255,255,255,.35)';
  c.fillRect(w*0.18,h*0.42,w*0.10,h*0.12);
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
    `${i18n.t('sfs_height')}：<b>${s.height.toFixed(0)} m</b> · ${i18n.t('sfs_width')}：<b>${s.width.toFixed(0)} m</b>`+
    (s.hasCore?'':`<br><span class="warn">${i18n.t('sfs_no_core')}</span>`)+
    (Math.abs(s.thrustOff)>0.01?`<br><span class="warn">${i18n.t('sfs_thrust_off')} ${s.thrustOff.toFixed(1)} m</span>`:'');
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
function addPart(key, index, side){
  if(index===undefined || index<0 || index>G.parts.length) index=G.parts.length;
  G.parts.splice(index,0,key);
  G.flips.splice(index,0,{h:false,v:false});
  G.sides.splice(index,0,side||0);
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
      b.innerHTML=`<i class="pdot" style="background:${d.color}"></i><span>${partName(d)}</span><small>${info}</small>`;
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
  const x=(e.clientX-rect.left)*(buildCanvas.width/rect.width);
  const y=(e.clientY-rect.top)*(buildCanvas.height/rect.height);
  const tgt=dropTargetAt(x,y);
  if(G.sym && tgt.side!==0){          // 对称模式：左右各挂一个
    addPart(key, tgt.index, -1);
    addPart(key, tgt.index, 1);
    G.selPart=tgt.index;
  } else {
    addPart(key, tgt.index, tgt.side);
    G.selPart=tgt.index;
  }
  drawBuild();
};
buildCanvas.onclick=(e)=>{
  const rect=buildCanvas.getBoundingClientRect();
  const x=(e.clientX-rect.left)*(buildCanvas.width/rect.width);
  const y=(e.clientY-rect.top)*(buildCanvas.height/rect.height);
  const rects=buildPartRects();
  let sel=-1, bestDx=1e9;
  for(const r of rects){
    if(y>=r.py-2 && y<=r.py+r.ph+2){
      const dx=Math.abs(x-r.cx);
      if(dx<bestDx){ bestDx=dx; sel=r.i; }   // 同一高度时选横向最近的（区分左右挂载件）
    }
  }
  G.selPart=sel; drawBuild();
};
// 建造台滚轮缩放
buildCanvas.addEventListener('wheel', e=>{
  e.preventDefault();
  G.buildZoom=Math.max(0.45, Math.min(2.2, G.buildZoom*(e.deltaY>0?0.9:1.1)));
  drawBuild();
}, {passive:false});
function flipSel(axis){
  const idx = G.selPart>=0 ? G.selPart : G.parts.length-1;
  if(idx<0) return;
  G.flips[idx]=G.flips[idx]||{h:false,v:false};
  G.flips[idx][axis]=!G.flips[idx][axis];
  drawBuild();
}
document.getElementById('flipVBtn').onclick=()=>flipSel('v');
document.getElementById('flipHBtn').onclick=()=>flipSel('h');
// 选中零件的挂点循环：中轴 → 左侧 → 右侧 → 中轴
function cycleSide(){
  const idx = G.selPart>=0 ? G.selPart : G.parts.length-1;
  if(idx<0 || idx>=G.parts.length) return;
  G.sides[idx] = (G.sides[idx]||0)===0 ? -1 : (G.sides[idx]<0 ? 1 : 0);
  drawBuild();
}
document.getElementById('sideBtn').onclick=cycleSide;
document.getElementById('symBtn').onclick=()=>{
  G.sym=!G.sym;
  document.getElementById('symBtn').classList.toggle('on', G.sym);
};
document.getElementById('removeBtn').onclick=()=>{
  const idx = G.selPart>=0 ? G.selPart : G.parts.length-1;
  if(idx<0 || idx>=G.parts.length) return;      // 驾驶舱也可删除，允许空箭（发射时会提示）
  G.parts.splice(idx,1); G.flips.splice(idx,1); G.sides.splice(idx,1);
  if(G.selPart>=G.parts.length) G.selPart=G.parts.length-1;
  drawBuild();
};
document.getElementById('clearBtn').onclick=()=>{ G.parts=[]; G.flips=[]; G.sides=[]; G.selPart=-1; drawBuild(); };

//==================================================================
//  发射 → 飞行状态
//==================================================================
function findBody(name){ return BODIES.find(b=>b.name===name) || TERRA; }
function startFlight(){
  if(!G.parts.length) return false;      // 空箭不允许发射
  // 先把时间归零再定位天体：否则会用上一班飞行遗留的 G.time 摆位置，
  // 而时间随后被清零 → 天体瞬移回轨道起点，飞船被孤零零留在深空
  G.time = 0;
  updateBodies(G.time);
  const body = findBody(G.launchBody);
  const s = rocketStats(G.parts, G.sides);
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
    sides: G.sides.slice(),
    dry:0, fuel:s.fuel, fuelMax:s.fuel, thrust:0, ispAvg:0,
    rcsFuel:s.rcsFuel, rcsFuelMax:s.rcsFuel, rcsThrust:0,
    elec:s.elecCap, elecMax:s.elecCap, elecUse:s.elecUse, elecGen:s.elecGen,
    height:s.height, radius:halfH,
    hasLeg:s.hasLeg, hasWheel:s.hasWheel, hasSolar:s.hasSolar, hasDock:s.hasDock,
    onGround:false, alive:true, heat:0,
  };
  recomputeShip(ship);
  G.ship = ship;
  G.debris = [];
  G.particles = [];
  G.time = 0;
  G.warp = 1; G.warpIdx = 0;
  G.throttle = 0; G.sas = false; G.roverDrive=false; G.docked=false;
  G.chuteOpen=false; G.awayHome=false;
  G.ap={ mode:'OFF', phase:'', targetAlt:0 };     // 每次发射重置自动驾驶
  G.camera.x = ship.x; G.camera.y = ship.y;
  G.camera.scale = 0.09; G.camera.targetScale = 0.09;
  G.state = 'flight';
  showState();
  return true;
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
  const cheatFuel = G.cheats.fuel;
  if(sh.onGround && G.throttle>0 && (cheatFuel || sh.fuel>0) && sh.thrust>0 && !G.roverDrive){
    sh.onGround=false; G.state='flight';
  }

  // 旋转控制
  const rotAuth = (sh.parts.includes('sasM')||sh.parts.includes('pod')||sh.parts.includes('probe')) ? 2.6 : 1.5;
  if(keys.left)  sh.angVel -= rotAuth*dt;
  if(keys.right) sh.angVel += rotAuth*dt;
  if(G.sas && (cheatFuel || sh.elec>0)){
    sh.angVel *= Math.pow(0.02, dt);
    sh.angle  *= Math.pow(0.2, dt);
  } else if(!G.sas){
    sh.angVel *= Math.pow(0.5, dt);
  }
  sh.angVel = Math.max(-2.5, Math.min(2.5, sh.angVel));
  sh.angle += sh.angVel*dt;

  // 自动驾驶：接管油门与姿态（放在姿态阻尼之后，避免被衰减掉）
  if(G.ap.mode!=='OFF') autopilot(dt);

  const g = gravityAt(sh.x, sh.y);
  let ax=g.ax, ay=g.ay;
  const curMass = sh.dry + sh.fuel;
  const fdir = { x:Math.sin(sh.angle), y:-Math.cos(sh.angle) };
  const right= { x:Math.cos(sh.angle), y: Math.sin(sh.angle) };

  // 主引擎推力
  let thrusting=false;
  const engineOn = (G.throttle>0 && (cheatFuel || sh.fuel>0) && sh.thrust>0 && !(sh.onGround&&G.roverDrive));
  if(engineOn){
    const F=G.throttle*sh.thrust*(G.cheats.thrust?5:1);
    ax += F*fdir.x/curMass; ay += F*fdir.y/curMass;
    // 偏置推力产生力矩：侧挂发动机不对称时火箭会自转（需 SAS 抵消）
    if(sh.thrustOff && sh.inertia>0){
      sh.angVel += (-F*sh.thrustOff/sh.inertia)*dt;
    }
    if(!cheatFuel){
      const burnRate = sh.thrust/(sh.ispAvg*G0);
      sh.fuel=Math.max(0, sh.fuel - burnRate*G.throttle*dt);
    }
    thrusting=true;
    spawnExhaust(fdir, dt, G.throttle, sh.thrustOff||0);
  }

  // RCS 平移
  if(sh.hasRcs && (cheatFuel || (sh.rcsFuel>0 && sh.elec>0)) && (keys.tup||keys.tdown||keys.tleft||keys.tright)){
    const F = sh.rcsThrust;
    let dx=0, dy=0;
    if(keys.tup){ dx+=fdir.x; dy+=fdir.y; }
    if(keys.tdown){ dx-=fdir.x; dy-=fdir.y; }
    if(keys.tright){ dx+=right.x; dy+=right.y; }
    if(keys.tleft){ dx-=right.x; dy-=right.y; }
    const m=Math.hypot(dx,dy)||1;
    ax += F*(dx/m)/curMass; ay += F*(dy/m)/curMass;
    if(!cheatFuel){
      sh.rcsFuel=Math.max(0, sh.rcsFuel - 6*dt);
      sh.elec=Math.max(0, sh.elec - sh.elecUse*dt);
    }
    spawnRCS(fdir, dt);
  }

  // 漫游车驾驶
  if(sh.onGround && sh.hasWheel && G.roverDrive){
    const drive = 5000;
    if(keys.up){ ax += right.x*drive/curMass; ay += right.y*drive/curMass; }
    if(keys.down){ ax -= right.x*drive/curMass; ay -= right.y*drive/curMass; }
  }

  // 电量：SAS / 发电
  if(G.sas && !cheatFuel && sh.elec>0) sh.elec=Math.max(0, sh.elec - sh.elecUse*dt);
  if(sh.hasSolar && isSunlit(sh.x, sh.y)){
    sh.elec=Math.min(sh.elecMax, sh.elec + sh.elecGen*dt);
  }

  // 大气：阻力 / 气动加热 / 降落伞减速与稳定（使用相对天体的速度；数值钳制防发散）
  const dom = dominantBody(sh.x, sh.y);
  if(dom && dom.atmo>0){
    const dx=sh.x-dom.x, dy=sh.y-dom.y; const r=Math.hypot(dx,dy);
    if(r < dom.R + dom.atmo){
      const altFrac = Math.max(0, (r-dom.R)/dom.atmo); // 0 表面 → 1 顶部
      const rho = 0.4*Math.pow(1-altFrac, 2.2);        // 密度随高度衰减（较稀薄，保证可发射）
      const rvx = sh.vx - dom.vx, rvy = sh.vy - dom.vy; // 相对天体速度
      const sp = Math.hypot(rvx, rvy);
      if(sp>0){
        const Cd=0.18;
        const A=sh.dragArea * (G.chuteOpen?9:1);   // 开伞大幅增加阻力面积
        let aDrag = 0.5*rho*sp*sp*Cd*A/curMass;
        const maxDrag = sp/dt*0.5;    // 单步最多减当前相对速度的一半，防止显式欧拉发散
        if(aDrag>maxDrag) aDrag=maxDrag;
        ax -= aDrag*(rvx/sp); ay -= aDrag*(rvy/sp); // 注意：aDrag 是加速度，积分时再乘 dt
        // 气动加热：仅在超高速（>1250 m/s）再入时积热，热流 ∝ ρ·v⁴；整流罩隔热，无敌作弊豁免
        if(G.cheats.god){ sh.heat=0; }
        else {
          const fairK = sh.parts.includes('fairing') ? 0.35 : 1;
          if(sp>1250){
            const q = rho*sp*sp*sp*sp*1.2e-12;
            sh.heat=Math.min(1.05, sh.heat + q*2*fairK*dt);
          } else {
            sh.heat=Math.max(0, sh.heat-0.3*dt);
          }
          if(sh.heat>=1){ crashOverheat(dom); return; }
        }
        // 开伞时自动稳定为反向飞行姿态（机头逆速度方向）
        if(G.chuteOpen && sp>40){
          const ta=Math.atan2(-rvx, rvy);
          let da=ta-sh.angle; da=Math.atan2(Math.sin(da),Math.cos(da));
          sh.angVel += da*2.5*dt;
          sh.angVel *= Math.pow(0.05,dt);
        }
        if(sp>300) spawnAero(sp);
        if(sp>900) spawnPlasma(rvx,rvy,sp);
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
    // 作弊：无敌——任何接触都视为软着陆
    if(G.cheats.god){
      sh.x=body.x+out.x*surf; sh.y=body.y+out.y*surf;
      sh.vx=body.vx; sh.vy=body.vy;
      sh.onGround=true;
      onLanded(body);
      G.chuteOpen=false;
      const lifting=(G.throttle>0 && sh.thrust>0 && !G.roverDrive);
      if(lifting){ G.state='flight'; }
      else if(G.state==='flight'){ G.state='landed'; }
      return;
    }
    // 用相对天体的速度判定着陆/坠毁（天体自身在轨道上高速运动）
    const rvx=sh.vx-body.vx, rvy=sh.vy-body.vy;
    const speed=Math.hypot(rvx,rvy);
    const up={x:Math.sin(sh.angle), y:-Math.cos(sh.angle)};
    const align=up.x*out.x+up.y*out.y;
    const vn=rvx*out.x+rvy*out.y;
    // 着陆容差：有着陆架更宽松；开伞时进一步放宽
    let maxSpeed = sh.hasLeg ? 110 : 60;
    let minAlign = sh.hasLeg ? 0.45 : 0.85;
    if(G.chuteOpen){ maxSpeed += 60; minAlign = Math.min(minAlign, 0.30); }
    if(speed<maxSpeed && align>minAlign){
      sh.x=body.x+out.x*surf; sh.y=body.y+out.y*surf;
      if(vn<0){ sh.vx-=vn*out.x; sh.vy-=vn*out.y; }
      sh.onGround=true;
      onLanded(body);
      G.chuteOpen=false;
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

// 过热解体：再入气动加热超限
function crashOverheat(body){
  const sh=G.ship;
  sh.alive=false;
  for(let i=0;i<50;i++){
    const a=Math.random()*Math.PI*2; const sp=Math.random()*90+15;
    G.particles.push({ x:sh.x, y:sh.y, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp,
      life:0.9, max:0.9, size:Math.random()*5+2, color: Math.random()<0.4?'#fff4e0':(Math.random()<0.5?'#ff9a5a':'#ff5a3a') });
  }
  G.state='crashed';
  showEnd(false, body, true);
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
function spawnExhaust(fdir, dt, thr, ox){
  const sh=G.ship;
  // 侧挂发动机：沿箭体横向偏移喷口位置
  const rx=Math.cos(sh.angle), ry=Math.sin(sh.angle);
  const off=(ox||0);
  const bx=sh.x - fdir.x*(sh.height/2) + rx*off;
  const by=sh.y - fdir.y*(sh.height/2) + ry*off;
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
// 再入等离子尾焰（沿速度反方向喷出）
function spawnPlasma(rvx, rvy, sp){
  const sh=G.ship;
  for(let i=0;i<3;i++){
    G.particles.push({ x:sh.x+(Math.random()-0.5)*sh.height*0.5, y:sh.y+(Math.random()-0.5)*sh.height*0.5,
      vx:-rvx*0.3+(Math.random()-0.5)*80, vy:-rvy*0.3+(Math.random()-0.5)*80,
      life:0.45, max:0.45, size:Math.random()*4+3,
      color: Math.random()<0.4?'#fff4e0':(Math.random()<0.5?'#ff9a5a':'#ff5a3a') });
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
      jettison(sh.parts.slice(li), sh.parts.slice(0, li), (sh.flips||[]).slice(li), (sh.flips||[]).slice(0, li),
               (sh.sides||[]).slice(li), (sh.sides||[]).slice(0, li));
    }
    return;
  }
  const dropParts = sh.parts.slice(idx);          // 含分离器及以下
  const keepParts = sh.parts.slice(0, idx);
  const dropFlips = (sh.flips||[]).slice(idx);
  const keepFlips = (sh.flips||[]).slice(0, idx);
  const dropSides = (sh.sides||[]).slice(idx);
  const keepSides = (sh.sides||[]).slice(0, idx);
  jettison(dropParts, keepParts, dropFlips, keepFlips, dropSides, keepSides);
}
function jettison(dropParts, keepParts, dropFlips, keepFlips, dropSides, keepSides){
  const sh=G.ship;
  unlockMission('stage');
  // 计算被抛部分的质量/燃料
  let dm=0, df=0, dr=0;
  for(const p of dropParts){ const d=PARTS[p]; dm+=d.mass; if(d.fuel) df+=d.fuel; if(d.rcsFuel) dr+=d.rcsFuel; }
  // 残骸
  const fdir={x:Math.sin(sh.angle), y:-Math.cos(sh.angle)};
  const kick=10;
  G.debris.push({ parts:dropParts, flips:dropFlips||[], sides:dropSides||[], x:sh.x, y:sh.y,
    vx:sh.vx - fdir.x*kick, vy:sh.vy - fdir.y*kick,
    angle:sh.angle, angVel:0.4, life:9999 });
  if(G.debris.length>14) G.debris.shift();
  // 主动飞船更新
  sh.parts = keepParts;
  sh.flips = (keepFlips && keepFlips.length===keepParts.length) ? keepFlips : keepParts.map(()=>({h:false,v:false}));
  sh.sides = (keepSides && keepSides.length===keepParts.length) ? keepSides : keepParts.map(()=>0);
  recomputeShip(sh);
  sh.fuel = Math.max(0, sh.fuel - df);
  sh.fuelMax = sh.fuel;
  sh.rcsFuel = Math.max(0, sh.rcsFuel - dr);
  sh.rcsFuelMax = sh.rcsFuel;
  sh.elecMax = rocketStats(keepParts, keepSides).elecCap;
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
//  作弊：瞬移入轨（围绕主导天体的顺行圆轨道）
//==================================================================
function cheatOrbit(){
  const sh=G.ship;
  if(!sh || !sh.alive || (G.state!=='flight' && G.state!=='landed')) return;
  const dom=dominantBody(sh.x, sh.y) || TERRA;
  const dx=sh.x-dom.x, dy=sh.y-dom.y;
  const rl=Math.hypot(dx,dy)||1;
  const ux=dx/rl, uy=dy/rl;
  const r=Math.max(rl, dom.R+60000);
  sh.x=dom.x+ux*r; sh.y=dom.y+uy*r;
  const vc=Math.sqrt(dom.mu/r);
  sh.vx=dom.vx - uy*vc; sh.vy=dom.vy + ux*vc;   // 顺行（CCW）圆轨道速度
  sh.onGround=false; G.docked=false; G.roverDrive=false;
  if(G.state!=='flight') G.state='flight';
  G.camera.x=sh.x; G.camera.y=sh.y;
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
    unlockMission('dock');
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

  // 再入热光晕（船体周围橙红辉光，随热度增强）
  if(G.ship && G.ship.alive && G.ship.heat>0.03){
    const hs=worldToScreen(G.ship.x, G.ship.y);
    const R=70*G.ship.heat+30;
    const g=ctx.createRadialGradient(hs.x,hs.y,2, hs.x,hs.y,R);
    g.addColorStop(0,'rgba(255,150,60,'+(0.55*G.ship.heat).toFixed(3)+')');
    g.addColorStop(1,'rgba(255,80,20,0)');
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(hs.x,hs.y,R,0,Math.PI*2); ctx.fill();
  }
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
  // 行星光环（朱庇特）
  if(b.rings && rad>2){
    ctx.save(); ctx.translate(s.x,s.y); ctx.scale(1,0.32);
    ctx.strokeStyle='rgba(200,190,160,.35)'; ctx.lineWidth=Math.max(1.2,rad*0.16);
    ctx.beginPath(); ctx.arc(0,0,rad*1.45,0,Math.PI*2); ctx.stroke();
    ctx.strokeStyle='rgba(220,210,180,.22)'; ctx.lineWidth=Math.max(1,rad*0.07);
    ctx.beginPath(); ctx.arc(0,0,rad*1.75,0,Math.PI*2); ctx.stroke();
    ctx.restore();
  }
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
  ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(d.angle);
  // 与飞船同一套布局（支持侧向挂点）
  const L=computeLayout(d.parts, d.sides);
  const halfH=L.height/2*sc;
  for(const r of L.rows){
    const dd=PARTS[r.key];
    const ph=dd.h*sc, pw=dd.w*sc;
    const py=(halfH - r.py*sc) - ph;
    drawPartShape(ctx, r.ox*sc, py, pw, ph, dd, 0.85, (d.flips && d.flips[r.i]) || {h:false,v:false});
  }
  ctx.restore();
}
function drawShip(){
  const sh=G.ship;
  const s=worldToScreen(sh.x, sh.y);
  const sc=G.camera.scale;
  ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(sh.angle);
  // 用布局行绘制（支持侧向挂载：ox 为相对中轴的横向偏移，单位米）
  const rows = sh.rows && sh.rows.length ? sh.rows : computeLayout(sh.parts, sh.sides).rows;
  const halfH = sh.height/2*sc;
  for(const r of rows){
    const d=PARTS[r.key];
    const ph=d.h*sc, pw=d.w*sc;
    const yBottom = halfH - r.py*sc;       // 该零件底部（局部坐标，向下为正）
    const py = yBottom - ph;
    drawPartShape(ctx, r.ox*sc, py, pw, ph, d, 1, (sh.flips && sh.flips[r.i]) || {h:false,v:false});
  }
  // 张开的降落伞：伞绳 + 橙白条纹伞盖（局部坐标 -y 为机头方向）
  if(G.chuteOpen){
    const top=-sh.height/2*sc;
    const R=Math.max(10, sh.height*sc*0.55);
    const cy=top-R-Math.max(14, R*1.15);
    ctx.strokeStyle='rgba(230,235,245,.85)'; ctx.lineWidth=Math.max(1, sc*8);
    [-R*0.9,-R*0.45,0,R*0.45,R*0.9].forEach(function(sx){
      ctx.beginPath(); ctx.moveTo(sx*0.22, top); ctx.lineTo(sx, cy+R*0.12); ctx.stroke();
    });
    const g=ctx.createLinearGradient(-R,0,R,0);
    g.addColorStop(0,'#d84a1f'); g.addColorStop(0.5,'#f2f2ee'); g.addColorStop(1,'#d84a1f');
    ctx.fillStyle=g;
    ctx.beginPath(); ctx.arc(0, cy, R, Math.PI, 0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle='rgba(10,16,28,.5)'; ctx.lineWidth=1; ctx.stroke();
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
  if(G.cheats.fuel||G.cheats.god||G.cheats.thrust){
    el.innerHTML += `<div><span class="k">⚠</span> <span class="v" style="color:#ffd23c">${i18n.t('sfs_cheat_on')}</span></div>`;
  }
  if(sh.heat>0.01){
    el.innerHTML += `<div><span class="k">${i18n.t('sfs_heat')}</span> <span class="v ${sh.heat>0.7?'bad':'good'}">${(sh.heat*100).toFixed(0)}%</span></div>`;
  }
  if(G.ap.mode!=='OFF'){
    el.innerHTML += `<div><span class="k">🤖 ${i18n.t('sfs_ap')}</span> <span class="v" style="color:#7fffd4">${i18n.t(G.ap.phase||'sfs_ap_idle')}</span></div>`;
  }
  document.getElementById('dockPanel').classList.toggle('hidden', !G.docked);
  updateApPanel();
  checkMissions();

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
  if(k==='a'||k==='arrowleft'){ keys.left=true;  if(G.ap.mode!=='OFF') apOff('sfs_ap_off_msg'); }
  if(k==='d'||k==='arrowright'){ keys.right=true; if(G.ap.mode!=='OFF') apOff('sfs_ap_off_msg'); }
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
  if(k==='c') toggleCheatPanel();
  if(k==='p') toggleChute();
  if(k==='t') toggleMissionPanel();
  if(k==='v') toggleApPanel();
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

//==================================================================
//  作弊系统：面板开关与选项绑定
//==================================================================
const cheatPanel=document.getElementById('cheatPanel');
function toggleCheatPanel(){ cheatPanel.classList.toggle('hidden'); }
document.getElementById('cheatBtn').onclick=toggleCheatPanel;
document.getElementById('ckClose').onclick=toggleCheatPanel;
document.getElementById('ckFuel').addEventListener('change',e=>{
  G.cheats.fuel=e.target.checked;
  if(G.cheats.fuel && G.ship){   // 开启时顺手加满
    G.ship.fuel=G.ship.fuelMax; G.ship.rcsFuel=G.ship.rcsFuelMax; G.ship.elec=G.ship.elecMax;
  }
});
document.getElementById('ckGod').addEventListener('change',e=>{ G.cheats.god=e.target.checked; });
document.getElementById('ckThrust').addEventListener('change',e=>{ G.cheats.thrust=e.target.checked; });
document.getElementById('ckOrbit').onclick=cheatOrbit;

//==================================================================
//  自动驾驶：自动入轨（重力转弯+远地点圆化）/ 自动着陆（刹车+制导下降）
//==================================================================
// cut=true 时同时收油门（正常完成/退出时用，避免着陆后残余推力又把自己顶起来）
function apOff(msg, cut){ G.ap={ mode:'OFF', phase:msg||'', targetAlt:0 }; if(cut) G.throttle=0; updateApPanel(); }
// 目标轨道高度：有大气取大气层顶再高一点，无大气按半径比例
function apTargetAlt(dom){ return (dom.atmo||0)>0 ? dom.atmo*1.4+4000 : dom.R*0.06+4000; }
function apStartOrbit(){
  const sh=G.ship; if(!sh||!sh.alive) return;
  const dom=dominantBody(sh.x,sh.y)||TERRA;
  if(!(sh.thrust>0)){ G.ap={mode:'OFF', phase:'sfs_ap_no_engine', targetAlt:0}; updateApPanel(); return; }
  G.ap={ mode:'ASCENT', phase:'sfs_ap_ascent', targetAlt:apTargetAlt(dom) };
  updateApPanel();
}
function apStartLand(){
  const sh=G.ship; if(!sh||!sh.alive) return;
  const dom=dominantBody(sh.x,sh.y)||TERRA;
  const o=orbitInfo(dom);
  const inOrbit = o && !o.escape && o.ap > (dom.atmo||0)*1.2+2000;
  G.ap={ mode: inOrbit?'DEORBIT':'DESCENT', phase: inOrbit?'sfs_ap_deorbit':'sfs_ap_descent', targetAlt:0 };
  updateApPanel();
}
// 机头指向 (dx,dy) 所需的箭体角度（fdir=(sin a, -cos a)）
function apAngleTo(dx,dy){ return Math.atan2(dx,-dy); }
// 一阶姿态跟踪：直接把角速度拉向目标，避免被阻尼吃掉
function apSteer(angle, dt){
  const sh=G.ship;
  let da=angle-sh.angle; da=Math.atan2(Math.sin(da),Math.cos(da));
  const want=Math.max(-2.5, Math.min(2.5, da*3));
  sh.angVel += (want-sh.angVel)*Math.min(1, 10*dt);
}
function autopilot(dt){
  const sh=G.ship; if(!sh||!sh.alive){ apOff(); return; }
  const dom=dominantBody(sh.x,sh.y); if(!dom){ apOff(); return; }
  if(G.docked){ apOff('sfs_ap_off_msg'); return; }
  const ux=sh.x-dom.x, uy=sh.y-dom.y; const rl=Math.hypot(ux,uy)||1;
  const up={x:ux/rl, y:uy/rl};
  const alt=rl-dom.R;
  const east={x:-up.y, y:up.x};                       // 顺行方向（CCW，与 cheatOrbit 一致）
  const rvx=sh.vx-dom.vx, rvy=sh.vy-dom.vy;
  const sp=Math.hypot(rvx,rvy)||1;
  const pro={x:rvx/sp, y:rvy/sp};
  const vert=rvx*up.x+rvy*up.y;                       // >0 = 上升
  const o=orbitInfo(dom);
  const braking = (G.ap.mode==='DEORBIT'||G.ap.mode==='DESCENT');
  const hasChute = sh.parts.indexOf('chute')>=0;
  // 没油就别硬撑：上升/圆化直接退出；离轨必须靠动力；下降段若既无伞又无大气且没油，注定摔
  if(G.ap.mode==='ASCENT' || G.ap.mode==='COAST' || G.ap.mode==='CIRC'){
    if(sh.fuel<=0){ apOff('sfs_ap_no_fuel', true); return; }
  } else if(G.ap.mode==='DEORBIT'){
    if(sh.fuel<=0){ apOff('sfs_ap_no_fuel', true); return; }
  } else if(G.ap.mode==='DESCENT'){
    if(sh.fuel<=0 && !(hasChute && (dom.atmo||0)>0)){ apOff('sfs_ap_no_fuel', true); return; }
  }

  switch(G.ap.mode){
    case 'ASCENT': {
      // 重力转弯：800m 内垂直上升，之后按高度比例把机头压向顺行方向
      const span=Math.max(3000, (dom.atmo||0)*0.8);
      const t=Math.max(0, Math.min(1, (alt-800)/span));
      const tilt=(Math.PI/2)*Math.pow(t,0.75)*0.92;
      const dir={x:up.x*Math.cos(tilt)+east.x*Math.sin(tilt), y:up.y*Math.cos(tilt)+east.y*Math.sin(tilt)};
      apSteer(apAngleTo(dir.x,dir.y), dt);
      G.throttle = (o.escape || o.ap>=G.ap.targetAlt) ? 0 : 1;
      if(G.throttle===0){ G.ap.mode='COAST'; G.ap.phase='sfs_ap_coast'; }
      break;
    }
    case 'COAST': {
      apSteer(apAngleTo(pro.x,pro.y), dt);
      G.throttle=0;
      if(vert<25 || alt>G.ap.targetAlt*0.97){ G.ap.mode='CIRC'; G.ap.phase='sfs_ap_circ'; }
      break;
    }
    case 'CIRC': {
      apSteer(apAngleTo(pro.x,pro.y), dt);
      const need=(dom.atmo||0)*0.85+2000;
      G.throttle = (!o.escape && o.pe>=need) ? 0 : 1;
      if(G.throttle===0) apOff('sfs_ap_done_orbit', true);
      break;
    }
    case 'DEORBIT': {
      apSteer(apAngleTo(-pro.x,-pro.y), dt);
      G.throttle=1;
      const stop=(dom.atmo||0)>0 ? (dom.atmo*0.35+200) : (dom.R*0.02);
      if(!o.escape && o.pe<stop){ G.throttle=0; G.ap.mode='DESCENT'; G.ap.phase='sfs_ap_descent'; }
      break;
    }
    case 'DESCENT': {
      const ag=Math.max(0, rl-dom.R-sh.radius);          // 离地高度
      const down=-vert;                                  // 下降速度（正=在下降）
      const atmo=(dom.atmo||0);
      const inAtmo=atmo>0 && alt<atmo*1.05;
      if(hasChute && atmo>0 && inAtmo && sp<900 && !G.chuteOpen) toggleChute();
      const mass=Math.max(1, sh.dry+sh.fuel);
      const aAvail=(sh.thrust>0 && sh.fuel>0) ? (sh.thrust/mass)*0.75 : 0;
      let brake=false, dir=up;
      // 该高度允许的最大速度：v²=2·a·(ag-25)，即「刚好能在触地前刹停」的速度上限
      const vAllowed = aAvail>0 ? Math.sqrt(Math.max(0, 2*aAvail*Math.max(0, ag-25))) : 0;
      if(atmo>0){
        // 有大气：速度被终端速度限制，别在高空浪费燃料——只在「再入过热」或「超出该高度允许速度」时点火
        if(sp>1250 && alt>atmo*0.3 && alt<atmo*2.5){ brake=true; dir={x:-pro.x,y:-pro.y}; }
        else if(ag<150){ brake = down>20; dir=up; }                 // 末段：控下降率软着陆
        else if(aAvail>0){
          brake = sp > vAllowed*0.9;
          dir = (ag>400 && sp>80) ? {x:-pro.x,y:-pro.y} : up;
        }
      } else {
        // 无大气：经典自杀式反推
        if(ag<150){ brake = down>20; }
        else if(aAvail>0){ brake = sp > vAllowed*0.9; }
        dir=(ag>400 && sp>60) ? {x:-pro.x,y:-pro.y} : up;
      }
      apSteer(apAngleTo(dir.x,dir.y), dt);
      G.throttle = brake ? 1 : 0;
      if(sh.onGround) apOff('sfs_ap_done_land', true);
      break;
    }
    default: G.throttle=G.throttle;
  }
}
function updateApPanel(){
  const b=document.getElementById('apBtn'); if(b) b.classList.toggle('on', G.ap.mode!=='OFF');
  const st=document.getElementById('apStatus'); if(!st) return;
  st.textContent = (G.ap.mode==='OFF')
    ? (G.ap.phase ? i18n.t(G.ap.phase) : i18n.t('sfs_ap_idle'))
    : i18n.t('sfs_ap_active')+'：'+i18n.t(G.ap.phase||'sfs_ap_idle');
}
function toggleApPanel(){
  document.getElementById('apPanel').classList.toggle('hidden');
  updateApPanel();
}
document.getElementById('apBtn').onclick=toggleApPanel;
document.getElementById('apOrbit').onclick=apStartOrbit;
document.getElementById('apLand').onclick=apStartLand;
document.getElementById('apOffBtn').onclick=()=>apOff('sfs_ap_off_msg');

//==================================================================
//  任务 / 成就系统（localStorage 持久化）
//==================================================================
const MISSIONS=[
  { id:'orbit',  zh:'到达稳定轨道', en:'Reach a stable orbit', zhD:'在任意天体周围进入闭合轨道（近地点高于大气层）', enD:'Enter a closed orbit around any body (periapsis above atmosphere)' },
  { id:'luna',   zh:'登陆月球', en:'Land on Luna', zhD:'安全降落在月球表面', enD:'Touch down safely on Luna' },
  { id:'vesta',  zh:'登陆维斯塔', en:'Land on Vesta', zhD:'安全降落在维斯塔表面', enD:'Touch down safely on Vesta' },
  { id:'glacius',zh:'登陆格拉修斯', en:'Land on Glacius', zhD:'在冰星格拉修斯的稀薄大气中着陆', enD:'Land on the ice world Glacius' },
  { id:'jove',   zh:'登陆朱庇特', en:'Land on Jove', zhD:'穿过厚重大气降落在气态巨行星上', enD:'Descend through the thick atmosphere of Jove' },
  { id:'io',     zh:'登陆伊奥', en:'Land on Io', zhD:'降落在朱庇特的卫星伊奥上', enD:'Touch down on Io' },
  { id:'europa', zh:'登陆欧罗巴', en:'Land on Europa', zhD:'降落在冰月欧罗巴上', enD:'Touch down on the icy moon Europa' },
  { id:'dock',   zh:'与空间站对接', en:'Dock with the station', zhD:'缓慢接触并与绕泰拉的空间站对接', enD:'Dock with the station orbiting Terra' },
  { id:'stage',  zh:'完成分级分离', en:'Perform staging', zhD:'用分离器抛掉用完的一级', enD:'Jettison a spent stage with a decoupler' },
  { id:'rover',  zh:'驾驶漫游车', en:'Drive a rover', zhD:'在星球表面切换漫游车模式行驶', enD:'Switch to rover mode and drive on the surface' },
  { id:'chute',  zh:'伞降着陆', en:'Parachute landing', zhD:'在降落伞张开的状态下安全着陆', enD:'Land safely with a deployed parachute' },
  { id:'home',   zh:'凯旋回家', en:'Return home', zhD:'离开泰拉之后再次安全返回泰拉表面', enD:'Leave Terra and land back home safely' },
];
function loadMissions(){ try{ return JSON.parse(localStorage.getItem('sfs-missions-v1'))||{}; }catch(e){ return {}; } }
function saveMissions(){ try{ localStorage.setItem('sfs-missions-v1', JSON.stringify(G.missions)); }catch(e){} }
G.missions = loadMissions();
let missionToastTimer=null;
function unlockMission(id){
  const m=MISSIONS.find(x=>x.id===id);
  if(!m || G.missions[id]) return;
  G.missions[id]=true; saveMissions(); renderMissions();
  const t=document.getElementById('missionToast');
  if(t){
    t.textContent='🏆 '+i18n.t('sfs_mission_toast')+'：'+(i18n.lang==='zh'?m.zh:m.en);
    t.classList.add('show');
    clearTimeout(missionToastTimer);
    missionToastTimer=setTimeout(()=>t.classList.remove('show'), 3500);
  }
}
function onLanded(body){
  unlockMission(body.name.toLowerCase());
  if(G.chuteOpen) unlockMission('chute');
  if(body===TERRA && G.awayHome) unlockMission('home');
}
function renderMissions(){
  const el=document.getElementById('missionList'); if(!el) return;
  el.innerHTML='';
  MISSIONS.forEach(function(m){
    const done=!!G.missions[m.id];
    const d=document.createElement('div'); d.className='mi'+(done?' done':'');
    d.innerHTML='<span class="ic">'+(done?'✅':'⬜')+'</span><span class="miT">'+(i18n.lang==='zh'?m.zh:m.en)+'</span><div class="miD">'+(i18n.lang==='zh'?m.zhD:m.enD)+'</div>';
    el.appendChild(d);
  });
}
function toggleMissionPanel(){
  const p=document.getElementById('missionPanel');
  p.classList.toggle('hidden'); renderMissions();
}
function checkMissions(){
  const sh=G.ship; if(!sh || !sh.alive) return;
  if(G.docked) unlockMission('dock');
  const dom=dominantBody(sh.x, sh.y);
  if(dom){
    if(dom!==TERRA) G.awayHome=true;
    const o=orbitInfo(dom);
    if(!o.escape && o.pe > (dom.atmo||0)+2000) unlockMission('orbit');
  }
}
document.getElementById('missionBtn').onclick=toggleMissionPanel;
document.getElementById('miClose').onclick=toggleMissionPanel;

//==================================================================
//  降落伞
//==================================================================
function toggleChute(){
  const sh=G.ship;
  if(!sh || !sh.alive) return;
  if(!sh.parts.includes('chute')) return;
  G.chuteOpen=!G.chuteOpen;
}
document.getElementById('chuteBtn').onclick=toggleChute;

//==================================================================
//  对接后的空间站服务：加注 / 充电 / 加装舱段
//==================================================================
document.getElementById('dkFuel').onclick=function(){
  const sh=G.ship; if(!sh || !G.docked) return;
  sh.fuel=sh.fuelMax; sh.rcsFuel=sh.rcsFuelMax;
};
document.getElementById('dkElec').onclick=function(){
  const sh=G.ship; if(!sh || !G.docked) return;
  sh.elec=sh.elecMax;
};
document.getElementById('dkMod').onclick=function(){
  const sh=G.ship; if(!sh || !G.docked) return;
  sh.parts.unshift('solar');
  sh.flips=(sh.flips||[]).slice();
  sh.flips.unshift({h:false,v:false});
  recomputeShip(sh);
  sh.elecMax=rocketStats(sh.parts).elecCap;
  sh.elec=sh.elecMax;
};
document.getElementById('dkUndock').onclick=function(){ if(G.docked) undock(); };

//==================================================================
//  蓝图：本地保存 / 载入 / 删除 / 分享码导出导入
//==================================================================
function bpList(){ try{ return JSON.parse(localStorage.getItem('sfs-blueprints-v1'))||[]; }catch(e){ return []; } }
function bpSaveList(l){ try{ localStorage.setItem('sfs-blueprints-v1', JSON.stringify(l)); }catch(e){} }
function bpRender(){
  const el=document.getElementById('bpList'); if(!el) return;
  const list=bpList(); el.innerHTML='';
  if(!list.length){
    el.innerHTML='<div class="bpRow"><span class="nm" style="color:#8aa3cc">'+i18n.t('sfs_bp_empty')+'</span></div>';
    return;
  }
  list.forEach(function(bp,i){
    const d=document.createElement('div'); d.className='bpRow';
    const nm=document.createElement('span'); nm.className='nm'; nm.textContent=bp.name;
    const use=document.createElement('button'); use.className='btn sm'; use.textContent=i18n.t('sfs_bp_use');
    use.onclick=function(){
      G.parts=bp.parts.slice();
      G.flips=(bp.flips||[]).map(f=>({h:!!f.h, v:!!f.v}));
      while(G.flips.length<G.parts.length) G.flips.push({h:false,v:false});
      G.sides=(bp.sides||[]).slice();
      while(G.sides.length<G.parts.length) G.sides.push(0);
      G.selPart=-1; drawBuild();
    };
    const exp=document.createElement('button'); exp.className='btn alt sm'; exp.textContent='⇪';
    exp.title=i18n.t('sfs_bp_export');
    exp.onclick=function(){
      const code='GWBP1:'+btoa(unescape(encodeURIComponent(JSON.stringify(bp))));
      const ta=document.getElementById('bpCode'); ta.value=code; ta.select();
      try{ document.execCommand('copy'); }catch(e){}
    };
    const del=document.createElement('button'); del.className='btn alt sm'; del.textContent=i18n.t('sfs_bp_del');
    del.onclick=function(){ const l=bpList(); l.splice(i,1); bpSaveList(l); bpRender(); };
    d.appendChild(nm); d.appendChild(use); d.appendChild(exp); d.appendChild(del);
    el.appendChild(d);
  });
}
function bpSave(){
  const name=prompt(i18n.t('sfs_bp_name'), i18n.t('sfs_bp_default'));
  if(!name) return;
  const l=bpList();
  l.push({ name:name, parts:G.parts.slice(), flips:G.flips.map(f=>({h:f.h, v:f.v})), sides:G.sides.slice() });
  bpSaveList(l); bpRender();
}
function bpImport(){
  const raw=(document.getElementById('bpCode').value||'').trim();
  if(!raw) return;
  try{
    const json=raw.indexOf('GWBP1:')===0 ? JSON.parse(decodeURIComponent(escape(atob(raw.slice(6))))) : JSON.parse(raw);
    if(!json.parts || !json.parts.every(p=>PARTS[p])) throw new Error('bad');
    const l=bpList();
    l.push({ name:json.name||'Imported', parts:json.parts, flips:json.flips||[], sides:json.sides||[] });
    bpSaveList(l); bpRender();
  }catch(e){ alert(i18n.t('sfs_bp_badcode')); }
}
document.getElementById('bpSaveBtn').onclick=bpSave;
document.getElementById('bpLoadBtn').onclick=function(){
  document.getElementById('bpPanel').classList.toggle('hidden');
  bpRender();
};
document.getElementById('bpClose').onclick=function(){ document.getElementById('bpPanel').classList.add('hidden'); };
document.getElementById('bpImportBtn').onclick=bpImport;

function toggleSAS(){ G.sas=!G.sas; }
function toggleMap(){ G.mapMode=!G.mapMode; if(G.mapMode) G.camera.targetScale=Math.min(G.camera.targetScale,0.0009); }
function toggleRover(){ if(G.ship&&G.ship.onGround&&G.ship.hasWheel){ G.roverDrive=!G.roverDrive; if(G.roverDrive) unlockMission('rover'); } }
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
  document.getElementById('cheatPanel').classList.add('hidden');
}
function toBuild(){ G.state='build'; G.selPart=-1; drawBuild(); showState(); }
function resetToBuild(){ G.particles=[]; G.debris=[]; toBuild(); }
function showEnd(win, body, overheat){
  const ov=document.getElementById('endOverlay');
  ov.className='overlay '+(win?'win':'lose');
  document.getElementById('endTitle').textContent=win?i18n.t('sfs_win'):(overheat?i18n.t('sfs_overheat'):i18n.t('sfs_crash'));
  if(win) document.getElementById('endMsg').textContent=i18n.t('sfs_win_msg').replace('{body}', bodyName(body));
  else if(overheat) document.getElementById('endMsg').textContent=i18n.t('sfs_overheat_msg').replace('{body}', bodyName(body||TERRA));
  else document.getElementById('endMsg').textContent=i18n.t('sfs_crash_msg').replace('{body}', bodyName(body||{name:'星球',nameZh:'星球',nameEn:'planet'}));
  document.getElementById('hud').classList.add('hidden');
  ov.classList.remove('hidden');
}
document.getElementById('endRetry').onclick=()=>startFlight();
document.getElementById('endBuild').onclick=()=>toBuild();
document.getElementById('startBtn').onclick=()=>toBuild();
document.getElementById('launchBtn').onclick=()=>{
  if(!G.parts.length){ alert(i18n.t('sfs_no_parts')); return; }   // 空箭不能发射
  startFlight();
};
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
        // 天体与飞船同步推进（原先天体整帧才更新一次，高时间加速下飞船会相对天体累积漂移）
        G.time += sub;
        updateBodies(G.time);
        physicsStep(sub);
        if(G.docked) dockKeep();
        if(!G.ship.alive) break;
      }
      if(!G.docked) updateDebris(sub*steps);
    }
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
      sfs_build_hint:'拖拽零件到火箭上添加（落点决定上/下位置）· 拖到左右两侧即为侧挂 · 点击零件选中 · 滚轮缩放视图',
      sfs_launch:'🚀 发射', sfs_back_menu:'返回菜单',
      sfs_map:'星图 (M)', sfs_sas:'SAS (Z)', sfs_stage:'分级 (Space)', sfs_rover:'漫游车 (G)', sfs_reset:'重置 (R)',
      sfs_controls:'W/S 油门 · A/D 转向 · Z SAS · M 星图 · , . 时间加速 · Space 分级 · IJKL 平移 · G 漫游车 · P 降落伞 · T 任务 · V 自动驾驶 · R 重置 · C 作弊',
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
      sfs_yes:'有', sfs_no:'无', sfs_height:'火箭高度',
      sfs_cheat:'作弊 (C)', sfs_cheat_title:'作弊菜单',
      sfs_cheat_fuel:'无限燃料 / RCS / 电量', sfs_cheat_god:'无敌（永不坠毁）', sfs_cheat_thrust:'引擎推力 ×5',
      sfs_cheat_orbit:'🛰 瞬移入轨', sfs_cheat_close:'关闭', sfs_cheat_on:'作弊已开启',
      sfs_chute:'降落伞 (P)', sfs_mission:'任务', sfs_mission_title:'任务 / 成就', sfs_mission_toast:'成就解锁',
      sfs_heat:'热度', sfs_overheat:'过热解体！', sfs_overheat_msg:'再入速度过快，火箭在 {body} 上空烧毁。',
      sfs_dock_title:'已对接 · 空间站服务', sfs_dock_fuel:'⛽ 加满燃料', sfs_dock_elec:'🔋 充满电量',
      sfs_dock_module:'➕ 加装太阳板', sfs_dock_undock:'脱离 (G/Space)',
      sfs_bp_save:'💾 保存蓝图', sfs_bp_load:'📂 蓝图库', sfs_bp_title:'蓝图库', sfs_bp_name:'蓝图名称',
      sfs_bp_default:'我的火箭', sfs_bp_use:'载入', sfs_bp_del:'删', sfs_bp_export:'导出分享码',
      sfs_bp_import_btn:'导入', sfs_bp_code_ph:'粘贴分享码…', sfs_bp_empty:'（还没有保存的蓝图）', sfs_bp_badcode:'分享码无效',
      sfs_ap:'自动驾驶', sfs_ap_title:'自动驾驶', sfs_ap_active:'自动驾驶中', sfs_ap_idle:'待机 · 选择模式',
      sfs_ap_orbit:'🚀 自动入轨', sfs_ap_land:'🛬 自动着陆', sfs_ap_off:'✖ 关闭',
      sfs_ap_ascent:'上升段（重力转弯）', sfs_ap_coast:'滑行至远地点', sfs_ap_circ:'远地点圆化',
      sfs_ap_deorbit:'离轨刹车', sfs_ap_descent:'制导下降',
      sfs_ap_done_orbit:'入轨完成，已交还操控', sfs_ap_done_land:'着陆完成，已交还操控',
      sfs_ap_no_fuel:'燃料耗尽，自动驾驶退出', sfs_ap_no_engine:'没有引擎，无法自动入轨', sfs_ap_off_msg:'自动驾驶已关闭',
      sfs_side_toggle:'⇤ 侧挂 ⇥', sfs_sym:'对称', sfs_width:'宽度',
      sfs_no_core:'无控制核心：转动力矩较低', sfs_thrust_off:'推力偏置', sfs_no_parts:'请先放置至少一个零件'
    },
    en: {
      sfs_menu_title:'Space Flight Sim', sfs_menu_sub:'SPACE FLIGHT SIMULATOR · Build · Launch · Orbit · Land · Dock · Rover',
      sfs_start_build:'Build Rocket', sfs_launch_body:'Launch Body', sfs_part_lib:'Parts',
      sfs_remove:'Remove', sfs_clear:'Clear', sfs_flip_v:'Flip ↕', sfs_flip_h:'Flip ↔',
      sfs_build_hint:'Drag parts onto the rocket (drop point sets position) · drop left/right of the axis to mount on the side · click to select · wheel to zoom',
      sfs_launch:'🚀 Launch', sfs_back_menu:'Back to Menu',
      sfs_map:'Map (M)', sfs_sas:'SAS (Z)', sfs_stage:'Stage (Space)', sfs_rover:'Rover (G)', sfs_reset:'Reset (R)',
      sfs_controls:'W/S throttle · A/D steer · Z SAS · M map · , . time warp · Space stage · IJKL translate · G rover · P chute · T missions · V autopilot · R reset · C cheats',
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
      sfs_yes:'yes', sfs_no:'no', sfs_height:'Height',
      sfs_cheat:'Cheats (C)', sfs_cheat_title:'Cheat Menu',
      sfs_cheat_fuel:'Infinite fuel / RCS / power', sfs_cheat_god:'Indestructible (never crash)', sfs_cheat_thrust:'Engine thrust ×5',
      sfs_cheat_orbit:'🛰 Teleport to orbit', sfs_cheat_close:'Close', sfs_cheat_on:'Cheats on',
      sfs_chute:'Chute (P)', sfs_mission:'Missions', sfs_mission_title:'Missions / Achievements', sfs_mission_toast:'Achievement unlocked',
      sfs_heat:'Heat', sfs_overheat:'Overheated!', sfs_overheat_msg:'Reentry too hot — the rocket burned up above {body}.',
      sfs_dock_title:'Docked · Station Services', sfs_dock_fuel:'⛽ Refuel', sfs_dock_elec:'🔋 Recharge',
      sfs_dock_module:'➕ Attach solar panel', sfs_dock_undock:'Undock (G/Space)',
      sfs_bp_save:'💾 Save Blueprint', sfs_bp_load:'📂 Blueprints', sfs_bp_title:'Blueprints', sfs_bp_name:'Blueprint name',
      sfs_bp_default:'My Rocket', sfs_bp_use:'Load', sfs_bp_del:'Del', sfs_bp_export:'Export share code',
      sfs_bp_import_btn:'Import', sfs_bp_code_ph:'Paste share code…', sfs_bp_empty:'(no saved blueprints yet)', sfs_bp_badcode:'Invalid share code',
      sfs_ap:'Autopilot', sfs_ap_title:'Autopilot', sfs_ap_active:'Autopilot', sfs_ap_idle:'Standby · pick a mode',
      sfs_ap_orbit:'🚀 Auto Orbit', sfs_ap_land:'🛬 Auto Land', sfs_ap_off:'✖ Disengage',
      sfs_ap_ascent:'Ascent (gravity turn)', sfs_ap_coast:'Coast to apoapsis', sfs_ap_circ:'Circularizing',
      sfs_ap_deorbit:'Deorbit burn', sfs_ap_descent:'Guided descent',
      sfs_ap_done_orbit:'Orbit achieved — control returned', sfs_ap_done_land:'Touchdown — control returned',
      sfs_ap_no_fuel:'Out of fuel — autopilot off', sfs_ap_no_engine:'No engine — cannot reach orbit', sfs_ap_off_msg:'Autopilot disengaged',
      sfs_side_toggle:'⇤ Side ⇥', sfs_sym:'Mirror', sfs_width:'Width',
      sfs_no_core:'No control core: reduced torque', sfs_thrust_off:'Thrust offset', sfs_no_parts:'Place at least one part first'
    }
  },
  onLang: function(){
    buildBodySel();
    buildPartList();
    renderMissions();
    updateApPanel();
    if(G.lastBuildStats) updateBuildStats(G.lastBuildStats);
  }
});

// 测试钩子（供自动化冒烟测试调用）
if(typeof globalThis!=='undefined'){
  globalThis.__t={G,startFlight,physicsStep,orbitInfo,predictPath,render,gravityAt,stage,checkDock,dominantBody,updateBodies,rocketStats,BODIES,findBody,keys,loop,updateHUD,addPart,flipSel,buildPartRects,insertIndexAt,drawBuild,bodyName,partName,cheatOrbit,toggleCheatPanel,toggleChute,unlockMission,MISSIONS,checkMissions,onLanded,crashOverheat,computeLayout,autopilot,apStartOrbit,apStartLand,apOff,cycleSide,dropTargetAt};
}

})();
