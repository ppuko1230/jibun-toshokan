export type ClozeHole={start:number;end:number};
export type ClozeQuestion={id:string;revision:string;bookId:string;page:number;blockId:string|null;title:string;text:string;mode:'code'|'text';holes:ClozeHole[];createdAt:string;updatedAt:string};
export type ClozeResult={id:string;questionId:string;revision:string;answers:string[];correct:boolean[];revealed:boolean;createdAt:string};
export type ClozeSession={id:string;questionId:string;revision:string;answers:string[];capturedAt:number;result:ClozeResult|null};
export type ClozeState={questions:ClozeQuestion[];sessions:Record<string,ClozeSession>;results:ClozeResult[]};
export type ClozeDraft={text:string;mode:'code'|'text';source:{bookId:string;page:number;blockId?:string};existing?:ClozeQuestion};
export type ClozeToken=ClozeHole&{text:string;preferred:boolean};
export const emptyCloze=():ClozeState=>({questions:[],sessions:{},results:[]});
export function validHoles(text:string,holes:any):holes is ClozeHole[]{
  if(!Array.isArray(holes)||holes.length<1||holes.length>30)return false;let previous=0;
  const boundary=(n:number)=>!(n>0&&n<text.length&&text.charCodeAt(n)>=0xdc00&&text.charCodeAt(n)<=0xdfff);
  return holes.every(h=>{if(!h||!Number.isInteger(h.start)||!Number.isInteger(h.end)||h.start<previous||h.end<=h.start||h.end>text.length||h.end-h.start>200||!boundary(h.start)||!boundary(h.end)||!text.slice(h.start,h.end).trim())return false;previous=h.end;return true;});
}
const stamp=(v:any)=>typeof v==='string'&&!Number.isNaN(Date.parse(v));
const id=(v:any)=>typeof v==='string'&&v.length>0&&v.length<=100&&!['__proto__','constructor','prototype'].includes(v);
const answers=(v:any)=>Array.isArray(v)&&v.length>=1&&v.length<=30&&v.every(s=>typeof s==='string'&&s.length<=500);
export function validClozeQuestion(q:any):q is ClozeQuestion{return !!q&&id(q.id)&&id(q.revision)&&id(q.bookId)&&Number.isInteger(q.page)&&q.page>=1&&(q.blockId===null||typeof q.blockId==='string'&&q.blockId.length<=200)&&typeof q.title==='string'&&!!q.title.trim()&&q.title.length<=120&&typeof q.text==='string'&&q.text.length<=10000&&!!q.text.trim()&&['code','text'].includes(q.mode)&&validHoles(q.text,q.holes)&&stamp(q.createdAt)&&stamp(q.updatedAt);}
export function validClozeState(v:any):v is ClozeState{
  if(!v||!Array.isArray(v.questions)||v.questions.length>2000||!v.questions.every(validClozeQuestion)||new Set(v.questions.map((q:ClozeQuestion)=>q.id)).size!==v.questions.length||!v.sessions||typeof v.sessions!=='object'||Array.isArray(v.sessions)||Object.keys(v.sessions).length>2000||!Array.isArray(v.results)||v.results.length>10000)return false;
  const questions=new Map<string,ClozeQuestion>(v.questions.map((q:ClozeQuestion)=>[q.id,q]));
  const validResult=(r:any)=>!!r&&id(r.id)&&questions.has(r.questionId)&&id(r.revision)&&answers(r.answers)&&Array.isArray(r.correct)&&r.correct.length===r.answers.length&&r.correct.every((b:any)=>typeof b==='boolean')&&typeof r.revealed==='boolean'&&(!r.revealed||r.correct.every((b:boolean)=>!b))&&stamp(r.createdAt);
  if(!v.results.every(validResult)||new Set(v.results.map((r:ClozeResult)=>r.id)).size!==v.results.length)return false;
  return Object.entries(v.sessions).every(([key,s]:[string,any])=>{const q=questions.get(key);return !!q&&!!s&&id(s.id)&&s.questionId===key&&s.revision===q.revision&&answers(s.answers)&&s.answers.length===q.holes.length&&Number.isSafeInteger(s.capturedAt)&&s.capturedAt>=0&&(s.result===null||validResult(s.result)&&s.result.id===s.id&&s.result.questionId===key&&s.result.revision===q.revision&&s.result.answers.length===q.holes.length&&v.results.some((r:ClozeResult)=>JSON.stringify(r)===JSON.stringify(s.result)));});
}
export function clozeTokens(text:string,mode:'code'|'text'):ClozeToken[]{
  if(mode==='code'){
    const re=/\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[A-Za-z_]\w*|\d+(?:\.\d*)?(?:[fFuUlL]+)?/g;
    const out:ClozeToken[]=[];for(const m of text.matchAll(re)){const word=m[0];if(!/^(?:[A-Za-z_]\w*|\d+(?:\.\d*)?(?:[fFuUlL]+)?)$/.test(word)||word.length>200)continue;out.push({start:m.index!,end:m.index!+word.length,text:word,preferred:! /^(?:void|const|static|public|private|protected|virtual|override|class|struct|int|float|bool|auto|return|if|else|for|while|true|false|\d)/.test(word)});}return out;
  }
  const segmenter=new Intl.Segmenter('ja',{granularity:'word'}),out:ClozeToken[]=[];
  for(const part of segmenter.segment(text)){const word=part.segment;if(!part.isWordLike||word.length>200)continue;out.push({start:part.index,end:part.index+word.length,text:word,preferred:! /^(?:[\d０-９]+|[ぁ-ゖー]{1,3}|する|ます|です|こと|もの|ため|これ|それ)$/.test(word)});}return out;
}
export function chooseHoles(tokens:ClozeToken[],count:number,current:ClozeHole[]=[],reroll=false,random= Math.random):ClozeHole[]{
  const target=Math.max(0,Math.min(30,tokens.length,Math.round(count))),chosen=reroll?[]:current.filter(h=>tokens.some(t=>t.start===h.start&&t.end===h.end)).slice(0,target);
  const pool=tokens.filter(t=>!chosen.some(h=>h.start===t.start)).map(t=>({token:t,score:random()+(t.preferred?1:0)})).sort((a,b)=>b.score-a.score);
  return [...chosen,...pool.slice(0,target-chosen.length).map(({token:{start,end}})=>({start,end}))].sort((a,b)=>a.start-b.start);
}
export function maskedCloze(text:string,holes:ClozeHole[]){let result='',at=0;holes.forEach((h,i)=>{result+=text.slice(at,h.start)+`【${i+1}】____`;at=h.end;});return result+text.slice(at);}
export function sameClozeAnswer(answer:string,expected:string){return answer.normalize('NFKC').trim()===expected.normalize('NFKC').trim();}
