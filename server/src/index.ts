import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB } from './config/database';
import authRoutes from './routes/authRoutes';
import conversationRoutes from './routes/conversationRoutes';
import itemRoutes from './routes/itemRoutes';
import tagRoutes from './routes/tagRoutes';
import collectionRoutes from './routes/collectionRoutes';
import noteRoutes from './routes/noteRoutes';
import statsRoutes from './routes/statsRoutes';
import sseRoutes from './routes/sseRoutes';
import { startItemWorker } from './workers/itemWorker';

dotenv.config({ path: '../.env' });

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/tags', tagRoutes);
app.use('/api/collections', collectionRoutes);
app.use('/api/notes', noteRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/events', sseRoutes);

const startServer = async () => {
  await connectDB();
  startItemWorker();
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
};

startServer();
