import {randomInt,randomUUID} from 'node:crypto';
import bank from './app/data/code-practice.json';
import vol1V2 from './app/data/web-vol1-v2.json';
import {sqlite} from './local-store';
import type {PracticeState,PracticeSession,PracticeResult,PracticeData} from './app/lib/practice-types';
const questions=new Map(bank.map(q=>[q.id,q]));
const bookTitles:Record<string,string>=__YOHAKU_SHARED__?{}:{'ue5-vol1':'Unreal C++ 第1巻 · 01〜10（改訂版）','ue5-range-v2':'3D的当て · 読む・作る・書く'};
// Keep question/result identities intact. Resolve only the reading destination to
// the new edition, so past results, active questions and imported backups survive.
function readingSource(q:typeof bank[number]){if(q.bookId==='ue5-vol1'){const file=vol1V2.files.find(f=>f.name===q.file),part=file?.segments.find(s=>s.block.lineStart<=q.lineStart&&s.block.lineEnd>=q.lineStart);if(part)return {sourceBookId:'ue5-vol1-v2',page:part.page,blockId:part.block.id};}return {sourceBookId:q.bookId,page:q.page,blockId:q.blockId};}
const fail=()=>{throw new Error('練習の情報を確認してください。');};
const stamp=(v:any)=>typeof v==='string'&&Number.isFinite(Date.parse(v));
const texts=(v:any,n:number)=>Array.isArray(v)&&v.length===n&&v.every(s=>typeof s==='string'&&s.length<=500);
function validEntry(v:any){const q=questions.get(v?.id);return !!q&&Array.isArray(v.holes)&&[1,2].includes(v.holes.length)&&new Set(v.holes).size===v.holes.length&&v.holes.every((i:any)=>Number.isInteger(i)&&i>=0&&i<q.holes.length);}
export function validPracticeResult(v:any):v is PracticeResult{return !!v&&typeof v.id==='string'&&v.id.length>0&&v.id.length<=100&&validEntry({id:v.questionId,holes:v.holes})&&questions.get(v.questionId)!.bookId===v.bookId&&texts(v.answers,v.holes.length)&&Array.isArray(v.correct)&&v.correct.length===v.holes.length&&v.correct.every((x:any)=>typeof x==='boolean')&&typeof v.revealed==='boolean'&&(!v.revealed||v.correct.every((x:boolean)=>!x))&&stamp(v.createdAt);}
export function validPracticeState(v:any):v is PracticeState{
  if(!v||!Array.isArray(v.results)||v.results.length>20000||!v.results.every(validPracticeResult)||new Set(v.results.map((r:PracticeResult)=>r.id)).size!==v.results.length)return false;
  const s=v.session;if(s===null)return true;
  return !!s&&typeof s.id==='string'&&s.id.length>0&&s.id.length<=100&&!!bookTitles[s.bookId]&&typeof s.scope==='string'&&s.scope.length<=100&&[1,2].includes(s.holeCount)&&Array.isArray(s.order)&&s.order.length>0&&s.order.length<=20&&s.order.every((e:any)=>validEntry(e)&&questions.get(e.id)!.bookId===s.bookId&&e.holes.length===s.holeCount)&&new Set(s.order.map((e:any)=>e.id)).size===s.order.length&&Number.isInteger(s.index)&&s.index>=0&&s.index<=s.order.length&&texts(s.draft,s.index<s.order.length?s.order[s.index].holes.length:0)&&stamp(s.updatedAt)&&(s.draftAt===undefined||Number.isSafeInteger(s.draftAt)&&s.draftAt>=0)&&(s.result===null||validPracticeResult(s.result)&&s.index<s.order.length&&s.result.questionId===s.order[s.index].id&&JSON.stringify(s.result.holes)===JSON.stringify(s.order[s.index].holes)&&s.result.id===s.id+':'+s.index);
}
export function practiceState():PracticeState{const row=sqlite.prepare("SELECT value FROM preferences WHERE key='codePractice'").get() as {value:string}|undefined;return row?JSON.parse(row.value):{session:null,results:[]};}
function store(state:PracticeState){sqlite.prepare("INSERT INTO preferences VALUES('codePractice',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(state));}
export function importPractice(state:PracticeState){const old=practiceState();const seen=new Set(old.results.map(r=>r.id));const results=[...old.results,...state.results.filter(r=>!seen.has(r.id))];if(results.length>20000)throw new Error('練習履歴の上限を超えています。');store({session:old.session||state.session,results});}
// Compare lexical tokens: layout/comments are ignored, literal content and token
// boundaries remain significant. This is a textbook-answer check, not a C++ compiler.
export function codeTokens(code:string){return code.match(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\/[^\n]*|\/\*[\s\S]*?\*\/|[A-Za-z_]\w*|\d+(?:\.\d*)?(?:[fFuUlL]+)?|::|->|<=|>=|==|!=|&&|\|\||\+\+|--|[^\s]/g)?.filter(token=>!token.startsWith('//')&&!token.startsWith('/*'))||[];}
export function sameCode(a:string,b:string){return JSON.stringify(codeTokens(a))===JSON.stringify(codeTokens(b));}
function shuffled<T>(list:T[]):T[]{const a=[...list];for(let i=a.length-1;i>0;i--){const j=randomInt(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;}
export function practiceData():PracticeData{
  const state=practiceState(),s=state.session;
  const latest=new Map<string,PracticeResult>();for(const r of [...state.results].sort((a,b)=>a.createdAt.localeCompare(b.createdAt)))latest.set(r.questionId,r);
  const session=s?(()=>{const {order,...rest}=s,entry=order[s.index],q=entry?questions.get(entry.id)!:undefined;let code=q?.code||'';if(q){const masks=entry.holes.flatMap((i,n)=>q.holes[i].occurrences.map(range=>({...range,number:n+1}))).sort((a,b)=>b.start-a.start);for(const h of masks)code=code.slice(0,h.start)+`【${h.number}】________`+code.slice(h.end);}
    const completed=state.results.filter(r=>r.id.startsWith(s.id+':'));return {...rest,total:order.length,round:{completed:completed.length,unaided:completed.filter(r=>!r.revealed&&r.correct.every(Boolean)).length,revealed:completed.filter(r=>r.revealed).length},question:q?{id:q.id,file:q.file,...readingSource(q),lineStart:q.lineStart,code,hints:entry.holes.map(i=>q.holes[i].hint),...(s.result?{expected:entry.holes.map(i=>q.holes[i].answer),explanations:entry.holes.map(i=>q.holes[i].explanation),sourceCode:q.code}:{})}:null};})():null;
  return {decks:Object.entries(bookTitles).map(([bookId,title])=>({bookId,title,count:bank.filter(q=>q.bookId===bookId).length,scopes:[...new Set(bank.filter(q=>q.bookId===bookId).map(q=>q.scope))]})),session,summary:{completed:state.results.length,unaided:state.results.filter(r=>!r.revealed&&r.correct.every(Boolean)).length,revealed:state.results.filter(r=>r.revealed).length,latest:[...latest.values()].map(r=>{const q=questions.get(r.questionId)!;return {questionId:r.questionId,bookId:r.bookId,correct:!r.revealed&&r.correct.every(Boolean),file:q.file,...readingSource(q)};})}};
}
export function updatePractice(input:any):PracticeData{
  const state=practiceState();if(!input||typeof input.action!=='string')fail();
  if(input.action==='start'){
    if(!bookTitles[input.bookId]||![1,2].includes(input.holeCount)||![5,10,20].includes(input.count)||typeof input.scope!=='string'||input.scope.length>100||typeof input.mistakes!=='boolean')fail();
    const latest=practiceData().summary.latest,weak=new Set(latest.filter(r=>!r.correct).map(r=>r.questionId));
    const pool=bank.filter(q=>q.bookId===input.bookId&&(!input.scope||q.scope===input.scope)&&(!input.mistakes||weak.has(q.id))&&q.holes.length>=input.holeCount);
    if(!pool.length)throw new Error(input.mistakes?'この範囲には、まだ解き直す問題がありません。':'この範囲の問題がありません。');
    const order=shuffled(pool).slice(0,input.count).map(q=>({id:q.id,holes:shuffled(q.holes.map((_,i)=>i)).slice(0,input.holeCount).sort((a,b)=>a-b)}));
    state.session={id:randomUUID(),bookId:input.bookId,scope:input.scope,holeCount:input.holeCount,order,index:0,draft:Array(input.holeCount).fill(''),result:null,updatedAt:new Date().toISOString()};
  }else{
    const s=state.session;if(!s||input.sessionId!==s.id||input.index!==s.index||s.index>=s.order.length)throw new Error('練習の画面を更新して、もう一度お試しください。');
    const entry=s.order[s.index],q=questions.get(entry.id)!;
    if(input.action==='draft'){
      if(s.result)return practiceData();if(!texts(input.answers,entry.holes.length))fail();const capturedAt=input.capturedAt??Date.now();if(!Number.isSafeInteger(capturedAt)||capturedAt<0||capturedAt>Date.now()+60000)fail();if(capturedAt<(s.draftAt||0))return practiceData();s.draft=input.answers;s.draftAt=capturedAt;
    }else if(input.action==='check'||input.action==='reveal'){
      if(s.result)return practiceData();if(!texts(input.answers,entry.holes.length))fail();
      if(input.action==='check'&&input.answers.some((a:string)=>!a.trim()))throw new Error('すべての空欄へ回答を入力してください。');
      const revealed=input.action==='reveal',correct=entry.holes.map((i,n)=>!revealed&&sameCode(input.answers[n],q.holes[i].answer));
      s.draft=input.answers;s.result={id:s.id+':'+s.index,questionId:q.id,bookId:q.bookId,holes:entry.holes,answers:input.answers,correct,revealed,createdAt:new Date().toISOString()};
      if(state.results.length>=20000)throw new Error('練習履歴の上限に達しました。');state.results.push(s.result);
    }else if(input.action==='next'){
      if(!s.result)throw new Error('採点するか、答えを確認してから次へ進んでください。');s.index++;s.draft=s.index<s.order.length?Array(s.holeCount).fill(''):[];s.result=null;
    }else fail();
    s.updatedAt=new Date().toISOString();
  }
  store(state);return practiceData();
}
