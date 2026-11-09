import '../v2/heroui.css';
import './auth/account.css';
import V2AppShell from '../../components/v2/V2AppShell';

/** Canonical Slopboy routes; never wrap the legacy prototype in this shell. */
export default function ModernLayout({children}:{children:React.ReactNode}){
  return <V2AppShell>{children}</V2AppShell>;
}
