import {scaffoldCreator,checkCreator,buildCreator,verifyCreator,previewCreator,CreatorError} from './creator-kit.ts';
async function main(args:string[]):Promise<void>{
  const [cmd,id,...rest]=args;
  if(rest.length||!id||!['new','check','build','verify','preview'].includes(cmd||'')){
    throw new CreatorError('USAGE','Use: pnpm creator:new|creator:check|creator:build|creator:verify|creator:preview <game-id>');
  }
  const result=cmd==='new'?await scaffoldCreator(id):
    cmd==='check'?await checkCreator(id):
    cmd==='build'?await buildCreator(id):
    cmd==='preview'?await previewCreator(id):await verifyCreator(id);
  console.log(JSON.stringify(result,null,2));
}
main(process.argv.slice(2)).catch(error=>{
  const code=error instanceof CreatorError?error.code:
    error instanceof Error&&'code' in error?String(error.code):'VALIDATION_FAILED';
  const message=error instanceof Error?error.message:String(error);
  console.error(JSON.stringify({ok:false,code,message}));
  process.exitCode=1;
});
