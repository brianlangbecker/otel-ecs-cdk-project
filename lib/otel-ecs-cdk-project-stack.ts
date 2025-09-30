import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as fs from 'fs';
import * as path from 'path';

export class OtelEcsCdkProjectStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create VPC
    const vpc = new ec2.Vpc(this, 'VPC', {
      natGateways: 1,
      maxAzs: 2
    });

    // Create ECS Cluster
    const cluster = new ecs.Cluster(this, 'Cluster', {
      vpc,
      clusterName: 'otel-xray-cluster'
    });

    // Create IAM roles following AWS documentation pattern
    const taskExecutionRole = new iam.Role(this, 'TaskExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy')
      ]
    });

    // Create OpenTelemetry X-Ray role as specified in AWS docs
    const otelXrayRole = new iam.Role(this, 'OpenTelemetryXrayRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AWSXRayDaemonWriteAccess'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentServerPolicy')
      ]
    });

    // Create SSM parameter for OTEL configuration
    const configContent = fs.readFileSync(path.join(__dirname, '../config/otel-config.yaml'), 'utf8');
    const otelConfigParameter = new ssm.StringParameter(this, 'OtelConfigParameter', {
      parameterName: `/otel-ecs-stack/config/${cdk.Stack.of(this).stackName}`,
      stringValue: configContent,
      description: 'OpenTelemetry Collector configuration for ECS with Honeycomb integration'
    });

    // Grant the task role permission to read the SSM parameter
    otelConfigParameter.grantRead(otelXrayRole);

    // Create log groups
    const appLogGroup = new logs.LogGroup(this, 'AppLogGroup', {
      logGroupName: '/ecs/aws-otel-emitter',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    const collectorLogGroup = new logs.LogGroup(this, 'CollectorLogGroup', {
      logGroupName: '/ecs/ecs-aws-otel-sidecar-collector',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    // Create task definition following AWS documentation pattern with increased resources
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDefinition', {
      family: 'otel-using-xray',
      taskRole: otelXrayRole,
      executionRole: taskExecutionRole,
      memoryLimitMiB: 4096,  // Increased from 3072
      cpu: 2048              // Increased from 1024
    });

    // Add AWS OTEL Collector sidecar container (as specified in AWS docs)
    const otelCollectorContainer = taskDefinition.addContainer('aws-otel-collector', {
      image: ecs.ContainerImage.fromRegistry('public.ecr.aws/aws-observability/aws-otel-collector:v0.30.0'),
      essential: true,
      command: [
        '--config=env:OTEL_CONFIG'
      ],
      environment: {
        HONEYCOMB_ENDPOINT: 'https://api.honeycomb.io',
        HONEYCOMB_API_KEY: 'YOUR_HONEYCOMB_API_KEY_HERE', // Replace with actual key or use secrets
      },
      secrets: {
        OTEL_CONFIG: ecs.Secret.fromSsmParameter(otelConfigParameter)
      },
      logging: ecs.LogDrivers.awsLogs({
        logGroup: collectorLogGroup,
        streamPrefix: 'ecs'
      }),
      memoryReservationMiB: 1024,  // Increased from 512
      portMappings: [
        {
          name: 'otlp-grpc',
          containerPort: 4317,
          protocol: ecs.Protocol.TCP
        },
        {
          name: 'otlp-http',
          containerPort: 4318,
          protocol: ecs.Protocol.TCP
        },
        {
          name: 'health-check',
          containerPort: 13133,
          protocol: ecs.Protocol.TCP
        },
        {
          name: 'metrics',
          containerPort: 8888,
          protocol: ecs.Protocol.TCP
        }
      ]
    });

    // Add application container that depends on OTEL collector
    const appContainer = taskDefinition.addContainer('aws-otel-emitter', {
      image: ecs.ContainerImage.fromAsset(path.join(__dirname, '../sample-app')),
      environment: {
        NODE_ENV: 'production',
        PORT: '3000',
        // OpenTelemetry environment variables
        OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318',
        OTEL_EXPORTER_OTLP_PROTOCOL: 'http/protobuf',
        OTEL_SERVICE_NAME: 'otel-ecs-sample-app',
        OTEL_SERVICE_VERSION: '1.0.0',
        OTEL_RESOURCE_ATTRIBUTES: 'deployment.environment=production'
      },
      logging: ecs.LogDrivers.awsLogs({
        logGroup: appLogGroup,
        streamPrefix: 'ecs'
      }),
      memoryReservationMiB: 1024,  // Increased from 512
      portMappings: [
        {
          name: 'app-port',
          containerPort: 3000,
          protocol: ecs.Protocol.TCP
        }
      ]
    });

    // Set container dependency as specified in AWS docs
    appContainer.addContainerDependencies({
      container: otelCollectorContainer,
      condition: ecs.ContainerDependencyCondition.START
    });

    // Create Fargate service with better deployment configuration
    const service = new ecs.FargateService(this, 'Service', {
      cluster,
      taskDefinition,
      desiredCount: 2,  // Increased from 1 for better availability
      assignPublicIp: false,
      serviceName: 'otel-xray-service',
      minHealthyPercent: 50,
      maxHealthyPercent: 200,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
      },
      healthCheckGracePeriod: cdk.Duration.seconds(300),  // Give more time for startup
      enableExecuteCommand: true  // Enable ECS Exec for debugging
    });

    // Create Application Load Balancer for the application
    const alb = new elbv2.ApplicationLoadBalancer(this, 'ALB', {
      vpc,
      internetFacing: true,
      loadBalancerName: 'otel-xray-alb'
    });

    // Create Target Group for the application
    const appTargetGroup = new elbv2.ApplicationTargetGroup(this, 'AppTargetGroup', {
      vpc,
      port: 3000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        path: '/health',
        port: '3000',
        protocol: elbv2.Protocol.HTTP,
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 5
      }
    });

    // Add listener for the application
    alb.addListener('AppListener', {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      defaultTargetGroups: [appTargetGroup]
    });

    // Attach service to target group - specify the application container
    appTargetGroup.addTarget(service.loadBalancerTarget({
      containerName: 'aws-otel-emitter',
      containerPort: 3000
    }));

    // Allow ALB to reach the application
    alb.connections.allowTo(service.connections, ec2.Port.tcp(3000), 'ALB to App');
    
    // Allow internal communication to OTEL collector ports
    service.connections.allowFromAnyIpv4(ec2.Port.tcp(4317), 'OTLP gRPC');
    service.connections.allowFromAnyIpv4(ec2.Port.tcp(4318), 'OTLP HTTP');
    service.connections.allowFromAnyIpv4(ec2.Port.tcp(13133), 'Health Check');
    service.connections.allowFromAnyIpv4(ec2.Port.tcp(8888), 'Metrics');

    // Outputs
    new cdk.CfnOutput(this, 'LoadBalancerDNS', {
      value: alb.loadBalancerDnsName,
      description: 'DNS name of the load balancer'
    });

    new cdk.CfnOutput(this, 'ApplicationEndpoint', {
      value: `http://${alb.loadBalancerDnsName}`,
      description: 'Application endpoint'
    });

    new cdk.CfnOutput(this, 'TaskDefinitionArn', {
      value: taskDefinition.taskDefinitionArn,
      description: 'Task definition ARN'
    });

    new cdk.CfnOutput(this, 'ClusterName', {
      value: cluster.clusterName,
      description: 'ECS Cluster name'
    });
  }
}
