# OpenTelemetry ECS CDK Project

A complete AWS CDK project that deploys OpenTelemetry collector on ECS Fargate with a sample instrumented application, sending traces, metrics, and logs to Honeycomb.

## Architecture

- **ECS Fargate Service** with 2 containers:
  - **AWS OTEL Collector** (sidecar pattern)
  - **Sample Node.js App** (with OpenTelemetry auto-instrumentation)
- **Application Load Balancer** for external access
- **CloudWatch Logs** for application and collector logs
- **Traces sent to**: Honeycomb (auto-named by service)
- **Metrics sent to**: Honeycomb (`otel-collector-metrics` and `collector-operations` datasets)
- **Logs sent to**: Honeycomb (`otel-ecs-logs` dataset) with trace correlation

## Prerequisites

- AWS CLI configured with appropriate permissions
- Node.js 18+ and npm
- Docker running locally
- CDK CLI: `npm install -g aws-cdk`

## Quick Start

### 1. Configure Honeycomb API Key

**IMPORTANT**: Update your Honeycomb API key in the CDK stack:

```typescript
// File: lib/otel-ecs-cdk-project-stack.ts
// Line ~85: Update the HONEYCOMB_API_KEY value
environment: {
  HONEYCOMB_ENDPOINT: 'https://api.honeycomb.io',
  HONEYCOMB_API_KEY: 'YOUR_HONEYCOMB_API_KEY_HERE', // ← Update this!
},
```

### 2. Deploy

```bash
# Install dependencies
npm install

# Deploy the stack
./scripts/deploy.sh

# Or manually:
npx cdk deploy --require-approval never
```

### 3. Test the Application

After deployment, test the endpoints using the ALB DNS name from the CDK output:

```bash
# Get the ALB DNS name from CDK output, then test:
curl http://YOUR-ALB-DNS-NAME/
curl http://YOUR-ALB-DNS-NAME/health
curl http://YOUR-ALB-DNS-NAME/api/users
curl http://YOUR-ALB-DNS-NAME/api/error
```

### 4. View Telemetry in Honeycomb

The application sends telemetry to Honeycomb across multiple datasets:

- **Traces**: Auto-named by service (`otel-ecs-sample-app`)
- **Metrics**: Two datasets
  - `otel-collector-metrics`: Application metrics
  - `collector-operations`: Collector operational metrics
- **Logs**: `otel-ecs-logs` dataset with full trace correlation
  - Logs are automatically linked to their parent traces
  - Filter by `service.name` to see application-specific logs

You can also view logs in the [CloudWatch Console](https://console.aws.amazon.com/cloudwatch/home)

## Configuration

### OpenTelemetry Collector Config

The collector configuration is in `config/otel-config.yaml` and includes:

- **Receivers**: OTLP (gRPC:4317, HTTP:4318), Prometheus (8888)
- **Exporters**: 
  - Honeycomb traces (no dataset header - auto-named by service)
  - Honeycomb metrics (`otel-collector-metrics` and `collector-operations` datasets)
  - Honeycomb logs (`otel-ecs-logs` dataset)
  - Logging (debug output)
- **Processors**: Memory limiter, Resource (deployment.environment only), Batch
- **Key Feature**: Resource processor does NOT overwrite application `service.name` attributes

### Sample Application

The Node.js sample app (`sample-app/`) demonstrates:

- Auto-instrumentation with OpenTelemetry
- HTTP requests automatically traced
- Custom error simulation endpoint
- Traces sent to the OTEL collector sidecar

## Cleanup

```bash
# Remove all AWS resources
./scripts/cleanup.sh

# Or manually:
npx cdk destroy --force
```

## Project Structure

```
├── lib/                          # CDK stack definition
├── sample-app/                   # Sample Node.js application
├── config/otel-config.yaml      # OpenTelemetry collector config
├── scripts/                     # Deployment scripts
│   ├── deploy.sh               # Deploy the stack
│   └── cleanup.sh              # Clean up resources
└── README.md                   # This file
```

## Key Features

- ✅ **Production-ready**: Uses AWS Distro for OpenTelemetry (ADOT)
- ✅ **Sidecar pattern**: Collector runs alongside application
- ✅ **Auto-instrumentation**: Zero-code tracing for Node.js
- ✅ **Honeycomb Integration**: Sends traces, metrics, and logs to Honeycomb
- ✅ **Trace-Log Correlation**: Logs automatically linked to traces via trace_id and span_id
- ✅ **Service Name Preservation**: Application service names preserved through the collector
- ✅ **Scalable**: ECS Fargate with ALB and auto-scaling ready
- ✅ **Observable**: Comprehensive logging and metrics

## Troubleshooting

### Common Issues

1. **Honeycomb API Key**: Make sure to update the API key in `lib/otel-ecs-cdk-project-stack.ts` (line ~87)
2. **Config Changes Not Applied**: After updating `config/otel-config.yaml`, you must redeploy the stack for changes to take effect. The config is stored in SSM Parameter Store and loaded by ECS tasks at startup.
3. **Service Name Changes**: To see updated service names in Honeycomb, force a new ECS deployment:
   ```bash
   aws ecs update-service --cluster otel-xray-cluster --service otel-xray-service --force-new-deployment --region us-east-1
   ```
4. **AWS Permissions**: Ensure your AWS CLI has ECS, CloudWatch, and SSM permissions
5. **Docker**: Make sure Docker is running for CDK asset building
6. **502/504 Errors**: Wait a few minutes after deployment for services to become healthy
7. **SSM Parameter Size**: The OTel config must be under 4KB. If needed, remove comments or use multiple parameters.

### Viewing Logs

```bash
# Application logs
aws logs tail /ecs/aws-otel-emitter --follow

# Collector logs
aws logs tail /ecs/ecs-aws-otel-sidecar-collector --follow
```

## Support

This project demonstrates AWS best practices for OpenTelemetry deployment on ECS. For production use, consider:

- Using AWS Secrets Manager for API keys
- Implementing proper monitoring and alerting
- Adding custom metrics and traces to your applications
- Configuring appropriate resource limits and auto-scaling
