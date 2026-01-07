/**
 * Worker para procesamiento de Seam Carving (Liquid Rescale) Dual Axis
 */

self.onmessage = function(e) {
    const { pixels, width, height, targetW, targetH, index } = e.data;
    let data = new Uint8ClampedArray(pixels);
    let curW = width;
    let curH = height;

    // Convertir a escala de grises para cálculos de energía
    function getLuminance(p, w, h) {
        const lum = new Uint8Array(w * h);
        for (let i = 0; i < w * h; i++) {
            const idx = i * 4;
            lum[i] = (p[idx] * 0.299 + p[idx + 1] * 0.587 + p[idx + 2] * 0.114);
        }
        return lum;
    }

    // --- REDUCCIÓN DE ANCHO (Vertical Seams) ---
    while (curW > targetW) {
        const lum = getLuminance(data, curW, curH);
        const cost = new Float32Array(curW * curH);
        
        // Primera fila
        for (let x = 0; x < curW; x++) cost[x] = 0;

        // DP para Forward Energy
        for (let y = 1; y < curH; y++) {
            for (let x = 0; x < curW; x++) {
                const idx = y * curW + x;
                const prevRow = (y - 1) * curW;
                
                const L = x > 0 ? lum[idx - 1] : lum[idx];
                const R = x < curW - 1 ? lum[idx + 1] : lum[idx];
                const U = lum[prevRow + x];

                const cV = Math.abs(R - L);
                const cL = cV + Math.abs(U - L);
                const cR = cV + Math.abs(U - R);

                let minCost = cost[prevRow + x] + cV;
                if (x > 0) minCost = Math.min(minCost, cost[prevRow + x - 1] + cL);
                if (x < curW - 1) minCost = Math.min(minCost, cost[prevRow + x + 1] + cR);
                
                cost[idx] = minCost;
            }
        }

        // Encontrar el camino mínimo (Backtrack)
        const seam = new Int32Array(curH);
        let minX = 0;
        for (let x = 1; x < curW; x++) {
            if (cost[(curH - 1) * curW + x] < cost[(curH - 1) * curW + minX]) minX = x;
        }
        seam[curH - 1] = minX;

        for (let y = curH - 2; y >= 0; y--) {
            const x = seam[y + 1];
            const prevRow = y * curW;
            const L = x > 0 ? lum[y * curW + x - 1] : lum[y * curW + x];
            const R = x < curW - 1 ? lum[y * curW + x + 1] : lum[y * curW + x];
            const U = y > 0 ? lum[(y-1) * curW + x] : lum[y * curW + x];
            const cV = Math.abs(R - L);
            const cL = cV + Math.abs(U - L);
            const cR = cV + Math.abs(U - R);

            let bestX = x;
            let minC = cost[prevRow + x] + cV;
            if (x > 0 && cost[prevRow + x - 1] + cL < minC) { minC = cost[prevRow + x - 1] + cL; bestX = x - 1; }
            if (x < curW - 1 && cost[prevRow + x + 1] + cR < minC) { bestX = x + 1; }
            seam[y] = bestX;
        }

        // Eliminar el seam vertical
        const newData = new Uint8ClampedArray((curW - 1) * curH * 4);
        for (let y = 0; y < curH; y++) {
            const sX = seam[y], oR = y * curW * 4, nR = y * (curW - 1) * 4;
            newData.set(data.subarray(oR, oR + sX * 4), nR);
            newData.set(data.subarray(oR + (sX + 1) * 4, oR + curW * 4), nR + sX * 4);
        }
        data = newData; curW--;
    }

    // --- REDUCCIÓN DE ALTO (Horizontal Seams) ---
    while (curH > targetH) {
        const lum = getLuminance(data, curW, curH);
        const cost = new Float32Array(curW * curH);

        for (let y = 0; y < curH; y++) cost[y * curW] = 0;

        for (let x = 1; x < curW; x++) {
            for (let y = 0; y < curH; y++) {
                const idx = y * curW + x;
                const U = y > 0 ? lum[(y - 1) * curW + x] : lum[idx];
                const D = y < curH - 1 ? lum[(y + 1) * curW + x] : lum[idx];
                const L = lum[y * curW + x - 1];

                const cH = Math.abs(U - D);
                const cU = cH + Math.abs(L - U);
                const cD = cH + Math.abs(L - D);

                let minCost = cost[y * curW + x - 1] + cH;
                if (y > 0) minCost = Math.min(minCost, cost[(y - 1) * curW + x - 1] + cU);
                if (y < curH - 1) minCost = Math.min(minCost, cost[(y + 1) * curW + x - 1] + cD);
                cost[idx] = minCost;
            }
        }

        const seam = new Int32Array(curW);
        let minY = 0;
        for (let y = 1; y < curH; y++) if (cost[y * curW + curW - 1] < cost[minY * curW + curW - 1]) minY = y;
        seam[curW - 1] = minY;

        for (let x = curW - 2; x >= 0; x--) {
            const y = seam[x + 1];
            const U = y > 0 ? lum[(y - 1) * curW + x] : lum[y * curW + x];
            const D = y < curH - 1 ? lum[(y + 1) * curW + x] : lum[y * curW + x];
            const L = lum[y * curW + x];
            const cH = Math.abs(U - D);
            const cU = cH + Math.abs(L - U);
            const cD = cH + Math.abs(L - D);

            let bestY = y;
            let minC = cost[y * curW + x] + cH;
            if (y > 0 && cost[(y - 1) * curW + x] + cU < minC) { minC = cost[(y - 1) * curW + x] + cU; bestY = y - 1; }
            if (y < curH - 1 && cost[(y + 1) * curW + x] + cD < minC) { bestY = y + 1; }
            seam[x] = bestY;
        }

        // Eliminar el seam horizontal
        const newData = new Uint8ClampedArray(curW * (curH - 1) * 4);
        for (let x = 0; x < curW; x++) {
            const sY = seam[x];
            for (let y = 0, nY = 0; y < curH; y++) {
                if (y === sY) continue;
                const oI = (y * curW + x) * 4, nI = (nY * curW + x) * 4;
                newData[nI] = data[oI]; newData[nI+1] = data[oI+1];
                newData[nI+2] = data[oI+2]; newData[nI+3] = data[oI+3];
                nY++;
            }
        }
        data = newData; curH--;
    }

    // Enviar resultado de vuelta
    self.postMessage({ 
        processedPixels: data.buffer, 
        finalW: curW, 
        finalH: curH, 
        index: index 
    }, [data.buffer]);
};