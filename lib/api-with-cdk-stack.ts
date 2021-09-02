import * as cdk from '@aws-cdk/core';

import {AttributeType, Table,TableEncryption } from '@aws-cdk/aws-dynamodb';
import { AwsIntegration, Cors, RestApi } from '@aws-cdk/aws-apigateway';
import { Effect, Policy, PolicyStatement, Role, ServicePrincipal } from '@aws-cdk/aws-iam';

export class ApiWithCdkStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const modelName = 'ShoppingCart';

    const dynamoTable = new Table(this, modelName, {
      partitionKey: {
        name: `id`,
        type: AttributeType.STRING,
      },
      readCapacity: 2,
      writeCapacity: 2,
      encryption: TableEncryption.AWS_MANAGED
    });

    
    const api = new RestApi(this, `${modelName}Api`, {
      restApiName: `${modelName} Service`,
      description: 'This is a temporary api to store information from kafka Topic'
    });

    const allResources = api.root.addResource(modelName.toLocaleLowerCase());

    const putPolicy = new Policy(this, 'putPolicy', {
      statements: [
        new PolicyStatement({
          actions: ['dynamodb:PutItem'],
          effect: Effect.ALLOW,
          resources: [dynamoTable.tableArn],
        }),
      ],
    });

    const putRole = new Role(this, 'putRole', {
      assumedBy: new ServicePrincipal('apigateway.amazonaws.com'),
    });
    putRole.attachInlinePolicy(putPolicy);

    const errorResponses = [
      {
        selectionPattern: '400',
        statusCode: '400',
        responseTemplates: {
          'application/json': `{
            "error": "Bad input!"
          }`,
        },
      },
      {
        selectionPattern: '5\\d{2}',
        statusCode: '500',
        responseTemplates: {
          'application/json': `{
            "error": "Internal Service Error!"
          }`,
        },
      },
    ];

    const createIntegration = new AwsIntegration({
      action: 'PutItem',
      options: {
        credentialsRole: putRole,
        integrationResponses:[
        {
            statusCode: '200',
            responseTemplates: {
              'application/json': `{
                "requestId": "$context.requestId"
              }`,
            },
        },
        ...errorResponses,
      ],
      requestTemplates : {
        'application/json': `
            {
              "TableName": "${dynamoTable.tableName}",
              "Item": {
                "id": {
                  "S": "$input.path('$.cart.id')"
                },
                "firstName": {
                  "S": "$input.path('$.contact.firstName')"
                },
                "lastName": {
                  "S": "$input.path('$.contact.lastName')"
                },
                "email": {
                  "S": "$input.path('$.contact.email')"
                },
                "phone": {
                  "S": "$input.path('$.contact.phone.number')"
                }
              }
            }
        `
      }
      },
      service: 'dynamodb',
    });

    const methodOptions = { methodResponses: [{ statusCode: '200' }, { statusCode: '400' }, { statusCode: '500' }] };
    allResources.addMethod('POST', createIntegration, methodOptions);
  }
}
