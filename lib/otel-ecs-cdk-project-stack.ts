import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { OtelConfigConstruct } from './constructs/otel-config';
import { OtelCollectorConstruct } from './constructs/otel-collector';

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
      clusterName: 'otel-cluster'
    });

    // Create OTEL Configuration
    const otelConfig = new OtelConfigConstruct(this, 'OtelConfig');

    // Create Application Load Balancer
    const alb = new elbv2.ApplicationLoadBalancer(this, 'ALB', {
      vpc,
      internetFacing: true,
      loadBalancerName: 'otel-alb'
    });

    // Create Target Group for OTEL Collector
    const targetGroup = new elbv2.ApplicationTargetGroup(this, 'OtelTargetGroup', {
      vpc,
      port: 4317,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        path: '/',
        port: '13133',
        protocol: elbv2.Protocol.HTTP,
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 5
      }
    });

    // Create Target Group for OTLP HTTP 
    const httpTargetGroup = new elbv2.ApplicationTargetGroup(this, 'OtelHttpTargetGroup', {
      vpc,
      port: 4318,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        path: '/',
        port: '13133',
        protocol: elbv2.Protocol.HTTP,
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 5
      }
    });

    // Add listener for OTLP gRPC (port 4317)
    const grpcListener = alb.addListener('GrpcListener', {
      port: 4317,
      protocol: elbv2.ApplicationProtocol.HTTP,
      defaultTargetGroups: [targetGroup]
    });

    // Add listener for OTLP HTTP (port 4318)
    const httpListener = alb.addListener('HttpListener', {
      port: 4318,
      protocol: elbv2.ApplicationProtocol.HTTP,
      defaultTargetGroups: [httpTargetGroup]
    });

    // Create Target Group for Health Check
    const healthTargetGroup = new elbv2.ApplicationTargetGroup(this, 'OtelHealthTargetGroup', {
      vpc,
      port: 13133,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        path: '/',
        port: '13133',
        protocol: elbv2.Protocol.HTTP,
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3
      }
    });

    // Add listener for Health Check (port 13133)
    const healthListener = alb.addListener('HealthListener', {
      port: 13133,
      protocol: elbv2.ApplicationProtocol.HTTP,
      defaultTargetGroups: [healthTargetGroup]
    });

    // Create OTEL Collector Service with target groups
    const otelCollector = new OtelCollectorConstruct(this, 'OtelCollector', {
      cluster,
      vpc,
      configParameter: otelConfig.configParameter,
      honeycombEndpoint: 'https://api.honeycomb.io',
      honeycombApiKey: 'CbUVTd7D7rrdzvcV1FOu8B',
      honeycombDataset: 'otel-collector',
      grpcTargetGroup: targetGroup,
      httpTargetGroup: httpTargetGroup,
      healthTargetGroup: healthTargetGroup
    });

    // Ensure ALB can reach both OTLP ports and health check port on ECS service
    alb.connections.allowTo(otelCollector.service.connections, ec2.Port.tcp(4317), 'ALB to OTLP gRPC');
    alb.connections.allowTo(otelCollector.service.connections, ec2.Port.tcp(4318), 'ALB to OTLP HTTP');
    alb.connections.allowTo(otelCollector.service.connections, ec2.Port.tcp(13133), 'ALB to Health Check');

    // Outputs
    new cdk.CfnOutput(this, 'LoadBalancerDNS', {
      value: alb.loadBalancerDnsName,
      description: 'DNS name of the load balancer'
    });

    new cdk.CfnOutput(this, 'OTLPGrpcEndpoint', {
      value: `http://${alb.loadBalancerDnsName}:4317`,
      description: 'OTLP gRPC endpoint'
    });

    new cdk.CfnOutput(this, 'OTLPHttpEndpoint', {
      value: `http://${alb.loadBalancerDnsName}:4318`,
      description: 'OTLP HTTP endpoint'
    });

    new cdk.CfnOutput(this, 'HealthCheckEndpoint', {
      value: `http://${alb.loadBalancerDnsName}:13133`,
      description: 'Health check endpoint'
    });
  }
}
