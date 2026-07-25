import express from 'express';
import cors from 'cors';

const app = express()
const port = process.env.PORT || 3000;

// Comma-separated list of allowed client origins (e.g. "http://localhost:5173,https://app.example.com")
const clientOrigins = (process.env.CLIENT_ORIGIN ?? 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())

app.use(
  cors({
    origin: clientOrigins,
    credentials: true, // allow cookies (session-based auth) to be sent cross-origin
  }),
)

app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`)
})
