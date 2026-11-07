import './heroui.css';
import V2AppShell from '../../components/v2/V2AppShell';

/** Shared V2-only chrome. The V1 site keeps its independent layout. */
export default function V2Layout({children}:{children:React.ReactNode}){
  return <V2AppShell>{children}</V2AppShell>;
}
