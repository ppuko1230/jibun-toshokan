import {useMemo,type Ref} from 'react';
import {codeSegmentTokens} from './lib/code-tokens';
export type CodeSegment={code:string;id?:string;page?:number;marked?:boolean;legacyIds?:string[]};
/** The gutter is outside the selectable code; term matching and copying see only source text. */
export default function CodeView({segments,file='',startLine=1,codeRef,label,continuous=false}:{segments:CodeSegment[];file?:string;startLine?:number;codeRef?:Ref<HTMLPreElement>;label?:string;continuous?:boolean}){
  const parts=segments.map(s=>s.code),text=parts.join('\n');
  const highlighted=useMemo(()=>codeSegmentTokens(parts,file),[text,file]);
  const numbers=Array.from({length:text.split('\n').length},(_,i)=>startLine+i).join('\n');
  return <div className="web-code-frame"><div className="web-line-numbers" aria-hidden="true">{numbers}</div><pre ref={codeRef} className={'web-code editor-code '+(continuous?'continuous-code':'')} aria-label={label}><code>{segments.map((segment,i)=><span key={segment.id||i} id={segment.id} data-block-id={segment.id} data-block-aliases={segment.legacyIds?.join(' ')} data-source-page={segment.page} className={'web-code-range '+(segment.marked?'has-challenge':'')}>{highlighted[i].map((token,j)=>token.kind?<span key={j} className={'code-token code-'+token.kind}>{token.text}</span>:token.text)}</span>)}</code></pre></div>;
}
