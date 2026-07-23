type RandomSource=()=>number; type NowSource=()=>number;
let randomSource:RandomSource=Math.random; let nowSource:NowSource=Date.now;
export function configureRandom(source:RandomSource,currentTime:NowSource=Date.now):void{randomSource=source;nowSource=currentTime}
export function resetRandom():void{randomSource=Math.random;nowSource=Date.now}
export const random=():number=>randomSource();
export const randomInt=(min:number,max:number):number=>Math.floor(random()*(max-min+1))+min;
export const randomChoice=<T>(values:readonly T[]):T=>values[Math.floor(random()*values.length)] as T;
export const clamp=(value:number,min:number,max:number):number=>Math.max(min,Math.min(max,value));
export function gaussian(mean:number,standardDeviation:number):number{let first=0,second=0;while(!first)first=random();while(!second)second=random();return mean+standardDeviation*Math.sqrt(-2*Math.log(first))*Math.cos(2*Math.PI*second)}
export function weightedRandom<T>(values:readonly T[],weights:readonly number[]):T{const total=weights.reduce((sum,weight)=>sum+weight,0);let threshold=random()*total;for(let index=0;index<values.length;index+=1){threshold-=weights[index]??0;if(threshold<=0)return values[index] as T}return values[values.length-1] as T}
export const uid=():string=>random().toString(36).slice(2,9)+nowSource().toString(36).slice(-4);
