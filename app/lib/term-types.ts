export type TermMemo={id:string;term:string;body:string;aliases:string[];sourceBookId:string|null;sourcePage:number|null;sourceTitle?:string;updatedAt:string;scopeFolderId?:string;scopeFolderName?:string};
export function termKey(value:string){return value.normalize('NFKC').toLowerCase().replace(/\s+/g,'');}
export function prioritizeTerms(terms:TermMemo[]){return [...terms].sort((a,b)=>Number(!!b.scopeFolderId)-Number(!!a.scopeFolderId));}
export function findTerm(terms:TermMemo[],word:string){const k=termKey(word);return prioritizeTerms(terms).find(t=>[t.term,...t.aliases].some(a=>termKey(a)===k));}
export function globalAlternatives(memo:TermMemo,terms:TermMemo[]){if(!memo.scopeFolderId)return [];const keys=new Set([memo.term,...memo.aliases].map(termKey));return terms.filter(t=>!t.scopeFolderId&&[t.term,...t.aliases].some(n=>keys.has(termKey(n))));}
export const scopeLabel=(memo:Pick<TermMemo,'scopeFolderId'|'scopeFolderName'>)=>memo.scopeFolderId?`${memo.scopeFolderName||'このフォルダ'}内のみ`:'全体で共有';
