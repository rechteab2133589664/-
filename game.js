(() => {
'use strict';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const KEY='hospital.field-engineer.v1';
const definitions=[
 {id:'ISP',name:'電信商交接設備',type:'isp',x:130,y:150,w:80,d:55,h:66,ports:['GE0'],note:'ISP 交接埠 GE0。這是電信商提供的上行介面。'},
 {id:'UPS',name:'不斷電系統',type:'ups',x:275,y:150,w:65,d:60,h:78,ports:[],note:'已預接機櫃 PDU。開啟 UPS 可供應路由器、防火牆、核心與接入交換器。'},
 {id:'RTR-01',name:'邊界路由器',type:'router',x:420,y:150,w:85,d:58,h:92,ports:['WAN','LAN','Console'],note:'WAN 接電信商，LAN 接防火牆 WAN。本關已載入邊界路由實驗設定。'},
 {id:'FW-01',name:'防火牆',type:'firewall',x:565,y:150,w:85,d:58,h:92,ports:['WAN','LAN','Console'],note:'WAN 接路由器，LAN 接核心。此原型使用實驗室預設放行規則。'},
 {id:'CORE-01',name:'核心交換器',type:'core',x:150,y:390,w:100,d:65,h:118,ports:['Gi0/1','Gi0/2','Gi0/3','Gi0/4','Console'],note:'Gi0/1 上聯防火牆，Gi0/2 連接接入交換器。本關需設定 VLAN 10、SVI 與路由。'},
 {id:'SW-01',name:'接入交換器',type:'switch',x:350,y:390,w:115,d:65,h:118,ports:['Gi0/1','Fa0/1','Fa0/2','Fa0/3','Fa0/4','Console'],note:'Gi0/1 是核心上聯，Fa0/1 接配線架 P1。記得設定 Trunk 與接入 VLAN。'},
 {id:'PATCH-01',name:'機櫃配線架',type:'patch',x:560,y:390,w:95,d:50,h:100,ports:['P1','P2','P3','P4'],note:'P1 背面連到護理站資訊插座 J1。先依面板教學完成線槽、穿線、打線與驗線，再接前面網孔的跳線。'},
 {id:'WALL-01',name:'護理站資訊插座',type:'wall',x:1000,y:170,w:65,d:26,h:60,ports:['J1','J2'],note:'J1 對應機房配線架 P1。請把這個資訊插座接到工作站的乙太網路埠。'},
 {id:'PC-01',name:'護理工作站',type:'pc',x:1130,y:365,w:100,d:70,h:72,ports:['eth0'],note:'這是本次驗收的護理工作站。需供電、接線，設定靜態 IPv4，再驗證閘道。'}
];
const byId=Object.fromEntries(definitions.map(d=>[d.id,d]));
function fresh(){return {version:1,player:{x:790,y:525},visited:false,ups:false,pcPower:false,cables:[],config:{},pc:{ip:'',mask:'',gateway:''},logs:{},pingPassed:false,completionShown:false,guide:true,permanent:{route:false,pulling:false,pulled:false,patch:false,wall:false,tested:false}};}
let state=fresh();try{const saved=JSON.parse(localStorage.getItem(KEY));if(validSave(saved)){state={...fresh(),...saved};if(!saved.permanent)state.permanent={route:true,pulling:false,pulled:true,patch:true,wall:true,tested:true};}}catch{}
function validSave(s){return s&&s.version===1&&s.player&&Number.isFinite(s.player.x)&&Number.isFinite(s.player.y)&&s.player.x>=25&&s.player.x<=1475&&s.player.y>=25&&s.player.y<=1035&&typeof s.ups==='boolean'&&typeof s.pcPower==='boolean'&&Array.isArray(s.cables)&&s.cables.length<=8&&s.cables.every(c=>c&&[c.a,c.b].every(p=>p&&byId[p.device]?.ports.includes(p.port)&&p.port!=='Console')&&[3,10,30,90].includes(c.length))&&s.config&&typeof s.config==='object'&&s.logs&&typeof s.logs==='object'&&s.pc&&['ip','mask','gateway'].every(k=>typeof s.pc[k]==='string');}
state.permanent={...fresh().permanent,...state.permanent};
const defaultConfig=()=>({vlan10:false,routing:false,svi:'',trunk:false,accessMode:false,accessVlan:1,saved:false});
for(const d of definitions)state.config[d.id]={...defaultConfig(),...(state.config[d.id]||{})};
let tool='inspect',selected=null,cableStart=null,consoleSession=null,keys=new Set(),path=[],pendingInspect=null,hoverDevice=null,zoom=.83;
let camera={x:state.player.x,y:state.player.y},pointer={x:0,y:0},lastTime=0,moving=false,walkCycle=0,saveTimer,toastTimer,history=[],historyIndex=0;
const canvas=$('#world'),ctx=canvas.getContext('2d');let width=0,height=0,dpr=1;
function save(){try{localStorage.setItem(KEY,JSON.stringify(state));$('#save-state').textContent='進度已儲存 · 本機';}catch{$('#save-state').textContent='儲存空間不可用，請匯出存檔';}}
function scheduleSave(){if(saveTimer)return;saveTimer=setTimeout(()=>{saveTimer=null;save();},250);}
function toast(text){$('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,4200);}
function showDialog(html){keys.clear();path=[];pendingInspect=null;$('#dialog-content').innerHTML=html;$('#dialog').showModal();}
function point(x,y,z=0){return{x:(x-y)*.82,y:(x+y)*.41-z};}
function project(x,y,z=0){const p=point(x,y,z),c=point(camera.x,camera.y);return{x:width/2+(p.x-c.x)*zoom,y:height/2+(p.y-c.y)*zoom};}
function unproject(x,y){const c=point(camera.x,camera.y),px=(x-width/2)/zoom+c.x,py=(y-height/2)/zoom+c.y;return{x:(px/.82+py/.41)/2,y:(py/.41-px/.82)/2};}
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function powered(d){return d.type==='isp'||d.type==='patch'||d.type==='wall'||(d.type==='pc'?state.pcPower:state.ups);}
function endpoint(device,port){return{device,port};}
const same=(a,b)=>a.device===b.device&&a.port===b.port;
function cableAt(p){return state.cables.find(c=>same(c.a,p)||same(c.b,p));}
function otherEnd(c,p){return same(c.a,p)?c.b:c.a;}
function connected(a,ap,b,bp){return state.cables.some(c=>same(c.a,endpoint(a,ap))&&same(c.b,endpoint(b,bp))||same(c.b,endpoint(a,ap))&&same(c.a,endpoint(b,bp)));}
const expected=[['ISP','GE0','RTR-01','WAN'],['RTR-01','LAN','FW-01','WAN'],['FW-01','LAN','CORE-01','Gi0/1'],['CORE-01','Gi0/2','SW-01','Gi0/1'],['SW-01','Fa0/1','PATCH-01','P1'],['WALL-01','J1','PC-01','eth0']];
function wiringDone(){return expected.every(l=>connected(...l));}
function coreReady(){const c=state.config['CORE-01'];return c.vlan10&&c.routing&&c.svi==='10.10.10.1'&&c.saved;}
function switchReady(){const c=state.config['SW-01'];return c.vlan10&&c.trunk&&c.accessMode&&c.accessVlan===10&&c.saved;}
function pcReady(){return state.pc.ip==='10.10.10.21'&&state.pc.mask==='255.255.255.0'&&state.pc.gateway==='10.10.10.1';}
function linkLayerReady(){return state.ups&&state.pcPower&&wiringDone()&&permanentReady();}
function reachable(){return linkLayerReady()&&coreReady()&&switchReady()&&pcReady();}
function objectives(){return [
 {done:state.visited,title:'走進機房，查看設備',hint:'用 WASD 移動。走近機房的交換器後按 E，或點擊設備讓角色走過去。'},
 {done:state.ups,title:'啟動 UPS 與機櫃供電',hint:'UPS 在機房後排。走近後查看面板，開啟供電。'},
 {done:permanentReady(),title:'完成牆內埋線與驗線',hint:'按右上角「埋線教學」，跟著路徑規劃、穿線、兩端打線與驗線，完成永久鏈路。'},
 {done:wiringDone(),title:`完成六段實體跳線（${expected.filter(l=>connected(...l)).length}/6）`,hint:'按 2 選 Cat6。靠近設備，點一個網孔，再帶著線頭走到另一端，點選對應網孔。'},
 {done:coreReady(),title:'Console 設定核心交換器',hint:'按 3 選 Console 線，在 CORE-01 點 Console 網孔，接上隨身筆電。設定提示在面板下方。'},
 {done:switchReady(),title:'設定接入交換器 VLAN／Trunk',hint:'使用 Console 進入 SW-01。Gi0/1 設為 Trunk；Fa0/1 設為 Access VLAN 10，並儲存。'},
 {done:state.pcPower,title:'啟動護理工作站',hint:'走到護理站，查看工作站面板，按下電源。'},
 {done:pcReady(),title:'設定工作站 IPv4',hint:'工作站使用 10.10.10.21 / 255.255.255.0，預設閘道 10.10.10.1。'},
 {done:state.pingPassed&&reachable(),title:'Ping 閘道，完成現場驗收',hint:'在護理工作站的命令列執行 ping 10.10.10.1。所有線路、供電與設定都會參與驗證。'}
 ];}
function refreshHUD(){const tasks=objectives(),count=tasks.filter(t=>t.done).length,next=tasks.findIndex(t=>!t.done);$('#progress-number').textContent=`${count} / ${tasks.length}`;$('#progress-bar').style.width=`${count/tasks.length*100}%`;$('#objectives').innerHTML=tasks.map((t,i)=>`<li class="${t.done?'done':i===next?'current':''}"><span class="check">${t.done?'✓':i+1}</span><button data-hint="${i}">${esc(t.title)}</button></li>`).join('');$$('[data-hint]').forEach(b=>b.onclick=()=>toast(tasks[+b.dataset.hint].hint));$('#dispatch-note').textContent=next<0?'護理工作站已驗收。你可以拔掉任何一段線，觀察連線測試是否會跟著失敗。':tasks[next].hint;$('#header-status').textContent=reachable()?(state.pingPassed?'護理站已通過驗收':'線路就緒 · 等待驗收'):'網路工程驗收前';$('#cable-count').textContent=8-state.cables.length;$('#location').textContent=state.player.x<720?(state.player.y<640?'資訊機房':'資訊室'):state.player.x>900&&state.player.y<640?'護理站／病房':'公共走廊';refreshGuide();scheduleSave();}
// Physical walls include real door openings. Furniture is solid, too.
const walls=[{x:20,y:20,w:1460,d:12},{x:20,y:20,w:12,d:1020},{x:1468,y:20,w:12,d:1020},{x:20,y:1028,w:1460,d:12},{x:720,y:20,w:14,d:295},{x:720,y:465,w:14,d:575},{x:20,y:640,w:300,d:14},{x:465,y:640,w:269,d:14},{x:900,y:20,w:14,d:295},{x:900,y:465,w:14,d:180},{x:900,y:640,w:580,d:14}];
const furniture=[{x:1100,y:80,w:230,d:60,h:35,type:'counter'},{x:1200,y:510,w:150,d:65,h:33,type:'bed'},{x:330,y:800,w:180,d:80,h:45,type:'desk'},{x:90,y:810,w:90,d:85,h:35,type:'sofa'},{x:1350,y:790,w:50,d:50,h:55,type:'plant'},{x:1290,y:235,w:150,d:65,h:33,type:'bed',label:'病床 02'},{x:1375,y:480,w:28,d:28,h:110,type:'iv'},{x:1350,y:555,w:40,d:32,h:92,type:'monitor'},{x:1245,y:185,w:183,d:6,h:114,type:'curtain'},{x:1020,y:765,w:110,d:32,h:45,type:'seats'},{x:1020,y:865,w:110,d:32,h:45,type:'seats'},{x:1150,y:47,w:20,d:20,h:60,type:'nurse'}];
function blocked(x,y){const r=13;if(x<42||x>1450||y<42||y>1010)return true;return [...walls,...definitions,...furniture].some(o=>x>o.x-r&&x<o.x+o.w+r&&y>o.y-r&&y<o.y+o.d+r);}
function move(dx,dy){if(!blocked(state.player.x+dx,state.player.y))state.player.x+=dx;if(!blocked(state.player.x,state.player.y+dy))state.player.y+=dy;}
function route(target){const size=22,start={x:Math.round(state.player.x/size),y:Math.round(state.player.y/size)},end={x:Math.round(target.x/size),y:Math.round(target.y/size)};const key=n=>n.x+','+n.y;let open=[{...start,g:0,f:0}],seen=new Map([[key(start),0]]),parents=new Map(),found=null;
 for(let iter=0;open.length&&iter<7000;iter++){open.sort((a,b)=>a.f-b.f);const n=open.shift();if(Math.abs(n.x-end.x)+Math.abs(n.y-end.y)<=1){found=n;break;}for(const [dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const q={x:n.x+dx,y:n.y+dy};if(blocked(q.x*size,q.y*size))continue;const g=n.g+1,k=key(q);if(seen.has(k)&&seen.get(k)<=g)continue;seen.set(k,g);parents.set(k,n);open.push({...q,g,f:g+Math.abs(q.x-end.x)+Math.abs(q.y-end.y)});}}
 if(!found){toast('無法走到那裡，請選擇走道或設備前方。');return false;}const result=[];let n=found;while(key(n)!==key(start)){result.unshift({x:n.x*size,y:n.y*size});n=parents.get(key(n));if(!n)break;}path=result;return true;
}
function approach(d){return{x:d.x+d.w/2,y:d.y+d.d+50};}
function near(d){return dist(state.player,approach(d))<115;}
function nearest(){return definitions.filter(near).sort((a,b)=>dist(state.player,approach(a))-dist(state.player,approach(b)))[0];}
function inspect(id){const d=byId[id];if(!d)return;if(!near(d)){closeInspector();pendingInspect=id;if(!route(approach(d)))pendingInspect=null;else toast(`正在走向 ${d.name}。`);return;}selected=id;keys.clear();path=[];pendingInspect=null;if(d.x<720&&d.y<640)state.visited=true;renderInspector();refreshHUD();}
function closeInspector(){if(testing){clearInterval(testTimer);testing=false;}selected=null;consoleSession=null;$('#inspector').hidden=true;canvas.focus({preventScroll:true});}
function setTool(value){tool=value;$$('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===tool));if(tool!=='copper')cableStart=null;updateCableBanner();if(selected)renderInspector();}
function updateCableBanner(){const banner=$('#cable-banner');banner.hidden=!cableStart;$('#cancel-cable').hidden=!cableStart;if(cableStart)banner.textContent=`線頭：${cableStart.device} ${cableStart.port} → 帶著另一端走到目的網孔`;refreshGuide();}
function cableLength(a,b){return Math.max(1,Math.ceil(dist(byId[a.device],byId[b.device])*.075));}
function clickPort(device,port){const d=byId[device];if(!near(d))return toast('請先走到設備旁邊。');const guide=guideStep();if(state.guide&&tool!=='remove'&&guide.target===device&&guide.port&&port!==guide.port)return toast(`這一步先點發光的 ${guide.port} 網孔。可收起教學自由操作。`);if(port==='Console'){
  if(tool!=='console')return toast('這是 Console 管理埠。按 3 選 Console 線，不能插 Cat6 資料線。');if(!powered(d))return toast('設備沒有供電，請先開啟 UPS。');consoleSession={device,mode:'user',iface:null};state.logs[device]??=[`USB Console → ${device}\nSerial 9600 / 8N1\n已建立主控台連線。輸入 help 查看支援指令。`];renderInspector();$('#command-input')?.focus();return;
 }
 const p=endpoint(device,port),c=cableAt(p);
 if(tool==='inspect')return toast(c?`${device} ${port} ↔ ${otherEnd(c,p).device} ${otherEnd(c,p).port}`:'這個網孔尚未插線。按 2 選網路線，再點選網孔。');
 if(tool==='console')return toast('這是資料網孔，Console 線只能接 Console 管理埠。');
 if(tool==='remove'){if(!c)return toast('這個網孔沒有接線。');state.cables=state.cables.filter(v=>v!==c);state.pingPassed=false;toast('已拔除線路，網路線放回工具包。');refreshHUD();renderInspector();return;}
 if(c)return toast('這個網孔已使用。按 4 拔線後才能重新接線。');
 if(!cableStart){if(state.cables.length>=8)return toast('工具包已沒有網路線，請先拔回不需要的接線。');cableStart=p;updateCableBanner();renderInspector();toast('第一端已插入。關閉面板，帶著線頭走到另一台設備。');return;}
 if(same(cableStart,p)){cableStart=null;updateCableBanner();renderInspector();return;}
 if(cableStart.device===p.device)return toast('請把另一端接到不同設備，避免形成迴路。');
 const length=Number($('#cable-length').value),needed=cableLength(cableStart,p);if(length<needed)return toast(`線不夠長：估計需要 ${needed} m。請在工具列換較長的網路線。`);
 state.cables.push({a:{...cableStart},b:p,length});cableStart=null;state.pingPassed=false;updateCableBanner();toast('兩端水晶頭已插妥。接線不代表設定已完成。');refreshHUD();renderInspector();
}
const coreCommands=['enable','configure terminal','vlan 10','exit','ip routing','interface vlan 10','ip address 10.10.10.1 255.255.255.0','no shutdown','end','copy running-config startup-config'];
const switchCommands=['enable','configure terminal','vlan 10','exit','interface gi0/1','switchport mode trunk','exit','interface fa0/1','switchport mode access','switchport access vlan 10','end','copy running-config startup-config'];
function renderInspector(){if(!selected)return;const d=byId[selected];const panel=$('#inspector');panel.hidden=false;panel.dataset.device=d.id;let connections=d.ports.filter(p=>p!=='Console').map(port=>{const p=endpoint(d.id,port),c=cableAt(p);return c?`<div class="connection-item">${esc(port)} ↔ ${esc(otherEnd(c,p).device)} ${esc(otherEnd(c,p).port)}<span>CAT6 / ${c.length} m · ${powered(d)&&powered(byId[otherEnd(c,p).device])?'實體介面通電':'等待兩端供電'}</span></div>`:'';}).join('');
 panel.innerHTML=`<div class="inspector-head"><div><span class="eyebrow">EQUIPMENT INSPECTION</span><h2>${esc(d.name)}</h2><span class="eyebrow">${d.id}</span></div><button id="close-inspector" title="關閉面板">×</button></div><div class="inspector-body"><div class="equipment-status"><span>現場距離：可操作</span><span class="${powered(d)?'online':'offline'}">● ${['patch','wall'].includes(d.type)?'被動配線元件':powered(d)?'供電正常':'尚未供電'}</span></div><p>${d.note}</p>${burialPanel(d)}${d.ports.length?`<div class="faceplate"><div class="faceplate-label">${d.id} / FRONT PANEL</div><div class="ports">${d.ports.map(port=>{const p=endpoint(d.id,port),c=cableAt(p);return `<div class="port-wrap"><button class="port ${port==='Console'?'console-port':''} ${c?'connected':''} ${powered(d)?'powered':''} ${cableStart&&same(cableStart,p)?'selected':''} ${guidePortClass(d.id,port)}" data-port="${esc(port)}" aria-label="${d.id} ${esc(port)} 網孔" title="${esc(port)}${c?' · 已接線':' · 空閒'}"><i class="port-light"></i></button><small>${esc(port)}</small></div>`;}).join('')}</div></div><div class="port-legend">點選實際網孔操作 · 藍色＝已插線 · 黃框＝Console</div>`:''}${d.type==='ups'?`<div class="status-card">PDU 電源已預接四台機櫃設備。<br>UPS 輸出：${state.ups?'230V AC · 運轉中':'關閉'}</div><div class="button-row"><button class="${state.ups?'secondary':'primary'} wide" id="toggle-power">${state.ups?'關閉 UPS 輸出':'⏻ 啟動 UPS 供電'}</button></div>`:''}${d.type==='pc'?`<button class="${state.pcPower?'secondary':'primary'} wide" id="toggle-pc">${state.pcPower?'⏻ 關閉工作站':'⏻ 開啟工作站電源'}</button>${state.pcPower?pcPanel():''}`:''}${connections?`<div class="connection-list">${connections}</div>`:''}${d.type==='patch'||d.type==='wall'?`<div class="status-card">永久鏈路：PATCH-01 P1 ↔ WALL-01 J1<br>約 38 m · ${permanentReady()?'基礎驗線 PASS':'尚未完成，請依上方施工教學操作'}。</div>`:''}${consoleSession?.device===d.id?terminalPanel(d.id):''}${['core','switch'].includes(d.type)?`<details class="inspector-note" ${consoleSession?'open':''}><summary>本次施工指令 · ${d.type==='core'?'核心':'接入'}</summary><pre class="code">${(d.type==='core'?coreCommands:switchCommands).join('\n')}</pre></details>`:''}<div class="inspector-note">${cableStart?'你正帶著另一端線頭。關閉面板，走到目的設備再插入。':'可用滑鼠點選網孔；WASD 移動時會自動收起面板。'}<br>設備與協定為教學用簡化模擬。</div></div>`;
 $('#close-inspector').onclick=closeInspector;$$('[data-port]').forEach(b=>b.onclick=()=>clickPort(d.id,b.dataset.port));$('#toggle-power')?.addEventListener('click',()=>{state.ups=!state.ups;state.pingPassed=false;consoleSession=null;refreshHUD();renderInspector();});$('#toggle-pc')?.addEventListener('click',()=>{state.pcPower=!state.pcPower;state.pingPassed=false;refreshHUD();renderInspector();});
 $('#ip-form')?.addEventListener('submit',e=>{e.preventDefault();const ip=$('#ip-address').value.trim(),mask=$('#ip-mask').value.trim(),gateway=$('#ip-gateway').value.trim();if(![ip,mask,gateway].every(validIPv4))return toast('IPv4 格式不正確，請輸入四段 0–255 的數字。');state.pc={ip,mask,gateway};state.pingPassed=false;refreshHUD();toast('IPv4 設定已套用。請用命令列驗證閘道。');});
 $('#terminal-form')?.addEventListener('submit',e=>{e.preventDefault();const input=$('#command-input'),value=input.value;input.value='';runCommand(d.id,value);});
 $('#command-input')?.addEventListener('keydown',e=>{if(e.key==='ArrowUp'){e.preventDefault();historyIndex=Math.max(0,historyIndex-1);e.target.value=history[historyIndex]||'';}if(e.key==='ArrowDown'){e.preventDefault();historyIndex=Math.min(history.length,historyIndex+1);e.target.value=history[historyIndex]||'';}});
 $$('[data-command]').forEach(b=>b.onclick=()=>runCommand(d.id,b.dataset.command));scrollTerminal();bindBurial(d);
}
function validIPv4(s){return /^(0|[1-9]\d{0,2})(\.(0|[1-9]\d{0,2})){3}$/.test(s)&&s.split('.').every(v=>Number(v)<=255);}
function pcPanel(){return `<form id="ip-form" class="ip-form"><label>IPv4 位址<input id="ip-address" value="${esc(state.pc.ip)}" placeholder="10.10.10.21" autocomplete="off"></label><label>子網路遮罩<input id="ip-mask" value="${esc(state.pc.mask)}" placeholder="255.255.255.0" autocomplete="off"></label><label>預設閘道<input id="ip-gateway" value="${esc(state.pc.gateway)}" placeholder="10.10.10.1" autocomplete="off"></label><button class="secondary" type="submit">套用 IPv4 設定</button></form>${terminalPanel('PC-01')}`;}
function promptFor(id){if(id==='PC-01')return 'C:\\>';const mode=consoleSession?.mode;return id+(mode==='priv'?'#':mode==='config'?'(config)#':mode==='vlan'?'(config-vlan)#':mode==='interface'?'(config-if)#':'>');}
function terminalPanel(id){const pc=id==='PC-01',logs=state.logs[id]||[pc?'Nurse Station OS · 本機命令列\n輸入 ipconfig 或 ping 10.10.10.1。':''];return `<div class="terminal"><div class="terminal-header">${pc?'LOCAL TERMINAL':'USB CONSOLE / 9600 8N1'} · ${id}</div><pre class="terminal-output" id="terminal-output" role="log">${esc(logs.join('\n'))}</pre><form class="terminal-form" id="terminal-form"><label for="command-input">${esc(promptFor(id))}</label><input id="command-input" aria-label="設備命令列" autocomplete="off" spellcheck="false"><button type="submit">↵</button></form></div><div class="quick-commands">${(pc?['ipconfig','ping 10.10.10.1']:['help','show running-config','show interfaces status']).map(c=>`<button data-command="${c}">${c}</button>`).join('')}</div>`;}
function scrollTerminal(){const t=$('#terminal-output');if(t)t.scrollTop=t.scrollHeight;}
function failureReason(){if(!state.pcPower)return '工作站尚未啟動。';if(!state.ups)return '機櫃設備未供電，請檢查 UPS。';if(!permanentReady())return '牆內永久鏈路尚未驗線通過。請檢查配線架與牆面插座的兩端打線。';const missing=expected.filter(l=>!connected(...l));if(missing.length)return '實體鏈路不完整。請逐段檢查網孔與配線架。';if(!pcReady())return 'IPv4／遮罩／閘道設定不符合本次驗收網段。';if(!coreReady())return '核心的 VLAN 10、SVI、路由或 startup-config 尚未就緒。';if(!switchReady())return '接入設備 VLAN／Trunk／Access VLAN 或儲存組態尚未就緒。';return '';}
function runCommand(id,raw){const input=raw.trim();if(!input)return;const d=byId[id];if(!near(d)||!powered(d))return toast('連線已中斷，請回到已供電設備旁邊。');if(id!=='PC-01'&&consoleSession?.device!==id)return toast('請先接上 Console 線。');const cmd=input.toLowerCase().replace(/\s+/g,' '),cfg=state.config[id],session=consoleSession;let output='',changed=false;history.push(input);history=history.slice(-50);historyIndex=history.length;
 if(id==='PC-01'){
  if(cmd==='ipconfig')output=`Ethernet adapter eth0\n  IPv4 Address . . . : ${state.pc.ip||'未設定'}\n  Subnet Mask . . . .: ${state.pc.mask||'未設定'}\n  Default Gateway . : ${state.pc.gateway||'未設定'}\n  Physical Link . . : ${linkLayerReady()?'UP':'DOWN'}`;
  else if(cmd==='ping 10.10.10.1'){const ok=reachable();state.pingPassed=ok;output=ok?'Pinging 10.10.10.1 with 32 bytes of data:\nReply from 10.10.10.1: bytes=32 time<1ms TTL=255\nReply from 10.10.10.1: bytes=32 time<1ms TTL=255\nPackets: Sent = 2, Received = 2, Lost = 0 (0% loss)\n[驗收] 護理工作站 → VLAN 10 閘道連線成功。':`Request timed out.\nPackets: Sent = 2, Received = 0, Lost = 2\n[排查提示] ${failureReason()}`;}
  else if(cmd==='help')output='ipconfig\nping 10.10.10.1\ncls\n此原型只模擬工作站到 VLAN 10 閘道的驗收。';
  else if(cmd==='cls'){state.logs[id]=[];renderInspector();return;}else output='無法辨識的指令。輸入 help 查看本原型支援範圍。';
 }else{
  if(cmd==='help'||cmd==='?')output='enable\nconfigure terminal\nvlan 10\nip routing\ninterface vlan 10 / gi0/1 / fa0/1\nip address 10.10.10.1 255.255.255.0\nswitchport mode trunk / access\nswitchport access vlan 10\nno shutdown\nexit / end\ncopy running-config startup-config\nshow running-config / show interfaces status / show vlan brief';
  else if(cmd==='enable'){session.mode='priv';}
  else if(['configure terminal','conf t'].includes(cmd)&&session.mode==='priv')session.mode='config';
  else if(cmd==='end'){session.mode='priv';session.iface=null;}
  else if(cmd==='exit'){session.mode=['interface','vlan'].includes(session.mode)?'config':session.mode==='config'?'priv':'user';session.iface=null;}
  else if(cmd.startsWith('show ')){
   if(cmd==='show running-config')output=`hostname ${id}\n${cfg.vlan10?'vlan 10\n':''}${cfg.routing?'ip routing\n':''}${cfg.svi?'interface Vlan10\n ip address '+cfg.svi+' 255.255.255.0\n':''}${cfg.trunk?'interface Gi0/1\n switchport mode trunk\n':''}${cfg.accessVlan===10?'interface Fa0/1\n switchport mode access\n switchport access vlan 10\n':''}end\n${cfg.saved?'[Startup configuration saved]':'[Unsaved running configuration]'}`;
   else if(cmd==='show vlan brief')output=`VLAN  Name      Status\n1     default   active\n${cfg.vlan10?'10    NURSE     active':''}`;
   else if(cmd==='show interfaces status')output=d.ports.filter(p=>p!=='Console').map(p=>`${p.padEnd(8)} ${cableAt(endpoint(id,p))?'connected':'notconnect'}`).join('\n');
   else output='% 本原型尚未支援這個 show 指令。';
  }
  else if(['copy running-config startup-config','copy run start','write memory'].includes(cmd)&&session.mode==='priv'){cfg.saved=true;output='Building configuration...\n[OK]';}
  else if(cmd==='vlan 10'&&session.mode==='config'&&['core','switch'].includes(d.type)){cfg.vlan10=true;session.mode='vlan';changed=true;}
  else if(cmd==='ip routing'&&session.mode==='config'&&d.type==='core'){cfg.routing=true;changed=true;}
  else if(/^interface (vlan 10|gi0\/1|gi0\/2|fa0\/1)$/.test(cmd)&&session.mode==='config'){session.iface=cmd.slice(10);session.mode='interface';}
  else if(cmd==='ip address 10.10.10.1 255.255.255.0'&&session.mode==='interface'&&session.iface==='vlan 10'&&d.type==='core'){cfg.svi='10.10.10.1';changed=true;}
  else if(cmd==='switchport mode trunk'&&session.mode==='interface'&&session.iface==='gi0/1'&&d.type==='switch'){cfg.trunk=true;changed=true;}
  else if(cmd==='switchport mode access'&&session.mode==='interface'&&session.iface==='fa0/1'&&d.type==='switch'){cfg.accessMode=true;changed=true;}
  else if(cmd==='switchport access vlan 10'&&session.mode==='interface'&&session.iface==='fa0/1'&&d.type==='switch'){cfg.accessVlan=10;changed=true;}
  else if(cmd==='no shutdown'&&session.mode==='interface'){output='Interface administratively enabled.';}
  else output='% 指令或模式不正確。請確認設備、介面與目前模式；輸入 help 查看支援範圍。';
 }
 if(changed){cfg.saved=false;state.pingPassed=false;}
 state.logs[id]??=[];state.logs[id].push(`${promptFor(id)} ${input}${output?'\n'+output:''}`);state.logs[id]=state.logs[id].slice(-100);refreshHUD();renderInspector();$('#command-input')?.focus({preventScroll:true});
 if(state.pingPassed&&reachable()&&!state.completionShown){state.completionShown=true;save();setTimeout(()=>showCompletion(),350);}
}
function showCompletion(){showDialog(`<span class="eyebrow">SITE ACCEPTANCE / PASSED</span><h2>第一個工作站，正式上線。</h2><p>你親手完成了供電、六段跳線、核心與接入設定，以及護理站的閘道連線驗證。</p><div class="diagram">UPS → 機櫃供電 ✓\nISP → 路由器 → 防火牆 → 核心 → 接入 ✓\n配線架 → 永久鏈路 → 資訊插座 → 護理工作站 ✓\nIPv4 / VLAN 10 / Trunk / Ping ✓</div><p>接著可以練習故障排除：拔除一段線，回工作站 Ping，再修復並重新驗證。本版加入了永久鏈路施工教學，仍聚焦現場操作，醫院人數成長、監控平台與自動化尚未加入。</p><button class="primary" id="continue-playing">繼續現場操作</button>`);$('#continue-playing').onclick=()=>$('#dialog').close();}
// Canvas renderer: a walkable isometric floor with equipment at fixed physical positions.
function poly(points,fill,stroke='#4a646f',line=1){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=line;ctx.stroke();}}
function floorRect(x,y,w,d,color,stroke){poly([point(x,y),point(x+w,y),point(x+w,y+d),point(x,y+d)],color,stroke);}
function box(x,y,w,d,h,top='#71949a',left='#3e626f',right='#4d7882',stroke='#8ab0b522'){
 const a=point(x,y),b=point(x+w,y),c=point(x+w,y+d),e=point(x,y+d),at=point(x,y,h),bt=point(x+w,y,h),ct=point(x+w,y+d,h),et=point(x,y+d,h);
 poly([e,c,ct,et],left,stroke);poly([b,c,ct,bt],right,stroke);poly([at,bt,ct,et],top,stroke);
}
function text(str,x,y,z,color='#91a9b4',size=12,align='center'){const p=point(x,y,z);ctx.fillStyle=color;ctx.font=`${size}px "Segoe UI","Microsoft JhengHei",sans-serif`;ctx.textAlign=align;ctx.fillText(str,p.x,p.y);}
function line3(points,color,width=2,dash=[]){ctx.beginPath();points.forEach((a,i)=>{const p=point(...a);i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y)});ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dash);ctx.stroke();ctx.setLineDash([]);}
function portWorld(ep){const d=byId[ep.device],index=d.ports.indexOf(ep.port);return {x:d.x+15+index*(d.w-25)/Math.max(1,d.ports.length-1),y:d.y+d.d,z:d.type==='wall'?35:d.type==='pc'?27:d.h*.62};}
function renderFloor(){
 floorRect(0,0,1500,1060,'#526b72','#779297');floorRect(32,32,688,608,'#5b747e',null);floorRect(734,32,166,996,'#c3ccc4',null);floorRect(914,32,554,608,'#cbd5cb',null);floorRect(32,654,688,374,'#9bb4b1',null);floorRect(914,654,554,374,'#bdcbc7',null);
 ctx.globalAlpha=.2;for(let x=40;x<1480;x+=60)line3([[x,32,0],[x,1028,0]],'#6c8388',.7);for(let y=40;y<1040;y+=60)line3([[32,y,0],[1468,y,0]],'#6c8388',.7);ctx.globalAlpha=1;
 // Hospital wayfinding stripe, separate from the network cable route.
 floorRect(774,50,12,930,'#709c9b',null);floorRect(786,370,195,12,'#709c9b',null);floorRect(636,390,150,12,'#597885',null);
 text('資訊機房',365,300,1,'#b0c7d0',25);text('AUTHORIZED PERSONNEL ONLY',365,335,1,'#91acb7',9);text('護理工作區 / NURSE STATION',1180,305,1,'#607d80',13);text('資訊室 / IT OFFICE',365,950,1,'#5d7b80',19);text('住院病區 →',818,780,1,'#5b7c7e',14);text('候診休息區',1190,970,1,'#6a8587',18);
 const p=state.permanent,routePoints=[[610,390,60],[680,390,60],[680,100,60],[1030,100,60],[1030,183,38]];
 if(p.route){line3(routePoints,'#536977',9);line3(routePoints,p.tested?'#b8dfac':p.pulled?'#eac082':'#cbb580',3,p.pulled?[]:[7,5]);text(p.tested?'P1 ↔ J1 / 驗線 PASS':'永久鏈路 / 天花板線槽',818,110,68,'#dfe9cc',9);}
 if(p.pulling&&!p.pulled){line3([[610,420,50],[state.player.x,state.player.y,16]],'#f1c78c',3,[6,5]);text('穿線中：另一端帶往護理站',state.player.x,state.player.y,85,'#ffe5ba',10);}
 for(const w of walls){const clinical=w.x>=900;box(w.x,w.y,w.w,w.d,55,clinical?'#dde3db':'#819ba3',clinical?'#a4b9b9':'#526e7b',clinical?'#b8c9c5':'#668590','#d8e2d033');if(clinical)line3([[w.x,w.y+w.d,25],[w.x+w.w,w.y+w.d,25]],'#759f9c',5);}
 for(const d of [{x:715,y:315,w:25,d:150},{x:315,y:635,w:150,d:25},{x:895,y:315,w:25,d:150}])floorRect(d.x,d.y,d.w,d.d,'#d5d8c155','#ebefe755');
 // Door leaves are held open, leaving the collision openings intact.
 box(706,315,10,68,50,'#a6bdc2','#61818e','#7797a2');box(918,465,10,65,50,'#e0e4d9','#a5b8b7','#bdcdc6');
 const signs=[{x:693,y:278,z:90,label:'資訊機房 / IT',fill:'#324e61'},{x:932,y:274,z:90,label:'護理站 / NURSE',fill:'#5e9187'},{x:815,y:95,z:90,label:'EXIT  →',fill:'#568a72'}];
 for(const s of signs){const a=point(s.x,s.y,s.z);ctx.font='bold 10px "Segoe UI","Microsoft JhengHei",sans-serif';const w=ctx.measureText(s.label).width+20;ctx.fillStyle=s.fill;ctx.fillRect(a.x-w/2,a.y-12,w,21);ctx.fillStyle='#eef4e5';ctx.textAlign='center';ctx.fillText(s.label,a.x,a.y+2);}
 // Wall-mounted red cross and fire-equipment cabinet establish the clinical setting.
 const cross=point(1340,70,80);ctx.fillStyle='#f3f3e9';ctx.fillRect(cross.x-17,cross.y-20,34,35);ctx.fillStyle='#bb7570';ctx.fillRect(cross.x-4,cross.y-13,8,22);ctx.fillRect(cross.x-11,cross.y-6,22,8);
 box(857,900,22,20,42,'#bb8076','#8e5c58','#a76f67');text('消防',868,921,47,'#f4ded1',8);
}
function renderFurniture(o){
 if(o.type==='bed'){
  // Wheeled hospital bed: frame, mattress, pillow, patient, blanket, raised rails.
  for(const [x,y]of[[o.x+12,o.y+10],[o.x+o.w-12,o.y+10],[o.x+12,o.y+o.d-10],[o.x+o.w-12,o.y+o.d-10]]){const p=point(x,y,7);ctx.fillStyle='#526a75';ctx.beginPath();ctx.ellipse(p.x,p.y,6,6,0,0,Math.PI*2);ctx.fill();}
  box(o.x,o.y,o.w,o.d,19,'#a9bdbd','#78929b','#8ba7ad');box(o.x+5,o.y+5,o.w-10,o.d-10,30,'#eef0e4','#b4cbc6','#cddbd1');box(o.x+8,o.y+8,30,o.d-16,37,'#faf6e8','#c6d6cb','#e1e9db');
  box(o.x+43,o.y+7,o.w-54,o.d-14,38,'#a8c4bc','#7f9e9a','#91b0a6');const head=point(o.x+30,o.y+o.d/2,43);ctx.fillStyle='#d2ab8a';ctx.beginPath();ctx.ellipse(head.x,head.y,10,9,-.35,0,Math.PI*2);ctx.fill();ctx.fillStyle='#6b7775';ctx.beginPath();ctx.ellipse(head.x-3,head.y-5,9,4,-.35,0,Math.PI*2);ctx.fill();
  for(const y of[o.y+3,o.y+o.d-3]){line3([[o.x+12,y,34],[o.x+12,y,53],[o.x+o.w-15,y,53],[o.x+o.w-15,y,34]],'#c6d6cc',3);}
  box(o.x+o.w-7,o.y,7,o.d,42,'#dce6d9','#9bb6b3','#b7cbc1');text(o.label||'病床 01',o.x+o.w/2,o.y+o.d+18,0,'#698589',9);
 }else if(o.type==='monitor'){
  box(o.x,o.y,o.w,o.d,40,'#a9bbb7','#6f8b96','#86a0a6');box(o.x+2,o.y+2,o.w-4,10,92,'#a3b7b8','#223b46','#49626b');const p=point(o.x+o.w/2,o.y+13,70);ctx.fillStyle='#16312f';ctx.fillRect(p.x-19,p.y-20,38,27);ctx.strokeStyle='#9bdbb2';ctx.lineWidth=1.3;ctx.beginPath();for(let i=0;i<32;i++){const bump=[0,0,0,0,0,-4,8,-11,0,0,0,1][i%12];const x=p.x-16+i;const y=p.y-6+bump;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();ctx.fillStyle='#d8e6ce';ctx.font='7px monospace';ctx.fillText('72  SpO₂ 98',p.x,p.y-14);
 }else if(o.type==='iv'){
  const p=point(o.x+o.w/2,o.y+o.d/2);line3([[o.x+12,o.y+12,4],[o.x+12,o.y+12,110]],'#b9cfcb',3);ctx.strokeStyle='#b9cfcb';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(p.x-14,p.y-107);ctx.lineTo(p.x+13,p.y-107);ctx.stroke();ctx.fillStyle='#d7e5d6aa';ctx.fillRect(p.x-12,p.y-106,13,22);ctx.strokeStyle='#e7eee4aa';ctx.beginPath();ctx.moveTo(p.x-6,p.y-84);ctx.bezierCurveTo(p.x-4,p.y-44,p.x+20,p.y-42,p.x+22,p.y-25);ctx.stroke();for(let i=0;i<3;i++)line3([[o.x+12,o.y+12,4],[o.x+12+Math.cos(i*2.1)*19,o.y+12+Math.sin(i*2.1)*19,2]],'#91adb2',2);
 }else if(o.type==='curtain'){
  line3([[o.x,o.y,114],[o.x+o.w,o.y,114],[o.x+o.w,o.y+o.d,114]],'#91aaa9',3);for(let i=0;i<10;i++){const x=o.x+i*o.w/10;box(x,o.y,7,4,105,i%2?'#b7ceca':'#9fbebc','#7da2a5','#9ab6b4','#dae4d11a');}
 }else if(o.type==='seats'){
  for(let i=0;i<3;i++){const x=o.x+i*38;box(x,o.y,31,32,21,'#7a9faa','#577b8c','#678e9d');box(x,o.y,31,5,45,'#88a9b1','#5c8090','#7297a2');}
 }else if(o.type==='nurse'){
  const p=point(o.x+10,o.y+10);ctx.fillStyle='#1c4e5f';ctx.fillRect(p.x-7,p.y-20,6,20);ctx.fillRect(p.x+2,p.y-20,6,20);ctx.fillStyle='#dce9de';ctx.beginPath();ctx.roundRect(p.x-11,p.y-45,22,28,4);ctx.fill();ctx.fillStyle='#d7b396';ctx.beginPath();ctx.arc(p.x,p.y-52,8,0,Math.PI*2);ctx.fill();ctx.fillStyle='#4e665e';ctx.beginPath();ctx.ellipse(p.x,p.y-57,8,4,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#abc5bd';ctx.fillRect(p.x-6,p.y-51,12,5);ctx.fillStyle='#6f9c98';ctx.fillRect(p.x+5,p.y-36,3,6);text('護理師',o.x+10,o.y+10,70,'#e8f1dc',9);
 }else if(o.type==='plant'){
  const p=point(o.x+25,o.y+25,40);box(o.x+7,o.y+7,36,36,22,'#c8b89b','#8c8579','#b0a48e');ctx.fillStyle='#79a58d';for(let i=0;i<6;i++){ctx.beginPath();ctx.ellipse(p.x+Math.cos(i)*14,p.y-10+Math.sin(i)*12,13,19,i,0,Math.PI*2);ctx.fill();}
 }else{
  box(o.x,o.y,o.w,o.d,o.h,o.type==='counter'?'#e0e5d8':'#a4c0bd','#77979c','#93afaf');
  if(o.type==='counter'){box(o.x+35,o.y+10,45,9,70,'#759b9f','#315462','#547680');const p=point(o.x+115,o.y+20,o.h+5);ctx.fillStyle='#eaf0e3';ctx.fillRect(p.x,p.y,21,10);ctx.strokeStyle='#9baea8';ctx.lineWidth=1;ctx.strokeRect(p.x,p.y,21,10);text('護理櫃台',o.x+o.w/2,o.y+o.d+2,20,'#547b7b',12);}
  if(o.type==='desk')box(o.x+30,o.y+10,75,15,76,'#88a8ac','#2c4c58','#476d7b');
 }
}
function renderDevice(d){const live=powered(d),selectedHere=selected===d.id||hoverDevice===d.id;let top=selectedHere?'#91b5bb':'#647f8a';if(d.type==='wall')top='#b0c2c2';if(d.type==='pc'){
 box(d.x,d.y,d.w,d.d,35,'#9db6b5','#5b7f89','#7799a1');box(d.x+20,d.y+12,60,10,88,'#567983','#18313f','#254453');const a=point(d.x+24,d.y+23,81),b=point(d.x+74,d.y+23,81),c=point(d.x+74,d.y+23,48),e=point(d.x+24,d.y+23,48);poly([a,b,c,e],live?'#82c9b0':'#152b37','#456a77');
 }else{box(d.x,d.y,d.w,d.d,d.h,top,'#283f4b','#3b5866',selectedHere?'#b8e4cb':'#77929c55');if(['core','switch','router','firewall'].includes(d.type)){
  for(let row=0;row<3;row++){const p=point(d.x+10,d.y+d.d+1,d.h-20-row*24);const p2=point(d.x+d.w-10,d.y+d.d+1,d.h-20-row*24);ctx.strokeStyle='#182f3c';ctx.lineWidth=13;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p2.x,p2.y);ctx.stroke();for(let i=0;i<6;i++){const a=point(d.x+16+i*(d.w-28)/6,d.y+d.d+1,d.h-20-row*24);ctx.fillStyle=live?'#9abf9b':'#637682';ctx.fillRect(a.x-1,a.y-1,2,2);}}
 }if(d.type==='ups'){const p=point(d.x+30,d.y+d.d+1,48);ctx.fillStyle=live?'#94d5ab':'#374d5a';ctx.fillRect(p.x-12,p.y-15,26,15);ctx.fillStyle=live?'#102d22':'#91a8b2';ctx.font='8px monospace';ctx.fillText(live?'230V':'OFF',p.x,p.y-4);}}
 for(const port of d.ports){const ep=endpoint(d.id,port),p=portWorld(ep),screen=point(p.x,p.y,p.z);ctx.fillStyle=cableAt(ep)?'#8ab1cd':port==='Console'?'#ba9b62':'#132733';ctx.fillRect(screen.x-3,screen.y-2,6,5);}
 const center=point(d.x+d.w/2,d.y+d.d/2,d.h+21);ctx.fillStyle='#0e2028db';ctx.font='10px monospace';const labelWidth=ctx.measureText(d.id).width+18;ctx.fillRect(center.x-labelWidth/2,center.y-11,labelWidth,17);ctx.textAlign='center';ctx.fillStyle=selectedHere?'#d4f1df':'#c2d0d7';ctx.fillText(d.id,center.x,center.y+1);
 const light=point(d.x+d.w-7,d.y+d.d,d.h-8);ctx.fillStyle=live?'#b3dd9d':'#79848a';ctx.beginPath();ctx.arc(light.x,light.y,2,0,Math.PI*2);ctx.fill();
}
function renderPlayer(){const p=point(state.player.x,state.player.y),wave=moving?Math.sin(walkCycle*10)*5:0;ctx.fillStyle='#08192366';ctx.beginPath();ctx.ellipse(p.x,p.y+2,15,7,0,0,Math.PI*2);ctx.fill();ctx.lineWidth=6;ctx.strokeStyle='#243844';ctx.lineCap='round';ctx.beginPath();ctx.moveTo(p.x-5,p.y-13);ctx.lineTo(p.x-7+wave,p.y);ctx.moveTo(p.x+5,p.y-13);ctx.lineTo(p.x+7-wave,p.y);ctx.stroke();ctx.fillStyle='#c6dec4';ctx.beginPath();ctx.roundRect(p.x-12,p.y-36,24,26,6);ctx.fill();ctx.fillStyle='#426c71';ctx.fillRect(p.x-10,p.y-34,5,23);ctx.fillRect(p.x+5,p.y-34,5,23);ctx.fillStyle='#dcaf8b';ctx.beginPath();ctx.arc(p.x,p.y-44,9,0,Math.PI*2);ctx.fill();ctx.fillStyle='#283d47';ctx.beginPath();ctx.ellipse(p.x,p.y-49,10,5,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#bbcbb9';ctx.fillRect(p.x+8,p.y-24,6,8);ctx.fillStyle='#9bb9b3';ctx.strokeStyle='#263f48';ctx.lineWidth=2;ctx.fillRect(p.x+12,p.y-19,13,12);ctx.strokeRect(p.x+12,p.y-19,13,12);
 text('YOU / 網路工程師',state.player.x,state.player.y,67,'#d7ead8',9);
 // Small selection ring underfoot.
 ctx.strokeStyle='#bbe1c17a';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(p.x,p.y+3,20,10,0,0,Math.PI*2);ctx.stroke();
}
function renderCables(){for(const c of state.cables){const a=portWorld(c.a),b=portWorld(c.b);const valid=expected.some(l=>connected(...l)&&((l[0]===c.a.device&&l[1]===c.a.port)||(l[0]===c.b.device&&l[1]===c.b.port)));const color=valid?'#83b9d0aa':'#d3a674cc';line3([[a.x,a.y,a.z],[a.x,a.y+12,4],[b.x,b.y+12,4],[b.x,b.y,b.z]],color,2.5);}
 if(cableStart){const a=portWorld(cableStart);line3([[a.x,a.y,a.z],[a.x,a.y+15,2],[state.player.x,state.player.y,13]],'#99c9eb',2.5,[6,5]);}
}
function draw(){ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);ctx.fillStyle='#172732';ctx.fillRect(0,0,width,height);const c=point(camera.x,camera.y);ctx.translate(width/2-c.x*zoom,height/2-c.y*zoom);ctx.scale(zoom,zoom);renderFloor();renderCables();drawGuide();
 const items=[...furniture.map(o=>({depth:o.x+o.y+o.d,draw:()=>renderFurniture(o)})),...definitions.map(d=>({depth:d.x+d.y+d.d,draw:()=>renderDevice(d)})),{depth:state.player.x+state.player.y,draw:renderPlayer}];items.sort((a,b)=>a.depth-b.depth).forEach(i=>i.draw());
 if(path.length){const end=path.at(-1),p=point(end.x,end.y);ctx.strokeStyle='#b8e4cb66';ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(p.x,p.y,12,6,0,0,Math.PI*2);ctx.stroke();}ctx.lineCap='butt';
}
function resize(){const rect=$('#viewport').getBoundingClientRect();width=rect.width;height=rect.height;dpr=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);draw();}
function deviceAt(sx,sy){return [...definitions].sort((a,b)=>b.x+b.y-a.x-a.y).find(d=>{const p=project(d.x+d.w/2,d.y+d.d/2,d.h/2);return Math.abs(sx-p.x)<Math.max(30,d.w*.55*zoom)&&Math.abs(sy-p.y)<Math.max(35,(d.h*.65+d.d*.4)*zoom);});}
function setZoom(value){zoom=Math.max(.4,Math.min(1.55,value));$('#zoom-value').textContent=Math.round(zoom*100)+'%';draw();}
function update(now){const dt=Math.min((now-lastTime)/1000||0,.04);lastTime=now;const before={...state.player};if(!$('#dialog').open){let dx=0,dy=0;
  // WASD follows screen directions in the isometric view.
  if(keys.has('w')||keys.has('arrowup')){dx-=1;dy-=1;}if(keys.has('s')||keys.has('arrowdown')){dx+=1;dy+=1;}if(keys.has('a')||keys.has('arrowleft')){dx-=1;dy+=1;}if(keys.has('d')||keys.has('arrowright')){dx+=1;dy-=1;}
  if(dx||dy){path=[];pendingInspect=null;if(selected)closeInspector();const mag=Math.hypot(dx,dy);move(dx/mag*(keys.has('shift')?430:300)*dt,dy/mag*(keys.has('shift')?430:300)*dt);}else if(path.length){const target=path[0],delta={x:target.x-state.player.x,y:target.y-state.player.y},distance=Math.hypot(delta.x,delta.y);if(distance<5)path.shift();else {const step=Math.min(distance,300*dt);move(delta.x/distance*step,delta.y/distance*step);}}
  if(pendingInspect&&near(byId[pendingInspect])&&!path.length)inspect(pendingInspect);
 }
 moving=dist(before,state.player)>.1;if(moving){walkCycle+=dt;scheduleSave();}
 if(selected&&!near(byId[selected]))closeInspector();
 camera.x+=(state.player.x-camera.x)*Math.min(1,dt*5);camera.y+=(state.player.y-camera.y)*Math.min(1,dt*5);
 const nearby=nearest(),prompt=$('#interaction-prompt');prompt.hidden=!nearby||!!selected||$('#dialog').open;if(nearby)prompt.innerHTML=`<kbd>E</kbd> 查看 ${esc(nearby.name)} <span style="opacity:.6">${nearby.id}</span>`;
 $('#location').textContent=state.player.x<720?(state.player.y<640?'資訊機房':'資訊室'):state.player.x>900&&state.player.y<640?'護理站／病房':'公共走廊';draw();requestAnimationFrame(update);
}
canvas.addEventListener('pointermove',e=>{const r=canvas.getBoundingClientRect();pointer={x:e.clientX-r.left,y:e.clientY-r.top};hoverDevice=deviceAt(pointer.x,pointer.y)?.id||null;canvas.style.cursor=hoverDevice?'pointer':'crosshair';});
canvas.addEventListener('pointerleave',()=>hoverDevice=null);
canvas.addEventListener('click',e=>{if($('#dialog').open)return;const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top,d=deviceAt(x,y);canvas.focus({preventScroll:true});if(d){inspect(d.id);return;}closeInspector();pendingInspect=null;const target=unproject(x,y);if(!blocked(target.x,target.y))route(target);else toast('這裡有牆壁或設備。請選擇可通行的地面。');});
canvas.addEventListener('wheel',e=>{e.preventDefault();setZoom(zoom-e.deltaY*.00065);},{passive:false});
window.addEventListener('keydown',e=>{const typing=['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName);if(typing){if(e.key==='Escape')e.target.blur();return;}const key=e.key.toLowerCase();if($('#dialog').open)return;if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright',' ','shift'].includes(key)){e.preventDefault();keys.add(key);}if(e.repeat)return;if(key==='e'){e.preventDefault();if(selected)closeInspector();else{const d=nearest();d?inspect(d.id):toast('附近沒有可操作的設備。走近機櫃、插座或工作站。');}}if(['1','2','3','4'].includes(key))setTool(['inspect','copper','console','remove'][+key-1]);if(key==='escape'){if(cableStart){cableStart=null;updateCableBanner();}else closeInspector();}if(key==='h')showHelp();});
window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));window.addEventListener('blur',()=>{keys.clear();save();});document.addEventListener('visibilitychange',()=>{if(document.hidden){keys.clear();save();}});window.addEventListener('beforeunload',save);
$$('[data-tool]').forEach(b=>b.onclick=()=>setTool(b.dataset.tool));$('#cancel-cable').onclick=()=>{cableStart=null;updateCableBanner();if(selected)renderInspector();};$('#zoom-in').onclick=()=>setZoom(zoom+.1);$('#zoom-out').onclick=()=>setZoom(zoom-.1);$('#recenter').onclick=()=>{camera={...state.player};setZoom(.83);};$('#dialog-close').onclick=()=>$('#dialog').close();$('#help-button').onclick=showHelp;$('#map-button').onclick=showMap;
function showMap(){showDialog(`<span class="eyebrow">AS-BUILT / CABLING PLAN</span><h2>先看清楚線路，再動手。</h2><p>機房在走廊左側，護理站在右側。角色必須從門口進出，不能穿過牆壁與設備。</p><div class="diagram">[ 機房後排 ]\nISP GE0 ──→ RTR-01 WAN\nRTR-01 LAN ──→ FW-01 WAN\nFW-01 LAN ──→ CORE-01 Gi0/1\n\n[ 機房前排 ]\nCORE-01 Gi0/2 ──→ SW-01 Gi0/1\nSW-01 Fa0/1 ──→ PATCH-01 P1\n                       ║ 天花板／牆內永久鏈路\n[ 護理站 ]              ║\nWALL-01 J1 ←═══════════╝\nWALL-01 J1 ──→ PC-01 eth0</div><p>共有六條 Cat6 跳線。配線架 P1 至牆面 J1 需先規劃線槽、穿線、兩端打線並驗線。它是永久鏈路，不是第七條跳線。90 m 線可以完成本關所有跳接；短線距離不足會被阻擋。</p><p>供電：UPS 預接 PDU；工作站有獨立電源。路由器與防火牆在本原型使用預載實驗設定，核心與接入交換器需手動設定。</p>`);}
function showHelp(){showDialog(`<span class="eyebrow">FIELD ENGINEER / QUICK START</span><h2>你就是現場的網管。</h2><div class="help-grid"><div><h3>01 · 移動與查看</h3><p>WASD／方向鍵移動角色，按住 Shift 快跑。也可以點地板，自動繞牆走過去。靠近設備按 E；點設備則會走到它前方並打開面板。</p></div><div><h3>02 · 插頭與網孔</h3><p>按 2 選 Cat6，點第一個網孔。關閉面板，走到另一端，再點另一個網孔。工具列可選 3／10／30／90 m 線。按 4 可拔線。</p></div><div><h3>03 · Console 設定</h3><p>先啟動 UPS。按 3 選 Console 線，走近核心或接入交換器，點 Console 埠連接隨身筆電。面板下方提供施工指令。</p></div><div><h3>04 · 實際驗證</h3><p>工作站要先開機、設定 IPv4，再執行 ping 10.10.10.1。實體線路、供電、VLAN、Trunk 與位址任一不完整，都會失敗。</p></div></div><p>右上角「埋線教學」會帶你完成線槽、穿線、兩端 T568B 線序練習及基礎驗線。教學卡會標出目標設備與網孔，也可按「帶我過去」自動走到設備。</p><p>滾輪或右上角按鈕可縮放。按 Esc 取消拉線或收起面板。點左側驗收項目可查看提示。進度自動保存在目前瀏覽器，也能匯出 JSON 備份。</p><p>這版先實作現場操作。尚無萬人經營、監控平台、真實 IOS、完整封包或纜線物理模擬；病患與臨床服務也不在本關驗收範圍。</p>`);}
$('#save-button').onclick=()=>{save();const url=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='hospital-field-save.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('已匯出 JSON 存檔備份。');};
$('#reset-button').onclick=()=>{showDialog('<span class="eyebrow">NEW SHIFT</span><h2>重新開始這次施工？</h2><p>目前瀏覽器中的現場進度將被清除。舊版企業與醫院經營模式的存檔不受影響；需要保留這個現場時，請先按「匯出存檔」。</p><div class="button-row"><button class="secondary" id="keep-game">繼續目前進度</button><button class="danger" id="confirm-reset">確認重開現場</button></div>');$('#keep-game').onclick=()=>$('#dialog').close();$('#confirm-reset').onclick=()=>{clearInterval(testTimer);testing=false;terminationDraft.patch=[];terminationDraft.wall=[];state=fresh();for(const d of definitions)state.config[d.id]=defaultConfig();selected=null;cableStart=null;consoleSession=null;path=[];pendingInspect=null;camera={...state.player};$('#inspector').hidden=true;$('#dialog').close();setTool('inspect');refreshHUD();save();toast('新施工現場已準備好。');};};
const WIRE_COLORS=[{name:'白橙',color:'repeating-linear-gradient(45deg,#f4eee1 0 5px,#e49b55 5px 8px)'},{name:'橙',color:'#e49b55'},{name:'白綠',color:'repeating-linear-gradient(45deg,#f4eee1 0 5px,#76ad8d 5px 8px)'},{name:'藍',color:'#6aa7ca'},{name:'白藍',color:'repeating-linear-gradient(45deg,#f4eee1 0 5px,#6aa7ca 5px 8px)'},{name:'綠',color:'#76ad8d'},{name:'白棕',color:'repeating-linear-gradient(45deg,#f4eee1 0 5px,#a67e61 5px 8px)'},{name:'棕',color:'#a67e61'}];
const terminationDraft={patch:[],wall:[]};let testing=false,testTimer=null;
function permanentReady(){return state.permanent.tested===true;}
function guideStep(){
 if(!state.ups)return{title:'先讓機櫃有電',body:'按「帶我過去」，角色會走到 UPS。再按設備面板的「啟動 UPS 供電」。',target:'UPS',tool:'inspect',tag:'準備 01'};
 const p=state.permanent;
 if(!p.route)return{title:'埋線 1/6：決定牆內線怎麼走',body:'到機房配線架，選「天花板線槽」。黃色線代表配線架到護理站插座的永久鏈路，不是插在前面網孔的跳線。',target:'PATCH-01',tool:'inspect',tag:'埋線教學'};
 if(!p.pulling&&!p.pulled)return{title:'埋線 2/6：從配線架開始穿線',body:'在配線架面板按「開始沿線槽穿線」。角色會帶著纜線另一端，沿走廊走到護理站。',target:'PATCH-01',tool:'inspect',tag:'埋線教學'};
 if(!p.pulled)return{title:'埋線 3/6：把線帶到牆面插座',body:'跟著黃色路徑走到護理站資訊插座。在插座面板按「完成牆面降線」，這樣兩端才都有線。',target:'WALL-01',tool:'inspect',tag:'埋線教學'};
 if(!p.wall)return{title:'埋線 4/6：打好護理站這一端',body:'在牆面資訊模組依 T568B 線序排入八條線芯，按「檢查並完成打線」。不熟時可先看逐芯示範。',target:'WALL-01',tool:'inspect',tag:'埋線教學'};
 if(!p.patch)return{title:'埋線 5/6：打好機房配線架端',body:'回機房配線架，以相同 T568B 線序完成另一端。永久鏈路的兩端都要端接。',target:'PATCH-01',tool:'inspect',tag:'埋線教學'};
 if(!p.tested)return{title:'埋線 6/6：接驗線器，檢查 1–8',body:'到護理站插座按「執行基礎驗線」。本關會檢查兩端是否完成，並依序顯示 1–8 導通結果。',target:'WALL-01',tool:'inspect',tag:'埋線教學'};
 const link=expected.find(l=>!connected(...l));
 if(link){const n=expected.indexOf(link)+1,a=endpoint(link[0],link[1]),b=endpoint(link[2],link[3]);let dest=a;if(cableStart){if(same(cableStart,a))dest=b;else if(same(cableStart,b))dest=a;else return{title:'先取消手上的線，回到這一步',body:'你手上的線不屬於目前教學。按「取消拉線」，再從發光的網孔開始。',target:cableStart.device,tool:'copper',tag:`跳線 ${n}/6`};}return{title:`跳線 ${n}/6：${cableStart?'插入另一端':'先插第一端'}`,body:`這條線連接 ${a.device} ${a.port} ↔ ${b.device} ${b.port}。${cableStart?'線頭在手上，走到另一台設備，點發光網孔。':'按「帶我過去」，再點面板中發光的網孔。'}永久鏈路和兩端跳線都完成，資料才走得通。`,target:dest.device,port:dest.port,tool:'copper',tag:`跳線 ${n}/6`};}
 if(!coreReady())return{title:'用 Console 設定核心設備',body:'選 Console 線，點核心交換器的 Console 埠。面板下方提供逐行施工指令。',target:'CORE-01',port:'Console',tool:'console',tag:'設備設定'};
 if(!switchReady())return{title:'用 Console 設定接入設備',body:'到 SW-01 設定 VLAN、上聯 Trunk 與 Fa0/1 的 VLAN 10，最後儲存。',target:'SW-01',port:'Console',tool:'console',tag:'設備設定'};
 if(!state.pcPower||!pcReady())return{title:'開啟工作站，填入 IP 位址',body:'開啟電源後填寫 IP 10.10.10.21、遮罩 255.255.255.0、閘道 10.10.10.1。',target:'PC-01',tool:'inspect',tag:'工作站設定'};
 return{title:state.pingPassed?'驗收完成，第一個護理站上線':'最後一步：測試連到閘道',body:state.pingPassed?'現在可以自行練習拔線與排除故障。需要重學埋線時，按上方「埋線教學」。':'在工作站命令列輸入 ping 10.10.10.1，或按同名快捷按鈕。',target:'PC-01',tool:'inspect',tag:'連線驗收'};
}
function refreshGuide(){const g=guideStep();$('#guide-card').hidden=!state.guide;$('#show-guide').hidden=state.guide;$('#guide-title').textContent=g.title;$('#guide-body').textContent=g.body;$('#guide-tag').textContent=g.tag;$('#guide-go').textContent=`帶我到 ${byId[g.target].name} →`;$('#guide-card').dataset.target=g.target;}
function followGuide(){const g=guideStep();setTool(g.tool);if(g.tool==='copper')$('#cable-length').value='90';inspect(g.target);}
function guidePortClass(id,port){const g=guideStep();return state.guide&&g.target===id&&g.port===port?'guide-port':'';}
function burialPanel(d){const p=state.permanent;if(!['patch','wall'].includes(d.type))return '';const side=d.type==='patch'?'patch':'wall',done=p[side];let controls='';
 if(!p.route&&side==='patch')controls='<div class="route-choices"><button class="primary wide" data-route="ceiling">✓ 選擇天花板線槽 · 約 38 m</button><button class="secondary wide" data-route="floor">選擇跨越走道地板 · 約 29 m</button></div>';
 else if(!p.route)controls='<p>先到機房配線架，決定永久鏈路路徑。</p>';
 else if(!p.pulled&&side==='patch')controls=`<button class="primary wide" id="pull-start" ${p.pulling?'disabled':''}>${p.pulling?'另一端正在帶往護理站':'開始沿線槽穿線'}</button>`;
 else if(!p.pulled&&side==='wall')controls=`<button class="primary wide" id="pull-end" ${!p.pulling?'disabled':''}>完成牆面降線</button>`;
 else if(!done){const draft=terminationDraft[side];controls=`<div class="termination"><h4>T568B 線序練習 · ${side==='patch'?'機房配線架 P1':'護理站資訊模組 J1'}</h4><p>下方為邏輯針腳 1–8 的對照。依參考順序點線芯，放入八格，再檢查。</p><div class="wire-reference">${WIRE_COLORS.map((w,i)=>`<span><i style="background:${w.color}"></i>${i+1} ${w.name}</span>`).join('')}</div><div class="wire-slots">${Array.from({length:8},(_,i)=>`<button data-slot="${i}" title="點擊清除此格" style="${draft[i]!==undefined?'--wire:'+WIRE_COLORS[draft[i]].color:''}"><b>${i+1}</b><i></i><small>${draft[i]!==undefined?WIRE_COLORS[draft[i]].name:'空格'}</small></button>`).join('')}</div><div class="wire-palette">${[3,0,5,1,7,2,6,4].map(i=>`<button data-wire="${i}" ${draft.includes(i)?'disabled':''}><i style="background:${WIRE_COLORS[i].color}"></i>${WIRE_COLORS[i].name}</button>`).join('')}</div><div class="button-row"><button class="primary" id="terminate-check">檢查並完成打線</button><button class="secondary" id="terminate-demo">示範下一條線芯</button><button class="secondary" id="terminate-clear">清空</button></div><p class="termination-note">這是線序教學，不是 RJ45 插頭正反面的實物圖。實際資訊模組打線請依該模組的 T568B／IDC 色碼，端子位置可能不同。</p></div>`;}
 else controls=`<div class="status-card">✓ ${side==='patch'?'配線架 P1':'牆面 J1'} 的 T568B 端接已完成。</div>`;
 if(side==='wall'&&p.patch&&p.wall)controls+=`<button class="primary wide" id="cable-test" ${testing?'disabled':''}>${testing?'驗線中…':'執行基礎驗線 · 1–8'}</button><pre class="tester-output" id="tester-output">${p.tested?'1→1  2→2  3→3  4→4\n5→5  6→6  7→7  8→8\nPASS · 本關導通與線序檢查完成':'尚未驗線，不能視為鏈路可用。'}</pre>`;
 return `<section class="burial-section"><span class="eyebrow">永久鏈路施工 · 配線架到牆內插座</span><h3>${p.tested?'永久鏈路已通過基本驗線':'先完成埋線，再插前面的跳線'}</h3><p>永久鏈路是牆內／天花板的固定線；跳線是設備前面可拔插的短線。兩者不同。</p><ol class="burial-progress">${[['route','規劃線槽'],['pulled','穿線降線'],['patch','機房打線'],['wall','護理站打線'],['tested','驗線']].map(([k,label])=>`<li class="${p[k]?'done':''}">${p[k]?'✓':'○'} ${label}</li>`).join('')}</ol>${controls}</section>`;
}
function bindBurial(d){const side=d.type==='patch'?'patch':'wall',p=state.permanent;$$('[data-route]').forEach(b=>b.onclick=()=>{if(b.dataset.route!=='ceiling')return toast('走道需保持暢通。本關請選天花板線槽，並在插座位置降線。');p.route=true;state.pingPassed=false;toast('已規劃：機房配線架 → 天花板線槽 → 護理站牆面插座。');refreshHUD();renderInspector();});
 $('#pull-start')?.addEventListener('click',()=>{p.pulling=true;refreshHUD();renderInspector();toast('已開始穿線。按教學卡「帶我過去」，把另一端帶到牆面插座。');});
 $('#pull-end')?.addEventListener('click',()=>{if(!p.pulling)return;p.pulled=true;p.pulling=false;refreshHUD();renderInspector();toast('牆面降線完成。接著在兩端依 T568B 色碼打線。');});
 $$('[data-wire]').forEach(b=>b.onclick=()=>{const draft=terminationDraft[side],empty=Array.from({length:8},(_,i)=>i).find(i=>draft[i]===undefined);if(empty!==undefined)draft[empty]=+b.dataset.wire;renderInspector();});$$('[data-slot]').forEach(b=>b.onclick=()=>{delete terminationDraft[side][+b.dataset.slot];renderInspector();});
 $('#terminate-clear')?.addEventListener('click',()=>{terminationDraft[side]=[];renderInspector();});
 $('#terminate-demo')?.addEventListener('click',()=>{const draft=terminationDraft[side],i=Array.from({length:8},(_,n)=>n).find(n=>draft[n]!==n);if(i===undefined)return toast('八條線序已正確，請按「檢查並完成打線」。');const old=draft.indexOf(i);if(old>=0)delete draft[old];draft[i]=i;toast(`第 ${i+1} 條線芯是「${WIRE_COLORS[i].name}」。請對照上方色碼。`);renderInspector();});
 $('#terminate-check')?.addEventListener('click',()=>{const draft=terminationDraft[side],wrong=Array.from({length:8},(_,i)=>i).find(i=>draft[i]!==i);if(wrong!==undefined)return toast(`第 ${wrong+1} 格應該是「${WIRE_COLORS[wrong].name}」，目前${draft[wrong]===undefined?'還沒放入線芯':'顏色不對'}。點該格可清除重排。`);p[side]=true;p.tested=false;state.pingPassed=false;refreshHUD();renderInspector();toast('此端八條線序正確，打線完成。');});
 $('#cable-test')?.addEventListener('click',()=>{if(!near(d)||!p.wall||!p.patch||!p.pulled)return;testing=true;renderInspector();let i=0;const lines=[];testTimer=setInterval(()=>{if(!selected||selected!==d.id||!near(d)||!p.wall||!p.patch){clearInterval(testTimer);testing=false;toast('驗線中斷，請留在資訊插座旁重新測試。');return;}lines.push(`${++i} → ${i}  ✓`);const out=$('#tester-output');if(out)out.textContent=lines.join('\n');if(i===8){clearInterval(testTimer);testing=false;p.tested=true;refreshHUD();renderInspector();toast('永久鏈路基礎驗線 PASS！現在開始接兩端跳線。');}},160);});
}
function showBurialLesson(){showDialog(`<span class="eyebrow">施工教學 / 從零埋線</span><h2>「埋線」與「插網路線」差在哪？</h2><div class="cabling-explainer"><div><strong>固定的永久鏈路</strong><p>機房配線架背面 → 天花板線槽 → 護理站牆內 → 資訊插座背面。需要規劃、穿線、兩端打線與驗線。</p></div><div><strong>可拔插的跳線</strong><p>交換器前面的孔 → 配線架 P1；牆面 J1 → 工作站 eth0。選 Cat6 工具，點兩端網孔即可。</p></div></div><div class="diagram">交換器 ─ 跳線 ─ 配線架 P1\n                  ║\n             天花板／牆內線\n                  ║\n工作站 ─ 跳線 ─ 牆面插座 J1</div><p>按下面按鈕開始，教學卡會每次只告訴你一件事，並標出設備和網孔。舊存檔可重做埋線練習；既有跳線、IP 與設備設定都會保留，但需要重新驗線與 Ping。</p><button id="start-burial" class="primary wide">帶我一步一步做埋線</button>`);$('#start-burial').onclick=()=>{clearInterval(testTimer);testing=false;state.permanent={route:false,pulling:false,pulled:false,patch:false,wall:false,tested:false};terminationDraft.patch=[];terminationDraft.wall=[];state.guide=true;state.pingPassed=false;state.completionShown=false;cableStart=null;updateCableBanner();$('#dialog').close();refreshHUD();followGuide();};}
function drawGuide(){if(!state.guide)return;const g=guideStep(),d=byId[g.target],target=approach(d),p=point(target.x,target.y,2);ctx.strokeStyle='#dbeeb28c';ctx.lineWidth=2;ctx.setLineDash([5,7]);const from=point(state.player.x,state.player.y);ctx.beginPath();ctx.moveTo(from.x,from.y);ctx.lineTo(p.x,p.y);ctx.stroke();ctx.setLineDash([]);ctx.beginPath();ctx.ellipse(p.x,p.y,27,13,0,0,Math.PI*2);ctx.stroke();const marker=point(d.x+d.w/2,d.y+d.d/2,d.h+45+Math.sin(performance.now()/400)*5);ctx.fillStyle='#e2efbc';ctx.beginPath();ctx.moveTo(marker.x,marker.y+9);ctx.lineTo(marker.x-7,marker.y-3);ctx.lineTo(marker.x+7,marker.y-3);ctx.fill();}

$('#guide-go').onclick=followGuide;$('#guide-hide').onclick=()=>{state.guide=false;refreshGuide();if(selected)renderInspector();scheduleSave();};$('#show-guide').onclick=()=>{state.guide=true;refreshGuide();if(selected)renderInspector();scheduleSave();};$('#burial-help').onclick=showBurialLesson;
new ResizeObserver(resize).observe($('#viewport'));refreshHUD();setZoom(zoom);requestAnimationFrame(update);
// Retire only caches from earlier versions of this repository; no remote dependencies are needed.
if('serviceWorker'in navigator&&location.protocol!=='file:'){navigator.serviceWorker.getRegistrations().then(rs=>rs.filter(r=>r.scope===new URL('./',location.href).href).forEach(r=>r.unregister())).catch(()=>{});}
})();
