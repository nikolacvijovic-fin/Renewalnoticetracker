import { LocalDomainEventBus } from "@/lib/events/domain-event-bus";
import type { DomainEvent, DomainEventInput } from "@/lib/events/domain-event-types";

export type DomainEventRecorder = {
  record(input: DomainEventInput): Promise<DomainEvent>;
  recordedEvents(): DomainEvent[];
};

export function createInMemoryDomainEventRecorder(): DomainEventRecorder {
  const events: DomainEvent[] = [];
  const bus = new LocalDomainEventBus([
    (event) => {
      if (!events.some((existing) => existing.idempotencyKey === event.idempotencyKey)) {
        events.push(event);
      }
    }
  ]);

  return {
    record(input) {
      return bus.publish(input);
    },
    recordedEvents() {
      return [...events];
    }
  };
}
