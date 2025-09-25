#!/bin/bash

# Test OTLP traces endpoint with a sample trace
# Usage: ./test-otlp-traces.sh <ALB_DNS_NAME>

set -e

ALB_DNS_NAME=${1:-"your-alb-dns-name"}
OTLP_ENDPOINT="http://${ALB_DNS_NAME}:4318"

echo "🧪 Testing OTLP HTTP endpoint: ${OTLP_ENDPOINT}"

# Generate a timestamp in nanoseconds
TIMESTAMP_NS=$(date +%s)000000000
SPAN_ID=$(openssl rand -hex 8)
TRACE_ID=$(openssl rand -hex 16)

# Create OTLP trace payload
TRACE_PAYLOAD='{
  "resourceSpans": [
    {
      "resource": {
        "attributes": [
          {
            "key": "service.name",
            "value": {
              "stringValue": "test-service"
            }
          },
          {
            "key": "service.version",
            "value": {
              "stringValue": "1.0.0"
            }
          }
        ]
      },
      "scopeSpans": [
        {
          "scope": {
            "name": "test-instrumentation",
            "version": "1.0.0"
          },
          "spans": [
            {
              "traceId": "'${TRACE_ID}'",
              "spanId": "'${SPAN_ID}'",
              "name": "test-operation",
              "kind": "SPAN_KIND_INTERNAL",
              "startTimeUnixNano": "'${TIMESTAMP_NS}'",
              "endTimeUnixNano": "'$((TIMESTAMP_NS + 1000000000))'",
              "attributes": [
                {
                  "key": "http.method",
                  "value": {
                    "stringValue": "GET"
                  }
                },
                {
                  "key": "http.url",
                  "value": {
                    "stringValue": "http://example.com/api/test"
                  }
                },
                {
                  "key": "http.status_code",
                  "value": {
                    "intValue": 200
                  }
                }
              ],
              "status": {
                "code": "STATUS_CODE_OK"
              }
            }
          ]
        }
      ]
    }
  ]
}'

echo "📡 Sending test trace..."
echo "   Trace ID: ${TRACE_ID}"
echo "   Span ID: ${SPAN_ID}"

# Send the trace
RESPONSE=$(curl -w "\nHTTP_CODE:%{http_code}\nTIME_TOTAL:%{time_total}s" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "User-Agent: otel-test-script/1.0" \
  -d "${TRACE_PAYLOAD}" \
  "${OTLP_ENDPOINT}/v1/traces" \
  2>/dev/null || echo "CURL_ERROR:$?")

echo ""
echo "📊 Response:"
echo "${RESPONSE}"

# Parse response
HTTP_CODE=$(echo "${RESPONSE}" | grep "HTTP_CODE:" | cut -d: -f2)
TIME_TOTAL=$(echo "${RESPONSE}" | grep "TIME_TOTAL:" | cut -d: -f2)

if [ "${HTTP_CODE}" = "200" ] || [ "${HTTP_CODE}" = "202" ]; then
  echo ""
  echo "✅ Success! Trace sent successfully"
  echo "   HTTP Status: ${HTTP_CODE}"
  echo "   Response Time: ${TIME_TOTAL}"
  echo ""
  echo "🍯 Check Honeycomb for your trace:"
  echo "   - Dataset: Your configured dataset"
  echo "   - Trace ID: ${TRACE_ID}"
  echo "   - Service: test-service"
else
  echo ""
  echo "❌ Failed! HTTP Status: ${HTTP_CODE}"
  echo "   Check ALB health and collector logs"
  exit 1
fi