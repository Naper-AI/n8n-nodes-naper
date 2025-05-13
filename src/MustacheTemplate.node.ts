import {
    IExecuteFunctions,
    INodeType,
    INodeTypeDescription,
    INodeExecutionData,
    NodeConnectionType,
} from 'n8n-workflow';
import * as Mustache from 'mustache';

export class MustacheTemplate implements INodeType {
    description: INodeTypeDescription = {
        displayName: 'Mustache Template',
        name: 'mustacheTemplate',
        // icon: 'file:mustache.svg',
        group: ['transform'],
        version: 1,
        description: 'Processes a Mustache template with the provided data',
        defaults: {
            name: 'Mustache Template',
        },
        inputs: [
            {
                type: NodeConnectionType.Main,
            },
        ],
        outputs: [
            {
                type: NodeConnectionType.Main,
            },
        ],
        properties: [
            {
                displayName: 'Template',
                name: 'template',
                type: 'string',
                typeOptions: {
                    rows: 10,
                },
                default: '',
                placeholder: 'Hello {{name}}!',
                description: 'Mustache template to be rendered',
                required: true,
            },
            {
                displayName: 'Data Source',
                name: 'dataSource',
                type: 'options',
                options: [
                    {
                        name: 'Input Item',
                        value: 'inputItem',
                        description: 'Use the data from the input item',
                    },
                    {
                        name: 'Custom Data',
                        value: 'customData',
                        description: 'Provide custom data as JSON',
                    },
                ],
                default: 'inputItem',
                description: 'Source of the data to be used in the template',
            },
            {
                displayName: 'Custom Data',
                name: 'customData',
                type: 'json',
                default: '{}',
                description: 'JSON data to use for template variables',
                displayOptions: {
                    show: {
                        dataSource: ['customData'],
                    },
                },
            },
            {
                displayName: 'Output Key',
                name: 'outputKey',
                type: 'string',
                default: 'renderedTemplate',
                description:
                    'Key to store the rendered template under in the output',
                required: true,
            },
            {
                displayName: 'Keep Input Data',
                name: 'keepInputData',
                type: 'boolean',
                default: true,
                description:
                    'Whether to keep the input data and add the rendered template or only return the rendered template',
            },
        ],
    };

    async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
        const items = this.getInputData();
        const returnData: INodeExecutionData[] = [];

        for (let i = 0; i < items.length; i++) {
            try {
                const template = this.getNodeParameter('template', i) as string;
                const dataSource = this.getNodeParameter(
                    'dataSource',
                    i,
                ) as string;
                const outputKey = this.getNodeParameter(
                    'outputKey',
                    i,
                ) as string;
                const keepInputData = this.getNodeParameter(
                    'keepInputData',
                    i,
                ) as boolean;

                let templateData: object;
                if (dataSource === 'inputItem') {
                    templateData = items[i].json;
                } else {
                    templateData = JSON.parse(
                        this.getNodeParameter('customData', i) as string,
                    );
                }

                // Render the Mustache template
                const renderedTemplate = Mustache.render(
                    template,
                    templateData,
                );

                let outputData: INodeExecutionData;
                if (keepInputData) {
                    outputData = {
                        ...items[i],
                        json: {
                            ...items[i].json,
                            [outputKey]: renderedTemplate,
                        },
                    };
                } else {
                    outputData = {
                        json: {
                            [outputKey]: renderedTemplate,
                        },
                    };
                }

                returnData.push(outputData);
                this.logger.info('Successfully rendered Mustache template');
            } catch (error) {
                this.logger.error(
                    `Error rendering Mustache template: ${(error as Error).message}`,
                );

                returnData.push({
                    ...items[i],
                    json: {
                        ...items[i].json,
                        error: (error as Error).message,
                        success: false,
                    },
                });
            }
        }

        return [returnData];
    }
}
