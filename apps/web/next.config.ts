import type {NextConfig} from 'next';
const config:NextConfig={
  async headers(){return [{source:'/sw.js',headers:[
    {key:'Content-Type',value:'text/javascript; charset=utf-8'},
    {key:'Cache-Control',value:'no-cache, no-store, must-revalidate'},
    {key:'X-Content-Type-Options',value:'nosniff'}
  ]}];},
  images:{unoptimized:true},transpilePackages:['@slopboy/hardware','@slopboy/runtime','@slopboy/catalog']};
export default config;
