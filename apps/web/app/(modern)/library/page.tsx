import V2GameLibrary from '../../../components/v2/V2GameLibrary';
export const dynamic = 'force-dynamic';
export default function LibraryPage(){
  return <V2GameLibrary cloudBackupsEnabled={process.env.CLOUD_SAVE_BACKUPS_ENABLED === '1'}/>;
}
