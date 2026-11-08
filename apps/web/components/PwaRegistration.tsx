'use client';
import {useEffect} from 'react';
/** Register only on the production HTTPS origin, never during Next development. */
export default function PwaRegistration(){
  useEffect(()=>{
    if(process.env.NODE_ENV!=='production'||!('serviceWorker' in navigator))return;
    // Browsers treat loopback as a secure context; production SSR smoke uses 127.0.0.1.
    const loopback=location.hostname==='localhost'||location.hostname==='127.0.0.1'||location.hostname==='[::1]';
    if(location.protocol!=='https:'&&!loopback)return;
    navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'})
      .catch(error=>console.warn('Offline installation unavailable:',error));
  },[]);
  return null;
}
