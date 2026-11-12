import {NextResponse} from 'next/server';
import {isGameUuid} from '@slopboy/catalog';
import {currentSubject} from '../../../../lib/auth/server';
import {catalogDatabaseConfigured,readVisibleCatalogGame} from '../../../../server/catalog-data';

export const dynamic='force-dynamic';
export const runtime='nodejs';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};

export async function GET(_request:Request,{params}:{params:Promise<{gameId:string}>}){
  const {gameId}=await params;
  if(!isGameUuid(gameId))return NextResponse.json({error:'NOT_FOUND'},{status:404,headers});
  if(!catalogDatabaseConfigured())
    return NextResponse.json({error:'DATABASE_UNAVAILABLE'},{status:503,headers});
  try{
    const session=await currentSubject();
    const game=await readVisibleCatalogGame(gameId,session?.emailVerified?session.id:null);
    if(!game)return NextResponse.json({error:'NOT_FOUND'},{status:404,headers});
    return NextResponse.json({game},{headers});
  }catch{return NextResponse.json({error:'DATABASE_UNAVAILABLE'},{status:503,headers});}
}
