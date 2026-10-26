const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// MySQL 커넥션 풀 설정 (Aiven 전용 포트 및 SSL 강제)
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER || 'avnadmin',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'defaultdb',
  port: parseInt(process.env.DB_PORT, 10) || 10710,
  connectTimeout: 20000, // 타임아웃 여유시간 20초 지정
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: {
    rejectUnauthorized: false
  }
});

// 메인 루트 확인
app.get('/', (req, res) => {
  res.send('🚀 RoutineNote API Server is Running!');
});

// 1. 오늘 루틴 목록 및 운동 일지 조회 API
app.get('/api/workout/today', async (req, res) => {
  const userId = req.query.userId || 'dadad';
  const today = new Date().toISOString().split('T')[0];

  try {
    let [logs] = await pool.query(
      'SELECT * FROM WORKOUT_LOG WHERE user_id = ? AND workout_date = ?',
      [userId, today]
    );

    let logId;
    if (logs.length === 0) {
      const [result] = await pool.query(
        'INSERT INTO WORKOUT_LOG (user_id, workout_date, is_completed, current_streak) VALUES (?, ?, FALSE, 0)',
        [userId, today]
      );
      logId = result.insertId;
    } else {
      logId = logs[0].log_id;
    }

    const [routines] = await pool.query(
      'SELECT selection_id, routine_type, routine_name, is_checked, confirmed_at FROM TODAY_ROUTINE_SELECTION WHERE log_id = ?',
      [logId]
    );

    res.json({ success: true, logId, today, routines });
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 2. 루틴 체크/해제 API
app.post('/api/workout/check', async (req, res) => {
  const { selectionId, isChecked } = req.body;

  try {
    const confirmedAt = isChecked ? new Date() : null;
    await pool.query(
      'UPDATE TODAY_ROUTINE_SELECTION SET is_checked = ?, confirmed_at = ? WHERE selection_id = ?',
      [isChecked, confirmedAt, selectionId]
    );

    res.json({ success: true, message: '루틴 상태가 업데이트 되었습니다.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 3. GPS 런닝 기록 저장 API
app.post('/api/workout/gps', async (req, res) => {
  const { selectionId, distance, calories, routePath } = req.body;

  try {
    const [result] = await pool.query(
      'INSERT INTO GPS_LOG (selection_id, distance, calories, route_path) VALUES (?, ?, ?, ?)',
      [selectionId || null, distance || 0, calories || 0, JSON.stringify(routePath || [])]
    );

    if (selectionId) {
      await pool.query(
        'UPDATE TODAY_ROUTINE_SELECTION SET is_checked = TRUE, confirmed_at = NOW() WHERE selection_id = ?',
        [selectionId]
      );
    }

    res.json({ success: true, gpsId: result.insertId, message: 'GPS 기록 저장 완료' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});