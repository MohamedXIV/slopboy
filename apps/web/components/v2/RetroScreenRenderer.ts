import {isScreenFxActive,type ScreenFxSettings} from './screen-fx-config';

/** Presentation-only WebGL1 pass. Source is a trusted, validated host framebuffer. */
const VERTEX_SHADER=[
  'attribute vec2 a_position;',
  'varying vec2 v_uv;',
  'void main(){v_uv=(a_position+1.0)*0.5;gl_Position=vec4(a_position,0.0,1.0);}'
].join('\n');
const FRAGMENT_SHADER=[
  'precision mediump float;',
  'varying vec2 v_uv;',
  'uniform sampler2D u_frame;',
  'uniform sampler2D u_previous;',
  'uniform vec2 u_logical;',
  'uniform float u_grid,u_glow,u_scan,u_ghost,u_curve,u_glass,u_noise,u_vignette,u_time;',
  'float random2(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
  'void main(){',
  '  vec2 centered=v_uv*2.0-1.0;',
  '  vec2 uv=(centered*(1.0+u_curve*0.12*dot(centered,centered))+1.0)*0.5;',
  '  if(uv.x<0.0||uv.y<0.0||uv.x>1.0||uv.y>1.0){gl_FragColor=vec4(0.015,0.024,0.022,1.0);return;}',
  '  vec2 pixel=1.0/u_logical;',
  '  vec2 uvNearest=(floor(uv*u_logical)+0.5)*pixel;',
  '  vec3 original=texture2D(u_frame,uvNearest).rgb;',
  '  vec3 previous=texture2D(u_previous,uvNearest).rgb;',
  '  vec3 color=mix(original,previous,u_ghost*0.50);',
  '  vec3 bloom=(texture2D(u_frame,uvNearest+vec2(pixel.x,0.0)).rgb',
  '    +texture2D(u_frame,uvNearest-vec2(pixel.x,0.0)).rgb',
  '    +texture2D(u_frame,uvNearest+vec2(0.0,pixel.y)).rgb',
  '    +texture2D(u_frame,uvNearest-vec2(0.0,pixel.y)).rgb)*0.25;',
  '  color+=bloom*u_glow*0.34;',
  '  vec2 cell=fract(uv*u_logical);',
  '  float edgeDist=min(min(cell.x,cell.y),min(1.0-cell.x,1.0-cell.y));',
  '  float gridLine=1.0-smoothstep(0.0,0.22,edgeDist);',
  '  color*=1.0-u_grid*0.29*gridLine;',
  '  float scanWave=0.5+0.5*cos(uv.y*u_logical.y*6.2831853);',
  '  color*=1.0-u_scan*0.24*scanWave;',
  '  float grain=random2(floor(uv*u_logical*1.8)+floor(u_time*7.0))-0.5;',
  '  color+=grain*u_noise*0.10;',
  '  float sheen=pow(max(0.0,1.0-abs(uv.x*0.83+uv.y*0.58-0.39)*2.8),3.0);',
  '  color+=vec3(0.68,0.86,0.78)*sheen*u_glass*0.12;',
  '  float vignette=smoothstep(0.18,1.20,dot(centered,centered));',
  '  color*=1.0-u_vignette*vignette*0.46;',
  '  gl_FragColor=vec4(clamp(color,0.0,1.0),1.0);',
  '}'
].join('\n');

