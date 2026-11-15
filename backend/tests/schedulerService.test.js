import { describe, it, expect } from '@jest/globals';
import { sameTimeNextWeek } from '../services/schedulerService.js';

describe('schedulerService: sameTimeNextWeek', () => {
    it('adds exactly seven days in an ordinary week', () => {
        const next = sameTimeNextWeek(new Date('2026-06-02T17:00:00Z'), 'Europe/London');
        expect(next.toISOString()).toBe('2026-06-09T17:00:00.000Z');
    });

    it('keeps the same time on the clock when summer time ends in between', () => {
        // 20:00 in London on 20 Oct (UTC+1) → 20:00 on 27 Oct (UTC+0), which is an hour later in UTC.
        const next = sameTimeNextWeek(new Date('2026-10-20T19:00:00Z'), 'Europe/London');
        expect(next.toISOString()).toBe('2026-10-27T20:00:00.000Z');
    });
});
