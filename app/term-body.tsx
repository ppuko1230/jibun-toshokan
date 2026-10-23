import {Fragment,type ReactNode} from 'react';

function inline(text:string):ReactNode[]{
  // Deliberately small, non-HTML syntax. Code wins over bold; all text is escaped by React.
  return text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/g).map((part,i)=>part.length>2&&part.startsWith('`')&&part.endsWith('`')?<code key={i}>{part.slice(1,-1)}</code>:part.length>4&&part.startsWith('**')&&part.endsWith('**')?<strong key={i}>{part.slice(2,-2)}</strong>:<Fragment key={i}>{part}</Fragment>);
}

/** Shared by the saved note, hover popup, large reader, and both live previews. */
export default function TermBody({body}:{body:string}){
  const lines=body.replace(/\r\n?/g,'\n').split('\n'),blocks:ReactNode[]=[];
  let i=0;
  const startsBlock=(line:string)=>/^\s*```/.test(line)||/^#{1,3}\s+\S/.test(line)||/^\s*([-*+]\s+|\d+[.)]\s+)\S/.test(line);
  while(i<lines.length){
    if(!lines[i].trim()){i++;continue;}
    const key=i,line=lines[i],fence=line.match(/^\s*```([\w+-]*)\s*$/);
    if(fence){const code:string[]=[];i++;while(i<lines.length&&!/^\s*```\s*$/.test(lines[i]))code.push(lines[i++]);if(i<lines.length)i++;blocks.push(<pre key={key} className="term-code"><code>{code.join('\n')}</code></pre>);continue;}
    const heading=line.match(/^(#{1,3})\s+(.+)$/);
    if(heading){blocks.push(heading[1].length<=2?<h4 key={key}>{inline(heading[2])}</h4>:<h5 key={key}>{inline(heading[2])}</h5>);i++;continue;}
    const unordered=line.match(/^\s*[-*+]\s+(\S.*)$/),ordered=line.match(/^\s*(\d+)[.)]\s+(\S.*)$/);
    if(unordered||ordered){const items:ReactNode[]=[];const pattern=unordered?/^\s*[-*+]\s+(\S.*)$/:/^\s*\d+[.)]\s+(\S.*)$/;let match:RegExpMatchArray|null;
      while(i<lines.length&&(match=lines[i].match(pattern)))items.push(<li key={i++}>{inline(match[1])}</li>);
      blocks.push(unordered?<ul key={key}>{items}</ul>:<ol key={key} start={Number(ordered![1])}>{items}</ol>);continue;
    }
    const paragraph=[line];i++;while(i<lines.length&&lines[i].trim()&&!startsBlock(lines[i]))paragraph.push(lines[i++]);
    blocks.push(<p key={key}>{inline(paragraph.join('\n'))}</p>);
  }
  return <div className="term-body term-formatted">{blocks}</div>;
}
