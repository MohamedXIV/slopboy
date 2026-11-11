import type {Metadata} from 'next';
import DesignSystemLab from '../../../../components/design/DesignSystemLab';

export const metadata:Metadata={
  title:'Design Lab · Slopboy',
  description:'Side-by-side live HeroUI v3 component comparison. No product UI is changed.',
};

export default function DesignSystemPage(){
  return <DesignSystemLab/>;
}
