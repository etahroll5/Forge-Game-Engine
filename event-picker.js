'use strict';
(()=>{
 const conditions=[['onStart','System','On start of layout'],['everyFrame','System','Every tick'],['keyPressed','Keyboard','Key is down'],['onCollect','Objects','Collectible collected']];
 const actions=[['moveX','Objects','Move horizontally'],['moveY','Objects','Move vertically'],['setPosition','Objects','Set position'],['rotate','Objects','Rotate object'],['lookAt','Objects','Look at object'],['setColor','Appearance','Set colour'],['show','Appearance','Show object'],['hide','Appearance','Hide object'],['cameraPosition','Camera','Set camera position'],['cameraFollow','Camera','Follow object'],['cameraZoom','Camera','Set camera zoom'],['cameraReset','Camera','Reset camera'],['message','System','Show message']];
 const root=document.createElement('div');root.id='forgeEventPicker';root.hidden=true;
 root.innerHTML='<div class="forgeEventDialog" role="dialog" aria-modal="true" aria-label="Create event"><header><div><small>FORGE VISUAL EVENTS</small><h2 id="forgePickerHeading">Add condition</h2><p id="forgePickerHint">Choose when the event happens</p></div><button id="forgePickerClose">✕</button></header><nav><span id="forgePickerStep0">1 Condition</span><span id="forgePickerStep1">2 Action</span><span id="forgePickerStep2">3 Parameters</span></nav><div class="forgePickerContent"><div id="forgePickerList"><input id="forgePickerSearch" placeholder="Search conditions and actions…"><div id="forgePickerItems"></div></div><div id="forgePickerBuild" hidden><div id="forgePickerConditions"></div><button type="button" id="forgePickerAddCondition">＋ Add another condition (AND)</button><div id="forgePickerActions"></div><button type="button" id="forgePickerAddAction">＋ Add another action</button></div><div id="forgePickerParams" hidden><p id="forgePickerSummary"></p><label>Target object</label><select id="forgePickerTarget"></select><label>Value (number, X,Y, object name or message)</label><input id="forgePickerValue" placeholder="Enter action parameter"><div id="forgePickerKeyRow"><label>Key</label><input id="forgePickerKey" value="ArrowRight"></div></div></div><footer><button id="forgePickerBack">Back</button><button id="forgePickerCreate" class="primary" hidden>Create event</button></footer></div>';
 document.body.append(root);
 const el=id=>document.getElementById(id);
 let step=0,condition=null,action=null,conditionsChosen=[],actionsChosen=[];
 function close(){root.hidden=true}
 function updateBuild(){el("forgePickerBuild").hidden=step!==2;el("forgePickerConditions").textContent="Conditions (ALL must match): "+conditionsChosen.map(c=>c[2]+(c[0]==="keyPressed"?" ["+(c.key||"ArrowRight")+"]":"")).join(" + ");el("forgePickerActions").textContent="Actions: "+actionsChosen.map(a=>a.action[2]).join(" → ")}
 function choices(){
  const items=step===0?conditions:actions,q=el('forgePickerSearch').value.toLowerCase(),container=el('forgePickerItems');container.replaceChildren();
  const groups=[...new Set(items.map(i=>i[1]))];
  for(const group of groups){const matches=items.filter(i=>i[1]===group&&i[2].toLowerCase().includes(q));if(!matches.length)continue;const heading=document.createElement('h3');heading.textContent=group;container.append(heading);const grid=document.createElement('div');grid.className='forgePickerGrid';for(const item of matches){const button=document.createElement('button');button.textContent=item[2];button.onclick=()=>{if(step===0){condition=item;conditionsChosen.push({...item,key:"ArrowRight"});changeStep(1)}else{action=item;changeStep(2)}};grid.append(button)}container.append(grid)}
 }
 function changeStep(next){
  step=next;el('forgePickerHeading').textContent=['Add condition','Add action','Configure event'][step];
  el('forgePickerHint').textContent=['Choose when the event happens','Choose what happens next','Set the object and parameters'][step];
  el('forgePickerList').hidden=step===2;updateBuild();el('forgePickerParams').hidden=step!==2;el('forgePickerCreate').hidden=step!==2;el('forgePickerBack').disabled=step===0;
  for(let i=0;i<3;i++)el('forgePickerStep'+i).classList.toggle('active',i===step);
  if(step<2){el('forgePickerSearch').value='';choices();el('forgePickerSearch').focus()}
  else{
   el('forgePickerSummary').textContent=condition[2]+' → '+action[2];
   const select=el('forgePickerTarget');select.replaceChildren();
   for(const [v,name] of [['selected','Selected object'],['all','All objects'],...project.objs.map(o=>[String(o.id),o.name])]){const option=document.createElement('option');option.value=v;option.textContent=name;select.append(option)}
   select.value=project.objs.some(o=>o.id===selectedId)?String(selectedId):'selected';
   el('forgePickerKeyRow').hidden=condition[0]!=='keyPressed';
   el('forgePickerValue').value=({setPosition:'300,200',cameraPosition:'1200,500',cameraZoom:'1.5',setColor:'#a67aff',lookAt:'Player',message:'Hello!',rotate:'45'})[action[0]]||'';
  }
 }
 el('forgePickerSearch').oninput=choices;el('forgePickerClose').onclick=close;el('forgePickerBack').onclick=()=>{if(step>0)changeStep(step-1)};
 function addConfiguredAction(){if(!action)return;const v=el('forgePickerTarget').value;actionsChosen.push({action,target:v==='all'||v==='selected'?v:Number(v),value:el('forgePickerValue').value});const last=conditionsChosen[conditionsChosen.length-1];if(last&&last[0]==='keyPressed')last.key=el('forgePickerKey').value||'ArrowRight';updateBuild()}
 el('forgePickerAddCondition').onclick=()=>{if(step===2){addConfiguredAction();action=null;changeStep(0)}};
 el('forgePickerAddAction').onclick=()=>{if(step===2){addConfiguredAction();action=null;changeStep(1)}};
 el('forgePickerCreate').onclick=()=>{
  addConfiguredAction();if(!conditionsChosen.length||!actionsChosen.length)return;
  checkpoint();const groupId='group-'+Date.now()+'-'+Math.random().toString(36).slice(2,6);
  let nextId=Math.max(0,...project.actions.map(a=>Number(a.id)||0))+1;
  const conditionData=conditionsChosen.map(c=>({trigger:c[0],key:c.key||'ArrowRight'}));
  for(const entry of actionsChosen){project.actions.push({id:nextId++,groupId,conditions:conditionData.map(c=>({...c})),trigger:conditionData[0].trigger,key:conditionData[0].key,action:entry.action[0],target:entry.target,value:entry.value})}
  renderEvents();autosave();close();
 };

 root.addEventListener('click',e=>{if(e.target===root)close()});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!root.hidden)close()});
 el('addEvent').addEventListener('click',e=>{e.stopImmediatePropagation();e.preventDefault();root.hidden=false;condition=null;action=null;conditionsChosen=[];actionsChosen=[];changeStep(0)},true);
})();