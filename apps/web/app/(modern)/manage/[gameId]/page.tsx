import GameManagementForm from '../../../../components/auth/GameManagementForm';
export default async function ManageGame({params}:{params:Promise<{gameId:string}>}){
  const {gameId}=await params;
  return <main className="mx-auto max-w-2xl px-4 py-12"><GameManagementForm gameId={gameId}/></main>;
}
