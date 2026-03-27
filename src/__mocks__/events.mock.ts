import { EventsService } from '../events/events.service';
import { BeliefEventsService } from '../events/belief-events.service';

export const mockEventsService: Partial<EventsService> = {
  emit: jest.fn().mockResolvedValue(undefined),
};

export const mockBeliefEventsService: Partial<BeliefEventsService> = {
  record: jest.fn().mockResolvedValue({ isOk: () => true }),
  getHistory: jest.fn().mockResolvedValue({ isOk: () => true, value: [] }),
  getRecentEvents: jest.fn().mockResolvedValue({ isOk: () => true, value: [] }),
};
