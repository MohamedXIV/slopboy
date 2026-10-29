import type {Metadata} from 'next';
import './globals.css';
import PwaRegistration from '../components/PwaRegistration';
export const metadata:Metadata={title:'Slopboy — Imaginary handhelds, real tiny games',description:'A zero-budget-first fantasy handheld game platform under construction.',applicationName:'Slopboy',manifest:'/manifest.webmanifest',appleWebApp:{capable:true,statusBarStyle:'black-translucent',title:'Slopboy'},icons:{icon:[{url:'/icons/slopboy-192.png',sizes:'192x192',type:'image/png'},{url:'/icons/slopboy-512.png',sizes:'512x512',type:'image/png'}],apple:'/icons/slopboy-192.png'}};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="en"><body>{children}<PwaRegistration/></body></html>;}
