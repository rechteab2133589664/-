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
 {id:'PATCH-01',name:'機櫃配線架',type:'patch',x:560,y:390,w:95,d:50,h:100,ports:['P1','P2','P3','P4'],note:'P1 與護理站資訊插座 J1 之間，已有預埋的永久鏈路；兩端仍需跳線。'},
 {id:'WALL-01',name:'護理站資訊插座',type:'wall',x:1000,y:170,w:65,d:26,h:60,ports:['J1','J2'],note:'J1 對應機房配線架 P1。請把這個資訊插座接到工作站的乙太網路埠。'},
 {id:'PC-01',name:'護理工作站',type:'pc',x:1130,y:365,w:100,d:70,h:72,ports:['eth0'],note:'這是本次驗收的護理工作站。需供電、接線，設定靜態 IPv4，再驗證閘道。'}
];
const byId=Object.fromEntries(definitions.map(d=>[d.id,d]));
function fresh(){return {version:1,player:{x:790,y:525},visited:false,ups:false,pcPower:false,cables:[],config:{},pc:{ip:'',mask:'',gateway:''},logs:{},pingPassed:false,completionShown:false};}
let state=fresh();try{const saved=JSON.parse(localStorage.getItem(KEY));if(validSave(saved))state={...fresh(),...saved};}catch{}
function validSave(s){return s&&s.version===1&&s.player&&Number.isFinite(s.player.x)&&Number.isFinite(s.player.y)&&s.player.x>=25&&s.player.x<=1475&&s.player.y>=25&&s.player.y<=1035&&typeof s.ups==='boolean'&&typeof s.pcPower==='boolean'&&Array.isArray(s.cables)&&s.cables.length<=8&&s.cables.every(c=>c&&[c.a,c.b].every(p=>p&&byId[p.device]?.ports.includes(p.port)&&p.port!=='Console')&&[3,10,30,90].includes(c.length))&&s.config&&typeof s.config==='object'&&s.logs&&typeof s.logs==='object'&&s.pc&&['ip','mask','gateway'].every(k=>typeof s.pc[k]==='string');}
const defaultConfig=()=>({vlan10:false,routing:false,svi:'',trunk:false,accessMode:false,accessVlan:1,saved:false});
for(const d of definitions)state.config[d.id]={...defaultConfig(),...(state.config[d.id]||{})};
let tool='inspect',selected=null,cableStart=null,consoleSession=null,keys=new Set(),path=[],pendingInspect=null,hoverDevice=null,zoom=.83;
let camera={x:state.player.x,y:state.player.y},pointer={x:0,y:0},lastTime=0,moving=false,walkCycle=0,saveTimer,toastTimer,history=[],historyIndex=0;
const canvas=$('#world'),ctx=canvas.getContext('2d');let width=0,height=0,dpr=1;
function save(){try{localStorage.setItem(KEY,JSON.stringify(state));$('#save-state').textContent='進度已儲存 · 本機';}catch{$('#save-state').textContent='儲存空間不可用，請匯出存檔';}}
function scheduleSave(){clearTimeout(saveTimer);saveTimer=setTimeout(save,250);}
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
function linkLayerReady(){return state.ups&&state.pcPower&&wiringDone();}
function reachable(){return linkLayerReady()&&coreReady()&&switchReady()&&pcReady();}
function objectives(){return [
 {done:state.visited,title:'走進機房，查看設備',hint:'用 WASD 移動。走近機房的交換器後按 E，或點擊設備讓角色走過去。'},
 {done:state.ups,title:'啟動 UPS 與機櫃供電',hint:'UPS 在機房後排。走近後查看面板，開啟供電。'},
 {done:wiringDone(),title:`完成六段實體跳線（${expected.filter(l=>connected(...l)).length}/6）`,hint:'按 2 選 Cat6。靠近設備，點一個網孔，再帶著線頭走到另一端，點選對應網孔。'},
 {done:coreReady(),title:'Console 設定核心交換器',hint:'按 3 選 Console 線，在 CORE-01 點 Console 網孔，接上隨身筆電。設定提示在面板下方。'},
 {done:switchReady(),title:'設定接入交換器 VLAN／Trunk',hint:'使用 Console 進入 SW-01。Gi0/1 設為 Trunk；Fa0/1 設為 Access VLAN 10，並儲存。'},
 {done:state.pcPower,title:'啟動護理工作站',hint:'走到護理站，查看工作站面板，按下電源。'},
 {done:pcReady(),title:'設定工作站 IPv4',hint:'工作站使用 10.10.10.21 / 255.255.255.0，預設閘道 10.10.10.1。'},
 {done:state.pingPassed&&reachable(),title:'Ping 閘道，完成現場驗收',hint:'在護理工作站的命令列執行 ping 10.10.10.1。所有線路、供電與設定都會參與驗證。'}
 ];}
