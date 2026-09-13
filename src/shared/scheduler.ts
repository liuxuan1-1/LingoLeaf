import type { Rating, Review } from './types';

const DAY = 86_400_000;

/** A deliberately small, deterministic SM-2-inspired schedule. Intervals are in days. */
export function initialReview(now = new Date()): Review {
  return { dueAt: now.toISOString(), interval: 0, ease: 2.5, repetitions: 0, lastReviewedAt: null };
}

export function scheduleReview(previous: Review, rating: Rating, now = new Date()): Review {
  if (!['again', 'hard', 'good', 'easy'].includes(rating))
    throw new Error('Unknown review rating.');
  let interval: number;
  let ease = previous.ease;
  let repetitions = previous.repetitions + 1;
  if (rating === 'again') {
    interval = 1 / 1440;
    ease = Math.max(1.3, ease - 0.2);
    repetitions = 0;
  } else if (rating === 'hard') {
    interval = Math.max(1, Math.round(previous.interval * 1.2));
    ease = Math.max(1.3, ease - 0.15);
  } else if (rating === 'good') {
    interval =
      previous.repetitions === 0
        ? 1
        : previous.repetitions === 1 && previous.interval <= 1
          ? 3
          : Math.max(1, Math.round(previous.interval * ease));
  } else {
    interval =
      previous.repetitions === 0 ? 4 : Math.max(4, Math.round(previous.interval * ease * 1.3));
    ease = Math.min(3.5, ease + 0.15);
  }
  interval = Math.min(interval, 3650);
  return {
    dueAt: new Date(now.getTime() + interval * DAY).toISOString(),
    interval,
    ease: Math.round(ease * 100) / 100,
    repetitions,
    lastReviewedAt: now.toISOString(),
  };
}
