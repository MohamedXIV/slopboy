import ProceduralDemo from '@/components/v2/ProceduralDemo';

export const metadata = {title:'Procedural sandbox demo · Slopboy'};

export default function ProceduralDemoPage() {
  return <main className="mx-auto max-w-xl space-y-4 px-4 py-12">
    <h1 className="text-3xl font-bold">Procedural sandbox demo</h1>
    <p>Move using the arrow keys or buttons. Each move plays a generated tone. Save position stores your place in this browser.</p>
    <ProceduralDemo/>
  </main>;
}
