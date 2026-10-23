import {randomUUID} from 'node:crypto';
import {sqlite} from './local-store';
import {findBook} from './app/lib/library';
import {emptyCloze,validClozeQuestion,validClozeState,sameClozeAnswer,type ClozeQuestion,type ClozeSession,type ClozeState} from './app/lib/cloze-types';
const key='clozePractice';
export function clozeState():ClozeState{const row=sqlite.prepare('SELECT value FROM preferences WHERE key=?').get(key) as {value:string}|undefined;return row?JSON.parse(row.value):emptyCloze();}
function store(state:ClozeState){if(!validClozeState(state)||JSON.stringify(state).length>40*1024*1024)throw Error('虫食い練習の保存上限に達しました。');sqlite.prepare('INSERT INTO preferences VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,JSON.stringify(state));}
export class ClozeError extends Error{constructor(message:string,public status=400){super(message);}}
function fail(message:string,status=400):never{throw new ClozeError(message,status);}
export async function updateCloze(input:any){
  if(!input||typeof input.action!=='string')fail('操作を確認してください。');
  const state=clozeState();let q=state.questions.find(q=>q.id===input.questionId);
  if(input.action==='save'){
    if(input.questionId&&!q)fail('問題が見つかりません。',404);
    if(q&&input.expectedRevision!==q.revision)fail('問題が更新されています。最新の内容を開き直してください。',409);
    const now=new Date().toISOString(),next:ClozeQuestion={id:q?.id||randomUUID(),revision:randomUUID(),bookId:input.bookId,page:input.page,blockId:input.blockId??null,title:input.title,text:input.text,mode:input.mode,holes:input.holes,createdAt:q?.createdAt||now,updatedAt:now};
    if(!validClozeQuestion(next))fail('問題は10,000文字、空欄は1〜30個で指定してください。');
    const book=await findBook('local-pc',next.bookId);if(!book||next.page>book.pageCount)fail('元の教材とページを確認してください。');
    // The source lookup awaits I/O; re-read before committing so another window's
    // draft or newly created question is never replaced by an older state.
    const latest=clozeState(),old=latest.questions.find(item=>item.id===next.id);
    if(q&&old?.revision!==input.expectedRevision)fail('問題が更新されています。最新の内容を開き直してください。',409);
    latest.questions=[next,...latest.questions.filter(item=>item.id!==next.id)];
    const session:ClozeSession={id:randomUUID(),questionId:next.id,revision:next.revision,answers:next.holes.map(()=>''),capturedAt:0,result:null};latest.sessions[next.id]=session;store(latest);return {question:next,session};
  }
  if(!q)fail('問題が見つかりません。',404);
  if(input.revision!==q.revision)fail('問題が更新されています。最新の内容を開き直してください。',409);
  if(input.action==='delete'){state.questions=state.questions.filter(item=>item.id!==q!.id);delete state.sessions[q.id];state.results=state.results.filter(r=>r.questionId!==q!.id);store(state);return {deleted:true};}
  let session=state.sessions[q.id];
  if(input.action==='start'||input.action==='retry'){
    if(!session||input.action==='retry'){session={id:randomUUID(),questionId:q.id,revision:q.revision,answers:q.holes.map(()=>''),capturedAt:0,result:null};state.sessions[q.id]=session;store(state);}return {question:q,session};
  }
  if(!session||input.sessionId!==session.id)fail('練習が更新されています。開き直してください。',409);
  if(!['draft','check','reveal'].includes(input.action))fail('操作を確認してください。');
  if(!Array.isArray(input.answers)||input.answers.length!==q.holes.length||input.answers.some((v:any)=>typeof v!=='string'||v.length>500))fail('空欄への回答を確認してください。');
  if(session.result)return {question:q,session};
  if(input.action==='draft'){
    if(!Number.isSafeInteger(input.capturedAt)||input.capturedAt<0||input.capturedAt>Date.now()+60000)fail('回答の保存時刻を確認してください。');
    if(input.capturedAt<session.capturedAt)return {question:q,session};session.answers=input.answers;session.capturedAt=input.capturedAt;
  }else{
    if(input.action==='check'&&input.answers.some((v:string)=>!v.trim()))fail('すべての空欄へ回答してください。');
    if(state.results.length>=10000)fail('練習記録の上限に達しました。');
    const revealed=input.action==='reveal';session.answers=input.answers;session.result={id:session.id,questionId:q.id,revision:q.revision,answers:input.answers,correct:q.holes.map((h,i)=>!revealed&&sameClozeAnswer(input.answers[i],q!.text.slice(h.start,h.end))),revealed,createdAt:new Date().toISOString()};state.results.push(session.result);
  }
  store(state);return {question:q,session};
}
export function importCloze(incoming:ClozeState,dryRun=false){
  const state=clozeState(),conflicts=new Set<string>();let added=0,unchanged=0;
  for(const q of incoming.questions){const existing=state.questions.find(item=>item.id===q.id);if(!existing){state.questions.push(q);added++;}else if(JSON.stringify(existing)===JSON.stringify(q))unchanged++;else conflicts.add(q.id);}
  const resultIds=new Set(state.results.map(r=>r.id));
  for(const r of incoming.results){if(conflicts.has(r.questionId))continue;const old=state.results.find(item=>item.id===r.id);if(old&&JSON.stringify(old)!==JSON.stringify(r))fail('練習記録の内容が競合しています。');if(!resultIds.has(r.id)){state.results.push(r);resultIds.add(r.id);}}
  for(const [id,s] of Object.entries(incoming.sessions))if(!conflicts.has(id)&&!state.sessions[id])state.sessions[id]=s;
  if(!validClozeState(state)||JSON.stringify(state).length>40*1024*1024)fail('虫食い練習の保存上限または内容を確認してください。');
  if(!dryRun)store(state);return {added,unchanged,conflicts:conflicts.size};
}