function compile(gl:WebGLRenderingContext,type:number,source:string):WebGLShader{
  const shader=gl.createShader(type);
  if(!shader)throw Error('WebGL shader unavailable');
  gl.shaderSource(shader,source);gl.compileShader(shader);
  if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){
    const log=gl.getShaderInfoLog(shader);gl.deleteShader(shader);throw Error('Screen shader compile: '+log);
  }
  return shader;
}
function makeProgram(gl:WebGLRenderingContext):WebGLProgram{
  const vertex=compile(gl,gl.VERTEX_SHADER,VERTEX_SHADER);
  const fragment=compile(gl,gl.FRAGMENT_SHADER,FRAGMENT_SHADER);
  const program=gl.createProgram();
  if(!program)throw Error('Screen shader program unavailable');
  gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);
  gl.deleteShader(vertex);gl.deleteShader(fragment);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS)){
    const log=gl.getProgramInfoLog(program);gl.deleteProgram(program);throw Error('Screen shader link: '+log);
  }
  return program;
}
function texture(gl:WebGLRenderingContext):WebGLTexture{
  const tex=gl.createTexture();if(!tex)throw Error('Screen texture allocation failed');
  gl.bindTexture(gl.TEXTURE_2D,tex);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  return tex;
}
export class RetroScreenRenderer{
  private gl:WebGLRenderingContext|null=null;
  private program:WebGLProgram|null=null;
  private vertexBuffer:WebGLBuffer|null=null;
  private frameTexture:WebGLTexture|null=null;
  private previousTexture:WebGLTexture|null=null;
  private lastSource:HTMLCanvasElement|null=null;
  private lastSettings:ScreenFxSettings|null=null;
  private lastTime=0;
  private historyValid=false;
  private readonly previousCanvas=document.createElement('canvas');
  private readonly previousContext=this.previousCanvas.getContext('2d',{alpha:false});
  private dead=false;
  private readonly onLost=(event:Event)=>{event.preventDefault();this.gl=null;this.onAvailability(false);};
  private readonly onRestored=()=>{
    try{this.initialize();this.onAvailability(true);this.repaint();}
    catch{this.onAvailability(false);}
  };
  constructor(private readonly output:HTMLCanvasElement,private readonly onAvailability:(available:boolean)=>void){
    output.addEventListener('webglcontextlost',this.onLost);
    output.addEventListener('webglcontextrestored',this.onRestored);
    try{this.initialize();}catch{this.gl=null;}
  }
  get available(){return this.gl!==null;}
  private initialize(){
    if(this.dead) return;
    const gl=this.output.getContext('webgl',{
      alpha:false,antialias:false,depth:false,stencil:false,
      premultipliedAlpha:false,preserveDrawingBuffer:true,powerPreference:'low-power'
    });
    if(!gl)throw Error('WebGL unavailable for cosmetic presentation');
    this.gl=gl;
    this.program=makeProgram(gl);
    this.vertexBuffer=gl.createBuffer();
    if(!this.vertexBuffer)throw Error('Screen geometry unavailable');
    gl.bindBuffer(gl.ARRAY_BUFFER,this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
    this.frameTexture=texture(gl);
    this.previousTexture=texture(gl);
    gl.disable(gl.BLEND);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,1);
    this.historyValid=false;
    this.lastTime=0;
  }
  /** Called only on host-presented frames, never from inside an untrusted iframe. */
  present(source:HTMLCanvasElement,settings:ScreenFxSettings,force=false):boolean{
    this.lastSource=source;this.lastSettings=settings;
    const gl=this.gl;
    if(!gl||!this.program||!this.vertexBuffer||!this.frameTexture||!this.previousTexture||
       !isScreenFxActive(settings))return false;
    const now=performance.now();
    const interval=settings.refresh==='native'?0:1000/Number(settings.refresh);
    if(!force&&interval&&now-this.lastTime<interval)return false;
    this.lastTime=now;
    try{
      const rect=this.output.getBoundingClientRect();
      const dpr=Math.min(window.devicePixelRatio||1,2);
      const width=Math.max(1,Math.min(2048,Math.round(rect.width*dpr)));
      const height=Math.max(1,Math.min(2048,Math.round(rect.height*dpr)));
      if(this.output.width!==width||this.output.height!==height){
        this.output.width=width;this.output.height=height;
      }
      gl.viewport(0,0,width,height);
      gl.useProgram(this.program);
      gl.bindBuffer(gl.ARRAY_BUFFER,this.vertexBuffer);
      const position=gl.getAttribLocation(this.program,'a_position');
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
      if(this.previousCanvas.width!==source.width||this.previousCanvas.height!==source.height){
        this.previousCanvas.width=source.width;this.previousCanvas.height=source.height;this.historyValid=false;
      }
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.frameTexture);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);
      gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,this.previousTexture);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,
        this.historyValid?this.previousCanvas:source);
      const uniform=(name:string)=>gl.getUniformLocation(this.program!,name);
      gl.uniform1i(uniform('u_frame'),0);
      gl.uniform1i(uniform('u_previous'),1);
      gl.uniform2f(uniform('u_logical'),source.width,source.height);
      for(const [name,key] of [
        ['u_grid','pixelGrid'],['u_glow','glow'],['u_scan','scanlines'],
        ['u_ghost','ghosting'],['u_curve','curvature'],['u_glass','glass'],
        ['u_noise','noise'],['u_vignette','vignette']
      ] as const)gl.uniform1f(uniform(name),settings[key]/100);
      gl.uniform1f(uniform('u_time'),now/1000);
      gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
      this.previousContext?.drawImage(source,0,0);
      this.historyValid=true;
      return true;
    }catch{
      // Never obscure the real framebuffer when cosmetic GPU presentation fails.
      this.gl=null;this.onAvailability(false);
      return false;
    }
  }
  repaint(){
    if(this.lastSource&&this.lastSettings)this.present(this.lastSource,this.lastSettings,true);
  }
  dispose(){
    this.dead=true;
    this.output.removeEventListener('webglcontextlost',this.onLost);
    this.output.removeEventListener('webglcontextrestored',this.onRestored);
    const gl=this.gl;
    if(gl){
      if(this.frameTexture)gl.deleteTexture(this.frameTexture);
      if(this.previousTexture)gl.deleteTexture(this.previousTexture);
      if(this.vertexBuffer)gl.deleteBuffer(this.vertexBuffer);
      if(this.program)gl.deleteProgram(this.program);
    }
    this.gl=null;
  }
}
