import type {Metadata} from 'next';
import DesignSystemLab from '../../../../components/design/DesignSystemLab';

export const metadata:Metadata={
  title:'Design Lab · Slopboy',
  description:'Comparison of original and approved Slopboy HeroUI v3 component styles.',
};

export default function DesignSystemPage(){
  return <DesignSystemLab/>;
}
