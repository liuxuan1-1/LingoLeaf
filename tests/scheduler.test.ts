import { describe, expect, it } from 'vitest';
import { initialReview, scheduleReview } from '../src/shared/scheduler';
import type { Rating } from '../src/shared/types';

const now = new Date('2026-09-13T10:00:00.000Z');

describe('spaced repetition schedule', () => {
  it('makes a new card available immediately and builds a recall schedule', () => {
    const initial = initialReview(now);
    expect(initial.dueAt).toBe(now.toISOString());
    const first = scheduleReview(initial, 'good', now);
    const second = scheduleReview(first, 'good', now);
    const third = scheduleReview(second, 'good', now);
    expect([first.interval, second.interval, third.interval]).toEqual([1, 3, 8]);
    expect(third.repetitions).toBe(3);
    expect(initial.repetitions).toBe(0);
    expect(first.dueAt).toBe('2026-09-14T10:00:00.000Z');
  });
  it('relearns forgotten cards in one minute without a negative ease', () => {
    let review = { ...initialReview(now), ease: 1.3, interval: 100, repetitions: 10 };
    review = scheduleReview(review, 'again', now);
    expect(review.dueAt).toBe('2026-09-13T10:01:00.000Z');
    expect(review.repetitions).toBe(0);
    expect(review.ease).toBe(1.3);
    expect(scheduleReview(review, 'good', now).interval).toBe(1);
  });
  it('distinguishes hard/easy and bounds mature-card intervals', () => {
    const mature = { ...initialReview(now), interval: 30, repetitions: 5 };
    expect(scheduleReview(mature, 'hard', now).interval).toBe(36);
    expect(scheduleReview(mature, 'easy', now).interval).toBe(98);
    expect(scheduleReview({ ...mature, interval: 3650, ease: 3.5 }, 'easy', now).interval).toBe(3650);
    expect(() => scheduleReview(mature, 'unknown' as Rating, now)).toThrow();
  });
  it('does not shorten the interval after an easy card is later recalled correctly', () => {
    const easy = scheduleReview(initialReview(now), 'easy', now);
    const good = scheduleReview(easy, 'good', now);
    expect(easy.interval).toBe(4);
    expect(good.interval).toBe(11);
  });
});
