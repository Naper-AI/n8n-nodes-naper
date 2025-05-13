# SQS Trigger Node Testing Environment

This repository contains a Docker Compose setup for testing the SQS Trigger node with n8n and LocalStack.

## Prerequisites

- Docker
- Docker Compose

## Setup Instructions

1. Start the services:
```bash
docker-compose up -d
```

2. Wait for both services to be fully started (this may take a minute or two)

3. Access n8n at http://localhost:5678

## Creating a Test SQS Queue

You can create a test SQS queue using the AWS CLI with LocalStack:

```bash
# Install AWS CLI if you haven't already
# Then configure it to use LocalStack
aws configure set aws_access_key_id test
aws configure set aws_secret_access_key test
aws configure set region us-east-1
aws configure set endpoint-url http://localhost:4566

# Create a test queue
aws --endpoint-url=http://localhost:4566 sqs create-queue --queue-name test-queue

# Get the queue URL
aws --endpoint-url=http://localhost:4566 sqs get-queue-url --queue-name test-queue
```

## Testing the SQS Trigger Node

1. In n8n, create a new workflow
2. Add the SQS Trigger node
3. Configure the node with these credentials:
   - AWS Access Key ID: test
   - AWS Secret Access Key: test
   - Region: us-east-1
   - Queue URL: http://localhost:4566/000000000000/test-queue

4. Send a test message to the queue:
```bash
aws --endpoint-url=http://localhost:4566 sqs send-message \
    --queue-url http://localhost:4566/000000000000/test-queue \
    --message-body '{"test": "message"}'
```

## Stopping the Services

To stop the services:
```bash
docker-compose down
```

To stop and remove all data:
```bash
docker-compose down -v
``` 