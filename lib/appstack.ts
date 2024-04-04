import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';

export class V2Apptack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        // new s3.Bucket(this, 'MyFirstBucket', {
        //     versioned: true,
        //     removalPolicy: cdk.RemovalPolicy.DESTROY,
        //     autoDeleteObjects: true
        // });

        new sqs.Queue(this, 'MyFirstQueue', {});

    }
}
