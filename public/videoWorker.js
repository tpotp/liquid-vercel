/**
 * LIQUID REACTOR PRO - MOBILE OPTIMIZED
 * GPU LUMINANCE + CPU DP (SEAM CARVING)
 * RESULTADO MATEMÁTICO IDÉNTICO
 */

let gl, program, texture, vao;
let uR, attrP;

// Buffers reutilizables (CRÍTICO para mobile)
let readBuf, lumBuf, costBuf, seamBuf;
let readCap = 0, lumCap = 0, costCap = 0, seamCap = 0;

function ensure(buf, cap, size, ctor) {
    if (!buf || cap < size) return [new ctor(size), size];
    return [buf, cap];
}

function initGL(w, h) {
    const canvas = new OffscreenCanvas(w, h);
    gl = canvas.getContext("webgl2");
    if (!gl) return false;

    const vs = `#version 300 es
    in vec2 p; void main(){gl_Position=vec4(p,0.,1.);}`;

    const fs = `#version 300 es
    precision highp float;
    uniform sampler2D t;
    uniform vec2 r;
    out vec4 c;
    const vec3 k=vec3(.299,.587,.114);
    void main(){
        float l=dot(texture(t,gl_FragCoord.xy/r).rgb,k);
        c=vec4(l,0.,0.,1.);
    }`;

    const sh = (t,s)=>{const x=gl.createShader(t);gl.shaderSource(x,s);gl.compileShader(x);return x;};

    program = gl.createProgram();
    gl.attachShader(program, sh(gl.VERTEX_SHADER,vs));
    gl.attachShader(program, sh(gl.FRAGMENT_SHADER,fs));
    gl.linkProgram(program);
    gl.useProgram(program);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);

    vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    attrP = gl.getAttribLocation(program,"p");
    gl.enableVertexAttribArray(attrP);
    gl.vertexAttribPointer(attrP,2,gl.FLOAT,false,0,0);

    texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);

    uR = gl.getUniformLocation(program,"r");
    return true;
}

function getLumGPU(w,h,pixels){
    if(!gl && !initGL(w,h)) return null;

    gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    gl.uniform2f(uR,w,h);
    gl.drawArrays(gl.TRIANGLE_STRIP,0,4);

    const need = w*h*4;
    [readBuf, readCap] = ensure(readBuf, readCap, need, Uint8Array);
    gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,readBuf.subarray(0,need));

    const lumSize = w*h;
    [lumBuf, lumCap] = ensure(lumBuf, lumCap, lumSize, Uint8Array);

    // extracción R sin multiplicaciones
    for(let i=0,j=0;i<lumSize;i++,j+=4) lumBuf[i]=readBuf[j];
    return lumBuf;
}

