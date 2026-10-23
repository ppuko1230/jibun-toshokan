import {sqlite} from '../../local-store';
import {database,findBook,books} from './library';
import {termKey,type TermMemo} from './term-types';
import {termContext,bookFolder,folders,FolderError} from './folders-store';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
export async function listFolderTerms(owner:string,folderId?:string):Promise<TermMemo[]>{
  const db=database(),where=folderId?' AND folder_id=?':'',args=folderId?[owner,folderId]:[owner];
  const [memos,names,library]=await Promise.all([
    db.prepare('SELECT * FROM folder_term_memos WHERE owner=?'+where+' ORDER BY updated_at DESC,id').bind(...args).all<any>(),
    db.prepare('SELECT memo_id,display FROM folder_term_names WHERE owner=?'+where+' ORDER BY name_key').bind(...args).all<any>(),books(owner,true),
  ]);
  const fs=folders(owner);
  return memos.results.map(m=>({id:m.id,term:m.term,body:m.body,aliases:names.results.filter(n=>n.memo_id===m.id&&termKey(n.display)!==termKey(m.term)).map(n=>n.display),sourceBookId:m.source_book_id,sourcePage:m.source_page,sourceTitle:library.find(b=>b.id===m.source_book_id)?.title,updatedAt:m.updated_at,scopeFolderId:m.folder_id,scopeFolderName:fs.find(f=>f.id===m.folder_id)?.name}));
}
export async function listTerms(owner:string,folderId:string|null=null):Promise<TermMemo[]>{
  const db=database();
  const [memos,names,library]=await Promise.all([
    db.prepare('SELECT id,term,body,source_book_id,source_page,updated_at FROM term_memos WHERE owner=? ORDER BY updated_at DESC').bind(owner).all<any>(),
    db.prepare('SELECT memo_id,display FROM term_names WHERE owner=? ORDER BY name_key').bind(owner).all<any>(),books(owner,true),
  ]);
  const global=memos.results.map(m=>({id:m.id,term:m.term,body:m.body,aliases:names.results.filter(n=>n.memo_id===m.id&&termKey(n.display)!==termKey(m.term)).map(n=>n.display),sourceBookId:m.source_book_id,sourcePage:m.source_page,sourceTitle:library.find(b=>b.id===m.source_book_id)?.title,updatedAt:m.updated_at}));
  return folderId?[...await listFolderTerms(owner,folderId),...global]:global;
}
export async function termRoute(req:Request,owner:string,parts:string[]):Promise<Response>{
  let folderId:string|null;
  try{folderId=await termContext(owner,new URL(req.url));}catch(e){if(e instanceof FolderError)return json({error:e.message},e.status);throw e;}
  if(req.method==='GET'&&parts.length===1)return json({terms:await listTerms(owner,folderId)});
  const db=database();
  const global=parts[1]?await db.prepare('SELECT * FROM term_memos WHERE owner=? AND id=?').bind(owner,parts[1]).first<any>():null;
  const local=parts[1]&&folderId?await db.prepare('SELECT * FROM folder_term_memos WHERE owner=? AND id=? AND folder_id=?').bind(owner,parts[1],folderId).first<any>():null;
  const old=local||global;
  if(req.method==='DELETE'||req.method==='PUT'){
    if(parts.length!==2||!old)return json({error:'この共有範囲に用語メモが見つかりません。一覧を更新してください。'},404);
    if(req.headers.get('if-match')!==JSON.stringify(old.updated_at))return json({error:'用語メモが更新されています。最新の内容を確認してください。'},409);
  }
  const currentBook=new URL(req.url).searchParams.get('book');
  if(currentBook&&bookFolder(owner,currentBook)!==folderId)return json({error:'教材の所属が変わりました。一覧を更新してください。'},409);
  if(req.method==='DELETE'){
    const table=local?'folder_term_memos':'term_memos',names=local?'folder_term_names':'term_names';
    const results=await db.batch([
      db.prepare(`DELETE FROM ${names} WHERE owner=? AND memo_id=? AND EXISTS (SELECT 1 FROM ${table} WHERE owner=? AND id=? AND updated_at=?)`).bind(owner,old.id,owner,old.id,old.updated_at),
      db.prepare(`DELETE FROM ${table} WHERE owner=? AND id=? AND updated_at=?`).bind(owner,old.id,old.updated_at),
    ]);
    return results[1].changes?json({deleted:true}):json({error:'用語メモが更新されています。一覧を更新してください。'},409);
  }
  if(!['POST','PUT'].includes(req.method)||req.method==='POST'&&parts.length!==1)return json({error:'この操作には対応していません。'},405);
  if(Number(req.headers.get('content-length')||0)>65000)return json({error:'用語メモが長すぎます。'},413);
  let data:any;try{data=await req.json();}catch{return json({error:'入力内容を確認してください。'},400);}
  if(typeof data.term!=='string'||!data.term.trim()||data.term.length>120||typeof data.body!=='string'||!data.body.trim()||data.body.length>10000||!Array.isArray(data.aliases)||data.aliases.length>20||data.aliases.some((a:any)=>typeof a!=='string'||!a.trim()||a.length>120))return json({error:'用語は120文字、別名は20個、メモは1〜10,000文字で入力してください。'},400);
  const scope=data.scopeFolderId??null;
  if(scope!==null&&(typeof scope!=='string'||scope!==folderId))return json({error:'フォルダ限定メモは、そのフォルダの教材か用語メモ一覧から作成してください。'},400);
  if(old&&scope!==(local?local.folder_id:null))return json({error:'保存済みメモの共有範囲は変更できません。別の範囲に新規作成してください。'},409);
  const term=data.term.trim(),names=[...new Map([term,...data.aliases.map((a:string)=>a.trim())].map((name:string)=>[termKey(name),name])).entries()];
  if(names.some(([key])=>!key))return json({error:'用語・別名に文字を入力してください。'},400);
  const id=old?.id||crypto.randomUUID();let sourceBookId:string|null=old?.source_book_id??null,sourcePage:number|null=old?.source_page??null;
  if(!old&&data.sourceBookId!=null){
    const source=typeof data.sourceBookId==='string'?await findBook(owner,data.sourceBookId):null;
    if(!source)return json({error:'元の教材が見つかりません。'},404);
    if(!Number.isInteger(data.sourcePage)||data.sourcePage<1||data.sourcePage>source.pageCount)return json({error:'元のページ番号が範囲外です。'},400);
    if(scope&&bookFolder(owner,source.id)!==scope)return json({error:'元の教材のフォルダが変わりました。一覧を更新してください。'},409);
    sourceBookId=source.id;sourcePage=data.sourcePage;
  }
  const table=scope?'folder_term_memos':'term_memos',nameTable=scope?'folder_term_names':'term_names';
  for(const [key] of names){const existing=await db.prepare(`SELECT memo_id FROM ${nameTable} WHERE owner=? AND name_key=?${scope?' AND folder_id=?':''}`).bind(...(scope?[owner,key,scope]:[owner,key])).first<any>();if(existing&&existing.memo_id!==id)return json({error:'この共有範囲には同じ用語・別名のメモがあります。既存メモを編集してください。',existingId:existing.memo_id},409);}
  const updatedAt=new Date(Math.max(Date.now(),old?Date.parse(old.updated_at)+1:0)).toISOString();
  const contextBook=new URL(req.url).searchParams.get('book');
  if(contextBook&&bookFolder(owner,contextBook)!==folderId||scope&&sourceBookId&&!old&&bookFolder(owner,sourceBookId)!==scope)return json({error:'教材の所属が変わりました。一覧を更新してください。'},409);
  if(old&&(sqlite.prepare(`SELECT updated_at FROM ${table} WHERE owner=? AND id=?`).get(owner,id) as any)?.updated_at!==old.updated_at)return json({error:'用語メモが更新されています。一覧を更新してください。'},409);
  // batch() executes synchronously in one transaction, after the version check above.
  const write=old?db.prepare(`UPDATE ${table} SET term=?,body=?,updated_at=? WHERE id=? AND owner=?`).bind(term,data.body,updatedAt,id,owner):scope?db.prepare('INSERT INTO folder_term_memos VALUES(?,?,?,?,?,?,?,?)').bind(id,owner,scope,term,data.body,sourceBookId,sourcePage,updatedAt):db.prepare('INSERT INTO term_memos VALUES(?,?,?,?,?,?,?)').bind(id,owner,term,data.body,sourceBookId,sourcePage,updatedAt);
  try{await db.batch([write,db.prepare(`DELETE FROM ${nameTable} WHERE owner=? AND memo_id=?`).bind(owner,id),...names.map(([key,display])=>scope?db.prepare('INSERT INTO folder_term_names VALUES(?,?,?,?,?)').bind(owner,scope,key,display,id):db.prepare('INSERT INTO term_names VALUES(?,?,?,?)').bind(owner,key,display,id))]);}
  catch(e){if(String(e).includes('UNIQUE'))return json({error:'同じ名前の用語が保存されました。一覧を更新してください。'},409);throw e;}
  return json({term:(await listTerms(owner,folderId)).find(t=>t.id===id)},old?200:201);
}
