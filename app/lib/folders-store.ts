import {sqlite} from '../../local-store';
import {findBook} from './library';
import {folderNameKey,type Folder} from './folder-types';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
export function folders(owner:string):Folder[]{return sqlite.prepare('SELECT id,name,updated_at AS updatedAt FROM folders WHERE owner=? ORDER BY name_key,id').all(owner) as Folder[];}
export function bookFolder(owner:string,bookId:string):string|null{return (sqlite.prepare('SELECT folder_id FROM book_folders WHERE owner=? AND book_id=?').get(owner,bookId) as any)?.folder_id??null;}
export class FolderError extends Error {constructor(message:string,public status=400){super(message);}}
export async function termContext(owner:string,url:URL):Promise<string|null>{
  const book=url.searchParams.get('book'),folder=url.searchParams.get('folder');
  if(book&&folder)throw new FolderError('教材かフォルダのどちらかを選んでください。');
  if(book){if(!await findBook(owner,book))throw new FolderError('教材が見つかりません。',404);return bookFolder(owner,book);}
  if(folder==='unclassified')return null;
  if(folder){if(!folders(owner).some(f=>f.id===folder))throw new FolderError('フォルダが見つかりません。',404);return folder;}
  return null;
}
export async function folderRoute(req:Request,owner:string,parts:string[]):Promise<Response>{
  if(req.method==='GET'&&parts.length===1)return json({folders:folders(owner)});
  if(!['POST','PUT'].includes(req.method))return json({error:'この操作には対応していません。'},405);
  let data:any;try{data=await req.json();}catch{return json({error:'入力内容を確認してください。'},400);}
  if(parts[1]==='membership'&&req.method==='PUT'){
    if(typeof data.bookId!=='string'||(data.folderId!==null&&typeof data.folderId!=='string'))return json({error:'教材とフォルダを確認してください。'},400);
    if(!await findBook(owner,data.bookId))return json({error:'教材が見つかりません。'},404);
    if(data.folderId!==null&&!folders(owner).some(f=>f.id===data.folderId))return json({error:'フォルダが見つかりません。'},404);
    if(data.previousFolderId!==bookFolder(owner,data.bookId))return json({error:'教材の所属が変わっています。一覧を更新してください。'},409);
    if(data.folderId===null)sqlite.prepare('DELETE FROM book_folders WHERE owner=? AND book_id=?').run(owner,data.bookId);
    else sqlite.prepare('INSERT INTO book_folders VALUES(?,?,?) ON CONFLICT(owner,book_id) DO UPDATE SET folder_id=excluded.folder_id').run(owner,data.bookId,data.folderId);
    return json({saved:true});
  }
  if(typeof data.name!=='string'||!data.name.trim()||data.name.trim().length>80)return json({error:'フォルダ名は1〜80文字で入力してください。'},400);
  const name=data.name.trim(),key=folderNameKey(name),id=req.method==='POST'?crypto.randomUUID():parts[1];
  if(!id||req.method==='POST'&&parts.length!==1||req.method==='PUT'&&parts.length!==2)return json({error:'操作を確認してください。'},400);
  const old=folders(owner).find(f=>f.id===id);
  if(req.method==='PUT'&&!old)return json({error:'フォルダが見つかりません。'},404);
  if(old&&req.headers.get('if-match')!==JSON.stringify(old.updatedAt))return json({error:'名前が更新されています。一覧を更新してください。'},409);
  if(sqlite.prepare('SELECT id FROM folders WHERE owner=? AND name_key=? AND id<>?').get(owner,key,id))return json({error:'同じ名前のフォルダがあります。'},409);
  const updatedAt=crypto.randomUUID();
  try{if(old)sqlite.prepare('UPDATE folders SET name=?,name_key=?,updated_at=? WHERE owner=? AND id=?').run(name,key,updatedAt,owner,id);
  else sqlite.prepare('INSERT INTO folders VALUES(?,?,?,?,?)').run(id,owner,name,key,updatedAt);}catch(e){if(String(e).includes('UNIQUE'))return json({error:'同じ名前のフォルダがあります。'},409);throw e;}
  return json({folder:{id,name,updatedAt}},old?200:201);
}
