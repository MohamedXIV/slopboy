'use client';

import {useEffect} from 'react';

/**
 * Client-side compatibility redirect while Next.js uses static export.
 * No runtime server redirects are available until the dynamic hosting cutover (#24).
 * Always include an ordinary link as a no-JavaScript/manual fallback.
 */
export default function CompatibilityRedirect({to}:{to:`/${string}`}){
  if(!to.startsWith('/')||to.startsWith('//'))throw Error('Invalid internal redirect');
  useEffect(()=>{
    const suffix=window.location.search+window.location.hash;
    window.location.replace(to+suffix);
  },[to]);
  return <main style={{maxWidth:640,margin:'8vh auto',padding:24}}>
    <h1 style={{fontSize:'1.5rem',letterSpacing:0,margin:'0 0 1rem'}}>This page has moved</h1>
    <p>Your saved game data remains on this device.</p>
    <a href={to}>Continue to Slopboy</a>
  </main>;
}
