import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Duration } from 'aws-cdk-lib';

export interface OtelCollectorProps {
  cluster: ecs.Cluster;
  vpc: ec2.Vpc;
  configParameter: ssm.StringParameter;
  honeycombEndpoint?: string;
  honeycombApiKey?: string;
  honeycombDataset?: string;
  grpcTargetGroup?: elbv2.ApplicationTargetGroup;
  httpTargetGroup?: elbv2.ApplicationTargetGroup;
  healthTargetGroup?: elbv2.ApplicationTargetGroup;
}

export class OtelCollectorConstruct extends Construct {
  public readonly service: ecs.FargateService;
  public readonly taskDefinition: ecs.FargateTaskDefinition;

  constructor(scope: Construct, id: string, props: OtelCollectorProps) {
    super(scope, id);

    // Create task execution role
    const executionRole = new iam.Role(this, 'ExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy')
      ]
    });

    // Create task role with SSM permissions
    const taskRole = new iam.Role(this, 'TaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      inlinePolicies: {
        SSMPolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: ['ssm:GetParameter'],
              resources: [props.configParameter.parameterArn]
            })
          ]
        })
      }
    });

    // Create log group with specific name for easier access
    const logGroup = new logs.LogGroup(this, 'LogGroup', {
      logGroupName: '/aws/ecs/otel-collector',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY // Clean up on stack deletion
    });

    // Create task definition
    this.taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDef', {
      memoryLimitMiB: 1024,
      cpu: 512,
      executionRole,
      taskRole
    });

    // Add container
    const container = this.taskDefinition.addContainer('otel-collector', {
      image: ecs.ContainerImage.fromRegistry('otel/opentelemetry-collector-contrib:latest'),
      memoryReservationMiB: 512,
      essential: true,
      environment: {
        HONEYCOMB_ENDPOINT: props.honeycombEndpoint || 'https://api.honeycomb.io',
        HONEYCOMB_API_KEY: props.honeycombApiKey || 'your-honeycomb-api-key',
        HONEYCOMB_DATASET: props.honeycombDataset || 'otel-collector'
      },
      command: [
        '--config=env:OTEL_CONFIG'
      ],
      secrets: {
        OTEL_CONFIG: ecs.Secret.fromSsmParameter(props.configParameter)
      },
      logging: ecs.LogDrivers.awsLogs({
        logGroup,
        streamPrefix: 'otel-collector'
      }),
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
          name: 'prometheus',
          containerPort: 8888,
          protocol: ecs.Protocol.TCP
        },
        {
          name: 'health',
          containerPort: 13133,
          protocol: ecs.Protocol.TCP
        }
      ],
      healthCheck: {
        command: ['CMD-SHELL', '/bin/sh -c "exec 3<>/dev/tcp/localhost/13133 && echo -e \\"GET / HTTP/1.1\\r\\nHost: localhost\\r\\n\\r\\" >&3 && cat <&3" || exit 1'],
        interval: Duration.seconds(30),
        timeout: Duration.seconds(10),
        retries: 3,
        startPeriod: Duration.seconds(60)
      }
    });

    // Create service
    this.service = new ecs.FargateService(this, 'Service', {
      cluster: props.cluster,
      taskDefinition: this.taskDefinition,
      desiredCount: 2, // Equivalent to replicas in Helm
      assignPublicIp: false,
      serviceName: 'otel-collector',
      healthCheckGracePeriod: Duration.seconds(60)
    });

    // Attach service to target groups if provided
    if (props.grpcTargetGroup) {
      this.service.attachToApplicationTargetGroup(props.grpcTargetGroup);
    }
    if (props.httpTargetGroup) {
      this.service.attachToApplicationTargetGroup(props.httpTargetGroup);
    }
    if (props.healthTargetGroup) {
      this.service.attachToApplicationTargetGroup(props.healthTargetGroup);
    }
  }
}