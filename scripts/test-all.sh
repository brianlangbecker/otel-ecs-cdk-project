#!/bin/bash

# Comprehensive test script for the OTEL collector deployment
# Usage: ./test-all.sh [ALB_DNS_NAME]

set -e

# Get ALB DNS from command line or CDK output
if [ -n "$1" ]; then
  ALB_DNS_NAME="$1"
else
  echo "🔍 Getting ALB DNS from CDK stack..."
  ALB_DNS_NAME=$(aws cloudformation describe-stacks \
    --stack-name "OtelEcsStack" \
    --query 'Stacks[0].Outputs[?OutputKey==`LoadBalancerDNS`].OutputValue' \
    --output text 2>/dev/null || echo "")
  
  if [ -z "${ALB_DNS_NAME}" ]; then
    echo "❌ Could not find ALB DNS name"
    echo "Usage: $0 <ALB_DNS_NAME>"
    echo "Or deploy the stack first with: npx cdk deploy"
    exit 1
  fi
fi

echo "🧪 Starting comprehensive OTEL collector tests"
echo "   ALB DNS: ${ALB_DNS_NAME}"
echo "   Timestamp: $(date)"
echo ""

# Test 1: Deployment Health
echo "1️⃣ Checking deployment health..."
./scripts/check-deployment.sh
echo ""

# Test 2: Health Endpoint
echo "2️⃣ Testing health endpoint..."
HEALTH_URL="http://${ALB_DNS_NAME}:13133/"
echo "   URL: ${HEALTH_URL}"

HEALTH_RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}\nTIME:%{time_total}s" \
  "${HEALTH_URL}" 2>/dev/null || echo "CURL_ERROR")

if echo "${HEALTH_RESPONSE}" | grep -q "HTTP_CODE:200"; then
  echo "   ✅ Health check passed"
else
  echo "   ❌ Health check failed: ${HEALTH_RESPONSE}"
fi
echo ""

# Test 3: OTLP Traces
echo "3️⃣ Testing OTLP traces endpoint..."
./scripts/test-otlp-traces.sh "${ALB_DNS_NAME}"
echo ""

# Test 4: OTLP Metrics  
echo "4️⃣ Testing OTLP metrics endpoint..."
./scripts/test-otlp-metrics.sh "${ALB_DNS_NAME}"
echo ""

# Test 5: Load Test (optional)
echo "5️⃣ Running light load test..."
echo "   Sending 5 traces rapidly..."

for i in {1..5}; do
  ./scripts/test-otlp-traces.sh "${ALB_DNS_NAME}" >/dev/null 2>&1 &
done

# Wait for background jobs
wait

echo "   ✅ Load test completed"
echo ""

# Test 6: Prometheus Metrics Endpoint
echo "6️⃣ Testing Prometheus metrics endpoint..."
PROMETHEUS_URL="http://${ALB_DNS_NAME}:8888/metrics"
echo "   URL: ${PROMETHEUS_URL}"

PROM_RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
  "${PROMETHEUS_URL}" 2>/dev/null || echo "CURL_ERROR")

if echo "${PROM_RESPONSE}" | grep -q "HTTP_CODE:200"; then
  echo "   ✅ Prometheus metrics endpoint responding"
  # Show some sample metrics
  echo "   Sample metrics:"
  echo "${PROM_RESPONSE}" | head -10 | sed 's/^/     /'
else
  echo "   ❌ Prometheus metrics failed: ${PROM_RESPONSE}"
fi
echo ""

# Final Summary
echo "📊 Test Summary:"
echo "   ALB DNS: ${ALB_DNS_NAME}"
echo "   OTLP gRPC: http://${ALB_DNS_NAME}:4317"  
echo "   OTLP HTTP: http://${ALB_DNS_NAME}:4318"
echo "   Health: http://${ALB_DNS_NAME}:13133"
echo "   Prometheus: http://${ALB_DNS_NAME}:8888/metrics"
echo ""
echo "🍯 Next Steps:"
echo "   1. Check Honeycomb UI for incoming data"
echo "   2. Configure your applications to send to: http://${ALB_DNS_NAME}:4317"
echo "   3. Monitor collector logs: aws logs tail /aws/ecs/otel-collector --follow"
echo ""
echo "✅ All tests completed!"