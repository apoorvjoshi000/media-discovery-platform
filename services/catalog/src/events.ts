// Kafka producer. Every impression/click/play becomes a domain event on the
// `interactions` topic. The recommender service consumes this stream to power
// real-time "trending now" and to feed the collaborative-filtering model.
// Decoupled + replayable: catalog never blocks on the recommender being up.
import { Kafka, Producer, logLevel } from "kafkajs";
import { eventsEmitted } from "./metrics.js";
import { logger } from "./logger.js";

export type InteractionType = "view" | "click" | "play";

export interface InteractionEvent {
  type: InteractionType;
  userId: string;
  movieId: number;
  ts: number; // epoch ms
}

export const TOPIC = "interactions";

let producer: Producer | null = null;
let ready = false;

export async function initProducer(brokers = (process.env.KAFKA_BROKERS ?? "localhost:9092").split(",")): Promise<void> {
  const kafka = new Kafka({ clientId: "catalog", brokers, logLevel: logLevel.ERROR });
  producer = kafka.producer({ allowAutoTopicCreation: true });
  try {
    await producer.connect();
    ready = true;
    logger.info({ brokers }, "kafka producer connected");
  } catch (err) {
    // Kafka being down must not take catalog down; we degrade gracefully and
    // simply drop events (counted as failures in metrics by the caller).
    logger.warn({ err }, "kafka producer failed to connect - events will be dropped");
  }
}

export async function emit(event: InteractionEvent): Promise<boolean> {
  if (!producer || !ready) return false;
  try {
    await producer.send({
      topic: TOPIC,
      // Key by userId so a user's events land on one partition (ordering).
      messages: [{ key: event.userId, value: JSON.stringify(event) }],
    });
    eventsEmitted.inc({ type: event.type });
    return true;
  } catch (err) {
    logger.warn({ err }, "failed to emit event");
    return false;
  }
}

export async function closeProducer(): Promise<void> {
  await producer?.disconnect();
  producer = null;
  ready = false;
}
