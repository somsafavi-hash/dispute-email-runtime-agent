#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";

import { DisputeEmailRuntimeStack } from "../lib/dispute-email-runtime-stack.js";

const app = new cdk.App();

new DisputeEmailRuntimeStack(app, "DisputeEmailRuntimeStack", {
  env: {
    ...(process.env.CDK_DEFAULT_ACCOUNT
      ? { account: process.env.CDK_DEFAULT_ACCOUNT }
      : {}),
    region: process.env.CDK_DEFAULT_REGION ?? "us-east-2",
  },
});
