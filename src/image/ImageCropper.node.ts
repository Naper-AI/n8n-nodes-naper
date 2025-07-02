import {
    IExecuteFunctions,
    INodeType,
    INodeTypeDescription,
    INodeExecutionData,
    IBinaryData,
    NodeConnectionType,
} from 'n8n-workflow';
import sharp from 'sharp';

export class ImageCropper implements INodeType {
    description: INodeTypeDescription = {
        displayName: 'Image Cropper & Zoom',
        name: 'imageCropper',
        icon: 'file:image-cropper.svg',
        group: ['imagetransform'],
        version: 1,
        description:
            'Crops varying white spaces and zooms by resizing to original size',
        defaults: {
            name: 'ImageCropper',
            color: '#00AAFF',
        },
        inputs: ['main'] as NodeConnectionType[],
        outputs: ['main'] as NodeConnectionType[],
        properties: [
            {
                displayName: 'Binary Property',
                name: 'binaryPropertyName',
                type: 'string',
                default: 'data',
                description:
                    'The name of the input binary property that contains the image',
            },
            {
                displayName: 'Output Property',
                name: 'outputPropertyName',
                type: 'string',
                default: 'cropped',
                description:
                    'Name of the output binary property with the processed image',
            },
            {
                displayName: 'Resize Option',
                name: 'resizeOption',
                type: 'options',
                default: 'none',
                description: 'How to resize after cropping',
                options: [
                    { name: 'None', value: 'none' },
                    { name: 'Ignore Aspect Ratio', value: 'ignore' },
                    { name: 'Maximum Area', value: 'max' },
                    { name: 'Minimum Area', value: 'min' },
                    { name: 'Only if Larger', value: 'only_larger' },
                    { name: 'Only if Smaller', value: 'only_smaller' },
                ],
            },
            {
                displayName: 'Target Width',
                name: 'targetWidth',
                type: 'number',
                default: 500,
                description: 'Desired width for resizing',
            },
            {
                displayName: 'Target Height',
                name: 'targetHeight',
                type: 'number',
                default: 500,
                description: 'Desired height for resizing',
            },
        ],
    };

    async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
        const items = this.getInputData();
        const returnData: INodeExecutionData[] = [];

        for (let i = 0; i < items.length; i++) {
            const binaryProp = this.getNodeParameter(
                'binaryPropertyName',
                i,
            ) as string;
            const outputProp = this.getNodeParameter(
                'outputPropertyName',
                i,
            ) as string;
            const resizeOption = this.getNodeParameter(
                'resizeOption',
                i,
            ) as string;
            const targetWidth = this.getNodeParameter(
                'targetWidth',
                i,
            ) as number;
            const targetHeight = this.getNodeParameter(
                'targetHeight',
                i,
            ) as number;

            const item = items[i];

            if (!item.binary?.[binaryProp]) {
                returnData.push(item);
                continue;
            }

            const orig = item.binary[binaryProp] as IBinaryData;
            const buf = Buffer.from(orig.data, 'base64');

            // 1. Remove white spaces using trim()
            const trimmed = await sharp(buf).trim().toBuffer();

            // 2. Define initial pipeline and metadata
            const image = sharp(trimmed);
            const meta = await image.metadata();
            let sharpPipeline = image;

            const { width, height } = meta;

            // 3. Apply resizing according to the selected option
            const shouldResizeLarger =
                width! > targetWidth || height! > targetHeight;
            const shouldResizeSmaller =
                width! < targetWidth || height! < targetHeight;

            const fitMap: Record<
                string,
                'contain' | 'cover' | 'fill' | undefined
            > = {
                max: 'contain',
                min: 'cover',
                ignore: 'fill',
            };

            if (
                resizeOption === 'ignore' ||
                resizeOption === 'max' ||
                resizeOption === 'min' ||
                (resizeOption === 'only_larger' && shouldResizeLarger) ||
                (resizeOption === 'only_smaller' && shouldResizeSmaller)
            ) {
                sharpPipeline = image.resize({
                    width: targetWidth,
                    height: targetHeight,
                    fit: fitMap[resizeOption] ?? 'inside',
                });
            }

            const final = await sharpPipeline.toBuffer();

            // 4. Prepare the output
            returnData.push({
                json: item.json,
                binary: {
                    ...item.binary,
                    [outputProp]: {
                        data: final.toString('base64'),
                        mimeType: orig.mimeType,
                        fileName: orig.fileName,
                    },
                },
            });
        }

        return this.prepareOutputData(returnData);
    }
}
