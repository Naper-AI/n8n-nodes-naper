# @naper/n8n-nodes-naper

A collection of enterprise-grade [n8n](https://n8n.io) nodes created by [Naper.ai](https://naper.ai) to power advanced automation workflows.

## Overview

This package provides a set of custom nodes for n8n, designed for robust integrations and data processing in enterprise environments.

## Included Nodes

- **SQS Trigger**: Listens to AWS SQS queues and triggers workflows when new messages arrive. Supports advanced concurrency and resource controls.
- **SQS Delete Message**: Deletes a message from an SQS queue after processing.
- **SQS Reject Message**: Changes the visibility of a message in SQS, allowing it to be reprocessed or returned to the queue.
- **Liquid Template**: Processes [Liquid](https://shopify.github.io/liquid/) templates with input or custom data.
- **Mustache Template**: Processes [Mustache](https://mustache.github.io/) templates with input or custom data.

## Installation

```bash
npm install @naper/n8n-nodes-naper
```

## Usage

1. Add the package to your n8n instance (see [n8n community nodes documentation](https://docs.n8n.io/integrations/community-nodes/installation/)).
2. Restart n8n.
3. The new nodes will appear in the n8n editor under their respective names:
   - SQS Trigger
   - SQS Delete Message
   - SQS Reject Message
   - Liquid Template
   - Mustache Template

## License

This project is licensed under the [MIT License](./LICENSE).

---

Made with ❤️ by [Naper.ai](https://naper.ai) 