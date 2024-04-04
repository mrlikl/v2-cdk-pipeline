#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { V2PipelineStack } from '../lib/pipelinestack';

const app = new cdk.App();
new V2PipelineStack(app, 'V2PipelineStack', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION }
});