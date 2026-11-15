import {NextResponse,type NextRequest} from 'next/server';
import {catalogDatabaseConfigured,listPublicCatalog} from '../../../server/catalog-data';
import {parseCatalogPage} from '../../../server/catalog-contract';

export const dynamic='force-dynamic';
export const runtime='nodejs';
// Avoid caching catalog metadata before publication and CDN invalidation are validated.
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};

export async function GET(request:NextRequest){
  const parsed=parseCatalogPage(request.nextUrl.searchParams);
  if(!parsed.ok)return NextResponse.json({error:parsed.error},{status:400,headers});
  if(!catalogDatabaseConfigured())
    return NextResponse.json({error:'DATABASE_UNAVAILABLE'},{status:503,headers});
  try{
    const result=await listPublicCatalog(parsed.page);
    return NextResponse.json(result,{headers});
  }catch{
    return NextResponse.json({error:'DATABASE_UNAVAILABLE'},{status:503,headers});
  }
}
