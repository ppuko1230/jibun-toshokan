import {sqlite} from './local-store';
import {folders} from './app/lib/folders-store';
import {folderNameKey} from './app/lib/folder-types';
import {listFolderTerms} from './app/lib/terms-store';
import {termKey} from './app/lib/term-types';
const owner='local-pc';
export async function folderBackup(){
  const fs=folders(owner);if(!fs.length)return undefined;
  return {folders:fs,bookFolders:sqlite.prepare('SELECT book_id AS bookId,folder_id AS folderId FROM book_folders WHERE owner=? ORDER BY book_id').all(owner),terms:await listFolderTerms(owner)};
}
function fail():never{throw new Error('フォルダ情報が不正か、既存の所属・メモと競合しています。何も取り込んでいません。元のバックアップを保管し、別の空の本棚へ復元してください。');}
const id=(v:any)=>typeof v==='string'&&v.length>0&&v.length<=200;
const stamp=(v:any)=>typeof v==='string'&&!Number.isNaN(Date.parse(v));
/** Preflight every new record before the caller starts its database transaction. */
export function prepareFolderImport(input:any,reference:(id:any,page:any)=>string|null){
  if(input===undefined)return ()=>({folders:0,folderTerms:0});
  if(!input||!Array.isArray(input.folders)||!Array.isArray(input.bookFolders)||!Array.isArray(input.terms)||input.folders.length>1000||input.bookFolders.length>1000||input.terms.length>10000)fail();
  const folderIds=new Set<string>(),folderKeys=new Set<string>(),newFolders:any[]=[],currentFolders=folders(owner);
  for(const f of input.folders){
    if(!f||!id(f.id)||typeof f.name!=='string'||!f.name.trim()||f.name.length>80||typeof f.updatedAt!=='string'||f.updatedAt.length>100||folderIds.has(f.id)||folderKeys.has(folderNameKey(f.name)))fail();
    folderIds.add(f.id);folderKeys.add(folderNameKey(f.name));
    const old=currentFolders.find(x=>x.id===f.id),sameName=currentFolders.find(x=>folderNameKey(x.name)===folderNameKey(f.name));
    if(old&&old.name!==f.name||sameName&&sameName.id!==f.id)fail();
    if(!old)newFolders.push(f);
  }
  const memberIds=new Set<string>(),members:any[]=[];
  for(const m of input.bookFolders){
    if(!m||!folderIds.has(m.folderId)||!id(m.bookId))fail();
    const bookId=reference(m.bookId,1);if(!bookId||memberIds.has(bookId))fail();memberIds.add(bookId);
    const old=sqlite.prepare('SELECT folder_id FROM book_folders WHERE owner=? AND book_id=?').get(owner,bookId) as any;
    if(old&&old.folder_id!==m.folderId)fail();members.push({bookId,folderId:m.folderId});
  }
  const memoIds=new Set<string>(),allNames=new Set<string>(),newTerms:any[]=[];
  for(const t of input.terms){
    if(!t||!id(t.id)||memoIds.has(t.id)||!folderIds.has(t.scopeFolderId)||typeof t.term!=='string'||!termKey(t.term)||t.term.length>120||typeof t.body!=='string'||!t.body.trim()||t.body.length>10000||!Array.isArray(t.aliases)||t.aliases.length>20||t.aliases.some((a:any)=>typeof a!=='string'||!termKey(a)||a.length>120)||!stamp(t.updatedAt))fail();
    memoIds.add(t.id);
    const names=[...new Map([t.term,...t.aliases].map((n:string)=>[termKey(n),n])).entries()] as [string,string][];
    for(const [key] of names){const k=t.scopeFolderId+':'+key;if(allNames.has(k))fail();allNames.add(k);}
    const sourceBookId=t.sourceBookId==null?null:reference(t.sourceBookId,t.sourcePage);if(t.sourceBookId!=null&&!sourceBookId)fail();
    const byId=sqlite.prepare('SELECT * FROM folder_term_memos WHERE id=?').get(t.id) as any;
    if(byId&&byId.owner!==owner||sqlite.prepare('SELECT id FROM term_memos WHERE id=?').get(t.id))fail();
    const matched=names.map(([key])=>sqlite.prepare('SELECT memo_id FROM folder_term_names WHERE owner=? AND folder_id=? AND name_key=?').get(owner,t.scopeFolderId,key) as any).filter(Boolean);
    const existingId=byId?.id||matched[0]?.memo_id;
    if(existingId){
      const old=sqlite.prepare('SELECT * FROM folder_term_memos WHERE id=?').get(existingId) as any;
      const oldNames=(sqlite.prepare('SELECT name_key FROM folder_term_names WHERE memo_id=?').all(existingId) as any[]).map(n=>n.name_key).sort();
      if(!old||old.owner!==owner||old.folder_id!==t.scopeFolderId||old.term!==t.term||old.body!==t.body||old.source_book_id!==sourceBookId||old.source_page!==(sourceBookId?t.sourcePage:null)||matched.some(n=>n.memo_id!==existingId)||JSON.stringify(oldNames)!==JSON.stringify(names.map(n=>n[0]).sort()))fail();
    }else newTerms.push({...t,sourceBookId,sourcePage:sourceBookId?t.sourcePage:null,names});
  }
  return ()=>{
    for(const f of newFolders)sqlite.prepare('INSERT INTO folders VALUES(?,?,?,?,?)').run(f.id,owner,f.name,folderNameKey(f.name),f.updatedAt);
    for(const m of members)sqlite.prepare('INSERT INTO book_folders VALUES(?,?,?) ON CONFLICT(owner,book_id) DO NOTHING').run(owner,m.bookId,m.folderId);
    for(const t of newTerms){sqlite.prepare('INSERT INTO folder_term_memos VALUES(?,?,?,?,?,?,?,?)').run(t.id,owner,t.scopeFolderId,t.term,t.body,t.sourceBookId,t.sourcePage,t.updatedAt);for(const [key,display] of t.names)sqlite.prepare('INSERT INTO folder_term_names VALUES(?,?,?,?,?)').run(owner,t.scopeFolderId,key,display,t.id);}
    return {folders:newFolders.length,folderTerms:newTerms.length};
  };
}
