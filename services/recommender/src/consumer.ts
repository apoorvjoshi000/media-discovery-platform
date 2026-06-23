// Kafka consumer for the `interactions` topic. Persists every event to Mongo
// and updates the in-memory trending window in real time.
import { Kafka, logLevel, Consumer } from "kafkajs";
import { events, EventDoc } from "./db.js";
import { TrendingWindow } from "./trending.js";
import { eventsConsumed } from "./metrics.js";
import { logger } from "./logger.js";

export const TOPIC = "interactions";

let consumer: Consumer | null = null;

export async function startConsumer(
  trending: TrendingWindow,
  onEvent: (e: EventDoc) => void,
  brokers = (process.env.KAFKA_BROKERS ?? "localhost:9092").split(",")
): Promise<void> {
  const kafka = new Kafka({ clientId: "recommender", brokers, logLevel: logLevel.ERROR });
  consumer = kafka.consumer({ groupId: "recommender-v1" });

  const WEIGHTS: Record<string, number> = { view: 1, click: 2, play: 3 };

  try {
    await consumer.connect();
    await consumer.subscribe({ topic: TOPIC, fromBeginning: true });
    await consumer.run({
      eachMessage: async ({ message }) => {
        if (!message.value) return;
        const e = JSON.parse(message.value.toString()) as EventDoc;
        await events().insertOne(e);
        trending.add(e.movieId, WEIGHTS[e.type] ?? 1, e.ts);
        eventsConsumed.inc({ type: e.type });
        onEvent(e);
      },
    });
    logger.info({ brokers }, "kafka consumer running");
  } catch (err) {
    // Degrade gracefully: without Kafka the service still serves recommendations
    // from whatever history is already in Mongo.
    logger.warn({ err }, "kafka consumer failed - serving from Mongo history only");
  }
}

export async function stopConsumer(): Promise<void> {
  await consumer?.disconnect();
  consumer = null;
}
