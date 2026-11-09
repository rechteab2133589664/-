const assert=require('node:assert/strict'),S=require('../company-sim.js');
function built(){const s=S.create({employees:12,planId:'small',seed:77});for(const f of['purchase','power','cable','configure','saveConfig','test','start'])assert(S[f](s).ok);return s;}
{
 const s=built(),pc=s.assets.find(a=>a.id==='pc-01'),cable=s.assets.find(a=>a.id==='cable-01'),jack=s.assets.find(a=>a.id==='jack-01');assert.equal(pc.lifespanMinutes,6*S.YEAR);assert.equal(cable.lifespanMinutes,15*S.YEAR);assert.equal(jack.lifespanMinutes,20*S.YEAR);assert(s.assets.filter(a=>a.type==='switch').every(a=>a.lifespanMinutes===10*S.YEAR));
 S.tick(s,30*S.DAY);assert(pc.condition>98);assert(cable.condition>99);assert(jack.condition>99);assert(!s.incidents.some(i=>i.kind==='aging'),'one month must not exhaust equipment');
}
{
 const s=built();s.nextWearCheckAt=Number.MAX_SAFE_INTEGER;s.nextMisplugAt=Number.MAX_SAFE_INTEGER;
 for(let i=0;i<5;i++)S.tick(s,S.YEAR);S.tick(s,S.YEAR-1);const pc=s.assets.find(a=>a.id==='pc-01');assert.equal(pc.fault,null,'PC is not automatically retired before six years');S.tick(s,1);assert.equal(pc.fault,'end-of-life');assert.equal(pc.ageMinutes,6*S.YEAR);assert.equal(S.formatAge(pc.lifespanMinutes),'6 年');assert(!s.assets.some(a=>a.type==='cable'&&a.fault),'network cables outlast PCs');
 for(let i=6;i<15;i++)S.tick(s,S.YEAR);assert.equal(s.assets.find(a=>a.id==='cable-01').fault,'end-of-life');assert.equal(s.assets.find(a=>a.id==='jack-01').fault,null);for(let i=15;i<20;i++)S.tick(s,S.YEAR);assert.equal(s.assets.find(a=>a.id==='jack-01').fault,'end-of-life');
}
{
 const a=built(),b=JSON.parse(JSON.stringify(a));for(let i=0;i<5;i++){S.tick(a,S.YEAR);S.tick(b,S.YEAR);}assert.deepEqual(a,b,'multi-year random wear remains deterministic across saves');assert(a.assets.filter(x=>x.type==='cable').every(x=>!x.fault),'five-year cables do not receive premature aging faults');
}
{
 const s=built(),budget=s.budget,config=JSON.stringify(s.config);S.inject(s,'aging','pc-01');S.inject(s,'pc','pc-02');S.inject(s,'aging','pc-03');s.incidents.find(i=>i.assetId==='pc-01').source='automatic';const a=s.assets.find(a=>a.id==='pc-01'),practice=s.assets.find(a=>a.id==='pc-03');a.ageMinutes=45*S.DAY;a.lifespanMinutes=45*S.DAY;practice.ageMinutes=45*S.DAY;practice.lifespanMinutes=45*S.DAY;for(const c of s.assets.filter(a=>a.type==='cable'))c.lifespanMinutes=30*S.DAY;delete s.lifecycleVersion;
 S.status(s);assert.equal(s.lifecycleVersion,2);assert.equal(a.ageMinutes,45*S.DAY);assert.equal(a.lifespanMinutes,6*S.YEAR);assert.equal(a.fault,null);assert(a.condition>97);assert(s.incidents.find(i=>i.assetId==='pc-01').resolved);assert.equal(s.assets.find(a=>a.id==='pc-02').fault,'hardware','unrelated fault is preserved');assert.equal(practice.fault,'end-of-life');assert.equal(practice.ageMinutes,6*S.YEAR,'intentional age drill remains an age drill');assert.equal(s.budget,budget);assert.equal(JSON.stringify(s.config),config);const once=JSON.stringify(s);S.status(s);assert.equal(JSON.stringify(s),once,'migration is idempotent');
}
{
 const s=built();S.inject(s,'aging','pc-01');S.inspect(s,'pc-01');assert(S.repair(s,'pc-01').ok);const a=s.assets.find(a=>a.id==='pc-01');assert.equal(a.ageMinutes,0);assert.equal(a.condition,100);assert.equal(a.lifespanMinutes,6*S.YEAR);
}
console.log('PASS realistic yearly lifetimes, first-month health, exact six/fifteen/twenty-year boundaries, deterministic long-term wear, legacy fault migration and replacement reset');
