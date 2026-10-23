export type WebPreferences={size:number;lineHeight:number;theme:'paper'|'white'|'night'};
export const defaultWebPreferences:WebPreferences={size:20,lineHeight:1.95,theme:'paper'};
export function validWebPreferences(v:any):v is WebPreferences{return !!v&&[18,20,22,24,26].includes(v.size)&&[1.7,1.95,2.2].includes(v.lineHeight)&&['paper','white','night'].includes(v.theme);}
export type WebBlock={id:string;type:'paragraph'|'heading'|'code'|'pair'|'table';title?:string;text:string;code?:string;file?:string;lineStart?:number;lineEnd?:number;rows?:string[][];meta?:string[];legacyIds?:string[]};
export type ContinuousFile={name:string;firstPage:number;lastPage:number;contextPage?:number;previousPage?:number;nextPage?:number;previousFile?:string;nextFile?:string;segments:{page:number;block:WebBlock}[]};
export type WebPageData={page:number;title:string;blocks:WebBlock[];exactCode:boolean;structured?:boolean;chapters:{title:string;page:number}[];continuousFile?:ContinuousFile;files?:ContinuousFile[]};
export type Challenge={id:string;bookId:string;page:number;blockId:string|null;quote:string;kind:'unclear'|'cannot-code';body:string;status:'open'|'resolved';createdAt:string;updatedAt:string};
export const challengeLabels={'unclear':'まだ曖昧','cannot-code':'自分で書けない'};
