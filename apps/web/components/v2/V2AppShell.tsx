'use client';

import {createContext,useCallback,useContext,useEffect,useMemo,useState,type ReactNode} from 'react';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {Button} from '@heroui/react';
import './v2-shell.css';

export type V2Theme='dark'|'light';
export const V2_THEME_STORAGE_KEY='slopboy:v2:theme';
interface V2ThemeState {readonly theme:V2Theme; readonly toggleTheme:()=>void}
const ThemeContext=createContext<V2ThemeState|null>(null);

export function useV2Theme():V2ThemeState {
  const value=useContext(ThemeContext);
  if(!value)throw Error('V2 theme must be used inside the shared V2 app shell');
  return value;
}

/** One header/footer/theme owner for canonical routes; legacy pages are separate. */
export default function V2AppShell({children}:{children:ReactNode}){
  const pathname=usePathname();
  const [theme,setTheme]=useState<V2Theme>('dark');
  useEffect(()=>{
    const frame=requestAnimationFrame(()=>{
      try{
        if(window.localStorage.getItem(V2_THEME_STORAGE_KEY)==='light')setTheme('light');
      }catch{/* Preferences must never block a game. */}
    });
    return()=>cancelAnimationFrame(frame);
  },[]);
  const toggleTheme=useCallback(()=>{
    const next=theme==='dark'?'light':'dark';
    setTheme(next);
    try{window.localStorage.setItem(V2_THEME_STORAGE_KEY,next);}catch{/* Optional guest preference. */}
  },[theme]);
  const state=useMemo(()=>({theme,toggleTheme}),[theme,toggleTheme]);
  return <ThemeContext.Provider value={state}>
    <div className="sb-v2-shell" data-v2-theme={theme} data-theme={theme}>
      <header className="sb-v2-header">
        <div className="sb-v2-header-inner">
          <Link className="sb-v2-brand" href="/" aria-label="Slopboy 2.0 home">
            SLOPBOY <span>2.0</span>
          </Link>
          <span className="sb-v2-header-descriptor">IMAGINARY HANDHELDS · REAL TINY GAMES</span>
          <nav className="sb-v2-nav" aria-label="Slopboy 2.0 navigation">
            <Link href="/" aria-current={pathname==='/'?'page':undefined}>Devices</Link>
            <Link href="/library" aria-current={pathname==='/library'?'page':undefined}>My library</Link>
            <Button size="sm" variant="secondary" className="sb-control sb-v2-theme-toggle"
              onPress={toggleTheme} aria-label={theme==='dark'?'Switch to light theme':'Switch to dark theme'}
>
              <span aria-hidden="true">{theme==='dark'?'☀':'☾'}</span>
              <span>{theme==='dark'?'Light':'Dark'}</span>
            </Button>
          </nav>
        </div>
      </header>
      <div className="sb-v2-main">{children}</div>
      <footer className="sb-v2-footer">
        <div className="sb-v2-footer-inner">
          <Link href="/" className="sb-v2-footer-brand">SLOPBOY <span>2.0</span></Link>
          <span>Imaginary handhelds, real tiny games. · Independent preview</span>
          <nav aria-label="Footer navigation">
            <Link href="/library">Library</Link>
            <Link href="/labs/kaplay">Engine lab</Link>
            <Link href="/legacy">Legacy prototype</Link>
          </nav>
        </div>
      </footer>
    </div>
  </ThemeContext.Provider>;
}
