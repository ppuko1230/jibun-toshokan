import {localDatabase,localBucket} from '../../local-store';
import samples from '../data/samples.json';
export type Book = {id:string;title:string;filename:string;pageCount:number;bytes:number;hash:string;sample:boolean;createdAt:string;description:string;tag:string;labels:string[];noteCount?:number;folderId?:string};
export type PageData = {page:number;label:string;content:string};
export const sampleBooks=samples;
export function database() { return localDatabase; }
export function bucket() { return localBucket; }
export async function books(owner:string,includeTrashed=false):Promise<Book[]> {
  const db=database();
  const rows=await db.prepare('SELECT * FROM textbooks WHERE owner=? ORDER BY created_at DESC').bind(owner).all<any>();
  const notes=await db.prepare("SELECT book_id,COUNT(*) as count FROM notes WHERE owner=? AND body<>'' GROUP BY book_id").bind(owner).all<any>();
  const counts=Object.fromEntries(notes.results.map(n=>[n.book_id,n.count]));
  const uploaded:Book[]=[];
  for(const r of rows.results){
    const labels=await db.prepare('SELECT label FROM pages WHERE book_id=? ORDER BY page').bind(r.id).all<any>();
    uploaded.push({id:r.id,title:r.title,filename:r.filename,pageCount:r.page_count,bytes:r.bytes,hash:r.hash,sample:false,createdAt:r.created_at,description:'あなたが追加した教材',tag:'マイ教材',labels:labels.results.map(x=>x.label),noteCount:counts[r.id]||0});
  }
  const hidden=(await db.prepare('SELECT book_id FROM book_trash WHERE owner=?').bind(owner).all<{book_id:string}>()).results;
  const memberships=(await db.prepare('SELECT book_id,folder_id FROM book_folders WHERE owner=?').bind(owner).all<any>()).results;
  return [...samples.map(({pages,...b})=>({...b,labels:pages.map(p=>p.label),noteCount:counts[b.id]||0})),...uploaded].filter(b=>includeTrashed||!hidden.some(t=>t.book_id===b.id)).map(b=>{const membership=memberships.find(m=>m.book_id===b.id);return membership?{...b,folderId:membership.folder_id}:b;});
}
export async function findBook(owner:string,id:string){ return (await books(owner,true)).find(b=>b.id===id); }
export async function pageData(book:Book,page:number):Promise<PageData|undefined>{
  if(book.sample)return samples.find(b=>b.id===book.id)?.pages[page-1];
  return (await database().prepare('SELECT page,label,content FROM pages WHERE book_id=? AND page=?').bind(book.id,page).first<PageData>())||undefined;
}
