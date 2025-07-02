/*****************************************************************************************
 * ImageCompose v3
 * ----------------------------------------------------------------------------
 * 🔹 Detects the largest continuous white area (or the indicated edge) of the BG
 * 🔹 Resizes the product proportionally to occupy the maximum useful area
 * 🔹 Centers/aligns (horizontal and vertical) according to parameters
 * 🔹 Automatically rotates 90° if the piece is too vertical (aspect ratio > 1.8)
 * 🔹 Respects configurable padding
 * ----------------------------------------------------------------------------
 * Dependencies: sharp (npm i sharp)
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
            'Pastes a product image onto the largest white area of the BG, automatically resizing and aligning',
        defaults: {
            name: 'ImageCompose',
            color: '#FF8800',
        },
        inputs: ['main'] as NodeConnectionType[],
        outputs: ['main'] as NodeConnectionType[],
        properties: [
            /* ---------------------- basic fields ---------------------- */
            {
                displayName: 'Base Image Property',
                name: 'baseImageProperty',
                type: 'string',
                default: 'bg',
                description:
                    'Name of the binary property with the background image',
            },
            {
                displayName: 'Product Image Property',
                name: 'overlayImageProperty',
                type: 'string',
                default: 'product',
                description:
                    'Name of the binary property with the product image',
            },
            {
                displayName: 'Output Property',
                name: 'outputPropertyName',
                type: 'string',
                default: 'composed',
                description: 'Name of the output binary property',
            },
            /* ---------------------- layout parameters ---------------------- */
            {
                displayName: 'Padding (px)',
                name: 'padding',
                type: 'number',
                default: 10,
                description:
                    'Minimum internal margin between product and useful area',
            },
            {
                displayName: 'Compose Mode',
                name: 'composeMode',
                type: 'options',
                options: [
                    { name: 'Detect White Area', value: 'detectWhite' }, // current
                    { name: 'Fill Entire Background', value: 'fillAll' }, // new mode!
                ],
                default: 'detectWhite',
                description:
                    'If "Fill Entire Background", the product will be fitted to the entire BG (ideal for pure white BG).',
            },
            {
                displayName: 'Horizontal Alignment',
                name: 'alignHorizontal',
                type: 'options',
                options: [
                    { name: 'Start', value: 'start' },
                    { name: 'Center', value: 'center' },
                    { name: 'End', value: 'end' },
                ],
                default: 'center',
            },
            {
                displayName: 'Vertical Alignment (white area preference)',
                name: 'alignVertical',
                type: 'options',
                options: [
                    { name: 'Top', value: 'top' },
                    { name: 'Center', value: 'center' },
                    { name: 'Bottom', value: 'bottom' },
                ],
                default: 'bottom',
                description:
                    "Where to look first for the largest white area (if it doesn't exist, the node uses the largest global area)",
            },
            /* ---------------------- rotation ---------------------- */
            {
                displayName: 'Manual Rotation (°)',
                name: 'tiltAngle',
                type: 'number',
                default: 0,
                description:
                    'Forces a specific rotation. Leave 0 for automatic rotation only if the piece is too vertical.',
            },
        ],
    };

    /*****************************************************************************************
     * EXECUTE
     *****************************************************************************************/
    async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
        // Helper function: finds the best angle that fills the most, testing all angles in 5-degree increments
        async function findBestFitRotation(
            prodBufOrig: Buffer,
            bgW: number,
            bgH: number,
            padding: number,
        ): Promise<{
            angle: number;
            width: number;
            height: number;
            buf: Buffer;
        }> {
            let bestArea = 0;
            let best: {
                angle?: number;
                width?: number;
                height?: number;
                buf?: Buffer;
            } = {};

            for (let angle = -90; angle <= 90; angle += 5) {
                // 1️⃣ rotate and trim to cut transparency
                const rotatedBuf =
                    angle !== 0
                        ? await sharp(prodBufOrig)
                              .rotate(angle, {
                                  background: {
                                      r: 255,
                                      g: 255,
                                      b: 255,
                                      alpha: 0,
                                  },
                              })
                              .trim() // remove transparent borders
                              .toBuffer()
                        : prodBufOrig;

                // 2️⃣ metadata already trimmed
                const meta = await sharp(rotatedBuf).metadata();

                const availW = bgW - 2 * padding;
                const availH = bgH - 2 * padding;
                if (availW <= 0 || availH <= 0) continue;

                // 3️⃣ proportional scale
                const scale = Math.min(
                    availW / meta.width!,
                    availH / meta.height!,
                );
                const w = Math.round(meta.width! * scale);
                const h = Math.round(meta.height! * scale);

                // 4️⃣ select the largest possible product
                if (w * h > bestArea) {
                    bestArea = w * h;
                    best = { angle, width: w, height: h, buf: rotatedBuf };
                }
            }

            return best as {
                angle: number;
                width: number;
                height: number;
                buf: Buffer;
            };
        }

        const items = this.getInputData();
        const returnData: INodeExecutionData[] = [];

        for (let i = 0; i < items.length; i++) {
            // --- Node parameters
            const baseProp = this.getNodeParameter(
                'baseImageProperty',
                i,
            ) as string;
            const prodProp = this.getNodeParameter(
                'overlayImageProperty',
                i,
            ) as string;
            const outProp = this.getNodeParameter(
                'outputPropertyName',
                i,
            ) as string;
            const padding = this.getNodeParameter('padding', i) as number;
            const hAlign = this.getNodeParameter(
                'alignHorizontal',
                i,
            ) as string;
            const vPref = this.getNodeParameter('alignVertical', i) as string;
            const tiltAngleParam = this.getNodeParameter(
                'tiltAngle',
                i,
            ) as number;
            const composeMode = this.getNodeParameter(
                'composeMode',
                i,
            ) as string;

            // --- Image buffers
            const item = items[i];
            const bgBuf = Buffer.from(
                (item.binary?.[baseProp] as IBinaryData).data,
                'base64',
            );
            const prodBufOrig = Buffer.from(
                (item.binary?.[prodProp] as IBinaryData).data,
                'base64',
            );

            // --- BG metadata
            const bgMeta = await sharp(bgBuf).metadata();
            const bgW = bgMeta.width!;
            const bgH = bgMeta.height!;

            // --- Define Rect and whiteRect only once
            type Rect = { x: number; y: number; w: number; h: number };
            let whiteRect: Rect;

            if (composeMode === 'fillAll') {
                // 1. New mode: occupies the entire BG (with padding) and searches for optimal rotation
                whiteRect = { x: 0, y: 0, w: bgW, h: bgH };

                // Search for best angle and resize
                const best = await findBestFitRotation(
                    prodBufOrig,
                    bgW,
                    bgH,
                    padding,
                );
                const prodResized = await sharp(best.buf)
                    .resize(best.width, best.height)
                    .toBuffer();
                const posX =
                    whiteRect.x + Math.floor((whiteRect.w - best.width) / 2);
                const posY =
                    whiteRect.y + Math.floor((whiteRect.h - best.height) / 2);

                // --- Composition
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
                // 2. "Traditional" mode: detects white area at bottom/top
                const WHITE = 240;
                const { data, info } = await sharp(bgBuf)
                    .ensureAlpha()
                    .raw()
                    .toBuffer({ resolveWithObject: true });
                let minY = bgH,
                    maxY = -1;
                for (let y = 0; y < bgH; y++) {
                    for (let x = 0; x < bgW; x++) {
                        const idx = (y * bgW + x) * info.channels;
                        const r = data[idx],
                            g = data[idx + 1],
                            b = data[idx + 2];
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
                if (maxY < bgH - 1)
                    rects.push({
                        x: 0,
                        y: maxY + 1,
                        w: bgW,
                        h: bgH - maxY - 1,
                    });
                if (rects.length === 0)
                    rects.push({ x: 0, y: 0, w: bgW, h: bgH });

                if (vPref === 'top') whiteRect = rects.find(r => r.y === 0)!;
                else if (vPref === 'bottom')
                    whiteRect = rects.find(r => r.y !== 0)!;
                else whiteRect = rects.sort((a, b) => b.w * b.h - a.w * a.h)[0];

                // Product (manual/vertical rotation)
                const prodMeta = await sharp(prodBufOrig).metadata();
                const prodAspect = prodMeta.height! / prodMeta.width!;
                let tiltAngle = 0;
                if (tiltAngleParam !== 0) tiltAngle = tiltAngleParam;
                else if (prodAspect > 1.8) tiltAngle = -90;
                let prodBuf = prodBufOrig;
                if (tiltAngle !== 0) {
                    prodBuf = await sharp(prodBufOrig)
                        .rotate(tiltAngle, {
                            background: { r: 255, g: 255, b: 255, alpha: 1 },
                        })
                        .toBuffer();
                }
                const prodRotMeta = await sharp(prodBuf).metadata();
                const prodW = prodRotMeta.width!;
                const prodH = prodRotMeta.height!;
                const availW = whiteRect.w - 2 * padding;
                const availH = whiteRect.h - 2 * padding;
                if (availW <= 0 || availH <= 0)
                    throw new Error('Insufficient white area for the product.');
                const scale = Math.min(availW / prodW, availH / prodH);
                const newW = Math.round(prodW * scale);
                const newH = Math.round(prodH * scale);
                const prodResized = await sharp(prodBuf)
                    .resize(newW, newH)
                    .toBuffer();

                // Positioning according to alignment
                let posX = whiteRect.x + padding;
                if (hAlign === 'center')
                    posX = whiteRect.x + Math.floor((whiteRect.w - newW) / 2);
                else if (hAlign === 'end')
                    posX = whiteRect.x + whiteRect.w - newW - padding;
                let posY = whiteRect.y + padding;
                if (vPref === 'center')
                    posY = whiteRect.y + Math.floor((whiteRect.h - newH) / 2);
                else if (vPref === 'bottom')
                    posY = whiteRect.y + whiteRect.h - newH - padding;

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
