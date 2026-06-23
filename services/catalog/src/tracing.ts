// OpenTelemetry bootstrap. MUST be imported first (see index.ts) so that
// auto-instrumentation can patch http/express/mongodb/kafkajs before they load.
import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

// Only wire up the exporter when an endpoint is configured (keeps unit tests
// and `npm run ingest` from trying to reach a collector that isn't there).
export function startTracing(serviceName: string): void {
  if (!endpoint) return;
  const sdk = new NodeSDK({
    serviceName,
    traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
    instrumentations: [
      getNodeAutoInstrumentations({
        // fs spans are noise for an HTTP service
        "@opentelemetry/instrumentation-fs": { enabled: false },
      }),
    ],
  });
  sdk.start();
  process.on("SIGTERM", () => void sdk.shutdown());
}