function refreshHUD(){const tasks=objectives(),count=tasks.filter(t=>t.done).length,next=tasks.findIndex(t=>!t.done);$('#progress-number').textContent=`${count} / ${tasks.length}`;$('#progress-bar').style.width=`${count/tasks.length*100}%`;$('#objectives').innerHTML=tasks.map((t,i)=>`<li class="${t.done?'done':i===next?'current':''}"><span class="check">${t.done?'✓':i+1}</span><button data-hint="${i}">${esc(t.title)}</button></li>`).join('');$$('[data-hint]').forEach(b=>b.onclick=()=>toast(tasks[+b.dataset.hint].hint));$('#dispatch-note').textContent=next<0?'護理工作站已驗收。你可以拔掉任何一段線，觀察連線測試是否會跟著失敗。':tasks[next].hint;$('#header-status').textContent=reachable()?(state.pingPassed?'護理站已通過驗收':'線路就緒 · 等待驗收'):'網路工程驗收前';$('#cable-count').textContent=8-state.cables.length;$('#location').textContent=state.player.x<720?(state.player.y<640?'資訊機房':'資訊室'):state.player.x>900&&state.player.y<640?'護理站／病房':'公共走廊';scheduleSave();}
// Physical walls include real door openings. Furniture is solid, too.
const walls=[{x:20,y:20,w:1460,d:12},{x:20,y:20,w:12,d:1020},{x:1468,y:20,w:12,d:1020},{x:20,y:1028,w:1460,d:12},{x:720,y:20,w:14,d:295},{x:720,y:465,w:14,d:575},{x:20,y:640,w:300,d:14},{x:465,y:640,w:269,d:14},{x:900,y:20,w:14,d:295},{x:900,y:465,w:14,d:180},{x:900,y:640,w:580,d:14}];
const furniture=[{x:1100,y:80,w:230,d:60,h:35,type:'counter'},{x:1200,y:510,w:150,d:65,h:33,type:'bed'},{x:330,y:800,w:180,d:80,h:45,type:'desk'},{x:90,y:810,w:90,d:85,h:35,type:'sofa'},{x:1350,y:790,w:50,d:50,h:55,type:'plant'}];
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
function closeInspector(){selected=null;consoleSession=null;$('#inspector').hidden=true;canvas.focus({preventScroll:true});}
function setTool(value){tool=value;$$('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===tool));if(tool!=='copper')cableStart=null;updateCableBanner();if(selected)renderInspector();}
function updateCableBanner(){const banner=$('#cable-banner');banner.hidden=!cableStart;$('#cancel-cable').hidden=!cableStart;if(cableStart)banner.textContent=`線頭：${cableStart.device} ${cableStart.port} → 帶著另一端走到目的網孔`;}
function cableLength(a,b){return Math.max(1,Math.ceil(dist(byId[a.device],byId[b.device])*.075));}
function clickPort(device,port){const d=byId[device];if(!near(d))return toast('請先走到設備旁邊。');if(port==='Console'){
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
 panel.innerHTML=`<div class="inspector-head"><div><span class="eyebrow">EQUIPMENT INSPECTION</span><h2>${esc(d.name)}</h2><span class="eyebrow">${d.id}</span></div><button id="close-inspector" title="關閉面板">×</button></div><div class="inspector-body"><div class="equipment-status"><span>現場距離：可操作</span><span class="${powered(d)?'online':'offline'}">● ${['patch','wall'].includes(d.type)?'被動配線元件':powered(d)?'供電正常':'尚未供電'}</span></div><p>${d.note}</p>${d.ports.length?`<div class="faceplate"><div class="faceplate-label">${d.id} / FRONT PANEL</div><div class="ports">${d.ports.map(port=>{const p=endpoint(d.id,port),c=cableAt(p);return `<div class="port-wrap"><button class="port ${port==='Console'?'console-port':''} ${c?'connected':''} ${powered(d)?'powered':''} ${cableStart&&same(cableStart,p)?'selected':''}" data-port="${esc(port)}" aria-label="${d.id} ${esc(port)} 網孔" title="${esc(port)}${c?' · 已接線':' · 空閒'}"><i class="port-light"></i></button><small>${esc(port)}</small></div>`;}).join('')}</div></div><div class="port-legend">點選實際網孔操作 · 藍色＝已插線 · 黃框＝Console</div>`:''}${d.type==='ups'?`<div class="status-card">PDU 電源已預接四台機櫃設備。<br>UPS 輸出：${state.ups?'230V AC · 運轉中':'關閉'}</div><div class="button-row"><button class="${state.ups?'secondary':'primary'} wide" id="toggle-power">${state.ups?'關閉 UPS 輸出':'⏻ 啟動 UPS 供電'}</button></div>`:''}${d.type==='pc'?`<button class="${state.pcPower?'secondary':'primary'} wide" id="toggle-pc">${state.pcPower?'⏻ 關閉工作站':'⏻ 開啟工作站電源'}</button>${state.pcPower?pcPanel():''}`:''}${connections?`<div class="connection-list">${connections}</div>`:''}${d.type==='patch'||d.type==='wall'?'<div class="status-card">永久鏈路：PATCH-01 P1 ↔ WALL-01 J1<br>預埋線長約 38 m，已完成基本驗線。</div>':''}${consoleSession?.device===d.id?terminalPanel(d.id):''}${['core','switch'].includes(d.type)?`<details class="inspector-note" ${consoleSession?'open':''}><summary>本次施工指令 · ${d.type==='core'?'核心':'接入'}</summary><pre class="code">${(d.type==='core'?coreCommands:switchCommands).join('\n')}</pre></details>`:''}<div class="inspector-note">${cableStart?'你正帶著另一端線頭。關閉面板，走到目的設備再插入。':'可用滑鼠點選網孔；WASD 移動時會自動收起面板。'}<br>設備與協定為教學用簡化模擬。</div></div>`;
 $('#close-inspector').onclick=closeInspector;$$('[data-port]').forEach(b=>b.onclick=()=>clickPort(d.id,b.dataset.port));$('#toggle-power')?.addEventListener('click',()=>{state.ups=!state.ups;state.pingPassed=false;consoleSession=null;refreshHUD();renderInspector();});$('#toggle-pc')?.addEventListener('click',()=>{state.pcPower=!state.pcPower;state.pingPassed=false;refreshHUD();renderInspector();});
 $('#ip-form')?.addEventListener('submit',e=>{e.preventDefault();const ip=$('#ip-address').value.trim(),mask=$('#ip-mask').value.trim(),gateway=$('#ip-gateway').value.trim();if(![ip,mask,gateway].every(validIPv4))return toast('IPv4 格式不正確，請輸入四段 0–255 的數字。');state.pc={ip,mask,gateway};state.pingPassed=false;refreshHUD();toast('IPv4 設定已套用。請用命令列驗證閘道。');});
 $('#terminal-form')?.addEventListener('submit',e=>{e.preventDefault();const input=$('#command-input'),value=input.value;input.value='';runCommand(d.id,value);});
 $('#command-input')?.addEventListener('keydown',e=>{if(e.key==='ArrowUp'){e.preventDefault();historyIndex=Math.max(0,historyIndex-1);e.target.value=history[historyIndex]||'';}if(e.key==='ArrowDown'){e.preventDefault();historyIndex=Math.min(history.length,historyIndex+1);e.target.value=history[historyIndex]||'';}});
 $$('[data-command]').forEach(b=>b.onclick=()=>runCommand(d.id,b.dataset.command));scrollTerminal();
}
function validIPv4(s){return /^(0|[1-9]\d{0,2})(\.(0|[1-9]\d{0,2})){3}$/.test(s)&&s.split('.').every(v=>Number(v)<=255);}
function pcPanel(){return `<form id="ip-form" class="ip-form"><label>IPv4 位址<input id="ip-address" value="${esc(state.pc.ip)}" placeholder="10.10.10.21" autocomplete="off"></label><label>子網路遮罩<input id="ip-mask" value="${esc(state.pc.mask)}" placeholder="255.255.255.0" autocomplete="off"></label><label>預設閘道<input id="ip-gateway" value="${esc(state.pc.gateway)}" placeholder="10.10.10.1" autocomplete="off"></label><button class="secondary" type="submit">套用 IPv4 設定</button></form>${terminalPanel('PC-01')}`;}
function promptFor(id){if(id==='PC-01')return 'C:\\>';const mode=consoleSession?.mode;return id+(mode==='priv'?'#':mode==='config'?'(config)#':mode==='vlan'?'(config-vlan)#':mode==='interface'?'(config-if)#':'>');}
function terminalPanel(id){const pc=id==='PC-01',logs=state.logs[id]||[pc?'Nurse Station OS · 本機命令列\n輸入 ipconfig 或 ping 10.10.10.1。':''];return `<div class="terminal"><div class="terminal-header">${pc?'LOCAL TERMINAL':'USB CONSOLE / 9600 8N1'} · ${id}</div><pre class="terminal-output" id="terminal-output" role="log">${esc(logs.join('\n'))}</pre><form class="terminal-form" id="terminal-form"><label for="command-input">${esc(promptFor(id))}</label><input id="command-input" aria-label="設備命令列" autocomplete="off" spellcheck="false"><button type="submit">↵</button></form></div><div class="quick-commands">${(pc?['ipconfig','ping 10.10.10.1']:['help','show running-config','show interfaces status']).map(c=>`<button data-command="${c}">${c}</button>`).join('')}</div>`;}
function scrollTerminal(){const t=$('#terminal-output');if(t)t.scrollTop=t.scrollHeight;}
function failureReason(){if(!state.pcPower)return '工作站尚未啟動。';if(!state.ups)return '機櫃設備未供電，請檢查 UPS。';const missing=expected.filter(l=>!connected(...l));if(missing.length)return '實體鏈路不完整。請逐段檢查網孔與配線架。';if(!pcReady())return 'IPv4／遮罩／閘道設定不符合本次驗收網段。';if(!coreReady())return '核心的 VLAN 10、SVI、路由或 startup-config 尚未就緒。';if(!switchReady())return '接入設備 VLAN／Trunk／Access VLAN 或儲存組態尚未就緒。';return '';}
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
function showCompletion(){showDialog(`<span class="eyebrow">SITE ACCEPTANCE / PASSED</span><h2>第一個工作站，正式上線。</h2><p>你親手完成了供電、六段跳線、核心與接入設定，以及護理站的閘道連線驗證。</p><div class="diagram">UPS → 機櫃供電 ✓\nISP → 路由器 → 防火牆 → 核心 → 接入 ✓\n配線架 → 永久鏈路 → 資訊插座 → 護理工作站 ✓\nIPv4 / VLAN 10 / Trunk / Ping ✓</div><p>接著可以練習故障排除：拔除一段線，回工作站 Ping，再修復並重新驗證。本版先聚焦現場操作，醫院人數成長、監控平台與自動化尚未加入。</p><button class="primary" id="continue-playing">繼續現場操作</button>`);$('#continue-playing').onclick=()=>$('#dialog').close();}
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
 floorRect(0,0,1500,1060,'#20343e','#45616b');floorRect(32,32,688,608,'#2c4850',null);floorRect(734,32,166,996,'#395059',null);floorRect(914,32,554,608,'#3a585d',null);floorRect(32,654,688,374,'#304c53',null);floorRect(914,654,554,374,'#304a54',null);
 ctx.globalAlpha=.23;for(let x=40;x<1480;x+=60)line3([[x,32,0],[x,1028,0]],'#7a9a9e',.65);for(let y=40;y<1040;y+=60)line3([[32,y,0],[1468,y,0]],'#7a9a9e',.65);ctx.globalAlpha=1;
 text('資訊機房',365,300,1,'#7799a5',26);text('SERVER / NETWORK ROOM',365,335,1,'#70909b',10);text('護理站 / 01',1190,275,1,'#90b4b7',23);text('資訊室',365,950,1,'#809da7',24);text('公共走廊',817,775,1,'#829da6',18);text('新院區 · 待啟用',1200,890,1,'#6b8894',19);
 // Permanent in-wall link is drawn as a subdued construction trace.
 line3([[610,390,0],[680,390,0],[680,100,0],[1000,100,0],[1030,170,0]],'#b9ac7c66',2,[7,5]);
 text('預埋永久鏈路',800,115,0,'#a39e7a',9);
 for(const w of walls)box(w.x,w.y,w.w,w.d,43,'#68858c','#3d5b68','#4c6b76','#90aab622');
 // Door thresholds stay unobstructed, so characters must use actual openings.
 for(const d of [{x:715,y:315,w:25,d:150},{x:315,y:635,w:150,d:25},{x:895,y:315,w:25,d:150}])floorRect(d.x,d.y,d.w,d.d,'#638c8b55','#8db4ad55');
}
function renderFurniture(o){if(o.type==='bed'){box(o.x,o.y,o.w,o.d,20,'#b5c8c6','#73989e','#85a8ac');box(o.x+8,o.y+6,o.w-16,o.d-12,35,'#c3d9d0','#92b6b1','#abc8c0');box(o.x+12,o.y+9,30,o.d-18,41,'#ebeddf','#b2c9c4','#d1dfd5');text('病床 01',o.x+70,o.y+o.d+24,0,'#8bafb5',10);}else if(o.type==='plant'){const p=point(o.x+25,o.y+25,40);box(o.x+7,o.y+7,36,36,22,'#ada48d','#756f64','#8b8674');ctx.fillStyle='#6f9d8a';for(let i=0;i<6;i++){ctx.beginPath();ctx.ellipse(p.x+Math.cos(i)*14,p.y-10+Math.sin(i)*12,13,19,i,0,Math.PI*2);ctx.fill();}}else{box(o.x,o.y,o.w,o.d,o.h,o.type==='counter'?'#98b6b5':'#809fa5','#4b737e','#638b93');if(o.type==='desk')box(o.x+30,o.y+10,75,15,76,'#6e8e9e','#163e50','#254b5c');}}
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
function draw(){ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);ctx.fillStyle='#172732';ctx.fillRect(0,0,width,height);const c=point(camera.x,camera.y);ctx.translate(width/2-c.x*zoom,height/2-c.y*zoom);ctx.scale(zoom,zoom);renderFloor();renderCables();
 const items=[...furniture.map(o=>({depth:o.x+o.y+o.d,draw:()=>renderFurniture(o)})),...definitions.map(d=>({depth:d.x+d.y+d.d,draw:()=>renderDevice(d)})),{depth:state.player.x+state.player.y,draw:renderPlayer}];items.sort((a,b)=>a.depth-b.depth).forEach(i=>i.draw());
 if(path.length){const end=path.at(-1),p=point(end.x,end.y);ctx.strokeStyle='#b8e4cb66';ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(p.x,p.y,12,6,0,0,Math.PI*2);ctx.stroke();}ctx.lineCap='butt';
}
function resize(){const rect=$('#viewport').getBoundingClientRect();width=rect.width;height=rect.height;dpr=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);draw();}
function deviceAt(sx,sy){return [...definitions].sort((a,b)=>b.x+b.y-a.x-a.y).find(d=>{const p=project(d.x+d.w/2,d.y+d.d/2,d.h/2);return Math.abs(sx-p.x)<Math.max(30,d.w*.55*zoom)&&Math.abs(sy-p.y)<Math.max(35,(d.h*.65+d.d*.4)*zoom);});}
function setZoom(value){zoom=Math.max(.4,Math.min(1.55,value));$('#zoom-value').textContent=Math.round(zoom*100)+'%';draw();}
function update(now){const dt=Math.min((now-lastTime)/1000||0,.04);lastTime=now;const before={...state.player};if(!$('#dialog').open){let dx=0,dy=0;
  // WASD follows screen directions in the isometric view.
  if(keys.has('w')||keys.has('arrowup')){dx-=1;dy-=1;}if(keys.has('s')||keys.has('arrowdown')){dx+=1;dy+=1;}if(keys.has('a')||keys.has('arrowleft')){dx-=1;dy+=1;}if(keys.has('d')||keys.has('arrowright')){dx+=1;dy-=1;}
  if(dx||dy){path=[];pendingInspect=null;if(selected)closeInspector();const mag=Math.hypot(dx,dy);move(dx/mag*185*dt,dy/mag*185*dt);}else if(path.length){const target=path[0],delta={x:target.x-state.player.x,y:target.y-state.player.y},distance=Math.hypot(delta.x,delta.y);if(distance<5)path.shift();else move(delta.x/distance*185*dt,delta.y/distance*185*dt);}
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
window.addEventListener('keydown',e=>{const typing=['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName);if(typing){if(e.key==='Escape')e.target.blur();return;}const key=e.key.toLowerCase();if($('#dialog').open)return;if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright',' '].includes(key)){e.preventDefault();keys.add(key);}if(e.repeat)return;if(key==='e'){e.preventDefault();if(selected)closeInspector();else{const d=nearest();d?inspect(d.id):toast('附近沒有可操作的設備。走近機櫃、插座或工作站。');}}if(['1','2','3','4'].includes(key))setTool(['inspect','copper','console','remove'][+key-1]);if(key==='escape'){if(cableStart){cableStart=null;updateCableBanner();}else closeInspector();}if(key==='h')showHelp();});
window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));window.addEventListener('blur',()=>{keys.clear();save();});document.addEventListener('visibilitychange',()=>{if(document.hidden){keys.clear();save();}});window.addEventListener('beforeunload',save);
$$('[data-tool]').forEach(b=>b.onclick=()=>setTool(b.dataset.tool));$('#cancel-cable').onclick=()=>{cableStart=null;updateCableBanner();if(selected)renderInspector();};$('#zoom-in').onclick=()=>setZoom(zoom+.1);$('#zoom-out').onclick=()=>setZoom(zoom-.1);$('#recenter').onclick=()=>{camera={...state.player};setZoom(.83);};$('#dialog-close').onclick=()=>$('#dialog').close();$('#help-button').onclick=showHelp;$('#map-button').onclick=showMap;
function showMap(){showDialog(`<span class="eyebrow">AS-BUILT / CABLING PLAN</span><h2>先看清楚線路，再動手。</h2><p>機房在走廊左側，護理站在右側。角色必須從門口進出，不能穿過牆壁與設備。</p><div class="diagram">[ 機房後排 ]\nISP GE0 ──→ RTR-01 WAN\nRTR-01 LAN ──→ FW-01 WAN\nFW-01 LAN ──→ CORE-01 Gi0/1\n\n[ 機房前排 ]\nCORE-01 Gi0/2 ──→ SW-01 Gi0/1\nSW-01 Fa0/1 ──→ PATCH-01 P1\n                       ║ 預埋永久鏈路\n[ 護理站 ]              ║\nWALL-01 J1 ←═══════════╝\nWALL-01 J1 ──→ PC-01 eth0</div><p>共有六條 Cat6 跳線。配線架 P1 至牆面 J1 已預埋，不用再拉一條跳線。90 m 線可以完成本關所有跳接；短線距離不足會被阻擋。</p><p>供電：UPS 預接 PDU；工作站有獨立電源。路由器與防火牆在本原型使用預載實驗設定，核心與接入交換器需手動設定。</p>`);}
function showHelp(){showDialog(`<span class="eyebrow">FIELD ENGINEER / QUICK START</span><h2>你就是現場的網管。</h2><div class="help-grid"><div><h3>01 · 移動與查看</h3><p>WASD／方向鍵移動角色。也可以點地板，自動繞牆走過去。靠近設備按 E；點設備則會走到它前方並打開面板。</p></div><div><h3>02 · 插頭與網孔</h3><p>按 2 選 Cat6，點第一個網孔。關閉面板，走到另一端，再點另一個網孔。工具列可選 3／10／30／90 m 線。按 4 可拔線。</p></div><div><h3>03 · Console 設定</h3><p>先啟動 UPS。按 3 選 Console 線，走近核心或接入交換器，點 Console 埠連接隨身筆電。面板下方提供施工指令。</p></div><div><h3>04 · 實際驗證</h3><p>工作站要先開機、設定 IPv4，再執行 ping 10.10.10.1。實體線路、供電、VLAN、Trunk 與位址任一不完整，都會失敗。</p></div></div><p>滾輪或右上角按鈕可縮放。按 Esc 取消拉線或收起面板。點左側驗收項目可查看提示。進度自動保存在目前瀏覽器，也能匯出 JSON 備份。</p><p>這版先實作現場操作。尚無萬人經營、監控平台、真實 IOS、完整封包或纜線物理模擬；病患與臨床服務也不在本關驗收範圍。</p>`);}
$('#save-button').onclick=()=>{save();const url=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='hospital-field-save.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('已匯出 JSON 存檔備份。');};
$('#reset-button').onclick=()=>{showDialog('<span class="eyebrow">NEW SHIFT</span><h2>重新開始這次施工？</h2><p>目前瀏覽器中的現場進度將被清除。舊版企業與醫院經營模式的存檔不受影響；需要保留這個現場時，請先按「匯出存檔」。</p><div class="button-row"><button class="secondary" id="keep-game">繼續目前進度</button><button class="danger" id="confirm-reset">確認重開現場</button></div>');$('#keep-game').onclick=()=>$('#dialog').close();$('#confirm-reset').onclick=()=>{state=fresh();for(const d of definitions)state.config[d.id]=defaultConfig();selected=null;cableStart=null;consoleSession=null;path=[];pendingInspect=null;camera={...state.player};$('#inspector').hidden=true;$('#dialog').close();setTool('inspect');refreshHUD();save();toast('新施工現場已準備好。');};};
new ResizeObserver(resize).observe($('#viewport'));refreshHUD();setZoom(zoom);requestAnimationFrame(update);
// Retire only caches from earlier versions of this repository; no remote dependencies are needed.
if('serviceWorker'in navigator&&location.protocol!=='file:'){navigator.serviceWorker.getRegistrations().then(rs=>rs.filter(r=>r.scope===new URL('./',location.href).href).forEach(r=>r.unregister())).catch(()=>{});}
})();
