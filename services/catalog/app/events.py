"""Kafka producer. Every impression/click/play becomes a domain event on the
`interactions` topic. The recommender service consumes this stream to power
real-time "trending now" and to feed the collaborative-filtering model.
Decoupled + replayable: catalog never blocks on the recommender being up, and
if Kafka is down we degrade gracefully and drop the event."""
from __future__ import annotations

import json
import logging

from aiokafka import AIOKafkaProducer

from .config import settings
from .metrics import EVENTS_EMITTED

log = logging.getLogger("catalog.events")
TOPIC = "interactions"

_producer: AIOKafkaProducer | None = None
_ready = False


async def init_producer() -> None:
    global _producer, _ready
    _producer = AIOKafkaProducer(
        bootstrap_servers=settings.kafka_brokers,
        enable_idempotence=True,
        acks="all",
    )
    try:
        await _producer.start()
        _ready = True
        log.info("kafka producer connected to %s", settings.kafka_brokers)
    except Exception as exc:  # noqa: BLE001 - Kafka down must not crash catalog
        log.warning("kafka producer failed to connect (%s); events will drop", exc)
        _ready = False


async def emit(event: dict) -> bool:
    """Send an interaction event. Returns False (not raises) if Kafka is down."""
    if not _producer or not _ready:
        return False
    try:
        # Key by userId so a user's events land on one partition (ordering).
        await _producer.send_and_wait(
            TOPIC,
            key=event["userId"].encode(),
            value=json.dumps(event).encode(),
        )
        EVENTS_EMITTED.labels(event["type"]).inc()
        return True
    except Exception as exc:  # noqa: BLE001
        log.warning("failed to emit event: %s", exc)
        return False


async def close_producer() -> None:
    global _producer, _ready
    if _producer is not None:
        await _producer.stop()
        _producer = None
    _ready = False
