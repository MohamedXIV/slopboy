'use client';

import type {CSSProperties} from 'react';
import {makeCartridgeAppearance} from './cartridge-cover';
import './v2-cartridge.css';

export default function V2CartridgeArt({id,title,emblem,index,compact=false}:{id:string;title:string;emblem:string;index:number;compact?:boolean}){
  const art=makeCartridgeAppearance(id);
  const vars={
    '--cart-primary':art.primary,'--cart-secondary':art.secondary,'--cart-highlight':art.highlight
  } as CSSProperties;
  return <div className={'v2-cart-shell'+(compact?' v2-cart-shell--compact':'')} style={vars} aria-label={'Procedural cartridge artwork for '+title}>
    <div className="v2-cart-grip" aria-hidden="true"><i/><i/><i/><i/><i/></div>
    <div className="v2-cart-label">
      <span className="v2-cart-serial">SLOPBOY / CARTRIDGE {String(index+1).padStart(3,'0')}</span>
      <svg className="v2-cart-artwork" viewBox="0 0 320 190" role="img" aria-label={'Generated '+title+' cover'}>
        <rect width="320" height="190" fill={art.secondary}/>
        {Array.from({length:art.stripes},(_,i)=><path key={i} d={`M${-80+i*60},0 l180,190`}
          stroke={art.primary} strokeWidth={16+(i%3)*13} opacity={.72}/>)}
        <circle cx={art.accentX*3.2} cy={art.accentY*1.9} r="68" fill={art.highlight} opacity=".3"/>
        <rect x="0" y="140" width="320" height="50" fill={art.secondary} opacity=".72"/>
        <text x="160" y="112" fill={art.highlight} fontFamily="ui-monospace, monospace" fontWeight="900"
          fontSize="74" dominantBaseline="middle" textAnchor="middle">{emblem}</text>
      </svg>
      <div className="v2-cart-title"><strong>{title}</strong><span>PLAY / SERIES 1000</span></div>
    </div>
    <div className="v2-cart-contacts" aria-hidden="true">{Array.from({length:9},(_,i)=><i key={i}/>)}</div>
  </div>;
}
