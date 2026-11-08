import './legacy.css';
/** Original Slopboy prototype, kept runnable and independent of the modern shell. */
export default function LegacyLayout({children}:{children:React.ReactNode}){
  return <div className="slopboy-legacy">{children}</div>;
}
