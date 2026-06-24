import { Logger } from "@aws-lambda-powertools/logger";
import { Metrics } from "@aws-lambda-powertools/metrics";
import { Tracer } from "@aws-lambda-powertools/tracer";

export const serviceName = "dispute-email-runtime-agent";

export const logger = new Logger({ serviceName });
export const metrics = new Metrics({ namespace: "SOCAPITAL/DisputeEmail", serviceName });
export const tracer = new Tracer({ serviceName });
