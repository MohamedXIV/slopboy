'use client';

import {createContext,useCallback,useContext,useEffect,useMemo,useState,type ReactNode} from 'react';
import Link from 'next/link';
import {V2ActionLink,V2TextLink} from './V2RouteControls';
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
  const sharedHeroUI=pathname!=='/labs/design-system';
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
    <div className={`sb-v2-shell ${theme}${sharedHeroUI?' sb-heroui-live':''}`} data-v2-theme={theme} data-theme={theme}>
      <header className="sb-v2-header">
        <div className="sb-v2-header-inner">
          <Link className="sb-v2-brand" href="/" aria-label="Slopboy 2.0 home">
            SLOPBOY <span>2.0</span>
          </Link>
          <span className="sb-v2-header-descriptor">IMAGINARY HANDHELDS · REAL TINY GAMES</span>
          <nav className="sb-v2-nav" aria-label="Slopboy 2.0 navigation">
            <V2ActionLink href="/" size="sm" variant={pathname==='/'?'secondary':'ghost'}
              ariaCurrent={pathname==='/'?'page':undefined}>Devices</V2ActionLink>
            <V2ActionLink href="/library" size="sm" variant={pathname==='/library'?'secondary':'ghost'}
              ariaCurrent={pathname==='/library'?'page':undefined}>My library</V2ActionLink>
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
            <V2TextLink href="/library">Library</V2TextLink>
            <V2TextLink href="/labs/kaplay">Engine lab</V2TextLink>
            <V2TextLink href="/legacy">Legacy prototype</V2TextLink>
          </nav>
        </div>
      </footer>
    </div>
  </ThemeContext.Provider>;
}
