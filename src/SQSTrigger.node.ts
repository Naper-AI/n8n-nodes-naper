import {
    ITriggerFunctions,
    INodeType,
    INodeTypeDescription,
    ITriggerResponse,
    IDataObject,
    NodeConnectionType,
    IExecuteResponsePromiseData,
    IRun,
} from 'n8n-workflow';
import { SQSClient, ReceiveMessageCommand } from '@aws-sdk/client-sqs';
import * as os from 'os';

export class SQSTrigger implements INodeType {
    description: INodeTypeDescription = {
        displayName: 'SQS Trigger',
        name: 'sqsTrigger',
        // icon: 'file:sqs.svg',
        group: ['trigger'],
        version: 1,
        subtitle: '={{$parameter["queueUrl"].split("/").pop()}}',
        description: 'Listens to SQS queue and triggers workflows',
        defaults: {
            name: 'SQS Trigger',
        },
        inputs: [],
        outputs: [
            {
                type: NodeConnectionType.Main,
                displayName: 'Output',
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
                default: '',
                required: true,
                description: 'URL of the SQS queue to listen to',
            },
            {
                displayName: 'Poll Interval',
                name: 'pollInterval',
                type: 'number',
                default: 10,
                description:
                    'Interval in seconds between checks for new messages',
            },
            {
                displayName: 'Wait Time',
                name: 'waitTimeSeconds',
                type: 'number',
                default: 20,
                description: 'Long polling wait time in seconds (0-20)',
            },
            {
                displayName: 'Max Number of Messages',
                name: 'maxMessages',
                type: 'number',
                default: 1,
                description:
                    'Maximum number of messages to process at once (1-10)',
            },
            {
                displayName: 'Visibility Timeout',
                name: 'visibilityTimeout',
                type: 'number',
                default: 30,
                description:
                    'Time in seconds that a message is hidden after being received before returning to the queue if not deleted',
            },
            {
                displayName: 'Concurrency Control',
                name: 'concurrencyControl',
                type: 'options',
                options: [
                    {
                        name: 'None',
                        value: 'none',
                        description:
                            'No concurrency limits (not recommended for production)',
                    },
                    {
                        name: 'Fixed Limit',
                        value: 'fixed',
                        description:
                            'Limit concurrent processing to a fixed number',
                    },
                    {
                        name: 'CPU Usage',
                        value: 'cpu',
                        description: 'Limit based on CPU usage percentage',
                    },
                    {
                        name: 'Memory Usage',
                        value: 'memory',
                        description: 'Limit based on memory usage percentage',
                    },
                ],
                default: 'fixed',
                description: 'Method to control concurrent message processing',
            },
            {
                displayName: 'Max Concurrent Processes',
                name: 'maxConcurrentProcesses',
                type: 'number',
                default: 5,
                description:
                    'Maximum number of messages to process simultaneously',
                displayOptions: {
                    show: {
                        concurrencyControl: ['fixed'],
                    },
                },
            },
            {
                displayName: 'Max CPU Usage %',
                name: 'maxCpuUsage',
                type: 'number',
                default: 80,
                description:
                    'Stop processing new messages when CPU usage exceeds this percentage',
                displayOptions: {
                    show: {
                        concurrencyControl: ['cpu'],
                    },
                },
            },
            {
                displayName: 'Max Memory Usage %',
                name: 'maxMemoryUsage',
                type: 'number',
                default: 80,
                description:
                    'Stop processing new messages when memory usage exceeds this percentage',
                displayOptions: {
                    show: {
                        concurrencyControl: ['memory'],
                    },
                },
            },
            {
                displayName: 'Resource Check Interval',
                name: 'resourceCheckInterval',
                type: 'number',
                default: 5,
                description: 'How often to check resource usage (seconds)',
                displayOptions: {
                    show: {
                        concurrencyControl: ['cpu', 'memory'],
                    },
                },
            },
        ],
    };

