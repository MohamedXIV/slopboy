import type {MetadataRoute} from 'next';
export default function manifest():MetadataRoute.Manifest {
  return {
    id:'/',name:'Slopboy — Tiny Console Club',short_name:'Slopboy',
    description:'Play original tiny games on imaginary handheld consoles.',
    start_url:'/library',scope:'/',display:'standalone',orientation:'any',
    background_color:'#0e191b',theme_color:'#0e191b',
    icons:[
      {src:'/icons/slopboy-192.png',sizes:'192x192',type:'image/png',purpose:'any'},
      {src:'/icons/slopboy-512.png',sizes:'512x512',type:'image/png',purpose:'any'},
      {src:'/icons/slopboy-512.png',sizes:'512x512',type:'image/png',purpose:'maskable'}
    ]
  };
}
