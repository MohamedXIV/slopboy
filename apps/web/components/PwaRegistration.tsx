'use client';
import {useEffect} from 'react';
/** Register only on the production HTTPS origin, never during Next development. */
export default function PwaRegistration(){
  useEffect(()=>{
    if(process.env.NODE_ENV!=='production'||!('serviceWorker' in navigator))return;
    if(location.protocol!=='https:' && location.hostname!=='localhost')return;
    navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'})
      .catch(error=>console.warn('Offline installation unavailable:',error));
  },[]);
  return null;
}
