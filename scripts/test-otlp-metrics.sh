#!/bin/bash

# Test OTLP metrics endpoint with sample metrics
# Usage: ./test-otlp-metrics.sh <ALB_DNS_NAME>

set -e

ALB_DNS_NAME=${1:-"your-alb-dns-name"}
OTLP_ENDPOINT="http://${ALB_DNS_NAME}:4318"

echo "📈 Testing OTLP HTTP metrics endpoint: ${OTLP_ENDPOINT}"

# Generate timestamp in nanoseconds
TIMESTAMP_NS=$(date +%s)000000000

# Create OTLP metrics payload
METRICS_PAYLOAD='{
  "resourceMetrics": [
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
      "scopeMetrics": [
        {
          "scope": {
            "name": "test-instrumentation",
            "version": "1.0.0"
          },
          "metrics": [
            {
              "name": "http_requests_total",
              "description": "Total number of HTTP requests",
              "unit": "1",
              "sum": {
                "dataPoints": [
                  {
                    "timeUnixNano": "'${TIMESTAMP_NS}'",
                    "asInt": 42,
                    "attributes": [
                      {
                        "key": "method",
                        "value": {
                          "stringValue": "GET"
                        }
                      },
                      {
                        "key": "status_code",
                        "value": {
                          "stringValue": "200"
                        }
                      }
                    ]
                  }
                ],
                "aggregationTemporality": "AGGREGATION_TEMPORALITY_CUMULATIVE",
                "isMonotonic": true
              }
            },
            {
              "name": "http_request_duration",
              "description": "HTTP request duration",
              "unit": "ms",
              "histogram": {
                "dataPoints": [
                  {
                    "timeUnixNano": "'${TIMESTAMP_NS}'",
                    "count": 10,
                    "sum": 1250,
                    "bucketCounts": [0, 2, 5, 2, 1, 0],
                    "explicitBounds": [10, 50, 100, 500, 1000],
                    "attributes": [
                      {
                        "key": "endpoint",
                        "value": {
                          "stringValue": "/api/test"
                        }
                      }
                    ]
                  }
                ],
                "aggregationTemporality": "AGGREGATION_TEMPORALITY_CUMULATIVE"
              }
            }
          ]
        }
      ]
    }
  ]
}'

echo "📡 Sending test metrics..."

# Send the metrics
RESPONSE=$(curl -w "\nHTTP_CODE:%{http_code}\nTIME_TOTAL:%{time_total}s" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "User-Agent: otel-test-script/1.0" \
  -d "${METRICS_PAYLOAD}" \
  "${OTLP_ENDPOINT}/v1/metrics" \
  2>/dev/null || echo "CURL_ERROR:$?")

echo ""
echo "📊 Response:"
echo "${RESPONSE}"

# Parse response
HTTP_CODE=$(echo "${RESPONSE}" | grep "HTTP_CODE:" | cut -d: -f2)
TIME_TOTAL=$(echo "${RESPONSE}" | grep "TIME_TOTAL:" | cut -d: -f2)

if [ "${HTTP_CODE}" = "200" ] || [ "${HTTP_CODE}" = "202" ]; then
  echo ""
  echo "✅ Success! Metrics sent successfully"
  echo "   HTTP Status: ${HTTP_CODE}"
  echo "   Response Time: ${TIME_TOTAL}"
  echo ""
  echo "🍯 Check Honeycomb for your metrics:"
  echo "   - Dataset: Your configured metrics dataset"
  echo "   - Service: test-service"
  echo "   - Metrics: http_requests_total, http_request_duration"
else
  echo ""
  echo "❌ Failed! HTTP Status: ${HTTP_CODE}"
  echo "   Check ALB health and collector logs"
  exit 1
fi