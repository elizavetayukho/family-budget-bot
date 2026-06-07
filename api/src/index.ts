import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import path from 'path';
import { scheduleMonthlyReset } from './jobs/monthlyReset';
import { scheduleUncategorisedReminder } from './jobs/uncategorisedReminder';

import authRoutes from './routes/auth';
import dashboardRoutes from './routes/dashboard';
import incomeRoutes from './routes/income';
import expenseRoutes from './routes/expenses';
import jarRoutes from './routes/jars';
import overheadRoutes from './routes/overheads';
import deductionRoutes from './routes/deductions';
import rateRoutes from './routes/rates';
import accountRoutes from './routes/account';
import historyRoutes from './routes/history';
import adminRoutes from './routes/admin';

const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(cors({
  origin: process.env.WEB_APP_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/income', incomeRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/jars', jarRoutes);
app.use('/api/overheads', overheadRoutes);
app.use('/api/deductions', deductionRoutes);
app.use('/api/rates', rateRoutes);
app.use('/api/account', accountRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/admin', adminRoutes);

// In production, serve the built React frontend
if (process.env.NODE_ENV === 'production') {
  const webDist = path.join(__dirname, '../../web/dist');
  app.use(express.static(webDist));
  app.get('*', (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
  scheduleMonthlyReset();
  scheduleUncategorisedReminder();
});

export default app;
