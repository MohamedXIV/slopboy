/** A fixed opaque-origin iframe document. Creator code is never interpolated into HTML. */
export const SANDBOX_DOCUMENT = String.raw`<!doctype html>
<html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' blob:; worker-src blob:; connect-src 'none'; img-src 'none'; media-src 'none'; style-src 'none'; font-src 'none'; object-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'">
</head><body><script>
(() => {
  'use strict';
  let key = null;
  let worker = null;
  let busy = false;
  let watchdog = 0;
  let pendingSave;
  let saveTimer = 0;
  let phase = 'idle';
  let channel = null;
  const MAX_CODE = 65536;
  const MAX_PIXELS = 512 * 512;
  const MAX_SAVE = 8192;
  const MAX_FRAME_MS = 1500;
  const VALID_BUTTONS = ['UP','DOWN','LEFT','RIGHT','A','B','START','SELECT'];
  const post = (type, extra={}) => parent.postMessage({scope:'slopboy-v1',key,type,...extra}, '*');
  function fail(reason) {
    if(phase==='stopped')return;
    phase='stopped';
    clearTimeout(watchdog);
    clearTimeout(saveTimer);
    pendingSave=undefined;
    if(channel){channel.port1.close();channel=null;}
    if(worker){ worker.terminate(); worker=null; }
    busy=false;
    post('error',{reason:String(reason).slice(0,120)});
  }
  function workerMain(){
    'use strict';
    let moduleGame=null;
    let width=0, height=0, shadeCount=0;
    let frame=null;
    let storedSave=null;
    let trustedPort=null;
    const send=(data,transfer)=>{if(trustedPort)trustedPort.postMessage(data,transfer||[]);};
    let down=new Set(), pressed=new Set();
    const clampShade = (shade) => {
      if (!Number.isInteger(shade) || shade < 0 || shade >= shadeCount) throw Error('Invalid pixel shade');
      return shade;
    };
    const api={
      input:{down:(k)=>down.has(k),pressed:(k)=>pressed.has(k)},
      storage:{
        load:()=>storedSave,
        save:(value)=>{
          if(typeof value!=='string' || new TextEncoder().encode(value).byteLength>8192)throw Error('Save exceeds hardware budget');
          storedSave=value;
          send({type:'save',value});
        },
        erase:()=>{
          storedSave=null;
          send({type:'save',value:null});
        }
      },
      screen:{
        clear:(shade=0)=>{frame.fill(clampShade(shade));},
        pixel:(x,y,shade)=>{
          clampShade(shade);
          if(!Number.isFinite(x)||!Number.isFinite(y))throw Error('Invalid pixel coordinate');
          x=Math.trunc(x);y=Math.trunc(y);
          if(x>=0&&x<width&&y>=0&&y<height)frame[y*width+x]=shade;
        },
        rect:(x,y,w,h,shade)=>{
          clampShade(shade);
          if(![x,y,w,h].every(Number.isFinite))throw Error('Invalid rectangle');
          x=Math.trunc(x);y=Math.trunc(y);w=Math.trunc(w);h=Math.trunc(h);
          if(w<0||h<0)throw Error('Negative rectangle size');
          const x0=Math.max(0,x), y0=Math.max(0,y);
          const x1=Math.min(width,x+w), y1=Math.min(height,y+h);
          for(let row=y0;row<y1;row++) frame.fill(shade,row*width+x0,row*width+x1);
        }
      }
    };
    self.onmessage=async (event)=>{
      const m=event.data;
      try {
        if(m?.type==='setup' && !trustedPort && m.port instanceof MessagePort){
          trustedPort=m.port;
          return;
        }
        if(!trustedPort)return;
        if(m?.type==='load' && !moduleGame){
          width=m.width;height=m.height;shadeCount=m.shades;
          if(!Number.isInteger(width)||width<1||width>512||!Number.isInteger(height)||height<1||height>512||!Number.isInteger(shadeCount)||shadeCount<1||shadeCount>256)throw Error('Bad hardware');
          storedSave=typeof m.save==='string'?m.save:null;
          frame=new Uint8Array(width*height);
          const url=URL.createObjectURL(new Blob([m.code],{type:'text/javascript'}));
          try {
            const imported=await import(url);
            if(!imported?.default||typeof imported.default.update!=='function'||typeof imported.default.draw!=='function')throw Error('Missing game lifecycle');
            moduleGame=imported.default;
            if(typeof moduleGame.init==='function')moduleGame.init(api);
            send({type:'ready'});
          }finally{ URL.revokeObjectURL(url); }
        } else if(m?.type==='tick' && moduleGame){
          down=new Set(m.down);pressed=new Set(m.pressed);
          moduleGame.update(api,Math.max(0,Math.min(0.05,m.dt)));
          moduleGame.draw(api);
          const data=frame;
          send({type:'frame',pixels:data},[data.buffer]);
          frame=new Uint8Array(width*height);
        }
      } catch(e){send({type:'error',reason:String(e?.message||e).slice(0,120)});}
    };
  }
  window.addEventListener('message',(event)=>{
    if(event.source!==parent)return;
    const m=event.data;
    if(!m||m.scope!=='slopboy-v1'||typeof m.key!=='string'||m.key.length>90)return;
    if(m.type==='load' && key===null && phase==='idle'){
      if(typeof m.code!=='string'||m.code.length>MAX_CODE||!Number.isInteger(m.width)||!Number.isInteger(m.height)||m.width*m.height>MAX_PIXELS)return;
      key=m.key;
      phase='starting';
      try {
        const source='('+workerMain.toString()+')()';
        const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
        worker=new Worker(url,{type:'classic'});
        URL.revokeObjectURL(url);
        worker.onerror=()=>fail('Worker failed');
        channel=new MessageChannel();
        channel.port1.onmessage=(e)=>{
          const data=e.data;
          if(data?.type==='ready'){
            if(phase!=='starting')return;
            clearTimeout(watchdog);phase='running';post('ready');return;
          }
          if(data?.type==='error'){fail(data.reason||'Game crashed');return;}
          if(data?.type==='save'){
            if(phase!=='running' && phase!=='starting')return;
            if((data.value===null||typeof data.value==='string') &&
              (data.value===null||new TextEncoder().encode(data.value).byteLength<=MAX_SAVE)){
              pendingSave=data.value;
              if(!saveTimer)saveTimer=setTimeout(()=>{
                saveTimer=0;
                const value=pendingSave;pendingSave=undefined;
                if(value!==undefined)post('save',{value});
              },300);
            }
            return;
          }
          if(data?.type!=='frame'||!busy||phase!=='running')return;
          const pixels=data.pixels;
          if(!(pixels instanceof Uint8Array)||pixels.length!==m.width*m.height){fail('Malformed frame');return;}
          for(let i=0;i<pixels.length;i++)if(pixels[i]>=m.shades){fail('Palette overflow');return;}
          clearTimeout(watchdog);busy=false;
          post('frame',{pixels});
        };
        const snapshot=(m.save===null||typeof m.save==='string'&&new TextEncoder().encode(m.save).byteLength<=MAX_SAVE)?m.save:null;
        worker.postMessage({type:'setup',port:channel.port2},[channel.port2]);
        worker.postMessage({type:'load',code:m.code,width:m.width,height:m.height,shades:m.shades,save:snapshot});
        watchdog=setTimeout(()=>fail('Game initialization timeout'),MAX_FRAME_MS);
      }catch(e){fail(e?.message||e);}
    } else if(m.type==='tick' && key===m.key && worker && !busy && phase==='running'){
      const ok=(a)=>Array.isArray(a)&&a.length<=VALID_BUTTONS.length&&a.every(k=>VALID_BUTTONS.includes(k));
      if(!ok(m.down)||!ok(m.pressed)||typeof m.dt!=='number'||!Number.isFinite(m.dt))return;
      busy=true;
      clearTimeout(watchdog);
      watchdog=setTimeout(()=>fail('Game frame timeout'),MAX_FRAME_MS);
      worker.postMessage({type:'tick',down:m.down,pressed:m.pressed,dt:m.dt});
    } else if(m.type==='stop' && key===m.key){
      if(phase==='stopped')return;
      phase='stopped';
      if(pendingSave!==undefined)post('save',{value:pendingSave});
      pendingSave=undefined;
      if(worker)worker.terminate();worker=null;
      if(channel){channel.port1.close();channel=null;}
      clearTimeout(watchdog);clearTimeout(saveTimer);busy=false;
    }
  });
  parent.postMessage({scope:'slopboy-v1',type:'boot'},'*');
})();
</script></body></html>`;