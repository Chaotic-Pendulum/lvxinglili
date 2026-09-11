import test from 'node:test';
import assert from 'node:assert/strict';
import {SceneView} from '../dist/app/scene.js';

test('normal scene dragging pans the camera without treating false as a furniture element',()=>{
 const node=new EventTarget();
 node.setPointerCapture=()=>{};node.classList={add(){},remove(){}};
 node.closest=()=>{throw new Error('normal play must not pick furniture');};
 const abort=new AbortController(), saved=[];
 const view=Object.assign(Object.create(SceneView.prototype),{node,edit:false,pointers:new Map(),signal:abort.signal,camera:{x:5,y:10,zoom:1},scale:2,layout(){},onCamera:camera=>saved.push({...camera})});
 view.bind();
 const pointer=(type,x,y)=>{const event=new Event(type);Object.assign(event,{button:0,pointerId:1,clientX:x,clientY:y});node.dispatchEvent(event);};
 pointer('pointerdown',100,100);assert.equal(view.drag.type,'camera');
 pointer('pointermove',120,140);assert.equal(view.camera.x,15);assert.equal(view.camera.y,30);
 pointer('pointerup',120,140);assert.equal(saved.length,1);assert.equal(view.pointers.size,0);assert.equal(view.drag,null);
 abort.abort();
});
