import Link from 'next/link';
import HandheldPlayer from '../../components/HandheldPlayer';
export default function PlayPage(){
  return <main className="play-page"><header className="topbar"><Link className="brand" href="/"><span className="brand-icon">S</span>SLOPBOY<span className="accent">.</span></Link><Link href="/" className="back-link">← Back to platform</Link></header><HandheldPlayer /></main>;
}
