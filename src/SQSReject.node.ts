import {
    IExecuteFunctions,
    INodeType,
    INodeTypeDescription,
    INodeExecutionData,
    NodeConnectionType,
} from 'n8n-workflow';
import { SQSClient, ChangeMessageVisibilityCommand } from '@aws-sdk/client-sqs';

export class SQSReject implements INodeType {
    description: INodeTypeDescription = {
        displayName: 'SQS Reject Message',
        name: 'sqsReject',
        // icon: 'file:sqs.svg',
        group: ['output'],
        version: 1,
        description: 'Rejects a message and returns it to SQS queue',
        defaults: {
            name: 'SQS Reject Message',
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
                description: 'Receipt handle of the message to reject',
            },
            {
                displayName: 'Visibility Timeout',
                name: 'visibilityTimeout',
                type: 'number',
                default: 0,
                required: true,
                description:
                    'Set to 0 to make the message immediately available again',
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
            const receiptHandle = this.getNodeParameter(
                'receiptHandle',
                i,
            ) as string;
            const visibilityTimeout = this.getNodeParameter(
                'visibilityTimeout',
                i,
            ) as number;

            try {
                const changeVisibilityCommand =
                    new ChangeMessageVisibilityCommand({
                        QueueUrl: queueUrl,
                        ReceiptHandle: receiptHandle,
                        VisibilityTimeout: visibilityTimeout,
                    });

                await sqsClient.send(changeVisibilityCommand);

                const item = items[i];
                returnData.push({
                    ...item,
                    json: {
                        ...item.json,
                        rejected: true,
                        success: true,
                        returnedToQueue: visibilityTimeout === 0,
                    },
                });

                this.logger.info(
                    `Successfully rejected message to queue: ${queueUrl}`,
                );
            } catch (error) {
                this.logger.error(
                    `Error rejecting SQS message: ${(error as Error).message}`,
                );
                const item = items[i];
                returnData.push({
                    ...item,
                    json: {
                        ...item.json,
                        rejected: false,
                        success: false,
                        error: (error as Error).message,
                    },
                });
            }
        }

        return [returnData];
    }
}
