const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const Sim=require('../company-sim.js'),CLI=require('../cisco-cli.js');
const key='netops.company.v1';
function legacySave(){
 const s=Sim.create({employees:12,planId:'small'});
 for(const f of ['purchase','power','cable','configure','saveConfig','test','start'])assert(Sim[f](s).ok);
 const access=CLI.create('ACCESS-01',Array.from({length:24},(_,i)=>'Gi1/0/'+(i+1)),{},false),session=CLI.session();
 for(const cmd of ['enable','configure terminal','vlan 10','name OFFICE','exit','interface gi1/0/1','switchport mode access','switchport access vlan 10','no shutdown','exit','interface gi1/0/24','switchport mode access','switchport access vlan 10','no shutdown','end','write memory'])CLI.execute(access,session,cmd);
 s.ui={player:{x:-9000,y:-9000},consoles:{access},gateway:'10.10.10.1',dhcp:true,wires:['link-0','link-1','link-2','link-3','link-4']};
 Sim.inject(s,'misplug','jack-12');return s;
}
(async()=>{
 fs.mkdirSync('/workspace/scratch/company',{recursive:true});
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const p=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[],seed=legacySave();p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(({key,seed})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(seed));},{key,seed});
  await p.goto('http://127.0.0.1:8000/');await p.locator('#pause').click();
  const stored=()=>p.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
  await p.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).ui.controlMode==='god',key);
  let s=await stored();assert(!('player' in s.ui));assert.equal(s.budget,seed.budget);assert.deepEqual(s.ui.consoles,seed.ui.consoles);assert.equal(s.incidents[0].assetId,'jack-12');
  assert(!/走到|走近|快跑|定位角色|自動走路/.test(await p.locator('#game').innerText()));
  await p.locator('[data-view="incidents"]').click();await p.locator('[data-open-asset="jack-12"]').click();
  assert(await p.locator('#inspect-asset').isVisible(),'remote selection opens immediately, even with unreachable legacy player position');
  assert(await p.locator('#fix-misplug').isDisabled());await p.locator('#inspect-asset').click();await p.locator('#fix-misplug').click();await p.locator('#close-asset').click();
  await p.locator('#center-camera').click();await p.waitForTimeout(450);
  const before=(await stored()).ui.camera;
  await p.locator('#office').focus();await p.keyboard.down('ArrowRight');await p.waitForTimeout(220);await p.keyboard.up('ArrowRight');await p.waitForTimeout(450);
  const after=(await stored()).ui.camera;assert(after.x>before.x);assert(after.y<before.y);
  const canvas=p.locator('#office');await canvas.scrollIntoViewIfNeeded();let r=await canvas.boundingBox();
  await p.mouse.move(r.x+r.width*.5,r.y+r.height*.8);await p.mouse.down();await p.mouse.move(r.x+r.width*.5+100,r.y+r.height*.8+30,{steps:8});await p.mouse.up();await p.waitForTimeout(450);
  const dragged=(await stored()).ui.camera;assert(Math.hypot(dragged.x-after.x,dragged.y-after.y)>30);assert(await p.locator('#asset-panel').isHidden(),'dragging does not select a device');
  const oldZoom=(await stored()).ui.zoom;await p.mouse.wheel(0,-180);await p.waitForTimeout(450);assert((await stored()).ui.zoom>oldZoom);
  await p.locator('#center-camera').click();await p.waitForTimeout(450);s=await stored();r=await canvas.boundingBox();
  // Click the visible access-switch rack directly on the map, rather than an asset-table shortcut.
  const project=(x,y,z)=>({x:r.x+r.width/2+((x-y)-(s.ui.camera.x-s.ui.camera.y))*.8*s.ui.zoom,y:r.y+r.height/2+((x+y-s.ui.camera.x-s.ui.camera.y)*.4-z)*s.ui.zoom});
  const switchPoint=project(150,340,50);await p.mouse.click(switchPoint.x,switchPoint.y);assert(await p.locator('#asset-panel').innerText().then(t=>t.toLowerCase().includes('access-1')));
  await p.locator('#asset-console').click();assert(await p.locator('#cli-input').isVisible());await p.locator('#cli-done').click();await p.locator('#close-asset').click();
  await p.locator('[data-view="assets"]').click();await p.locator('[data-open-asset="pc-12"]').click();assert(await p.locator('[data-related-asset="pc-12"]').count());
  await p.locator('[data-related-asset="cable-12"]').click();assert((await p.locator('#asset-panel').innerText()).toLowerCase().includes('cable-12'));
  await p.locator('[data-related-asset="jack-12"]').click();assert((await p.locator('#asset-panel').innerText()).toLowerCase().includes('jack-12'));
  await p.keyboard.press('Escape');assert(await p.locator('#asset-panel').isHidden(),'Escape closes a component panel while its button has focus');await p.locator('#center-camera').click();await p.waitForTimeout(450);const saved=await stored();
  await p.locator('#viewport').screenshot({path:'/workspace/scratch/company/god-view.png'});
  await p.reload();await p.waitForTimeout(450);s=await stored();assert.deepEqual(s.ui.camera,saved.ui.camera);assert.equal(s.ui.zoom,saved.ui.zoom);assert(s.incidents[0].resolved);assert.equal(s.budget,seed.budget);assert(!('player' in s.ui));assert.deepEqual(errors,[]);
  console.log('PASS god-view migration preserves company, instant remote diagnostics, direct map selection, CLI access, workstation components, camera keys/drag/zoom/overview and persisted camera');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
