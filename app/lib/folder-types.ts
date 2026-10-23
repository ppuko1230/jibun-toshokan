export type Folder={id:string;name:string;updatedAt:string};
export type BookFolder={bookId:string;folderId:string};
export const folderNameKey=(name:string)=>name.normalize('NFKC').trim().toLocaleLowerCase();
