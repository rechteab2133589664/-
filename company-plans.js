/* Company-size planning data. Original teaching scenarios, not vendor sizing rules. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.CompanyPlans=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const shared=[
 {id:'rack',label:'機櫃與配電',model:'19 吋機櫃／PDU',role:'rack',price:28000,ports:0},
 {id:'ups',label:'UPS 不斷電系統',model:'線上式 UPS／教學容量',role:'ups',price:36000,ports:0},
 {id:'edge',label:'邊界路由器',model:'Cisco ISR 1111',role:'edge',price:42000,ports:8},
 {id:'firewall',label:'安全閘道',model:'Cisco Secure Firewall 1010',role:'firewall',price:48000,ports:8}
];
const endpoint={id:'pc-1',label:'第一台員工電腦',model:'辦公工作站／有線 NIC',role:'endpoint',price:24000,ports:1};
const access={id:'access-1',label:'48 埠接入交換器',model:'Cisco Catalyst C9200L-48T-4G',role:'access',price:88000,ports:48};
const plans=[
 {id:'small',name:'小型辦公室／單台交換器',min:0,max:24,summary:'先用簡單架構建立單一辦公室：邊界、VLAN 與接入交換器。',reasons:['設備數少、故障範圍容易理解，適合從零學習。','先完成員工 VLAN、實體佈線、IP 與驗收，再談擴建。','單一辦公室不強迫增加獨立核心。先用一台接入交換器與邊界閘道，保留日後擴充分層的空間。'],equipment:[...shared.map(x=>({...x})),{...access},{...endpoint}],availability:'單一路徑；沒有模擬設備自動備援。',scope:'單台接入交換器供應辦公端點，閘道由邊界設備提供。單一 VLAN 的上聯不強迫配置 Trunk；未建立自動備援。'},
 {id:'collapsed',name:'中型公司／折疊核心',min:25,max:200,summary:'由雙核心／彙聚層連接各辦公區的接入交換器，集中管理 VLAN 與路由。',reasons:['把多個辦公區集中到核心／彙聚層，接入層負責員工端點。','雙核心可作為日後備援設計的起點；仍須另設協定與驗證切換。','增加接入交換器前先計算埠容量、預留空間及配線需求。'],equipment:[...shared.map(x=>({...x})),{id:'core-1',label:'核心／彙聚交換器 A',model:'Cisco Catalyst C9300',role:'core',price:190000,ports:48},{id:'core-2',label:'核心／彙聚交換器 B',model:'Cisco Catalyst C9300',role:'core',price:190000,ports:48},{...access},{...endpoint}],availability:'示範雙核心設備與分層連接；本版不把「買了兩台」當成已完成 HSRP、StackWise 或自動切換。',scope:'主要操作第一組核心與接入設備，其餘辦公區以容量和批次數量呈現。'},
 {id:'three-tier',name:'大型公司／核心、彙聚、接入三層',min:201,max:10000,summary:'核心負責高速骨幹，彙聚按區域分組，接入層供應各辦公區端點。',reasons:['把故障範圍和變更範圍限制在個別區域，避免全部端點直接集中到一組設備。','規模增加時應分區增加彙聚組與接入交換器，並計畫雙上聯、頻寬與監控。','大型園區需再評估樓棟、路由、安全政策及服務可用性；人數只是規劃起點。'],equipment:[...shared.map(x=>({...x})),{id:'core-1',label:'骨幹核心 A',model:'Cisco Catalyst C9500',role:'core',price:360000,ports:48},{id:'core-2',label:'骨幹核心 B',model:'Cisco Catalyst C9500',role:'core',price:360000,ports:48},{id:'dist-1',label:'區域彙聚 A',model:'Cisco Catalyst C9300',role:'distribution',price:190000,ports:48},{id:'dist-2',label:'區域彙聚 B',model:'Cisco Catalyst C9300',role:'distribution',price:190000,ports:48},{...access},{...endpoint}],availability:'展示三層設備角色與容量；OSPF、ECMP、LACP、STP 和自動故障切換需分別建置，本版不宣稱完整模擬。',scope:'圖上先教一個代表區域；容量規劃會顯示整間公司需要多少接入設備與示範彙聚組，並非兩台彙聚能支援所有萬人端點。'}
];
function count(value){const n=Number(value);if(!Number.isInteger(n)||n<0||n>10000)throw new RangeError('員工規劃人數須為 0–10,000 的整數。');return n;}
function recommend(employeeCount){const n=count(employeeCount);return plans.find(p=>n>=p.min&&n<=p.max);}
function capacity(employeeCount){const employees=count(employeeCount),endpointDemand=employees,sparePorts=Math.ceil(endpointDemand*.2),requiredPorts=endpointDemand+sparePorts,portsPerSwitch=48,accessSwitches=Math.ceil(requiredPorts/portsPerSwitch),installedPorts=accessSwitches*portsPerSwitch,distributionPairs=employees>200?Math.ceil(accessSwitches/20):0;return {employees,employeeCount:employees,endpoints:endpointDemand,endpointDemand,sparePorts,requiredPorts,portsPerSwitch,accessSwitches,installedPorts,unusedPorts:installedPorts-endpointDemand,endpointUtilization:installedPorts?endpointDemand/installedPorts:0,designUtilization:installedPorts?requiredPorts/installedPorts:0,distributionPairs,distributionSwitches:distributionPairs*2,assumption:'每位員工一個有線端點，另預留 20% 埠。48 個資料埠與獨立上聯埠分開計算；尚未包含 AP、電話、印表機和 IoT。',distributionAssumption:'三層教學以每 20 台接入設備示範一組雙彙聚；實務仍須依上聯埠、頻寬、樓棟及備援重新計算。'};}
function getPlan(id){return plans.find(p=>p.id===id)||null;}
function steps(planId){const p=getPlan(planId);if(!p)throw new RangeError('找不到架構，請先選擇公司網路方案。');const hierarchy=p.id==='three-tier'?'邊界 → 核心 → 彙聚 → 接入 → 電腦':p.id==='collapsed'?'邊界 → 折疊核心 → 接入 → 電腦':'ISP → 邊界閘道 → 單台接入交換器 → 電腦';return [
 {id:'purchase',title:'01 · 使用管理電腦網購設備',why:'先把設備角色、埠數和預算對起來，才能知道設備夠不夠用。',instruction:'點選已有行動網路的管理電腦，開啟採購網站、確認清單與機櫃數量，再送出訂單。',action:'purchase'},
 {id:'site',title:'02 · 自選機房位置',why:'機房需考慮用電、空調、管線與擴充空間。',instruction:'比較推薦與其他候選地點，選擇位置並確認機櫃數量及建設費。',action:'site'},
 {id:'rack',title:'03 · 選機櫃與 U 位上架',why:'設備需佔用連續 U 位，庫存設備只能安裝一次。',instruction:'先點機房地板、自選位置建立機櫃，再點機櫃的空白 U 位，從庫存選設備確認上架。',action:'rack'},
 {id:'power',title:'02 · 上架與供電',why:'設備放進機房不等於可以使用；配電和穩定供電是所有檢查的起點。',instruction:'完成機櫃上架，開啟 UPS／PDU，再確認各台設備供電狀態。',action:'power'},
 {id:'wan',title:'03 · 接好外網與安全邊界',why:'內網與外網的角色不同；先辨識 WAN、LAN 與安全閘道，避免接錯區域。',instruction:'依配線提示接好 ISP／邊界路由器與防火牆。外網故障不代表同 VLAN 內的閘道也應無法到達。',action:'cable'},
 {id:'cable',title:'04 · 按層級完成實體配線',why:'有一致的接線方式，後續才能定位哪一層、哪一段線出問題。',instruction:'照圖逐段連接：'+hierarchy+'。選設備上聯埠，不要把員工接入埠誤當上聯，也不要多接一條線形成迴路。',action:'cable'},
 {id:'vlans',title:'05 · Console 設定 VLAN',why:'VLAN 是二層網域；設備兩端需要一致的設計，端點才不會落到錯的網段。',instruction:'進入 Cisco 風格 Console：enable → configure terminal → vlan 10。再依提示把員工埠設為 switchport mode access 與 switchport access vlan 10。',action:'configure'},
 {id:'trunk',title:p.id==='small'?'06 · 確認上聯與埠角色':'06 · 設定交換器 Trunk 上聯',why:p.id==='small'?'只有一個員工 VLAN 的小型辦公室，不需要為了教學強迫加入不必要的 Trunk。':'交換器間要傳多個 VLAN 時，應有明確的 Trunk 與允許清單。',instruction:p.id==='small'?'確認交換器上聯接到邊界閘道的 LAN，員工電腦接在 VLAN 10 的 Access 埠。以 show interfaces status 和 show vlan brief 檢查介面角色。':'在指定上聯介面設定 switchport mode trunk，並確認 VLAN 10 在 allowed VLAN 清單中。用 show interfaces trunk 檢查，不只看網路線有沒有插好。',action:'configure'},
 {id:'address',title:'07 · 設定閘道與工作站 IP',why:'實體有連線、VLAN 正確之後，才輪到 IPv4、遮罩和預設閘道。',instruction:p.id==='small'?'依本關位址表設定邊界閘道的 LAN 位址，以及第一台電腦的 IP、遮罩和預設閘道。小型方案不要求獨立核心 SVI。':'依本關位址表設定 VLAN 10 的 SVI／閘道，再設定第一台電腦的 IP、遮罩及預設閘道。不要把兩台端點設成同一個 IP。',action:'configure'},
 {id:'save',title:'08 · 保存組態與備份',why:'running-config 與 startup-config 不同；未儲存的設定可能在設備重開機後消失。',instruction:'檢視 show running-config。執行 copy running-config startup-config，按 Enter 確認；另外保留施工紀錄與組態備份。',action:'configure'},
 {id:'test',title:'09 · 驗收連線與容量',why:'驗收應證明端點真的能到閘道，不是只看到綠燈或按完採購。',instruction:'檢查交換器介面、VLAN、Trunk 與 IPv4。在工作站 Ping 本地閘道，確認結果與端點數、可用埠一致。未通過就依供電 → 線材 → 埠 → VLAN → IP 順序排查。',action:'test'},
 {id:'operate',title:'10 · 開始營運與維護',why:'網路建好後仍會出事：使用者可能亂接線，線材、網孔與電腦也會逐漸老化或發生間歇故障。',instruction:'進入辦公區營運，查看告警和報修紀錄。先蒐證、找出根因，再換線、換孔、修正組態或更換工作站，最後重新驗證。',action:'operate'}
 ].map((s,i)=>({...s,title:String(i+1).padStart(2,'0')+s.title.slice(2)}));}
return {plans,recommend,capacity,getPlan,steps};
});
