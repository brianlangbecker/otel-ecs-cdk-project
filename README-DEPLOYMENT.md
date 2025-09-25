# OpenTelemetry Collector ECS with AWS CDK - Honeycomb Integration

> ⚠️ **WORK IN PROGRESS** ⚠️  
> This project is currently under active development and may contain incomplete features, configuration issues, or breaking changes. Use at your own risk in production environments.

This project deploys an OpenTelemetry Collector to Amazon ECS using AWS CDK, configured to send telemetry data to Honeycomb. Converted from a Kubernetes Helm chart configuration.

## Project Structure

```
otel-ecs-cdk-project/
├── lib/
│   ├── otel-ecs-cdk-project-stack.ts    # Main stack definition
│   ├── constructs/
│   │   ├── otel-collector.ts             # ECS service construct
│   │   └── otel-config.ts                # SSM Parameter Store construct
├── config/
│   └── otel-config.yaml                  # OpenTelemetry configuration
├── scripts/
│   ├── test-otlp-traces.sh              # Test trace endpoint
│   ├── test-otlp-metrics.sh             # Test metrics endpoint
│   ├── check-deployment.sh              # Check ECS deployment
│   └── test-all.sh                      # Run all tests
├── bin/
│   └── otel-ecs-cdk-project.ts          # Application entry point
├── README-DEPLOYMENT.md
├── HONEYCOMB-SETUP.md
├── TESTING.md
├── package.json
└── cdk.json
```

## Configuration

### Honeycomb Configuration
Before deploying, you need to configure your Honeycomb credentials:

1. **Get your Honeycomb API key** from [Honeycomb Settings](https://ui.honeycomb.io/account)
2. **Update the CDK stack** in `lib/otel-ecs-cdk-project-stack.ts`:

```typescript
honeycombEndpoint: 'https://api.honeycomb.io',
honeycombApiKey: 'your-actual-honeycomb-api-key',
honeycombDataset: 'your-dataset-name'
```

### OpenTelemetry Configuration
The OTEL collector configuration in `config/otel-config.yaml` is pre-configured for Honeycomb with:

- **Traces**: Sent to main Honeycomb dataset
- **Metrics**: Sent to `otel-collector-metrics` dataset
- **Collector Operations**: Sent to `collector-operations` dataset
- **Debug logging**: Detailed verbosity for troubleshooting
- **Health checks**: Available on port 13133
- **Debug UI**: zPages on port 55679, pprof on port 1777

## Deployment Commands

### Prerequisites
```bash
# Install dependencies
pnpm install

# Configure AWS credentials
aws configure
```

### Deploy
```bash
# Bootstrap CDK (first time only)
npx cdk bootstrap

# Build the project
npm run build

# Preview changes (verify Honeycomb config)
npx cdk diff

# Deploy the stack
npx cdk deploy

# Clean up (when done)
npx cdk destroy
```

### Verify Honeycomb Integration
After deployment:
1. Check the ALB endpoint is receiving telemetry
2. Verify data appears in your Honeycomb dataset
3. Use Honeycomb's query interface to explore traces and metrics

## Architecture Components

### Infrastructure
- **VPC**: 2 AZs with NAT Gateway
- **ECS Cluster**: Fargate cluster for container orchestration
- **Application Load Balancer**: Routes traffic to OTEL collectors
- **CloudWatch Logs**: Centralized logging

### OpenTelemetry Collector
- **Image**: `otel/opentelemetry-collector-contrib:latest`
- **Resources**: 1024 MB memory, 0.5 vCPU
- **Replicas**: 2 instances for high availability
- **Ports**: 
  - 4317 (OTLP gRPC) - **Exposed via ALB**
  - 4318 (OTLP HTTP) - **Exposed via ALB**
  - 8888 (Prometheus metrics)
  - 13133 (Health check)
  - 1777 (pprof profiling)
  - 55679 (zPages debug UI)

## Helm to ECS Mapping

| Helm Concept | ECS Equivalent | CDK Implementation |
|--------------|----------------|-------------------|
| `mode: deployment` | ECS Service | `FargateService` |
| `config` section | Parameter Store | `StringParameter` |
| `resources.limits` | Task definition | `memoryLimitMiB`, `cpu` |
| `ports` section | Container ports | `portMappings` |
| `service.type: LoadBalancer` | ALB | `ApplicationLoadBalancer` |

## Outputs

After deployment, the stack provides:
- **LoadBalancerDNS**: DNS name of the load balancer
- **OTLPGrpcEndpoint**: Full OTLP gRPC endpoint URL (port 4317)
- **OTLPHttpEndpoint**: Full OTLP HTTP endpoint URL (port 4318)

## Troubleshooting

### Check service status
```bash
aws ecs describe-services --cluster otel-cluster --services otel-collector
```

### View logs
```bash
aws logs describe-log-groups --log-group-name-prefix /aws/logs/
aws logs tail <log-group-name> --follow
```

### Update configuration
Update `config/otel-config.yaml` and redeploy:
```bash
npm run build
npx cdk deploy
```

### Test the deployment
Run the test scripts to verify everything works:
```bash
# Test everything
./scripts/test-all.sh

# Or test individual endpoints
./scripts/test-otlp-traces.sh <ALB-DNS>
./scripts/test-otlp-metrics.sh <ALB-DNS>
./scripts/check-deployment.sh
```

## Advanced Features

### Auto Scaling
Add to the collector construct:
```typescript
const scaling = otelCollector.service.autoScaleTaskCount({
  maxCapacity: 10,
  minCapacity: 2
});

scaling.scaleOnCpuUtilization('CpuScaling', {
  targetUtilizationPercent: 70
});
```

### Service Discovery
Enable AWS Cloud Map for service discovery:
```typescript
const namespace = new servicediscovery.PrivateDnsNamespace(this, 'Namespace', {
  name: 'otel.local',
  vpc
});

otelCollector.service.enableCloudMap({
  namespace,
  name: 'collector'
});
```