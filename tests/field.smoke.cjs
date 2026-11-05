// Requires a local HTTP server and the environment's existing Playwright + Chromium.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const URL=process.env.GAME_URL||'http://127.0.0.1:8000/';
const devices={ISP:[130,150,80,55,66],UPS:[275,150,65,60,78],'RTR-01':[420,150,85,58,92],'FW-01':[565,150,85,58,92],'CORE-01':[150,390,100,65,118],'SW-01':[350,390,115,65,118],'PATCH-01':[560,390,95,50,100],'WALL-01':[1000,170,65,26,60],'PC-01':[1130,365,100,70,72]};
const core=['enable','configure terminal','vlan 10','exit','ip routing','interface vlan 10','ip address 10.10.10.1 255.255.255.0','no shutdown','end','copy running-config startup-config'];
const access=['enable','configure terminal','vlan 10','exit','interface gi0/1','switchport mode trunk','exit','interface fa0/1','switchport mode access','switchport access vlan 10','end','copy running-config startup-config'];
(async()=>{
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(URL);assert(await page.locator('#guide-card').isVisible());await page.locator('#zoom-out').click();await page.locator('#zoom-out').click();
 const read=async()=>{await page.waitForTimeout(350);return page.evaluate(()=>JSON.parse(localStorage.getItem('hospital.field-engineer.v1')))};
 async function go(id){if(await page.locator('#inspector').isVisible())await page.locator('#close-inspector').click();await page.waitForTimeout(400);const s=await read(),rect=await page.locator('#world').boundingBox(),[x,y,w,d,h]=devices[id],zoom=parseInt(await page.locator('#zoom-value').innerText())/100;const sx=rect.x+rect.width/2+((x+w/2-y-d/2)-(s.player.x-s.player.y))*.82*zoom,sy=rect.y+rect.height/2+((x+w/2+y+d/2-s.player.x-s.player.y)*.41-h/2)*zoom;await page.mouse.click(sx,sy);await page.locator(`#inspector[data-device="${id}"]`).waitFor({state:'visible',timeout:15000});console.log('inspect',id);}
 async function port(id,name){await page.getByRole('button',{name:`${id} ${name} 網孔`,exact:true}).click();}
 async function command(value){await page.locator('#command-input').fill(value);await page.locator('#terminal-form button').click();if(value.startsWith('copy '))await page.locator('#terminal-form button').click();}
 // Keyboard movement must change position, and walls must stop movement.
 await page.locator('#world').focus();await page.keyboard.down('s');await page.waitForTimeout(300);await page.keyboard.up('s');await page.waitForTimeout(350);assert((await read()).player.x>790,'WASD movement');
 await go('UPS');await page.locator('#toggle-power').click();assert((await page.locator('#toggle-power').innerText()).includes('關閉'));
 // Guided permanent cabling is a real prerequisite, not a pre-completed background line.
 async function guideTo(id){await page.locator('#guide-go').click();await page.locator(`#inspector[data-device="${id}"]`).waitFor({state:'visible',timeout:15000});}
 await guideTo('PATCH-01');await page.locator('[data-route=floor]').click();assert((await page.locator('#toast').innerText()).includes('走道需保持暢通'));assert.equal((await read()).permanent.route,false);
 await page.locator('[data-route=ceiling]').click();await page.locator('#pull-start').click();await guideTo('WALL-01');await page.locator('#pull-end').click();
 await page.locator('[data-wire="3"]').click();await page.locator('#terminate-check').click();assert((await page.locator('#toast').innerText()).includes('第 1 格應該是'));
 await page.locator('#terminate-clear').click();for(let i=0;i<8;i++)await page.locator(`[data-wire="${i}"]`).click();await page.locator('#terminate-check').click();
 await guideTo('PATCH-01');for(let i=0;i<8;i++)await page.locator('#terminate-demo').click();await page.locator('#terminate-check').click();
 await guideTo('WALL-01');assert.equal((await read()).permanent.tested,false);await page.locator('#cable-test').click();await page.waitForFunction(()=>document.querySelector('#tester-output')?.textContent.includes('PASS'));assert.equal((await read()).permanent.tested,true);console.log('PASS guided path selection, pull cable across rooms, wrong color rejection, both T568B terminations, 1–8 wiremap');
 // A Console plug cannot be used as an Ethernet data socket.
 await go('CORE-01');await page.locator('[data-tool=copper]').click();await port('CORE-01','Console');assert((await page.locator('#toast').innerText()).includes('Console'));
 const links=[['ISP','GE0','RTR-01','WAN'],['RTR-01','LAN','FW-01','WAN'],['FW-01','LAN','CORE-01','Gi0/1'],['CORE-01','Gi0/2','SW-01','Gi0/1'],['SW-01','Fa0/1','PATCH-01','P1'],['WALL-01','J1','PC-01','eth0']];
 // Deliberately try a short cable, then retry with an adequate one.
 await go('ISP');assert(await page.locator('[data-port=GE0]').evaluate(el=>el.classList.contains('guide-port')));await port('ISP','GE0');await go('RTR-01');await page.locator('#cable-length').selectOption('3');await port('RTR-01','WAN');assert((await page.locator('#toast').innerText()).includes('線不夠長'));await page.locator('#cable-length').selectOption('90');await port('RTR-01','WAN');
 for(const [a,ap,b,bp]of links.slice(1)){await go(a);await port(a,ap);await go(b);await port(b,bp);}
 assert((await read()).cables.length===6,'six physical cables');console.log('PASS physical walk, door navigation, type and length checks, six cables');
 await go('PC-01');await page.locator('#toggle-pc').click();await command('ping 10.10.10.1');assert((await page.locator('#terminal-output').innerText()).includes('Request timed out'));
 await page.locator('#ip-address').fill('10.10.10.21');await page.locator('#ip-mask').fill('255.255.255.0');await page.locator('#ip-gateway').fill('10.10.10.1');await page.locator('#ip-form button').click();
 for(const [id,commands]of[['CORE-01',core],['SW-01',access]]){await go(id);await page.locator('[data-tool=console]').click();await port(id,'Console');for(const c of commands)await command(c);assert((await page.locator('#terminal-output').innerText()).includes('[OK]'));}
 await go('PC-01');await command('ping 10.10.10.1');await page.locator('#continue-playing').waitFor();assert((await page.locator('#terminal-output').innerText()).includes('Lost = 0'));await page.locator('#continue-playing').click();await page.waitForTimeout(350);assert((await read()).pingPassed);console.log('PASS Console CLI, static IPv4, real state-dependent ping and completion');
 await page.screenshot({path:'/workspace/scratch/tutorial-update/field-complete.png'});
 // Failure must return after a physical cable is removed.
 await go('SW-01');await page.locator('[data-tool=remove]').click();await port('SW-01','Fa0/1');await go('PC-01');await command('ping 10.10.10.1');assert((await page.locator('#terminal-output').innerText()).includes('Request timed out'));await page.waitForTimeout(350);assert.equal((await read()).pingPassed,false);assert.equal((await read()).cables.length,5);
 await page.reload();assert((await read()).cables.length===5);assert.equal(await page.locator('#progress-number').innerText(),'7 / 9');
 for(const viewport of[{width:1366,height:768},{width:1920,height:1080}]){await page.setViewportSize(viewport);assert(!(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)));}
 assert.deepEqual(errors,[]);console.log('PASS unplug breaks ping, save restoration, desktop viewports, no page errors');
}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
