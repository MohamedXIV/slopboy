import Link from "next/link";
import KaplaySpikePlayer from "../../../../components/v2/KaplaySpikePlayer";
import "./kaplay-spike.css";

export default function KaplaySpikePage() {
  return <main className="kaplay-lab">
    <header><Link href="/v2">← Slopboy 2.0</Link><span>ENGINE FEASIBILITY LAB / NOT PUBLIC CARTRIDGES</span></header>
    <h1>Orbit Dodge <small>powered by KAPLAY 3001.0.19</small></h1>
    <p>A real KAPLAY game isolated in an opaque iframe. Frames are captured from WebGL and quantized into the Slopboy 1000&apos;s four indexed colors before appearing in the platform display.</p>
    <KaplaySpikePlayer />
    <aside>Technical experiment, not a security approval. Canvas readback, main-thread stalls, memory limits and mobile support must be assessed before accepting untrusted KAPLAY cartridges.</aside>
  </main>;
}
