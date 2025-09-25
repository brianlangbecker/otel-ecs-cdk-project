# Testing Guide

This guide covers testing your deployed OpenTelemetry Collector on ECS.

## Quick Start

After deployment, run the comprehensive test suite:

```bash
# Test everything automatically
./scripts/test-all.sh

# Or provide the ALB DNS manually
./scripts/test-all.sh your-alb-dns-name.elb.amazonaws.com
```

## Individual Tests

### 1. Check Deployment Health

```bash
./scripts/check-deployment.sh
```

**What it checks:**
- CloudFormation stack outputs
- ECS service status and running tasks
- Task health status
- ALB connectivity
- Recent logs

### 2. Test OTLP Traces

```bash
./scripts/test-otlp-traces.sh <ALB_DNS_NAME>
```

**What it sends:**
- Sample trace with span
- HTTP attributes (method, URL, status)
- Proper OTLP JSON format
- Unique trace and span IDs

**Expected response:** HTTP 200/202

### 3. Test OTLP Metrics

```bash
./scripts/test-otlp-metrics.sh <ALB_DNS_NAME>
```

**What it sends:**
- Counter metric (`http_requests_total`)
- Histogram metric (`http_request_duration`)
- Proper OTLP metrics format
- Service attributes

**Expected response:** HTTP 200/202

## Manual Testing

### Health Check Endpoint

```bash
curl http://your-alb-dns:13133/
```

Should return HTTP 200 with health status.

### Prometheus Metrics

```bash
curl http://your-alb-dns:8888/metrics
```

Should return Prometheus-formatted metrics from the collector itself.

### Raw OTLP Trace Example

```bash
ALB_DNS="your-alb-dns.elb.amazonaws.com"

curl -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "resourceSpans": [{
      "resource": {
        "attributes": [{
          "key": "service.name",
          "value": {"stringValue": "my-app"}
        }]
      },
      "scopeSpans": [{
        "spans": [{
          "traceId": "12345678901234567890123456789012",
          "spanId": "1234567890123456",
          "name": "test-span",
          "startTimeUnixNano": "'$(date +%s)'000000000",
          "endTimeUnixNano": "'$(($(date +%s) + 1))'000000000",
          "status": {"code": "STATUS_CODE_OK"}
        }]
      }]
    }]
  }' \
  "http://${ALB_DNS}:4318/v1/traces"
```

## Using OpenTelemetry CLI

Install the OTEL CLI tool for more advanced testing:

```bash
# Install otel-cli
go install github.com/equinix-labs/otel-cli@latest

# Send a trace
otel-cli exec \
  --endpoint "http://your-alb-dns:4317" \
  --service "test-service" \
  --name "test-operation" \
  -- echo "Hello World"
```

## Troubleshooting Tests

### Connection Refused
- Check ALB security groups allow traffic on ports 4317, 4318, 13133, 8888
- Verify ECS service is running with `./scripts/check-deployment.sh`
- Check target group health in AWS console

### HTTP 500 Errors
- Check collector logs: `aws logs tail /aws/ecs/otel-collector --follow`
- Verify Honeycomb API key is correct
- Check collector configuration in Parameter Store

### Data Not Appearing in Honeycomb
- Verify API key has write permissions
- Check dataset name matches configuration
- Look for error logs in CloudWatch
- Confirm Honeycomb endpoint is reachable from ECS

### Test Script Failures

#### Missing Dependencies
```bash
# Install required tools
apt-get update && apt-get install -y curl jq
# or
brew install curl jq
```

#### AWS CLI Permissions
Ensure your AWS credentials have permissions for:
- CloudFormation (read stacks)
- ECS (describe services, tasks)
- CloudWatch Logs (read log events)

## Load Testing

For performance testing, use a tool like `hey`:

```bash
# Install hey
go install github.com/rakyll/hey@latest

# Create a trace payload file
echo '{...}' > trace.json

# Load test the OTLP endpoint  
hey -n 1000 -c 10 \
  -H "Content-Type: application/json" \
  -D trace.json \
  http://your-alb-dns:4318/v1/traces
```

## Continuous Testing

Add tests to your CI/CD pipeline:

```yaml
# GitHub Actions example
- name: Test OTEL Collector
  run: |
    ALB_DNS=$(aws cloudformation describe-stacks \
      --stack-name OtelEcsStack \
      --query 'Stacks[0].Outputs[?OutputKey==`LoadBalancerDNS`].OutputValue' \
      --output text)
    
    ./scripts/test-all.sh "${ALB_DNS}"
```

## Monitoring

Set up monitoring for your collector:

```bash
# Check collector metrics
curl -s http://your-alb-dns:8888/metrics | grep otelcol_

# Monitor error rates
aws logs filter-log-events \
  --log-group-name /aws/ecs/otel-collector \
  --filter-pattern "ERROR" \
  --start-time $(date -d '1 hour ago' +%s)000
```