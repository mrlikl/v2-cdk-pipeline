import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codecommit from 'aws-cdk-lib/aws-codecommit';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as iam from 'aws-cdk-lib/aws-iam';
import { V2Apptack } from './appstack';

export class V2PipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    //V2 Pipeline
    const pipeline = new codepipeline.Pipeline(this, 'V2Pipeline', {
      pipelineName: 'V2Pipeline',
      pipelineType: codepipeline.PipelineType.V2,
      executionMode: codepipeline.ExecutionMode.PARALLEL,
      restartExecutionOnUpdate: true,
    }
    );


    //Source
    const repository = codecommit.Repository.fromRepositoryName(this, 'MyRepo', 'v2pipeline');
    const sourceStage = pipeline.addStage({ stageName: 'Source' });
    const sourceOutput = new codepipeline.Artifact();
    sourceStage.addAction(new codepipeline_actions.CodeCommitSourceAction({
      actionName: 'CodeCommit',
      repository,
      output: sourceOutput,
      branch: 'main',
      trigger: codepipeline_actions.CodeCommitTrigger.EVENTS,
    }));

    //Build - Synth
    const synthStage = pipeline.addStage({
      stageName: 'Build',
    });
    const synthBuildProject = new codebuild.PipelineProject(this, 'SynthBuildProject', {
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          build: {
            commands: [
              'npm ci',
              "npm run build",
              "npx cdk synth"
            ],
          },
        },
        artifacts: {
          "base-directory": "cdk.out",
          "files": "**/*"
        }
      }),
    });
    const synthOutput = new codepipeline.Artifact();
    synthStage.addAction(new codepipeline_actions.CodeBuildAction({
      actionName: 'Synth',
      project: synthBuildProject,
      input: sourceOutput,
      outputs: [synthOutput]
    }));

    //UpdatePipeline - SelfMutate
    const updatePipelineStage = pipeline.addStage({
      stageName: 'UpdatePipeline',
    });

    const selfMutateBuildProject = new codebuild.PipelineProject(this, 'SelfMutateBuildProject', {
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: "0.2",
        phases: {
          install: {
            commands: [
              "npm install -g aws-cdk@2"
            ]
          },
          build: {
            commands: [
              "cdk -a . deploy V2PipelineStack --require-approval=never --verbose"
            ]
          }
        }
      }),
    });

    selfMutateBuildProject.addToRolePolicy(iam.PolicyStatement.fromJson({
      "Condition": {
        "ForAnyValue:StringEquals": {
          "iam:ResourceTag/aws-cdk:bootstrap-role": [
            "image-publishing",
            "file-publishing",
            "deploy"
          ]
        }
      },
      "Action": "sts:AssumeRole",
      "Resource": `arn:*:iam::${props?.env?.account}:role/*`,
      "Effect": "Allow"
    }
    ));
    selfMutateBuildProject.addToRolePolicy(iam.PolicyStatement.fromJson({
      "Action": [
        "cloudformation:DescribeStacks",
        "s3:ListBucket"
      ],
      "Resource": "*",
      "Effect": "Allow"
    }
    ))

    updatePipelineStage.addAction(new codepipeline_actions.CodeBuildAction({
      actionName: 'Synth',
      project: selfMutateBuildProject,
      input: synthOutput
    }));

    //Deploy stacks
    const appStage = new S3AppStage(this, 'S3AppStage');
    const stack_template = appStage.node.tryFindChild('SQSStack') as any


    const deployStage = pipeline.addStage(appStage);

    const stackName = 'SQSStack2';
    const changeSetName = 'cdkchangeset';

    deployStage.addAction(new codepipeline_actions.CloudFormationCreateReplaceChangeSetAction({
      actionName: 'PrepareChanges',
      stackName: stackName,
      changeSetName: changeSetName,
      deploymentRole: iam.Role.fromRoleName(this, 'CDKExecRole', `cdk-hnb659fds-cfn-exec-role-${props?.env?.account}-${props?.env?.region}`),
      adminPermissions: true,
      cfnCapabilities: [cdk.CfnCapabilities.ANONYMOUS_IAM, cdk.CfnCapabilities.NAMED_IAM, cdk.CfnCapabilities.AUTO_EXPAND],
      templatePath: synthOutput.atPath(`${appStage.artifactId}/${stack_template['templateFile']}`),
      runOrder: 1,
    }));
    deployStage.addAction(new codepipeline_actions.ManualApprovalAction({
      actionName: 'ApproveChanges',
      runOrder: 2,
    }));
    deployStage.addAction(new codepipeline_actions.CloudFormationExecuteChangeSetAction({
      actionName: 'ExecuteChanges',
      stackName,
      changeSetName,
      runOrder: 3,
    }));

  }
}


class S3AppStage extends cdk.Stage {
  constructor(scope: Construct, id: string, props?: cdk.StageProps) {
    super(scope, id, props);

    const s3Stack = new V2Apptack(this, 'SQSStack');

  }
}