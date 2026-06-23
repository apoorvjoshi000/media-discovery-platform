"""Kafka consumer for the `interactions` topic. Persists every event to Mongo
and updates the in-memory trending window in real time. Runs as an asyncio task
started at app startup; degrades gracefully when Kafka is unavailable."""
from __future__ import annotations

import asyncio
import json
import logging

from aiokafka import AIOKafkaConsumer

from . import db
from .cf import WEIGHTS
from .config import settings
from .metrics import EVENTS_CONSUMED
from .trending import TrendingWindow

log = logging.getLogger("recommender.consumer")
TOPIC = "interactions"


class Consumer:
    def __init__(self, trending: TrendingWindow) -> None:
        self._trending = trending
        self._task: asyncio.Task | None = None
        self._consumer: AIOKafkaConsumer | None = None
        self._stop = asyncio.Event()

    async def start(self) -> None:
        self._task = asyncio.create_task(self._run())

    async def _run(self) -> None:
        self._consumer = AIOKafkaConsumer(
            TOPIC,
            bootstrap_servers=settings.kafka_brokers,
            group_id="recommender-v1",
            auto_offset_reset="earliest",  # replay history on first start
            enable_auto_commit=True,
        )
        try:
            await self._consumer.start()
        except Exception as exc:  # noqa: BLE001
            # Without Kafka the service still serves recommendations from
            # whatever history is already in Mongo.
            log.warning("kafka consumer failed (%s); serving from Mongo history only", exc)
            return
        log.info("kafka consumer running on %s", settings.kafka_brokers)
        try:
            async for msg in self._consumer:
                if self._stop.is_set():
                    break
                try:
                    e = json.loads(msg.value)
                    await db.events().insert_one(dict(e))
                    self._trending.add(e["movieId"], WEIGHTS.get(e["type"], 1), e["ts"])
                    EVENTS_CONSUMED.labels(e["type"]).inc()
                except Exception as exc:  # noqa: BLE001 - one bad message must not kill the loop
                    log.warning("skipping bad message: %s", exc)
        finally:
            await self._consumer.stop()

    async def stop(self) -> None:
        self._stop.set()
        if self._consumer is not None:
            await self._consumer.stop()
        if self._task is not None:
            self._task.cancel()
