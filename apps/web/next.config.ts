import type {NextConfig} from 'next';
const config:NextConfig={output:'export',images:{unoptimized:true},transpilePackages:['@slopboy/hardware','@slopboy/runtime']};
export default config;
