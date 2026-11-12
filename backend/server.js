const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// 1. Lấy danh sách tất cả chuyến đi kèm tổng chi phí
app.get('/api/trips', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT t.*, 
             COALESCE(SUM(i.cost), 0) as total_cost,
             COUNT(i.id) as item_count
      FROM trips t
      LEFT JOIN itinerary_items i ON t.id = i.trip_id
      GROUP BY t.id
      ORDER BY t.start_date ASC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Tạo chuyến đi mới
app.post('/api/trips', async (req, res) => {
  const { title, destination, start_date, end_date, members, notes } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO trips (title, destination, start_date, end_date, members, notes) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [title, destination, start_date, end_date, members, notes]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Xóa chuyến đi
app.delete('/api/trips/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM trips WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Lấy toàn bộ hạng mục dịch vụ của 1 chuyến đi (Sắp xếp theo thời gian thực)
app.get('/api/trips/:tripId/items', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM itinerary_items 
       WHERE trip_id = $1 
       ORDER BY start_datetime ASC`,
      [req.params.tripId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Thêm hạng mục mới (Bay, Khách sạn, Tàu, eSIM, Vé tham quan)
app.post('/api/items', async (req, res) => {
  const {
    trip_id, item_type, title, provider_or_code,
    start_datetime, end_datetime, location_from, location_to,
    assigned_to, cost, status, details, qr_image
  } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO itinerary_items 
       (trip_id, item_type, title, provider_or_code, start_datetime, end_datetime, location_from, location_to, assigned_to, cost, status, details, qr_image)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [
        trip_id, item_type, title, provider_or_code,
        start_datetime, end_datetime || null, location_from, location_to,
        assigned_to || 'Cả đoàn', cost || 0, status || 'Confirmed',
        details || {}, qr_image || null
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Xóa hạng mục
app.delete('/api/items/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM itinerary_items WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Travel API running on port ${PORT}`));