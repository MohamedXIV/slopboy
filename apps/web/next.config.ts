import type {NextConfig} from 'next';
const config:NextConfig={
  // Build-produced bundles live outside public/, and must be traced into the
  // cartridge Route Handler's serverless function (never CDN static assets).
  outputFileTracingIncludes:{'/cartridges/[...parts]':['./private/cartridges/**/*.slop']},
  async headers(){return [
    {source:'/auth/sign-in',headers:[{key:'Content-Security-Policy',value:"frame-ancestors 'none'"}]},
    {source:'/auth/consent',headers:[{key:'Content-Security-Policy',value:"frame-ancestors 'none'"}]},
    {source:'/',headers:[{key:'X-Slopboy-Offline-Public',value:'1'}]},
    {source:'/library',headers:[{key:'X-Slopboy-Offline-Public',value:'1'}]},
    {source:'/play/:gameId',headers:[{key:'X-Slopboy-Offline-Public',value:'1'}]},
    {source:'/sw.js',headers:[
    {key:'Content-Type',value:'text/javascript; charset=utf-8'},
    {key:'Cache-Control',value:'no-cache, no-store, must-revalidate'},
    {key:'X-Content-Type-Options',value:'nosniff'}
  ]}];},
  images:{unoptimized:true},transpilePackages:['@slopboy/hardware','@slopboy/runtime','@slopboy/catalog']};
export default config;
