const express = require('express');
const { Pool, types } = require('pg');
const cors = require('cors');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const path = require('path');

// GIỮ NGUYÊN KIỂU CHUỖI CỦA TIMESTAMP TRÁNH LỆCH 7 TIẾNG
types.setTypeParser(1114, (str) => str);
types.setTypeParser(1082, (str) => str);

const app = express();
app.use(cors());
app.use(express.json({ limit: '15mb' }));

// PHÂN PHỐI THƯ MỤC GIAO DIỆN CHÍNH
app.use(express.static(path.join(__dirname, 'public')));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const JWT_SECRET = process.env.JWT_SECRET || 'travel_os_super_secret_jwt_key_2026';

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Bắt tự động tạo Schema nếu DB rỗng
async function ensureSchema() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        full_name VARCHAR(150) DEFAULT 'Quản trị viên',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    const defaultHash = hashPassword('123456');
    await pool.query(
      `INSERT INTO users (username, password_hash, full_name)
       VALUES ('admin', $1, 'Gia đình Admin')
       ON CONFLICT (username) DO NOTHING`,
      [defaultHash]
    );
    await pool.query(`ALTER TABLE itinerary_items ADD COLUMN IF NOT EXISTS is_done BOOLEAN DEFAULT FALSE;`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS custom_phrases (
        id SERIAL PRIMARY KEY,
        category VARCHAR(100) DEFAULT 'Tùy chỉnh',
        vi_text TEXT NOT NULL,
        zh_text TEXT NOT NULL,
        pinyin TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS packing_items (
        id SERIAL PRIMARY KEY,
        trip_id INT REFERENCES trips(id) ON DELETE CASCADE,
        item_name VARCHAR(255) NOT NULL,
        quantity INT DEFAULT 1,
        status VARCHAR(50) DEFAULT 'Chưa có',
        luggage_type VARCHAR(50) DEFAULT 'Ký gửi',
        suitcase_owner VARCHAR(150) DEFAULT 'Vali chung',
        cost NUMERIC(12, 0) DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
  } catch (err) {
    console.error('Schema migration error:', err.message);
  }
}
ensureSchema();

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại!' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token không hợp lệ hoặc đã hết hạn!' });
  }
}

