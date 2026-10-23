export type BookCompletion={bookId:string;completed:boolean;updatedAt:string};
export function validBookCompletion(value:unknown):value is BookCompletion[]{
  if(!Array.isArray(value)||value.length>1000)return false;
  const ids=new Set<string>();
  return value.every(item=>{
    if(!item||typeof item!=='object'||typeof item.bookId!=='string'||!item.bookId||item.bookId.length>200||ids.has(item.bookId)||typeof item.completed!=='boolean'||typeof item.updatedAt!=='string'||!Number.isFinite(Date.parse(item.updatedAt)))return false;
    ids.add(item.bookId);return true;
  });
}
