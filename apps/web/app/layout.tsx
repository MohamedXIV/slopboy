import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'Slopboy — Imaginary handhelds, real tiny games',description:'A zero-budget-first fantasy handheld game platform under construction.'};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="en"><body>{children}</body></html>;}