    async trigger(this: ITriggerFunctions): Promise<ITriggerResponse> {
        const credentials = await this.getCredentials('aws');

        const queueUrl = this.getNodeParameter('queueUrl') as string;
        const pollInterval = this.getNodeParameter('pollInterval') as number;
        const waitTimeSeconds = this.getNodeParameter(
            'waitTimeSeconds',
        ) as number;
        const maxMessages = this.getNodeParameter('maxMessages') as number;
        const visibilityTimeout = this.getNodeParameter(
            'visibilityTimeout',
        ) as number;
        const concurrencyControl = this.getNodeParameter(
            'concurrencyControl',
        ) as string;

        const maxConcurrentProcesses =
            concurrencyControl === 'fixed'
                ? (this.getNodeParameter('maxConcurrentProcesses') as number)
                : Infinity;
        const maxCpuUsage =
            concurrencyControl === 'cpu'
                ? (this.getNodeParameter('maxCpuUsage') as number)
                : Infinity;
        const maxMemoryUsage =
            concurrencyControl === 'memory'
                ? (this.getNodeParameter('maxMemoryUsage') as number)
                : Infinity;

        const resourceCheckInterval =
            concurrencyControl === 'cpu' || concurrencyControl === 'memory'
                ? (this.getNodeParameter('resourceCheckInterval') as number)
                : 5;

        let activeProcesses = 0;
        let lastResourceCheck = Date.now();
        let canProcessMore = true;

        const checkResourceUsage = async (): Promise<boolean> => {
            if (concurrencyControl === 'none') return true;

            if (concurrencyControl === 'fixed') {
                return activeProcesses < maxConcurrentProcesses;
            }

            if (Date.now() - lastResourceCheck > resourceCheckInterval * 1000) {
                lastResourceCheck = Date.now();

                if (concurrencyControl === 'cpu') {
                    const cpus = os.cpus();
                    let totalIdle = 0;
                    let totalTick = 0;

                    cpus.forEach(cpu => {
                        for (const type in cpu.times) {
                            totalTick +=
                                cpu.times[type as keyof typeof cpu.times];
                        }
                        totalIdle += cpu.times.idle;
                    });

                    const currentCpuUsage = 100 - (totalIdle / totalTick) * 100;
                    canProcessMore = currentCpuUsage < maxCpuUsage;

                    if (!canProcessMore) {
                        this.logger.info(
                            `CPU usage at ${currentCpuUsage.toFixed(2)}%, pausing message processing`,
                        );
                    }
                }

                if (concurrencyControl === 'memory') {
                    const totalMemory = os.totalmem();
                    const freeMemory = os.freemem();
                    const usedMemory = totalMemory - freeMemory;
                    const memoryUsagePercent = (usedMemory / totalMemory) * 100;

                    canProcessMore = memoryUsagePercent < maxMemoryUsage;

                    if (!canProcessMore) {
                        this.logger.info(
                            `Memory usage at ${memoryUsagePercent.toFixed(2)}%, pausing message processing`,
                        );
                    }
                }
            }

            return canProcessMore;
        };

        const sqsClient = new SQSClient({
            region: credentials.region as string,
            credentials: {
                accessKeyId: credentials.accessKeyId as string,
                secretAccessKey: credentials.secretAccessKey as string,
            },
        });

        let isRunning = true;
        let timeout: NodeJS.Timeout;

        const processMessages = async () => {
            if (!isRunning) return;

            try {
                if (!(await checkResourceUsage())) {
                    this.logger.debug(
                        'Resource limit reached, delaying message processing',
                    );
                    timeout = setTimeout(processMessages, pollInterval * 1000);
                    return;
                }

                const receiveCommand = new ReceiveMessageCommand({
                    QueueUrl: queueUrl,
                    MaxNumberOfMessages: maxMessages,
                    WaitTimeSeconds: waitTimeSeconds,
                    VisibilityTimeout: visibilityTimeout,
                    AttributeNames: ['All'],
                    MessageAttributeNames: ['All'],
                });

                const response = await sqsClient.send(receiveCommand);

                if (response.Messages && response.Messages.length > 0) {
                    this.logger.info(
                        `Received ${response.Messages.length} messages from SQS queue`,
                    );

                    activeProcesses += response.Messages.length;

                    for (const message of response.Messages) {
                        let body: IDataObject;
                        try {
                            body = JSON.parse(message.Body || '{}');
                        } catch (error) {
                            body = { body: message.Body };
                        }

                        const messageData = {
                            json: {
                                body,
                                queueUrl, // Add queue URL for use in other nodes
                                messageId: message.MessageId,
                                receiptHandle: message.ReceiptHandle,
                                attributes: message.Attributes || {},
                            },
                        };

                        const responsePromise =
                            this.helpers.createDeferredPromise<IExecuteResponsePromiseData>();
                        const donePromise =
                            this.helpers.createDeferredPromise<IRun>();
                        this.emit(
                            [[messageData]],
                            responsePromise,
                            donePromise,
                        );

                        donePromise.promise
                            .then(() => {
                                activeProcesses--;
                            })
                            .catch(error => {
                                activeProcesses--;
                                this.logger.error(
                                    'Error processing SQS message',
                                    { error },
                                );
                            });
                    }

                    // If we received messages, poll immediately for more
                    timeout = setTimeout(processMessages, 0);
                    return;
                }
            } catch (error: unknown) {
                const errorObj = error as Error;
                this.logger.error(`SQS polling error: ${errorObj.message}`, {
                    error,
                });
            }

            // No messages received or error occurred, wait for the poll interval
            timeout = setTimeout(processMessages, pollInterval * 1000);
        };

        await processMessages();

        async function closeFunction() {
            isRunning = false;
            if (timeout) {
                clearTimeout(timeout);
            }
        }

        return {
            closeFunction,
        };
    }
}
