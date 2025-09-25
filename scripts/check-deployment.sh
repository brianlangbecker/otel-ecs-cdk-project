#!/bin/bash

# Check ECS deployment status and health
# Usage: ./check-deployment.sh [stack-name]

set -e

STACK_NAME=${1:-"OtelEcsStack"}
CLUSTER_NAME="otel-cluster"
SERVICE_NAME="otel-collector"

echo "🔍 Checking deployment status for stack: ${STACK_NAME}"

# Get stack outputs
echo ""
echo "📋 Stack Outputs:"
ALB_DNS=$(aws cloudformation describe-stacks \
  --stack-name "${STACK_NAME}" \
  --query 'Stacks[0].Outputs[?OutputKey==`LoadBalancerDNS`].OutputValue' \
  --output text 2>/dev/null || echo "N/A")

OTLP_ENDPOINT=$(aws cloudformation describe-stacks \
  --stack-name "${STACK_NAME}" \
  --query 'Stacks[0].Outputs[?OutputKey==`OTLPGrpcEndpoint`].OutputValue' \
  --output text 2>/dev/null || echo "N/A")

echo "   ALB DNS: ${ALB_DNS}"
echo "   OTLP Endpoint: ${OTLP_ENDPOINT}"

# Check ECS service status
echo ""
echo "🚢 ECS Service Status:"
SERVICE_STATUS=$(aws ecs describe-services \
  --cluster "${CLUSTER_NAME}" \
  --services "${SERVICE_NAME}" \
  --query 'services[0].status' \
  --output text 2>/dev/null || echo "NOT_FOUND")

DESIRED_COUNT=$(aws ecs describe-services \
  --cluster "${CLUSTER_NAME}" \
  --services "${SERVICE_NAME}" \
  --query 'services[0].desiredCount' \
  --output text 2>/dev/null || echo "0")

RUNNING_COUNT=$(aws ecs describe-services \
  --cluster "${CLUSTER_NAME}" \
  --services "${SERVICE_NAME}" \
  --query 'services[0].runningCount' \
  --output text 2>/dev/null || echo "0")

echo "   Status: ${SERVICE_STATUS}"
echo "   Desired: ${DESIRED_COUNT}"
echo "   Running: ${RUNNING_COUNT}"

# Check task health
echo ""
echo "🏥 Task Health:"
TASK_ARNS=$(aws ecs list-tasks \
  --cluster "${CLUSTER_NAME}" \
  --service-name "${SERVICE_NAME}" \
  --desired-status RUNNING \
  --query 'taskArns[*]' \
  --output text 2>/dev/null || echo "")

if [ -n "${TASK_ARNS}" ]; then
  for TASK_ARN in ${TASK_ARNS}; do
    TASK_ID=$(basename "${TASK_ARN}")
    HEALTH_STATUS=$(aws ecs describe-tasks \
      --cluster "${CLUSTER_NAME}" \
      --tasks "${TASK_ARN}" \
      --query 'tasks[0].healthStatus' \
      --output text 2>/dev/null || echo "UNKNOWN")
    
    LAST_STATUS=$(aws ecs describe-tasks \
      --cluster "${CLUSTER_NAME}" \
      --tasks "${TASK_ARN}" \
      --query 'tasks[0].lastStatus' \
      --output text 2>/dev/null || echo "UNKNOWN")
    
    echo "   Task ${TASK_ID}: ${LAST_STATUS} (Health: ${HEALTH_STATUS})"
  done
else
  echo "   No running tasks found"
fi

# Check ALB health
if [ "${ALB_DNS}" != "N/A" ]; then
  echo ""
  echo "🏥 ALB Health Check:"
  
  # Test health endpoint
  HEALTH_RESPONSE=$(curl -s -w "HTTP_CODE:%{http_code}" \
    "http://${ALB_DNS}:13133/" 2>/dev/null || echo "CURL_ERROR")
  
  if echo "${HEALTH_RESPONSE}" | grep -q "HTTP_CODE:200"; then
    echo "   ✅ Health endpoint responding (200 OK)"
  else
    echo "   ❌ Health endpoint failed: ${HEALTH_RESPONSE}"
  fi
  
  # Test OTLP endpoint connectivity
  OTLP_RESPONSE=$(curl -s -w "HTTP_CODE:%{http_code}" \
    -X POST \
    -H "Content-Type: application/json" \
    -d '{}' \
    "http://${ALB_DNS}:4318/v1/traces" 2>/dev/null || echo "CURL_ERROR")
  
  if echo "${OTLP_RESPONSE}" | grep -q "HTTP_CODE:400\|HTTP_CODE:200"; then
    echo "   ✅ OTLP endpoint responding"
  else
    echo "   ❌ OTLP endpoint failed: ${OTLP_RESPONSE}"
  fi
fi

# Check recent logs
echo ""
echo "📝 Recent Logs (last 10 minutes):"
aws logs filter-log-events \
  --log-group-name "/aws/ecs/otel-collector" \
  --start-time $(($(date +%s) - 600))000 \
  --max-items 5 \
  --query 'events[*].[logStreamName,message]' \
  --output table 2>/dev/null || echo "   No logs found or log group doesn't exist"

# Summary
echo ""
echo "📊 Summary:"
if [ "${SERVICE_STATUS}" = "ACTIVE" ] && [ "${RUNNING_COUNT}" = "${DESIRED_COUNT}" ]; then
  echo "   ✅ Service is healthy and running"
  if [ "${ALB_DNS}" != "N/A" ]; then
    echo ""
    echo "🧪 Test your deployment:"
    echo "   ./scripts/test-otlp-traces.sh ${ALB_DNS}"
    echo "   ./scripts/test-otlp-metrics.sh ${ALB_DNS}"
  fi
else
  echo "   ⚠️  Service may have issues"
  echo "   Check ECS console and logs for details"
fi