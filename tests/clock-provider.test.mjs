import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gameNow,clockOffset,nextGameEvent,advanceGameClock,advanceToNextEvent} from '../dist/app/core/clock.js';
import {createState,commitDeparture,planLocally,settleTrip,restoreState} from '../dist/app/core/engine.js';
import {createItinerary,deliverJourneyNodes} from '../dist/app/core/itinerary.js';
import {collectTravelCoins,apiAvailability} from '../dist/app/core/travel.js';
import {destinationById} from '../dist/app/core/catalog.js';
import {requestApi} from '../dist/app/ai.js';
import {applyProviderDefaults} from '../dist/app/core/provider.js';
import {providerRuntime,providerKey} from '../server/provider-config.mjs';
const pack=JSON.parse(fs.readFileSync('dist/packs/reading-room/pack.json','utf8'));
test('simulation follows departure, intermediate nodes, mail and return once, then survives restore',()=>{
 const s=createState(pack,0);s.nextTripAt=60000;
 assert.equal(nextGameEvent(s,0).kind,'departure');
 advanceToNextEvent(s,0);assert.equal(gameNow(s,0),60001);
 s.settings.travelMinutes=120;s.settings.journeyMinNodes=3;s.settings.journeyMaxNodes=3;
 const itinerary=createItinerary(pack,s,destinationById('NZ'),120,()=>.5);
 const trip=commitDeparture(s,planLocally(pack,s,'NZ'),{photoMode:'default',itinerary},gameNow(s,0));
 advanceGameClock(s,31,0);
 const first=collectTravelCoins(s,gameNow(s,0));assert.equal(first.count,1);assert.equal(collectTravelCoins(s,gameNow(s,0)),null);
 const nodes=deliverJourneyNodes(s,gameNow(s,0));assert.ok(nodes.length>0);assert.equal(deliverJourneyNodes(s,gameNow(s,0)).length,0);
 const restored=restoreState(s,pack,0);assert.equal(clockOffset(restored),clockOffset(s));assert.equal(restored.currentTrip.returnAt,trip.returnAt);
 advanceGameClock(s,100,0);collectTravelCoins(s,gameNow(s,0));deliverJourneyNodes(s,gameNow(s,0));
 assert.equal(settleTrip(s,gameNow(s,0)).id,trip.id);assert.equal(settleTrip(s,gameNow(s,0)),null);
 assert.equal(s.trips.length,1);assert.equal(s.trips[0].coinsReceived,200);assert.ok(s.trips[0].itinerary.nodes.every(n=>n.deliveredAt!=null));
 assert.equal(nextGameEvent(s,0).kind,'departure');
});
test('simulated clock cannot go backward or corrupt normal saved timestamps',()=>{
 const s=createState(pack,1000);assert.equal(gameNow(s,1000),1000);
 assert.throws(()=>advanceGameClock(s,-1,1000));assert.throws(()=>advanceGameClock(s,Infinity,1000));
 s.simulationOffsetMs=NaN;assert.equal(gameNow(s,1000),1000);
 s.settings.autoTravel=false;assert.equal(nextGameEvent(s,1000),null);assert.throws(()=>advanceToNextEvent(s,1000));
});
test('server provider defaults disclose no key and apply once without overriding later choices',()=>{
 const env={OPENROUTER_API_KEY:'private-test-value',ROAM_PROVIDER_CONFIG_VERSION:'test-v1'};
 const runtime=providerRuntime(env);assert.ok(!JSON.stringify(runtime).includes(env.OPENROUTER_API_KEY));
 const state=createState(pack);assert.equal(applyProviderDefaults(state,runtime),true);
 assert.equal(state.settings.textModel,'openai/gpt-5.6-luna');assert.equal(state.settings.imageModel,'openai/gpt-image-2.5-sunburst');
 state.settings.imageModel='custom';assert.equal(applyProviderDefaults(state,runtime),false);assert.equal(state.settings.imageModel,'custom');
 assert.equal(providerKey('image','https://openrouter.ai/api/v1/images','',env),'private-test-value');
 assert.equal(providerKey('image','https://other.test/images','session-key',env),'session-key');
 assert.equal(providerKey('text','https://openrouter.ai.evil.test/chat','',env),'');
 assert.equal(apiAvailability({...state.settings,imageBaseUrl:'https://other.test/v1'}, {},{proxy:true,openrouterConfigured:true}).image,false);
});
test('OpenRouter image request carries only the character reference in Images JSON, no multipart',async()=>{
 const original=globalThis.fetch,calls=[];
 globalThis.fetch=async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return Response.json({data:[]});};
 try{
 const s=createState(pack).settings;Object.assign(s,{connectionMode:'proxy',imageBaseUrl:'https://openrouter.ai/api/v1',imageProtocol:'openrouter'});
 await requestApi('image',s,{}, {proxy:true,csrfToken:'test',openrouterConfigured:true},{model:'openai/gpt-image-2.5-sunburst',prompt:'A calm trip'},'data:image/png;base64,dGVzdA==');
 assert.equal(calls.length,1);assert.equal(calls[0].url,'./api/image');assert.equal(calls[0].body.url,'https://openrouter.ai/api/v1/images');
 assert.equal(calls[0].body.reference,null);assert.deepEqual(calls[0].body.payload.input_references,[{type:'image_url',image_url:{url:'data:image/png;base64,dGVzdA=='}}]);
 assert.ok(!JSON.stringify(calls).includes('photo-styles/previews'));
 }finally{globalThis.fetch=original;}
});
