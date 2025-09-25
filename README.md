# OpenTelemetry Collector on ECS with CDK

> ⚠️ **WORK IN PROGRESS** ⚠️  
> 
> This project is currently under active development. Expect:
> - Configuration changes and breaking updates
> - Incomplete documentation  
> - Potential bugs and issues
> - Testing and validation in progress
> 
> **DO NOT use in production environments without thorough testing!**

## Overview

This project converts a Kubernetes Helm chart deployment of OpenTelemetry Collector to run on Amazon ECS using AWS CDK, with data flowing to Honeycomb.

## Project Status

- ✅ Basic ECS deployment with CDK
- ✅ Honeycomb integration configured
- ✅ Load balancer with both gRPC (4317) and HTTP (4318) endpoints
- ✅ Test scripts for validation
- ✅ Multiple Honeycomb datasets (traces, metrics, operations)
- 🚧 OTEL configuration stability in progress
- 🚧 Production hardening ongoing
- ❌ Production readiness - NOT READY

## Quick Start

**Prerequisites:** Node.js, AWS CLI configured, Honeycomb API key

```bash
# Install dependencies
pnpm install

# Configure Honeycomb API key in lib/otel-ecs-cdk-project-stack.ts
honeycombApiKey: 'your-api-key-here'
honeycombDataset: 'your-dataset-name'

# Deploy (at your own risk!)
npm run build
npx cdk deploy

# Test the deployment
./scripts/test-all.sh
```

## Documentation

- [Deployment Guide](README-DEPLOYMENT.md) - Detailed setup instructions
- [Honeycomb Setup](HONEYCOMB-SETUP.md) - API key and configuration
- [Testing Guide](TESTING.md) - Test scripts and validation

## Available Commands

### CDK Commands
* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `npx cdk deploy`  deploy this stack to your default AWS account/region
* `npx cdk diff`    compare deployed stack with current state
* `npx cdk synth`   emits the synthesized CloudFormation template

### Test Scripts
* `./scripts/test-all.sh [ALB-DNS]` - Run comprehensive tests
* `./scripts/test-otlp-traces.sh <ALB-DNS>` - Test trace endpoint
* `./scripts/test-otlp-metrics.sh <ALB-DNS>` - Test metrics endpoint
* `./scripts/check-deployment.sh` - Check ECS deployment status

## Contributing

This is a work-in-progress project. Issues and PRs welcome, but expect rapid changes and potential conflicts.

## Disclaimer

This project is experimental and not suitable for production use. Use at your own risk.