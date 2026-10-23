import {termKey,prioritizeTerms,type TermMemo} from './term-types';
export type TermMatch={start:number;end:number;memoId:string};
const identifierPart=(value:string)=>/^[a-z0-9_]$/.test(value);
/** Map normalized matches back to exact UTF-16 offsets, including split PDF runs. */
export function termMatches(text:string,terms:TermMemo[]):TermMatch[]{
  let flat='';const starts:number[]=[],ends:number[]=[];let offset=0;
  for(const char of text){const value=termKey(char);flat+=value;for(let i=0;i<value.length;i++){starts.push(offset);ends.push(offset+char.length);}offset+=char.length;}
  const candidates:{start:number;end:number;memoId:string}[]=[];
  for(const memo of prioritizeTerms(terms)){for(const alias of [memo.term,...memo.aliases]){
    const key=termKey(alias);if(!key)continue;const wholeIdentifier=/^[a-z0-9_]+$/.test(key)&&!/\s/.test(alias.trim());let cursor=0,index:number;
    while((index=flat.indexOf(key,cursor))>=0){
      const last=index+key.length-1,start=starts[index],end=ends[last];cursor=index+key.length;
      // An identifier is one name: Subsystem must not match inside a longer
      // identifier, even at a capital letter. Use original offsets so spaces
      // between words remain boundaries after PDF whitespace normalization.
      if(identifierPart(key[0])&&index>0&&ends[index-1]>=start&&identifierPart(flat[index-1]))continue;
      if(identifierPart(key.at(-1)!)&&last+1<flat.length&&starts[last+1]<=end&&identifierPart(flat[last+1]))continue;
      if(wholeIdentifier&&/\s/.test(text.slice(start,end)))continue;
      candidates.push({start,end,memoId:memo.id});if(candidates.length>=3000)break;
    }
  }}
  candidates.sort((a,b)=>a.start-b.start||(b.end-b.start)-(a.end-a.start));
  const matches:TermMatch[]=[];let end=-1;
  for(const m of candidates){if(m.start<end)continue;matches.push(m);end=m.end;if(matches.length>=500)break;}
  return matches;
}
