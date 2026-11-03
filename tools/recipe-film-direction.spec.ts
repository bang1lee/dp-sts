import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { RECIPE_SHA256, KIT_SHA256, originalDirection, presetDirection, makeDirectionDocument, parseDirectionDocument, evaluateDirection, focalForFov } from '../apps/studio/src/recipe-film-direction';
import { parseRecipe } from '../apps/studio/src/workbench-workflow';
const recipeBytes=readFileSync('apps/studio/src/assets/recipe-film-recipe.json');
const kitBytes=readFileSync('assets/original-kit/manifest.json');
const recipe=parseRecipe(JSON.parse(recipeBytes.toString()));
const identity={recipeSha256:RECIPE_SHA256,kitSha256:KIT_SHA256,music:recipe.music};
const original=originalDirection(recipe.visual);
const doc=()=>makeDirectionDocument(original,'1920x1080',identity);
test('identity pins the exact recipe and kit manifest',()=>{
 assert.equal(createHash('sha256').update(recipeBytes).digest('hex'),RECIPE_SHA256);
 assert.equal(createHash('sha256').update(kitBytes).digest('hex'),KIT_SHA256);
});
test('default direction reproduces the former shape and camera at absolute times',()=>{
 assert.equal(original.power,10);assert.equal(original.stretch,1);assert.equal(original.rotation,0);assert.equal(original.morphAmount,0);assert.equal(original.fov,34);assert.equal(focalForFov(34),1.64);
 const smooth=(a:number,b:number,x:number)=>{const u=Math.max(0,Math.min(1,(x-a)/(b-a)));return u*u*(3-2*u);};
 for(const t of [0,7,30,64,89]){const phase=t/recipe.music.duration,reveal=smooth(0,.12,phase),settle=smooth(.77,1,phase),passage=smooth(.58,.69,phase)*(1-smooth(.75,.86,phase));const radius=4.25/(.70+recipe.visual.scale*.78)+.80*(1-reveal)+.50*passage+.25*settle,angle=t*recipe.visual.motion*.033;const frame=evaluateDirection(original,t,recipe.music.duration,recipe.visual);assert.equal(frame.x,Math.sin(angle)*radius);assert.equal(frame.y,.09);assert.equal(frame.z,Math.cos(angle)*radius);assert.equal(frame.shapePower,10);assert.equal(frame.shapeRotation,0);}
});
test('presets and morphs are deterministic and FOV alters the camera ray',()=>{
 const arc=presetDirection('rising-arc',recipe.visual),a=evaluateDirection(arc,20,recipe.music.duration,recipe.visual),b=evaluateDirection(arc,20,recipe.music.duration,recipe.visual),c=evaluateDirection(arc,60,recipe.music.duration,recipe.visual);
 assert.deepEqual(a,b);assert.notEqual(a.y,c.y);assert.notEqual(a.shapePower,c.shapePower);assert.ok(a.shapePower>=2&&a.shapePower<=12);assert.ok(focalForFov(65)<focalForFov(34));assert.ok(focalForFov(22)>focalForFov(34));
});
test('direction round trip makes independent copies and keeps render and music',()=>{
 const saved=doc(),loaded=parseDirectionDocument(JSON.parse(JSON.stringify(saved)),identity);assert.deepEqual(loaded,saved);assert.notEqual(loaded.direction,saved.direction);assert.equal(loaded.render.fps,30);assert.equal(loaded.music.music.bpm,recipe.music.bpm);
});
test('rejects other music, invalid identity, bounds, malformed versions and render sizes',()=>{
 const cases:unknown[]=[{...doc(),version:2},{...doc(),music:{...identity,kitSha256:'other'}},{...doc(),music:{...identity,music:{...identity.music,bpm:identity.music.bpm+1}}},{...doc(),direction:{...original,power:13}},{...doc(),direction:{...original,fov:NaN}},{...doc(),direction:{...original,cameraPath:'invalid'}},{...doc(),direction:{...original,lookX:Infinity}},{...doc(),render:{width:100,height:100,fps:30}},{...doc(),render:{width:1920,height:1080,fps:24}},{...doc(),extra:true}];for(const item of cases)assert.throws(()=>parseDirectionDocument(item,identity));
});
