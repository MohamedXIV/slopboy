const GENRES=['Arcade','Shooter','Puzzle','Action','Adventure','Strategy','Other'] as const;
export type GameMetadata={title:string;tagline:string|null;description:string|null;genre:typeof GENRES[number]};

/** Only presentation fields may be changed through the management API. */
export function parseGameMetadata(value:unknown):GameMetadata|null{
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const data=value as Record<string,unknown>;
  if(Object.keys(data).some(key=>!['title','tagline','description','genre'].includes(key)))return null;
  if(typeof data.title!=='string'||data.title.includes('\0')||!data.title.trim()||data.title.trim().length>80||
    typeof data.genre!=='string'||!GENRES.some(genre=>genre===data.genre))return null;
  const optional=(item:unknown,max:number):string|null|undefined=>{
    if(item===null||item===undefined)return null;
    if(typeof item!=='string'||item.includes('\0')||item.length>max)return undefined;
    return item.trim()||null;
  };
  const tagline=optional(data.tagline,160),description=optional(data.description,2000);
  if(tagline===undefined||description===undefined)return null;
  return {title:data.title.trim(),tagline,description,genre:data.genre as GameMetadata['genre']};
}
