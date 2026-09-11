const MAX_OFFSET=365*24*60*60000;
export function clockOffset(state) {
  const value=state?.simulationOffsetMs;return Number.isFinite(value)?Math.max(0,Math.min(MAX_OFFSET,Math.floor(value))):0;
}
export function gameNow(state,realNow=Date.now()) {return realNow+clockOffset(state);}
export function nextGameEvent(state,realNow=Date.now()) {
  const now=gameNow(state,realNow),trip=state.currentTrip;
  if(!trip)return state.settings.autoTravel&&Number.isFinite(state.nextTripAt)?{at:Math.max(now,state.nextTripAt),kind:'departure',label:'自动出发'}:null;
  const events=[{at:trip.returnAt,kind:'return',label:'旅行归来'}];
  for(const node of trip.itinerary?.nodes||[])if(node.triggeredAt==null&&node.deliveredAt==null)events.push({at:Math.min(node.deliverAt,trip.returnAt),kind:'node',label:`第 ${node.index+1} 个行程节点`});
  const mail=trip.coinMail,interval=(mail?.intervalMinutes||state.settings.coinMailMinutes||30)*60000;
  const at=trip.startedAt+((mail?.claimed||0)+1)*interval;
  if(at<=trip.returnAt)events.push({at,kind:'coins',label:'金币来信'});
  return events.filter(e=>Number.isFinite(e.at)).sort((a,b)=>a.at-b.at).map(e=>({...e,at:Math.max(now,e.at)}))[0]||null;
}
export function advanceGameClock(state,minutes,realNow=Date.now()) {
  if(!Number.isFinite(minutes)||minutes<=0||minutes>43200)throw new Error('推进时间需要在0–43200分钟之间');
  const before=gameNow(state,realNow),offset=clockOffset(state)+Math.round(minutes*60000);
  if(offset>MAX_OFFSET)throw new Error('模拟时间已达到一年上限，可重新建立测试存档');
  state.simulationOffsetMs=offset;
  return {before,after:gameNow(state,realNow)};
}
export function advanceToNextEvent(state,realNow=Date.now()) {
  const event=nextGameEvent(state,realNow);if(!event)throw new Error('没有待推进事件，请先开启自动出发');
  const delta=Math.max(1,event.at-gameNow(state,realNow)+1);
  const result=advanceGameClock(state,delta/60000,realNow);return {...result,event};
}
