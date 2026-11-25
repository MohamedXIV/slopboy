import V2GameLibrary from '../../../components/v2/V2GameLibrary';
import {currentSubject} from '@/lib/auth/server';
import {readProfile} from '@/lib/auth/database';
import {cloudStorageReady,canUseCloudBackups} from '@/server/cloud-backup-storage';

export const dynamic = 'force-dynamic';
export default async function LibraryPage(){
  let enabled=false;
  if(cloudStorageReady()){
    try{
      const subject=await currentSubject();
      if(subject?.emailVerified)enabled=canUseCloudBackups((await readProfile(subject))?.role);
    }catch{ /* Fail closed; offline library remains available. */ }
  }
  return <V2GameLibrary cloudBackupsEnabled={enabled}/>;
}
