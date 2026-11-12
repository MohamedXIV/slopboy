import {GAMES} from '@slopboy/catalog';
import CompatibilityRedirect from '../../components/CompatibilityRedirect';
export default function DefaultGamePage(){return <CompatibilityRedirect to={`/play/${GAMES[0].gameId}`}/>;}
