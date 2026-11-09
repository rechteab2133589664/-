const assert=require('node:assert/strict');
const Sim=require('../company-sim.js');
function built(opts={}){const s=Sim.create({employees:80,planId:'collapsed',seed:123,...opts});for(const fn of ['purchase','power','cable','configure','saveConfig','test','start'])assert(Sim[fn](s).ok,fn);return s;}
{
 const s=Sim.create({employees:24,planId:'small'}),budget=s.budget;
 for(const fn of ['power','cable','configure','saveConfig','test','start'])assert.equal(Sim[fn](s).ok,false,fn+' prerequisite');
 assert.equal(Sim.inject(s,'misplug').ok,false);assert.equal(Sim.tick(s,1).ok,false);assert.equal(s.elapsedMinutes,0);assert.equal(s.budget,budget);
 assert(Sim.purchase(s).ok);const after=s.budget;assert.equal(Sim.purchase(s).ok,false);assert.equal(s.budget,after);assert(Sim.power(s).ok);assert(Sim.cable(s).ok);assert(Sim.configure(s,{trunk:false}).ok);assert.equal(Sim.status(s).online,24,'running config works before save');assert.equal(Sim.test(s).ok,false,'test requires save');assert(Sim.saveConfig(s).ok);assert(Sim.test(s).ok);assert(Sim.start(s).ok);assert.equal(Sim.status(s).ready,true);
}
{
 const s=built();assert(Sim.configure(s,{vlan:20,trunk:false,gateway:'10.20.20.1',dhcp:false}).ok);assert.equal(Sim.status(s).online,0);assert.equal(Sim.test(s).ok,false);assert(Sim.resetToStartup(s).ok);assert.equal(s.config.vlan,10);assert.equal(Sim.status(s).online,80);assert.equal(Sim.status(s).ready,false,'reload requires retest');assert(Sim.test(s).ok);
 const fresh=Sim.create({employees:10,planId:'small'});Sim.purchase(fresh);Sim.power(fresh);Sim.cable(fresh);Sim.configure(fresh);Sim.resetToStartup(fresh);assert.equal(fresh.milestones.configured,false);assert.equal(Sim.status(fresh).online,0);
}
{
 const s=built(),r=Sim.inject(s,'misplug','jack-01');assert(r.ok);assert.equal(Sim.status(s).affected,1);assert.equal(Sim.resolveMisplug(s,r.incident.id).ok,false);assert(Sim.inspect(s,'jack-01').ok);assert.equal(Sim.repair(s,'jack-01').ok,false);const before=s.budget;assert(Sim.resolveMisplug(s,r.incident.id).ok);assert.equal(s.budget,before);assert.equal(Sim.status(s).online,80);assert(Sim.test(s).ok);
}
{
 const s=built();assert(Sim.inject(s,'pc','pc-01').ok);assert(Sim.inject(s,'cable','cable-01').ok);assert.equal(Sim.status(s).affected,1,'same endpoint failures are not double counted');assert.equal(Sim.repair(s,'pc-01').ok,false,'diagnosis first');assert(Sim.inspect(s,'pc-02').ok);assert.equal(Sim.repair(s,'pc-01').ok,false,'wrong inspection does not diagnose fault');assert(Sim.inspect(s,'pc-01').ok);assert(Sim.repair(s,'pc-01').ok);assert.equal(Sim.status(s).affected,1,'other fault remains');assert.equal(Sim.status(s).activeIncidents,1);assert.equal(Sim.test(s).ok,false);Sim.inspect(s,'cable-01');assert(Sim.repair(s,'cable-01').ok);assert.equal(Sim.status(s).online,80);assert(Sim.test(s).ok);
}
{
 const s=built();Sim.inject(s,'jack','jack-02');Sim.inspect(s,'jack-02');const old=JSON.stringify(s.assets.find(a=>a.id==='jack-02'));s.budget=0;assert.equal(Sim.repair(s,'jack-02').ok,false);assert.equal(JSON.stringify(s.assets.find(a=>a.id==='jack-02')),old);assert.equal(Sim.status(s).activeIncidents,1);
}
{
 const s=built();Sim.inject(s,'jack','jack-01');const a=s.assets.find(a=>a.id==='jack-01');assert.equal(a.fault,'oxidation');let sawUp=false,sawDown=false;for(let i=0;i<4;i++){Sim.tick(s,5);if(a.intermittentDown)sawDown=true;else sawUp=true;}assert(sawUp&&sawDown,'contact fault really fluctuates');assert.equal(Sim.status(s).health,'degraded');assert.equal(Sim.test(s).ok,false,'intermittently up is not a clean acceptance');
}
{
 const a=built({seed:77}),b=built({seed:77});Sim.tick(a,60);Sim.tick(b,60);assert.deepEqual(a,b);assert(a.assets.every(x=>!x.fault),'pristine hardware does not randomly fail');Sim.tick(a,1440*31);Sim.tick(b,1440*31);assert.deepEqual(a,b);assert(a.assets.filter(x=>x.type==='cable').every(x=>!x.fault),'new cables do not expire after one month');assert(Sim.status(a).activeIncidents<80,'fast-forward event population is bounded');const restored=JSON.parse(JSON.stringify(a));Sim.tick(a,10);Sim.tick(restored,10);assert.deepEqual(a,restored,'serialized simulation resumes deterministically');
}
{
 const s=built();const r=Sim.inject(s,'aging','pc-01');assert(r.ok);const a=s.assets.find(a=>a.id==='pc-01');assert.equal(a.condition,0);assert.equal(Sim.status(s).affected,1);Sim.inspect(s,a.id);assert(Sim.repair(s,a.id).ok);assert.equal(a.condition,100);assert.equal(a.ageMinutes,0);
}
{
 const s=built();Sim.inject(s,'switch','core-2');assert.equal(Sim.status(s).affected,0,'unconfigured standby is not primary');assert.equal(Sim.status(s).health,'degraded');Sim.inject(s,'switch','core-1');assert.equal(Sim.status(s).affected,80,'purchasing a second core does not invent HA');
}
{
 const s=built();Sim.inject(s,'cable','cable-01');for(let i=0;i<100;i++){const r=Sim.inject(s,'misplug','jack-02');assert(r.ok);Sim.inspect(s,'jack-02');assert(Sim.resolveMisplug(s,r.incident.id).ok);}assert(s.incidents.some(i=>i.assetId==='cable-01'&&!i.resolved),'unresolved incident must never age out of capped history');Sim.inspect(s,'cable-01');assert(Sim.repair(s,'cable-01').ok);
}
{
 const s=built({employees:10000,planId:'three-tier'});assert.equal(s.sampledEndpoints,12);assert(s.assets.length<60);assert.equal(Sim.status(s).online,10000);Sim.inject(s,'pc','pc-12');assert.equal(Sim.status(s).affected,1);Sim.inject(s,'switch','access-1');assert.equal(Sim.status(s).affected,48,'sample access switch affects its real 48-port range');
}
console.log('PASS CompanySim prerequisites, cost, running/startup config, diagnostics, repair isolation, misplugs, intermittent contacts, lifetime, deterministic persistence, honest standby and 10,000-user impact counts');