self.onmessage = e=>{
    const {pixels,width,height,targetW,targetH,index} = e.data;
    let data = new Uint8ClampedArray(pixels);
    let curW = width, curH = height;

    const isMobile = self.navigator?.userAgent?.includes("Android") || false;
    const BATCH = isMobile ? 2 : 1;

    /* ========= REDUCCIÓN ANCHO ========= */
    while(curW > targetW){
        let lum = null;

        for(let b=0;b<BATCH && curW>targetW;b++){
            if(!lum) lum = getLumGPU(curW,curH,data);

            const area = curW*curH;
            [costBuf, costCap] = ensure(costBuf,costCap,area,Int32Array);
            costBuf.fill(0,0,area);

            const w1 = curW-1;

            for(let y=1;y<curH;y++){
                const r=y*curW, p=r-curW;

                { // x=0
                    const i=r,R=lum[i+1],L=lum[i],U=lum[p];
                    const d=R-L, cV=(d^(d>>31))-(d>>31);
                    let m=costBuf[p]+cV;
                    const du=U-R, m1=costBuf[p+1]+cV+((du^(du>>31))-(du>>31));
                    costBuf[i]=m<m1?m:m1;
                }

                for(let x=1;x<w1;x++){
                    const i=r+x,L=lum[i-1],R=lum[i+1],U=lum[p+x];
                    const d=R-L, cV=(d^(d>>31))-(d>>31);
                    let m=costBuf[p+x]+cV;

                    const dL=U-L,dR=U-R;
                    const m1=costBuf[p+x-1]+cV+((dL^(dL>>31))-(dL>>31));
                    const m2=costBuf[p+x+1]+cV+((dR^(dR>>31))-(dR>>31));
                    m=m<m1?m:m1;
                    costBuf[i]=m<m2?m:m2;
                }

                { // x=last
                    const i=r+w1,L=lum[i-1],R=lum[i],U=lum[p+w1];
                    const d=R-L,cV=(d^(d>>31))-(d>>31);
                    let m=costBuf[p+w1]+cV;
                    const dL=U-L,m1=costBuf[p+w1-1]+cV+((dL^(dL>>31))-(dL>>31));
                    costBuf[i]=m<m1?m:m1;
                }
            }

            [seamBuf,seamCap]=ensure(seamBuf,seamCap,curH,Int32Array);
            let minX=0,minC=costBuf[(curH-1)*curW];
            for(let x=1;x<curW;x++){
                const c=costBuf[(curH-1)*curW+x];
                if(c<minC){minC=c;minX=x;}
            }
            seamBuf[curH-1]=minX;

            for(let y=curH-2;y>=0;y--){
                const x=seamBuf[y+1], r=y*curW;
                let bx=x, mc=costBuf[r+x];
                if(x>0 && costBuf[r+x-1]<mc){mc=costBuf[r+x-1];bx=x-1;}
                if(x<w1 && costBuf[r+x+1]<mc) bx=x+1;
                seamBuf[y]=bx;
            }

            const next=new Uint8ClampedArray((curW-1)*curH*4);
            for(let y=0;y<curH;y++){
                const sx=seamBuf[y], o=y*curW*4, n=y*(curW-1)*4;
                next.set(data.subarray(o,o+sx*4),n);
                next.set(data.subarray(o+(sx+1)*4,o+curW*4),n+sx*4);
            }
            data=next;
            curW--;
            lum=null;
        }
    }

    /* ========= REDUCCIÓN ALTO ========= */
    while(curH > targetH){
        let lum = getLumGPU(curW,curH,data);

        const area = curW*curH;
        [costBuf,costCap]=ensure(costBuf,costCap,area,Int32Array);
        costBuf.fill(0,0,area);

        const h1=curH-1;

        for(let x=1;x<curW;x++){
            { // y=0
                const i=x,U=lum[i],D=lum[i+curW],L=lum[i-1];
                const d=D-U,cH=(d^(d>>31))-(d>>31);
                let m=costBuf[i-1]+cH;
                const dL=L-D,m1=costBuf[i-1+curW]+cH+((dL^(dL>>31))-(dL>>31));
                costBuf[i]=m<m1?m:m1;
            }

            for(let y=1;y<h1;y++){
                const i=y*curW+x,U=lum[i-curW],D=lum[i+curW],L=lum[i-1];
                const d=D-U,cH=(d^(d>>31))-(d>>31);
                let m=costBuf[i-1]+cH;

                const dU=L-U,dD=L-D;
                const m1=costBuf[i-1-curW]+cH+((dU^(dU>>31))-(dU>>31));
                const m2=costBuf[i-1+curW]+cH+((dD^(dD>>31))-(dD>>31));
                m=m<m1?m:m1;
                costBuf[i]=m<m2?m:m2;
            }

            { // y=last
                const i=h1*curW+x,U=lum[i-curW],D=lum[i],L=lum[i-1];
                const d=D-U,cH=(d^(d>>31))-(d>>31);
                let m=costBuf[i-1]+cH;
                const dU=L-U,m1=costBuf[i-1-curW]+cH+((dU^(dU>>31))-(dU>>31));
                costBuf[i]=m<m1?m:m1;
            }
        }

        [seamBuf,seamCap]=ensure(seamBuf,seamCap,curW,Int32Array);
        let minY=0,minC=costBuf[curW-1];
        for(let y=1;y<curH;y++){
            const c=costBuf[y*curW+curW-1];
            if(c<minC){minC=c;minY=y;}
        }
        seamBuf[curW-1]=minY;

        for(let x=curW-2;x>=0;x--){
            const y=seamBuf[x+1], i=y*curW+x;
            let by=y,mc=costBuf[i];
            if(y>0 && costBuf[i-curW]<mc){mc=costBuf[i-curW];by=y-1;}
            if(y<h1 && costBuf[i+curW]<mc) by=y+1;
            seamBuf[x]=by;
        }

        const next=new Uint8ClampedArray(curW*(curH-1)*4);
        for(let x=0;x<curW;x++){
            const sy=seamBuf[x];
            let ny=0;
            for(let y=0;y<curH;y++){
                if(y===sy) continue;
                const o=(y*curW+x)*4,n=(ny*curW+x)*4;
                next[n]=data[o];
                next[n+1]=data[o+1];
                next[n+2]=data[o+2];
                next[n+3]=data[o+3];
                ny++;
            }
        }
        data=next;
        curH--;
    }

    self.postMessage({processedPixels:data.buffer,finalW:curW,finalH:curH,index},[data.buffer]);
};
