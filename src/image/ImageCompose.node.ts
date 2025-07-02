/*****************************************************************************************
 * ImageCompose v3
 * ----------------------------------------------------------------------------
 * 🔹 Detecta a maior área branca contínua (ou a extremidade indicada) do BG
 * 🔹 Redimensiona o produto proporcionalmente para ocupar o máximo da área útil
 * 🔹 Centraliza/alinhas (horizontal e vertical) conforme parâmetros
 * 🔹 Rotaciona automaticamente 90 ° se a peça for muito vertical (aspect ratio > 1.8)
 * 🔹 Respeita padding configurável
 * ----------------------------------------------------------------------------
 * Dependências: sharp (npm i sharp)
 *****************************************************************************************/

import {
  IExecuteFunctions,
  INodeType,
  INodeTypeDescription,
  INodeExecutionData,
  IBinaryData,
  NodeConnectionType,
} from 'n8n-workflow';
import sharp from 'sharp';


export class ImageCompose implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Image Compose',
    name: 'imageCompose',
    icon: 'file:image-compose.svg',
    group: ['transform'],
    version: 3,
    description:
      'Cola uma imagem de produto na maior área branca do BG, redimensionando e alinhando automaticamente',
    defaults: {
      name: 'ImageCompose',
      color: '#FF8800',
    },
    inputs: ['main'] as NodeConnectionType[],
    outputs: ['main'] as NodeConnectionType[],
    properties: [
      /* ---------------------- campos básicos ---------------------- */
      {
        displayName: 'Base Image Property',
        name: 'baseImageProperty',
        type: 'string',
        default: 'bg',
        description: 'Nome da propriedade binária com a imagem de fundo',
      },
      {
        displayName: 'Product Image Property',
        name: 'overlayImageProperty',
        type: 'string',
        default: 'product',
        description: 'Nome da propriedade binária com a imagem do produto',
      },
      {
        displayName: 'Output Property',
        name: 'outputPropertyName',
        type: 'string',
        default: 'composed',
        description: 'Nome da propriedade binária de saída',
      },
      /* ---------------------- parâmetros de layout ---------------------- */
      {
        displayName: 'Padding (px)',
        name: 'padding',
        type: 'number',
        default: 10,
        description: 'Margem interna mínima entre produto e área útil',
      },
      {
        displayName: 'Modo de Colagem',
        name: 'composeMode',
        type: 'options',
        options: [
          { name: 'Detectar Área Branca', value: 'detectWhite' },  // atual
          { name: 'Preencher Fundo Inteiro', value: 'fillAll' },   // novo modo!
        ],
        default: 'detectWhite',
        description: 'Se "Preencher Fundo Inteiro", o produto será encaixado no BG todo (ideal para BG branco puro).',
      },
      {
        displayName: 'Alinhamento Horizontal',
        name: 'alignHorizontal',
        type: 'options',
        options: [
          { name: 'Início', value: 'start' },
          { name: 'Centro', value: 'center' },
          { name: 'Fim', value: 'end' },
        ],
        default: 'center',
      },
      {
        displayName: 'Alinhamento Vertical (preferência da área branca)',
        name: 'alignVertical',
        type: 'options',
        options: [
          { name: 'Topo', value: 'top' },
          { name: 'Centro', value: 'center' },
          { name: 'Base', value: 'bottom' },
        ],
        default: 'bottom',
        description:
          'Onde procurar primeiro a maior área branca (se não existir, o node usa a maior área global)',
      },
      /* ---------------------- rotação ---------------------- */
      {
        displayName: 'Rotação Manual (°)',
        name: 'tiltAngle',
        type: 'number',
        default: 0,
        description:
          'Força uma rotação específica. Deixe 0 para rotação automática apenas se a peça for muito vertical.',
      },
    ],
  };

  /*****************************************************************************************
   * EXECUTE
   *****************************************************************************************/
  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
      // Função auxiliar: acha o melhor ângulo que preenche mais, testando todos de 5 em 5 graus
    async function findBestFitRotation(
      prodBufOrig: Buffer,
      bgW: number,
      bgH: number,
      padding: number
    ): Promise<{ angle: number; width: number; height: number; buf: Buffer }> {
      let bestArea = 0;
      let best: any = {};

      for (let angle = -90; angle <= 90; angle += 5) {
        // 1️⃣ gira e trim para cortar transparência
        const rotatedBuf = angle !== 0
          ? await sharp(prodBufOrig)
              .rotate(angle, { background: { r: 255, g: 255, b: 255, alpha: 0 } })
              .trim()   // remove bordas transparentes
              .toBuffer()
          : prodBufOrig;

        // 2️⃣ metadata já trimado
        const meta = await sharp(rotatedBuf).metadata();

        const availW = bgW - 2 * padding;
        const availH = bgH - 2 * padding;
        if (availW <= 0 || availH <= 0) continue;

        // 3️⃣ scale proporcional
        const scale = Math.min(availW / meta.width!, availH / meta.height!);
        const w = Math.round(meta.width! * scale);
        const h = Math.round(meta.height! * scale);

        // 4️⃣ seleciona o maior produto possível
        if (w * h > bestArea) {
          bestArea = w * h;
          best = { angle, width: w, height: h, buf: rotatedBuf };
        }
      }

      return best;
    }


    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    for (let i = 0; i < items.length; i++) {
      // --- Parâmetros do node
      const baseProp = this.getNodeParameter('baseImageProperty', i) as string;
      const prodProp = this.getNodeParameter('overlayImageProperty', i) as string;
      const outProp = this.getNodeParameter('outputPropertyName', i) as string;
      const padding = this.getNodeParameter('padding', i) as number;
      const hAlign = this.getNodeParameter('alignHorizontal', i) as string;
      const vPref = this.getNodeParameter('alignVertical', i) as string;
      const tiltAngleParam = this.getNodeParameter('tiltAngle', i) as number;
      const composeMode = this.getNodeParameter('composeMode', i) as string;

      // --- Buffers de imagem
      const item = items[i];
      const bgBuf = Buffer.from((item.binary?.[baseProp] as IBinaryData).data, 'base64');
      const prodBufOrig = Buffer.from((item.binary?.[prodProp] as IBinaryData).data, 'base64');

      // --- Metadados BG
      const bgMeta = await sharp(bgBuf).metadata();
      const bgW = bgMeta.width!;
      const bgH = bgMeta.height!;

      // --- Defina Rect e whiteRect só uma vez
      type Rect = { x: number; y: number; w: number; h: number };
      let whiteRect: Rect;

      if (composeMode === 'fillAll') {
        // 1. Novo modo: ocupa o BG inteiro (com padding) e busca rotação ótima
        whiteRect = { x: 0, y: 0, w: bgW, h: bgH };

        // Busca melhor ângulo e resize
        const best = await findBestFitRotation(prodBufOrig, bgW, bgH, padding);
        const prodResized = await sharp(best.buf).resize(best.width, best.height).toBuffer();
        let posX = whiteRect.x + Math.floor((whiteRect.w - best.width) / 2);
        let posY = whiteRect.y + Math.floor((whiteRect.h - best.height) / 2);

        // --- Composição
        const finalBuf = await sharp(bgBuf)
          .composite([{ input: prodResized, top: posY, left: posX }])
          .png()
          .toBuffer();

        returnData.push({
          json: item.json,
          binary: {
            ...item.binary,
            [outProp]: {
              data: finalBuf.toString('base64'),
              mimeType: 'image/png',
              fileName: `composed-${Date.now()}.png`,
            },
          },
        });
      } else {
        // 2. Modo "tradicional": detecta área branca inferior/topo
        const WHITE = 240;
        const { data, info } = await sharp(bgBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        let minY = bgH, maxY = -1;
        for (let y = 0; y < bgH; y++) {
          for (let x = 0; x < bgW; x++) {
            const idx = (y * bgW + x) * info.channels;
            const r = data[idx], g = data[idx + 1], b = data[idx + 2];
            if (!(r > WHITE && g > WHITE && b > WHITE)) {
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }
        if (maxY === -1) {
          minY = 0;
          maxY = -1;
        }

        const rects: Rect[] = [];
        if (minY > 0) rects.push({ x: 0, y: 0, w: bgW, h: minY });
        if (maxY < bgH - 1) rects.push({ x: 0, y: maxY + 1, w: bgW, h: bgH - maxY - 1 });
        if (rects.length === 0) rects.push({ x: 0, y: 0, w: bgW, h: bgH });

        if (vPref === 'top') whiteRect = rects.find(r => r.y === 0)!;
        else if (vPref === 'bottom') whiteRect = rects.find(r => r.y !== 0)!;
        else whiteRect = rects.sort((a, b) => b.w * b.h - a.w * a.h)[0];

        // Produto (rotação manual/vertical)
        const prodMeta = await sharp(prodBufOrig).metadata();
        const prodAspect = prodMeta.height! / prodMeta.width!;
        let tiltAngle = 0;
        if (tiltAngleParam !== 0) tiltAngle = tiltAngleParam;
        else if (prodAspect > 1.8) tiltAngle = -90;
        let prodBuf = prodBufOrig;
        if (tiltAngle !== 0) {
          prodBuf = await sharp(prodBufOrig)
            .rotate(tiltAngle, { background: { r: 255, g: 255, b: 255, alpha: 1 } })
            .toBuffer();
        }
        const prodRotMeta = await sharp(prodBuf).metadata();
        const prodW = prodRotMeta.width!;
        const prodH = prodRotMeta.height!;
        const availW = whiteRect.w - 2 * padding;
        const availH = whiteRect.h - 2 * padding;
        if (availW <= 0 || availH <= 0) throw new Error('Área branca insuficiente para o produto.');
        const scale = Math.min(availW / prodW, availH / prodH);
        const newW = Math.round(prodW * scale);
        const newH = Math.round(prodH * scale);
        const prodResized = await sharp(prodBuf).resize(newW, newH).toBuffer();

        // Posicionamento conforme alinhamento
        let posX = whiteRect.x + padding;
        if (hAlign === 'center') posX = whiteRect.x + Math.floor((whiteRect.w - newW) / 2);
        else if (hAlign === 'end') posX = whiteRect.x + whiteRect.w - newW - padding;
        let posY = whiteRect.y + padding;
        if (vPref === 'center') posY = whiteRect.y + Math.floor((whiteRect.h - newH) / 2);
        else if (vPref === 'bottom') posY = whiteRect.y + whiteRect.h - newH - padding;

        const finalBuf = await sharp(bgBuf)
          .composite([{ input: prodResized, top: posY, left: posX }])
          .png()
          .toBuffer();

        returnData.push({
          json: item.json,
          binary: {
            ...item.binary,
            [outProp]: {
              data: finalBuf.toString('base64'),
              mimeType: 'image/png',
              fileName: `composed-${Date.now()}.png`,
            },
          },
        });
      }
    }

    return this.prepareOutputData(returnData);
  }


}