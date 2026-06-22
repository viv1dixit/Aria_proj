import { Queue } from 'bullmq';
import { redisConnection } from '../config/redis';

export const itemQueue = new Queue('item-processing', { connection: redisConnection });
