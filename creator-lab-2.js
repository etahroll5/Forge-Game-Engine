'use strict';
/* Forge Creator Lab 2: isolated from the core editor to keep navigation safe. */
(()=> {
const $=id=>document.getElementById(id);
const say=t=>{const el=$('forgeLab2Status');if(el)el.textContent=t;};
const data=()=>{if(typeof project==='undefined')throw Error('Project not loaded');return project;};
const persist=()=>{if(typeof autosave==='function')autosave();};
const history=()=>{if(typeof checkpoint==='function')checkpoint();};
const add=(id,fn)=>$(id)?.addEventListener('click',()=>{try{fn()}catch(e){say('Error: '+e.message);console.error(e)}});
const findObject=term=>data().objs.find(o=>o.name.toLowerCase().includes(term.toLowerCase()));
const showObject=o=>{if(!o)return say('No matching object');selectedId=o.id;if(typeof showEditor==='function')showEditor();if(typeof renderObjects==='function')renderObjects();if(typeof renderInspector==='function')renderInspector();if(typeof draw==='function')draw();say('Selected '+o.name)};
add('forgeLab2Commands',()=>{const choice=prompt('Command: editor, events, script, pixel, home, save, new, play');if(!choice)return;const map={editor:'homeContinue',events:'workspaceEventsTab',script:'workspaceScriptTab',pixel:'pixelTab',home:'homeTab',save:'saveProject',new:'newProject',play:'playButton'};const id=map[choice.trim().toLowerCase()];if(id)$(id)?.click();else say('Unknown command')});
add('forgeLab2Search',()=>{const q=prompt('Find an object by name');if(q!==null)showObject(findObject(q))});
add('forgeLab2Layout',()=>{const root=document.querySelector('.workspace');if(!root)return;root.classList.toggle('forgeFocusLayout');say(root.classList.contains('forgeFocusLayout')?'Focus layout: sidebars hidden':'Normal layout restored')});
add('forgeLab2Themes',()=>{document.body.classList.toggle('forgeWarmTheme');say(document.body.classList.contains('forgeWarmTheme')?'Warm theme enabled':'Blue theme enabled')});
add('forgeLab2Play',()=>{if(typeof showEditor==='function')showEditor();const play=$('playButton');if(play)play.click();else say('Use Play in the editor toolbar')});
add('forgeLab2Align',()=>{const objs=data().objs;if(objs.length<2)return say('Need at least two objects');history();const gap=16;let x=Math.min(...objs.map(o=>o.x));for(const o of [...objs].sort((a,b)=>a.x-b.x)){o.x=x;x+=o.w+gap}persist();if(typeof draw==='function')draw();say('Objects spaced horizontally by 16px')});
add('forgeLab2Tags',()=>{const o=data().objs.find(o=>o.id===selectedId);if(!o)return say('Select an object in the editor first');const v=prompt('Tags for '+o.name+' (comma separated)',(o.forgeTags||[]).join(', '));if(v===null)return;history();o.forgeTags=v.split(',').map(t=>t.trim()).filter(Boolean);persist();say('Saved tags: '+(o.forgeTags.join(', ')||'none'))});
add('forgeLab2Preview',()=>{const source=$('scene'),target=$('forgeLab2Canvas');if(!source||!target)return say('Scene canvas unavailable');target.width=source.width;target.height=source.height;target.getContext('2d').drawImage(source,0,0);target.hidden=false;say('Scene preview captured. Click again to refresh')});
add('forgeLab2Health',()=>{const p=data(),issues=[];if(!p.objs.length)issues.push('Scene is empty');if(p.objs.some(o=>!Number.isFinite(+o.x)||!Number.isFinite(+o.y)))issues.push('Invalid object coordinates');if(p.objs.some(o=>+o.w<=0||+o.h<=0))issues.push('Invalid object size');const ids=p.objs.map(o=>o.id);if(new Set(ids).size!==ids.length)issues.push('Duplicate object IDs');say(issues.length?'Health: '+issues.join(' • '):'Basic project health check passed')});
add('forgeLab2States',()=>{const p=data();p.forgeStates ||= [];const name=prompt('New state name (e.g. Idle, Run, Jump)');if(!name)return;if(p.forgeStates.some(s=>s.name===name))return say('State already exists');history();p.forgeStates.push({name,transitions:[]});persist();say('Added state '+name+'. States: '+p.forgeStates.map(s=>s.name).join(', '))});
})();