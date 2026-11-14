/** Test-only Neon HTTP transport backed by an isolated local PostgreSQL.
 * Loaded only into the Next test process via NODE_OPTIONS. It never handles
 * real Neon URLs or credentials, and executes only SELECT statements. */
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile);
const nativeFetch=globalThis.fetch;
const endpoint='sql-test.invalid';
globalThis.fetch=async function(input,init){
  const url=new URL(typeof input==='string'?input:input.url);
  if(!url.hostname.endsWith(endpoint))return nativeFetch(input,init);
  try{
    const body=JSON.parse(String(init?.body??''));
    if(typeof body.query!=='string'||!/^\s*SELECT\b/i.test(body.query)||!Array.isArray(body.params))throw Error('Only SELECT is allowed');
    const query=body.query.replace(/\$(\d+)/g,(_,number)=>{
      const value=body.params[Number(number)-1];
      if(value===null)return 'NULL';
      if(typeof value!=='string'||value.includes('\0'))throw Error('Invalid parameter');
      return "'"+value.replaceAll("'","''")+"'";
    }).replace(/;\s*$/,'');
    const sql=`SELECT coalesce(json_agg(row_to_json(q)),'[]'::json)::text FROM (${query}) q`;
    const {stdout}=await run(process.env.SLOPBOY_TEST_PSQL,['-X','-q','-A','-t','-v','ON_ERROR_STOP=1',
      '-h',process.env.SLOPBOY_TEST_SOCKET,'-p',process.env.SLOPBOY_TEST_PG_PORT,'-U','slopboy_runtime','postgres','-c',sql],{maxBuffer:4*1024*1024});
    const rows=JSON.parse(stdout.trim());
    const keys=rows.length?Object.keys(rows[0]):[];
    const oid=value=>typeof value==='boolean'?16:typeof value==='number'?23:value!==null&&typeof value==='object'?114:25;
    const fields=keys.map(key=>({name:key,dataTypeID:oid(rows.find(row=>row[key]!==null)?.[key]??null)}));
    return Response.json({fields,rows:rows.map(row=>keys.map(key=>row[key]===null?null:
      typeof row[key]==='object'?JSON.stringify(row[key]):String(row[key]))) });
  }catch(error){return Response.json({message:String(error)},{status:400});}
};
