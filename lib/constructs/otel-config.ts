import { Construct } from 'constructs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as fs from 'fs';
import * as path from 'path';

export class OtelConfigConstruct extends Construct {
  public readonly configParameter: ssm.StringParameter;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    // Read the OTEL config file
    const configPath = path.join(__dirname, '../../config/otel-config.yaml');
    const configContent = fs.readFileSync(configPath, 'utf-8');

    // Store config in Systems Manager Parameter Store
    this.configParameter = new ssm.StringParameter(this, 'OtelConfig', {
      parameterName: '/otel/collector/config',
      stringValue: configContent,
      description: 'OpenTelemetry Collector Configuration',
      type: ssm.ParameterType.STRING
    });
  }
}