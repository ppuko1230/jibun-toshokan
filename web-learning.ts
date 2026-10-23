import {randomUUID} from 'node:crypto';
import {sqlite} from './local-store';
import {findBook,pageData,database} from './app/lib/library';
import source from './app/data/web-vol1.json';
import outlines from './app/data/web-outlines.json';
import samples from './app/data/web-samples.json';
import rangeSource from './app/data/range-code-source.json';
import rangeV2 from './app/data/web-range-v2.json';
import vol1V2 from './app/data/web-vol1-v2.json';
import type {WebBlock,WebPageData,Challenge,ContinuousFile} from './app/lib/web-types';

// Keep original page/block identities; the reading layout joins ranges without changing source data.
const continuousFiles:ContinuousFile[]=[];
for(const [page,data] of Object.entries(source.pages))for(const raw of data.blocks){
  const block=raw as WebBlock;if(block.type!=='pair'||!block.file)continue;
  let file=continuousFiles.find(f=>f.name===block.file);
  if(!file){file={name:block.file,firstPage:Number(page),lastPage:Number(page),segments:[]};continuousFiles.push(file);}
  file.segments.push({page:Number(page),block});file.lastPage=Number(page);
}
continuousFiles.sort((a,b)=>a.firstPage-b.firstPage);
continuousFiles.forEach((file,i)=>{file.segments.sort((a,b)=>a.block.lineStart!-b.block.lineStart!);file.previousPage=continuousFiles[i-1]?.firstPage;file.nextPage=continuousFiles[i+1]?.firstPage;});

const rangeFiles:ContinuousFile[]=Object.entries(rangeSource.files).map(([name,code])=>{
  const lines=code.split('\n');
  const segments=Object.entries(samples['ue5-range'].pages).flatMap(([page,data])=>data.blocks.filter(raw=>{const block=raw as WebBlock;return block.type==='code'&&block.file===name&&block.lineEnd!<=lines.length;}).map(raw=>({page:Number(page),block:{...raw,code:(raw as WebBlock).text} as WebBlock})));
  return {name,firstPage:segments[0].page,lastPage:segments.at(-1)!.page,segments};
});
rangeFiles.forEach((file,i)=>{const prev=rangeFiles[i-1],next=rangeFiles[i+1];file.previousPage=prev?.firstPage;file.previousFile=prev?.name;file.nextPage=next?.firstPage;file.nextFile=next?.name;});

