import Link from 'next/link';
import GameManagementForm from '../../../../components/auth/GameManagementForm';
export default async function ManageGame({params}:{params:Promise<{gameId:string}>}){
  const {gameId}=await params;
  return <main className="mx-auto max-w-2xl px-4 py-12">
    <nav className="mb-6"><Link className="underline" href={`/manage/${encodeURIComponent(gameId)}/history`}>
      Private source version history (if available)
    </Link></nav>
    <GameManagementForm gameId={gameId}/>
  </main>;
}
