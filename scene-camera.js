'use strict';
/* Forge multi-scene editor and camera controls. */
function forgeEnsureScenes(){
 if(!project.camera)project.camera={x:0,y:0,zoom:1,followId:null};
 if(!Array.isArray(project.scenes)||!project.scenes.length){
  project.scenes=[{name:'Scene 1',objs:JSON.parse(JSON.stringify(project.objs)),actions:JSON.parse(JSON.stringify(project.actions||[])),script:project.script||'',width:project.width,height:project.height,background:project.background,camera:{...project.camera}}];
  project.activeScene=0;
 }
 if(!Number.isInteger(project.activeScene)||project.activeScene<0||project.activeScene>=project.scenes.length)project.activeScene=0;
}
function forgeSyncScene(){
 forgeEnsureScenes();
 const scene=project.scenes[project.activeScene];
 Object.assign(scene,{objs:JSON.parse(JSON.stringify(project.objs)),actions:JSON.parse(JSON.stringify(project.actions||[])),script:project.script||'',width:project.width,height:project.height,background:project.background,camera:{...project.camera}});
}
function forgeLoadScene(index){
 forgeEnsureScenes();if(index<0||index>=project.scenes.length)return;
 if(typeof stopPlay==='function')stopPlay();
 forgeSyncScene();
 const scene=project.scenes[index];project.activeScene=index;
 project.objs=JSON.parse(JSON.stringify(scene.objs||[])).map(normalizeObject).filter(Boolean);
 project.actions=JSON.parse(JSON.stringify(scene.actions||[]));
 project.script=scene.script||'';project.width=scene.width||4096;project.height=scene.height||2304;project.background=scene.background||'#e7edf6';
 project.camera={x:0,y:0,zoom:1,followId:null,...scene.camera};
 selectedId=null;nextId=Math.max(nextId,...project.objs.map(o=>o.id+1),1);
 document.getElementById('scriptEditor').value=project.script;
 document.getElementById('gameWidth').value=project.width;document.getElementById('gameHeight').value=project.height;document.getElementById('backgroundColor').value=project.background;
 if(typeof renderEvents==='function')renderEvents();
 if(typeof renderObjects==='function')renderObjects();
 if(typeof renderInspector==='function')renderInspector();
 forgeRefreshSceneUI();if(typeof draw==='function')draw();
 if(typeof autosave==='function')autosave();
}
function forgeRefreshSceneUI(){
 forgeEnsureScenes();
 const select=document.getElementById('forgeSceneSelect');if(!select)return;
 select.replaceChildren();
 project.scenes.forEach((scene,i)=>{const opt=document.createElement('option');opt.value=String(i);opt.textContent=scene.name||('Scene '+(i+1));select.append(opt)});
 select.value=String(project.activeScene);
 const follow=document.getElementById('forgeCamFollow');const prev=project.camera.followId;
 follow.replaceChildren();const none=document.createElement('option');none.value='';none.textContent='Free camera';follow.append(none);
 project.objs.forEach(o=>{const opt=document.createElement('option');opt.value=String(o.id);opt.textContent='Follow '+o.name;follow.append(opt)});
 follow.value=prev==null?'':String(prev);
 const c=project.camera;document.getElementById('forgeCameraStatus').textContent='World '+project.width+' × '+project.height+' · '+Math.round(c.zoom*100)+'%';
}
function forgeMoveCamera(dx,dy){forgeEnsureScenes();project.camera.followId=null;project.camera.x=Math.max(0,Math.min(Math.max(0,project.width-960/project.camera.zoom),project.camera.x+dx));project.camera.y=Math.max(0,Math.min(Math.max(0,project.height-540/project.camera.zoom),project.camera.y+dy));forgeRefreshSceneUI();draw();autosave()}
function forgeCameraFrame(){
 if(!project?.camera)return;
 const c=project.camera;if(c.followId!=null){const o=project.objs.find(o=>o.id===c.followId);if(o){c.x=Math.max(0,Math.min(Math.max(0,project.width-960/c.zoom),o.x+o.w/2-480/c.zoom));c.y=Math.max(0,Math.min(Math.max(0,project.height-540/c.zoom),o.y+o.h/2-270/c.zoom))}}
}
(()=>{
 const $=id=>document.getElementById(id),on=(id,fn)=>$(id)?.addEventListener('click',fn);
 $('forgeSceneSelect')?.addEventListener('change',e=>forgeLoadScene(Number(e.target.value)));
 on('forgeSceneAdd',()=>{forgeEnsureScenes();forgeSyncScene();project.scenes.push({name:'Scene '+(project.scenes.length+1),objs:[],actions:[],script:'',width:4096,height:2304,background:'#e7edf6',camera:{x:0,y:0,zoom:1,followId:null}});forgeLoadScene(project.scenes.length-1)});
 on('forgeSceneRename',()=>{forgeEnsureScenes();const s=project.scenes[project.activeScene],name=prompt('Scene name',s.name);if(!name?.trim())return;s.name=name.trim();forgeRefreshSceneUI();autosave()});
 on('forgeSceneDelete',()=>{forgeEnsureScenes();if(project.scenes.length<=1)return alert('A project needs at least one scene');if(!confirm('Delete this scene?'))return;forgeSyncScene();project.scenes.splice(project.activeScene,1);const target=Math.min(project.activeScene,project.scenes.length-1);project.activeScene=target;const scene=project.scenes[target];project.objs=JSON.parse(JSON.stringify(scene.objs||[]));project.actions=JSON.parse(JSON.stringify(scene.actions||[]));project.script=scene.script||'';project.camera={...scene.camera};forgeLoadScene(target)});
 for(const [id,dx,dy] of [['forgeCamLeft',-160,0],['forgeCamRight',160,0],['forgeCamUp',0,-120],['forgeCamDown',0,120]])on(id,()=>forgeMoveCamera(dx,dy));
 const zoom=mult=>{forgeEnsureScenes();project.camera.zoom=Math.max(.25,Math.min(3,project.camera.zoom*mult));forgeMoveCamera(0,0)};
 on('forgeCamZoomIn',()=>zoom(1.25));on('forgeCamZoomOut',()=>zoom(.8));
 on('forgeCamReset',()=>{forgeEnsureScenes();project.camera={x:0,y:0,zoom:1,followId:null};forgeRefreshSceneUI();draw();autosave()});
 $('forgeCamFollow')?.addEventListener('change',e=>{forgeEnsureScenes();project.camera.followId=e.target.value?Number(e.target.value):null;forgeCameraFrame();draw();autosave()});
 document.addEventListener('keydown',e=>{if(!e.altKey||/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName||''))return;const m={ArrowLeft:[-160,0],ArrowRight:[160,0],ArrowUp:[0,-120],ArrowDown:[0,120]};if(m[e.key]){e.preventDefault();forgeMoveCamera(...m[e.key])}});
 let middlePan=null;
 const canvasEl=document.getElementById('scene');
 canvasEl?.addEventListener('pointerdown',e=>{
  if(e.button!==1)return;
  e.preventDefault();e.stopImmediatePropagation();
  forgeEnsureScenes();project.camera.followId=null;
  middlePan={id:e.pointerId,x:e.clientX,y:e.clientY,cx:project.camera.x,cy:project.camera.y};
  canvasEl.classList.add('forgePanning');canvasEl.setPointerCapture(e.pointerId);
 },true);
 canvasEl?.addEventListener('pointermove',e=>{
  if(!middlePan||e.pointerId!==middlePan.id)return;
  e.preventDefault();e.stopImmediatePropagation();
  const bounds=canvasEl.getBoundingClientRect(),z=Math.max(.25,Math.min(3,project.camera.zoom||1));
  const sx=canvasEl.width/bounds.width/z,sy=canvasEl.height/bounds.height/z;
  project.camera.x=middlePan.cx-(e.clientX-middlePan.x)*sx;
  project.camera.y=middlePan.cy-(e.clientY-middlePan.y)*sy;
  forgeRefreshSceneUI();draw();
 },true);
 const finishPan=e=>{if(!middlePan||e.pointerId!==middlePan.id)return;e.stopImmediatePropagation();middlePan=null;canvasEl.classList.remove('forgePanning');autosave()};
 canvasEl?.addEventListener('pointerup',finishPan,true);
 canvasEl?.addEventListener('pointercancel',finishPan,true);
 canvasEl?.addEventListener('auxclick',e=>{if(e.button===1)e.preventDefault()});
 canvasEl?.addEventListener('wheel',e=>{
  if(!document.getElementById('sceneWorkspace')?.classList.contains('active'))return;
  e.preventDefault();forgeEnsureScenes();
  project.camera.zoom=Math.max(.25,Math.min(3,(project.camera.zoom||1)*(e.deltaY<0?1.1:1/1.1)));
  forgeRefreshSceneUI();draw();
 },{passive:false});
 const oldDraw=draw;draw=function(){forgeCameraFrame();oldDraw();};
 const oldApply=applyProject;applyProject=function(d){oldApply(d);forgeEnsureScenes();forgeRefreshSceneUI();draw()};
 forgeEnsureScenes();forgeRefreshSceneUI();
})();