const headings=new Set(['今回の収録範囲','1パターンの数え方','学習の目標','想定する環境','検証範囲','学習の進め方','必要なファイルと役割','エディタでの設定と実行','成功の目印','読むポイント','つまずきやすい点・範囲','改造課題','最初の一巡','ファイルの基本ルール','学習チェック','入力が動かないとき','処理のつながり','統合する練習','メモ','補助資料','ファイル構成','使い方']);
/** Reflow extracted text conservatively; only canonical source data creates paired code. */
export function textBlocks(content:string,page:number):{title:string;blocks:WebBlock[]}{
  const lines=content.replace(/\u0000/g,'').split('\n').map(s=>s.trimEnd()).filter(s=>s.trim());
  while(lines.length&&(/^(Unreal C\+\+|UE5 3D).*(Vol\.|第1巻)/.test(lines[0])||/^\d+$/.test(lines[0])))lines.shift();
  const title=(lines[0]?.includes(' / ')?lines[1]:lines[0])||`ページ ${page}`;
  const clean=lines.filter(s=>!(s===lines[0]&&s!==title)&&!/^元資料 p\d+/.test(s)&&!/^Unreal C\+\+ 第1巻 .*コードの横の解説/.test(s)&&!/^((元|本文) \d+ \/ )?PDF \d+ \/ \d+$/.test(s));
  const blocks:WebBlock[]=[];let paragraph='';let code:string[]=[];
  const add=(type:WebBlock['type'],text:string)=>{if(text.trim())blocks.push({id:`p${page}-text-${blocks.length+1}`,type,text});};
  const flush=()=>{add('paragraph',paragraph);paragraph='';if(code.length){add('code',code.join('\n'));code=[];}};
  for(const line of clean){
    if(line===title)continue;
    if(headings.has(line)||/^(Q\d+ |SECTION |[0-9０-９]+[.．、] |[0-9]{2} [^=;]+$)/.test(line)){flush();add('heading',line);continue;}
    const isCode=(code.length>0&&/^[\x20-\x7E]+$/.test(line)&&!line.startsWith('https://'))||/^(\s{2,}|#include|#pragma|UCLASS\(|UPROPERTY\(|GENERATED_BODY\(|class [A-Z]|(?:void|float|bool|int32|FVector|FRotator|const |auto\*|return |if \(|Super::)|[{}];?$|(?:public|private|protected):|[A-Za-z_][A-Za-z0-9_:<>* .]*\s*=)/.test(line);
    if(isCode){if(paragraph){add('paragraph',paragraph);paragraph='';}code.push(line);continue;}
    if(code.length){add('code',code.join('\n'));code=[];}
    paragraph+=(paragraph&&/[a-zA-Z0-9]$/.test(paragraph)&&/^[a-zA-Z0-9]/.test(line)?' ':'')+line.trim();
    if(/[。！？：:]$/.test(line)||line.startsWith('https://')){add('paragraph',paragraph);paragraph='';}
  }
  flush();return {title,blocks};
}
export async function webPage(bookId:string,page:number):Promise<WebPageData>{
  const book=await findBook('local-pc',bookId);if(!book||!Number.isInteger(page)||page<1||page>book.pageCount)throw new Error('教材とページを確認してください。');
  const original=await pageData(book,page);if(!original)throw new Error('本文が見つかりません。');
  if(bookId==='ue5-range-v2'){const data=(rangeV2.pages as Record<string,{title:string;blocks:WebBlock[]}>)[String(page)];return {page,...data,exactCode:true,structured:true,chapters:rangeV2.chapters,files:rangeV2.files as ContinuousFile[]};}
  if(bookId==='ue5-vol1-v2'){const data=(vol1V2.pages as Record<string,{title:string;blocks:WebBlock[]}>)[String(page)];return {page,...data,exactCode:true,structured:true,chapters:vol1V2.chapters,files:vol1V2.files as ContinuousFile[]};}
  const canonical=bookId==='ue5-vol1'?(source.pages as Record<string,{title:string;blocks:WebBlock[]}>)[String(page)]:undefined;
  const structuredBook=(samples as Record<string,{hash:string;pages:Record<string,{title:string;blocks:WebBlock[]}>}>)[bookId];
  const structured=structuredBook?.pages[String(page)];
  let chapters=(outlines as Record<string,{title:string;page:number}[]>)[bookId];
  if(structuredBook)chapters=Object.entries(structuredBook.pages).map(([page,data])=>({page:Number(page),title:data.title}));
  if(!chapters){const pages=await database().prepare('SELECT page,content FROM pages WHERE book_id=? ORDER BY page').bind(bookId).all<{page:number;content:string}>();chapters=pages.results.map(p=>({title:textBlocks(p.content,p.page).title.slice(0,90),page:p.page}));}
  chapters=[...new Map([...chapters].reverse().map(chapter=>[chapter.page,chapter])).values()].sort((a,b)=>a.page-b.page);
  const continuousFile=canonical?continuousFiles.find(f=>f.segments.some(s=>s.page===page)):undefined;
  return {page,...(canonical||structured||textBlocks(original.content,page)),exactCode:!!canonical,structured:!!structured,chapters,continuousFile,...(bookId==='ue5-range'?{files:rangeFiles}:{})};
}
export function challenges():Challenge[]{return sqlite.prepare('SELECT id,book_id AS bookId,page,block_id AS blockId,quote,kind,body,status,created_at AS createdAt,updated_at AS updatedAt FROM learning_challenges ORDER BY updated_at DESC').all() as Challenge[];}
export function validChallenge(v:any):v is Challenge{return !!v&&typeof v.id==='string'&&v.id.length>0&&v.id.length<=100&&typeof v.bookId==='string'&&v.bookId.length<=200&&Number.isInteger(v.page)&&v.page>0&&(v.blockId===null||typeof v.blockId==='string'&&v.blockId.length<=160)&&typeof v.quote==='string'&&v.quote.length<=2000&&typeof v.body==='string'&&v.body.length<=10000&&['unclear','cannot-code'].includes(v.kind)&&['open','resolved'].includes(v.status)&&typeof v.createdAt==='string'&&Number.isFinite(Date.parse(v.createdAt))&&typeof v.updatedAt==='string'&&Number.isFinite(Date.parse(v.updatedAt));}
export async function saveChallenge(input:any,id?:string){
  const old=id?challenges().find(c=>c.id===id):undefined;if(id&&!old)throw new Error('課題が見つかりません。');
  const now=new Date().toISOString(),value={...input,id:old?.id||randomUUID(),createdAt:old?.createdAt||now,updatedAt:now};
  if(!validChallenge(value))throw new Error('課題の内容を確認してください。');
  if(old&&(old.bookId!==value.bookId||old.page!==value.page||old.blockId!==value.blockId))throw new Error('課題の元の場所は変更できません。');
  const book=await findBook('local-pc',value.bookId);if(!book||value.page>book.pageCount)throw new Error('教材とページを確認してください。');
  if(value.blockId){const data=await webPage(book.id,value.page);if(!data.blocks.some(b=>b.id===value.blockId||b.legacyIds?.includes(value.blockId||'')))throw new Error('本文の場所が見つかりません。');}
  sqlite.prepare('INSERT INTO learning_challenges VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,body=excluded.body,status=excluded.status,quote=excluded.quote,updated_at=excluded.updated_at').run(value.id,value.bookId,value.page,value.blockId,value.quote,value.kind,value.body,value.status,value.createdAt,value.updatedAt);
  return value;
}
