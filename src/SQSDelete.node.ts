import {
    IExecuteFunctions,
    INodeType,
    INodeTypeDescription,
    INodeExecutionData,
    NodeConnectionType,
} from 'n8n-workflow';
import {
    SQSClient,
    DeleteMessageCommand,
} from '@aws-sdk/client-sqs';

export class SQSDelete implements INodeType {
    description: INodeTypeDescription = {
        displayName: 'SQS Delete Message',
        name: 'sqsDelete',
        // icon: 'file:sqs.svg',
        group: ['output'],
        version: 1,
        description: 'Deletes a message from SQS queue',
        defaults: {
            name: 'SQS Delete Message',
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
        credentials: [
            {
                name: 'aws',
                required: true,
            },
        ],
        properties: [
            {
                displayName: 'Queue URL',
                name: 'queueUrl',
                type: 'string',
                default: '={{ $json.queueUrl }}',
                required: true,
                description: 'URL of the SQS queue',
            },
            {
                displayName: 'Receipt Handle',
                name: 'receiptHandle',
                type: 'string',
                default: '={{ $json.receiptHandle }}',
                required: true,
                description: 'Receipt handle of the message to delete',
            },
        ],
    };

    async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
        const items = this.getInputData();
        const returnData: INodeExecutionData[] = [];

        const credentials = await this.getCredentials('aws');

        const sqsClient = new SQSClient({
            region: credentials.region as string,
            credentials: {
                accessKeyId: credentials.accessKeyId as string,
                secretAccessKey: credentials.secretAccessKey as string,
            },
        });

        for (let i = 0; i < items.length; i++) {
            const queueUrl = this.getNodeParameter('queueUrl', i) as string;
            const receiptHandle = this.getNodeParameter('receiptHandle', i) as string;

            try {
                const deleteCommand = new DeleteMessageCommand({
                    QueueUrl: queueUrl,
                    ReceiptHandle: receiptHandle,
                });

                await sqsClient.send(deleteCommand);
                
                const item = items[i];
                returnData.push({
                    ...item,
                    json: {
                        ...item.json,
                        deleted: true,
                        success: true,
                    },
                });
                
                this.logger.info(`Successfully deleted message from queue: ${queueUrl}`);
            } catch (error) {
                this.logger.error(`Error deleting SQS message: ${(error as Error).message}`);
                const item = items[i];
                returnData.push({
                    ...item,
                    json: {
                        ...item.json,
                        deleted: false,
                        success: false,
                        error: (error as Error).message,
                    },
                });
            }
        }

        return [returnData];
    }
}
