import {redirect} from 'next/navigation';
import PrivateSourceForm from '../../../../components/auth/PrivateSourceForm';
import {currentSubject} from '../../../../lib/auth/server';

export const dynamic = 'force-dynamic';
export default async function NewGame() {
  const actor = await currentSubject();
  if (!actor?.emailVerified) redirect('/dashboard');
  return <main className="mx-auto max-w-2xl px-4 py-12"><PrivateSourceForm/></main>;
}
