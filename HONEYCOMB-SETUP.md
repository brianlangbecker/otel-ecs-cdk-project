# Honeycomb Setup Guide

## Prerequisites

1. **Honeycomb Account**: Sign up at [honeycomb.io](https://honeycomb.io)
2. **API Key**: Get your API key from [Account Settings](https://ui.honeycomb.io/account)

## Configuration Steps

### 1. Update CDK Stack

Replace the placeholder values in `lib/otel-ecs-cdk-project-stack.ts`:

```typescript
const otelCollector = new OtelCollectorConstruct(this, 'OtelCollector', {
  cluster,
  vpc,
  configParameter: otelConfig.configParameter,
  honeycombEndpoint: 'https://api.honeycomb.io',
  honeycombApiKey: 'hcaik_01234567890abcdef...', // Your actual API key
  honeycombDataset: 'my-application' // Your dataset name
});
```

### 2. Environment Variables

The collector will use these environment variables:
- `HONEYCOMB_ENDPOINT`: Honeycomb API endpoint 
- `HONEYCOMB_API_KEY`: Your team's API key
- `HONEYCOMB_DATASET`: Default dataset name

### 3. Datasets

The configuration creates two datasets:
- **Traces**: `${HONEYCOMB_DATASET}` (e.g., "my-application")
- **Metrics**: `${HONEYCOMB_DATASET}-metrics` (e.g., "my-application-metrics")

## Testing the Integration

### 1. Send Test Traces

Once deployed, send test traces to your collector:

```bash
# Get the ALB endpoint from CDK output
export OTEL_ENDPOINT="http://your-alb-dns-name:4317"

# Send a test trace (using otel CLI or your application)
curl -X POST $OTEL_ENDPOINT/v1/traces \
  -H "Content-Type: application/json" \
  -d '{"resourceSpans":[...]}'  # Your trace data
```

### 2. Check Honeycomb

1. Go to [Honeycomb UI](https://ui.honeycomb.io)
2. Select your dataset
3. Look for traces from `service.name: "otel-collector-ecs"`
4. Query for recent data to verify ingestion

### 3. Common Queries

**Recent Traces:**
```
| where service.name = "otel-collector-ecs"
| limit 100
```

**Error Analysis:**
```
| where status.code != "OK" 
| group by status.message
| count
```

## Security Best Practices

### Use AWS Secrets Manager

For production, store your API key in AWS Secrets Manager:

```typescript
// In your CDK stack
const honeycombSecret = new secretsmanager.Secret(this, 'HoneycombSecret', {
  secretName: 'honeycomb-api-key',
  description: 'Honeycomb API key for OTEL collector'
});

// Update container to use secret
secrets: {
  HONEYCOMB_API_KEY: ecs.Secret.fromSecretsManager(honeycombSecret)
}
```

### Environment-Specific Configuration

Use different API keys for different environments:

```typescript
const environment = this.node.tryGetContext('environment') || 'dev';
const apiKeyParameterName = `/honeycomb/${environment}/api-key`;

const apiKeyParameter = ssm.StringParameter.fromStringParameterName(
  this, 'ApiKey', apiKeyParameterName
);
```

## Troubleshooting

### 1. No Data in Honeycomb

Check the collector logs:
```bash
aws logs filter-log-events \
  --log-group-name /aws/ecs/otel-collector \
  --filter-pattern "ERROR"
```

### 2. Authentication Issues

Verify your API key:
```bash
curl -H "x-honeycomb-team: YOUR_API_KEY" \
  https://api.honeycomb.io/1/auth
```

### 3. Network Connectivity

Ensure the ECS service can reach Honeycomb:
- Check security groups allow outbound HTTPS (443)
- Verify NAT Gateway is configured for private subnets
- Test DNS resolution to `api.honeycomb.io`

## Advanced Configuration

### Custom Headers

Add custom headers in the OTEL config:

```yaml
exporters:
  otlphttp:
    endpoint: "${HONEYCOMB_ENDPOINT}"
    headers:
      "x-honeycomb-team": "${HONEYCOMB_API_KEY}"
      "x-honeycomb-dataset": "${HONEYCOMB_DATASET}"
      "user-agent": "otel-collector-ecs/1.0"
```

### Sampling Configuration

Add sampling to reduce data volume:

```yaml
processors:
  probabilistic_sampler:
    sampling_percentage: 10  # Sample 10% of traces
```

### Batch Configuration

Optimize batching for your workload:

```yaml
processors:
  batch:
    timeout: 1s
    send_batch_size: 1024
    send_batch_max_size: 2048
```