require('../people.js');require('../hospital-life.js');
const fs=require('node:fs'),assert=require('node:assert/strict'),src=fs.readFileSync(require.resolve('../game.js'),'utf8');
let code=['definitions','walls','clinicalPartitions','furniture'].map(n=>'const '+n+'='+src.match(new RegExp('const '+n+'=([\\s\\S]*?);'))[1]+';').join('\n');
code+='\nconst otherFloorCache=new Map();\n'+src.slice(src.indexOf('function floorObjects('),src.indexOf('function blockedMain('));
code+='\n'+src.slice(src.indexOf('function moveActor('),src.indexOf('function isNearInWorld('));
code+='\n'+src.slice(src.indexOf('const routeCache='),src.indexOf('function route(target)'));
code+='\nreturn {findPath,moveActor};';const nav=Function(code)();
for(const loc of HospitalLife.buildings.flatMap(b=>b.floors.map(f=>({building:b.id,floor:f.number})))){const s=HospitalLife.create(loc);for(let i=0;i<2400;i++)HospitalLife.tick(s,.1,{talking:null,findPath:(a,p)=>nav.findPath(a,p,s.key),move:(a,dx,dy)=>nav.moveActor(a,dx,dy,s.key)});assert(s.completed>0,`${s.key} never completed a consultation: `+JSON.stringify(s.agents.map(a=>({phase:a.phase,x:a.x,y:a.y,blocked:a.blocked}))));assert(s.logs.some(l=>l.message.includes('掛號')||l.message.includes('登記')));assert(s.logs.some(l=>l.message.includes('報到')));assert(s.agents.some(a=>a.kind==='doctor'));assert(s.agents.some(a=>a.kind==='nurse'));console.log('PASS actual walkable lifecycle',s.key,'completed',s.completed);}
assert(new Set(HospitalPeople.candidates.map(c=>c.name)).size===6);assert(HospitalPeople.candidates.every(c=>HospitalPeople.portrait(c).includes('ellipse')));console.log('PASS named candidates and face artwork');