// ================= AUTH APIs =================
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu!' });
    const user = result.rows[0];
    if (user.password_hash !== hashPassword(password)) return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu!' });
    const token = jwt.sign(
      { id: user.id, username: user.username, full_name: user.full_name },
      JWT_SECRET, { expiresIn: '30d' }
    );
    res.json({ token, user: { id: user.id, username: user.username, full_name: user.full_name } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/change-password', authMiddleware, async (req, res) => {
  const { old_password, new_password } = req.body;
  if (!new_password || new_password.length < 4) return res.status(400).json({ error: 'Mật khẩu mới phải có ít nhất 4 ký tự!' });
  try {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const user = result.rows[0];
    if (!user || user.password_hash !== hashPassword(old_password)) return res.status(400).json({ error: 'Mật khẩu hiện tại không chính xác!' });
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashPassword(new_password), req.user.id]);
    res.json({ success: true, message: 'Đổi mật khẩu thành công!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================= TRIPS CRUD APIs =================
app.get('/api/trips', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT t.*, 
             (COALESCE((SELECT SUM(cost) FROM itinerary_items WHERE trip_id = t.id), 0) +
              COALESCE((SELECT SUM(cost) FROM packing_items WHERE trip_id = t.id), 0)) as total_cost,
             (SELECT COUNT(id) FROM itinerary_items WHERE trip_id = t.id) as item_count,
             (SELECT COUNT(id) FROM packing_items WHERE trip_id = t.id) as packing_count
      FROM trips t
      ORDER BY t.start_date ASC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/trips', authMiddleware, async (req, res) => {
  const { title, destination, start_date, end_date, members, notes } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO trips (title, destination, start_date, end_date, members, notes) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [title, destination, start_date, end_date, members, notes]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/trips/:id', authMiddleware, async (req, res) => {
  const { title, destination, start_date, end_date, members, notes } = req.body;
  try {
    const result = await pool.query(
      `UPDATE trips SET title = $1, destination = $2, start_date = $3, end_date = $4, members = $5, notes = $6 WHERE id = $7 RETURNING *`,
      [title, destination, start_date, end_date, members, notes, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/trips/:id', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM trips WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================= ITINERARY ITEMS CRUD APIs =================
app.get('/api/trips/:tripId/items', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM itinerary_items WHERE trip_id = $1 ORDER BY COALESCE(is_done, false) ASC, start_datetime ASC`,
      [req.params.tripId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/items', authMiddleware, async (req, res) => {
  const { trip_id, item_type, title, provider_or_code, start_datetime, end_datetime, location_from, location_to, assigned_to, cost, status, is_done, details, qr_image } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO itinerary_items (trip_id, item_type, title, provider_or_code, start_datetime, end_datetime, location_from, location_to, assigned_to, cost, status, is_done, details, qr_image)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [trip_id, item_type, title, provider_or_code, start_datetime, end_datetime || null, location_from, location_to, assigned_to || 'Cả đoàn', cost || 0, status || 'Đã xác nhận', Boolean(is_done), details || {}, qr_image || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/items/:id', authMiddleware, async (req, res) => {
  const { item_type, title, provider_or_code, start_datetime, end_datetime, location_from, location_to, assigned_to, cost, status, is_done, details, qr_image } = req.body;
  try {
    const result = await pool.query(
      `UPDATE itinerary_items SET item_type = $1, title = $2, provider_or_code = $3, start_datetime = $4, end_datetime = $5, location_from = $6, location_to = $7, assigned_to = $8, cost = $9, status = $10, is_done = $11, details = $12, qr_image = COALESCE($13, qr_image) WHERE id = $14 RETURNING *`,
      [item_type, title, provider_or_code, start_datetime, end_datetime || null, location_from, location_to, assigned_to || 'Cả đoàn', cost || 0, status || 'Đã xác nhận', Boolean(is_done), details || {}, qr_image, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/items/:id/toggle-done', authMiddleware, async (req, res) => {
  try {
    const current = await pool.query('SELECT * FROM itinerary_items WHERE id = $1', [req.params.id]);
    if (current.rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy mục này' });
    const item = current.rows[0];
    const nextDone = !item.is_done;
    let nextStatus = item.item_type === 'esim' ? (nextDone ? 'Đã dùng' : 'Chưa dùng') : (nextDone ? 'Đã xong' : 'Đã xác nhận');
    const updated = await pool.query(`UPDATE itinerary_items SET is_done = $1, status = $2 WHERE id = $3 RETURNING *`, [nextDone, nextStatus, req.params.id]);
    res.json(updated.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/items/:id', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM itinerary_items WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/trips/:tripId/import', authMiddleware, async (req, res) => {
  const { items } = req.body;
  const tripId = req.params.tripId;
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Không có dữ liệu hoạt động để nhập!' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let importedCount = 0;
    for (const item of items) {
      await client.query(
        `INSERT INTO itinerary_items (trip_id, item_type, title, provider_or_code, start_datetime, end_datetime, location_from, location_to, assigned_to, cost, status, is_done, details) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [tripId, item.item_type || 'activity', item.title, item.provider_or_code || '', item.start_datetime, item.end_datetime || null, item.location_from || '', item.location_to || '', item.assigned_to || 'Cả đoàn', Number(item.cost || 0), item.status || 'Đã xác nhận', Boolean(item.is_done), item.details || {}]
      );
      importedCount++;
    }
    await client.query('COMMIT');
    res.status(201).json({ success: true, importedCount });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ================= PACKING ITEMS APIs =================
app.get('/api/trips/:tripId/packing', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM packing_items WHERE trip_id = $1 ORDER BY CASE status WHEN 'Chưa có' THEN 1 WHEN 'Đã có' THEN 2 WHEN 'Sang đó rồi mua' THEN 3 WHEN 'Đã chuẩn bị' THEN 4 ELSE 5 END ASC, id DESC`,
      [req.params.tripId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/packing', authMiddleware, async (req, res) => {
  const { trip_id, item_name, quantity, status, luggage_type, suitcase_owner, cost, notes } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO packing_items (trip_id, item_name, quantity, status, luggage_type, suitcase_owner, cost, notes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [trip_id, item_name, Number(quantity || 1), status || 'Chưa có', luggage_type || 'Ký gửi', suitcase_owner || 'Vali chung', Number(cost || 0), notes || '']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/packing/:id', authMiddleware, async (req, res) => {
  const { item_name, quantity, status, luggage_type, suitcase_owner, cost, notes } = req.body;
  try {
    const result = await pool.query(
      `UPDATE packing_items SET item_name = $1, quantity = $2, status = $3, luggage_type = $4, suitcase_owner = $5, cost = $6, notes = $7 WHERE id = $8 RETURNING *`,
      [item_name, Number(quantity || 1), status || 'Chưa có', luggage_type || 'Ký gửi', suitcase_owner || 'Vali chung', Number(cost || 0), notes || '', req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/packing/:id/status', authMiddleware, async (req, res) => {
  const { status } = req.body;
  try {
    const result = await pool.query(`UPDATE packing_items SET status = $1 WHERE id = $2 RETURNING *`, [status, req.params.id]);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/packing/:id', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM packing_items WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================= CUSTOM PHRASES APIs =================
app.get('/api/phrases', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM custom_phrases ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/phrases', authMiddleware, async (req, res) => {
  const { category, vi_text, zh_text, pinyin } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO custom_phrases (category, vi_text, zh_text, pinyin) VALUES ($1, $2, $3, $4) RETURNING *`,
      [category || 'Tùy chỉnh', vi_text, zh_text, pinyin || '']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/phrases/:id', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM custom_phrases WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ROUTE CUỐI CÙNG: Cho phép Frontend xử lý Routing nếu cần thiết, luôn trả về index.html cho các route không phải API
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'API không tồn tại!' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`TravelOS API v6 (Static Hosted) running on port ${PORT}`));