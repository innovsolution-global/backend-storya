import { logger } from '../config/logger';

export type Job = () => Promise<void>;

export interface JobQueue {
  enqueue(name: string, job: Job): void;
  /** Attend la fin des jobs en cours (arrêt propre, tests). */
  drain(): Promise<void>;
}

/**
 * File en mémoire à concurrence limitée.
 * Suffisante pour une instance unique ; pour plusieurs instances, la remplacer
 * par une file persistante (BullMQ + Redis) implémentant la même interface.
 */
export class InMemoryJobQueue implements JobQueue {
  private readonly pending: { name: string; job: Job }[] = [];
  private readonly running = new Set<Promise<void>>();

  constructor(private readonly concurrency: number) {}

  enqueue(name: string, job: Job): void {
    this.pending.push({ name, job });
    this.next();
  }

  private next(): void {
    while (this.running.size < this.concurrency && this.pending.length > 0) {
      const item = this.pending.shift();
      if (!item) return;
      const run = item
        .job()
        .catch((error: unknown) => logger.error({ err: error, job: item.name }, 'Job en échec'))
        .finally(() => {
          this.running.delete(run);
          this.next();
        });
      this.running.add(run);
    }
  }

  async drain(): Promise<void> {
    while (this.running.size > 0 || this.pending.length > 0) {
      await Promise.all([...this.running]);
    }
  }
}

/** Les générations vidéo sont longues et coûteuses : 2 en parallèle par instance. */
export const generationQueue: JobQueue = new InMemoryJobQueue(2);
