const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// MySQL 커넥션 풀 설정
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'routinenote',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// 0. 메인 루트 경로 (서버 상태 확인용)
app.get('/', (req, res) => {
  res.send('🚀 RoutineNote 백엔드 서버가 정상적으로 작동 중입니다!');
});

// 1. 오늘 루틴 목록 및 운동 일지 조회 API
app.get('/api/workout/today', async (req, res) => {
  const userId = req.query.userId || 'testuser';
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
      'SELECT selection_id, routine_type, is_checked, confirmed_at FROM TODAY_ROUTINE_SELECTION WHERE log_id = ?',
      [logId]
    );

    res.json({ success: true, logId, today, routines });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'DB 조회 중 오류 발생' });
  }
});

// 2. 운동 루틴 체크/해제 API
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
    res.status(500).json({ success: false, message: '상태 변경 중 오류 발생' });
  }
});

// 3. GPS 런닝 기록 저장 API
app.post('/api/workout/gps', async (req, res) => {
  const { selectionId, distance, calories, routePath } = req.body;

  try {
    const [result] = await pool.query(
      'INSERT INTO GPS_LOG (selection_id, distance, calories, route_path) VALUES (?, ?, ?, ?)',
      [selectionId, distance, calories, JSON.stringify(routePath)]
    );

    await pool.query(
      'UPDATE TODAY_ROUTINE_SELECTION SET is_checked = TRUE, confirmed_at = NOW() WHERE selection_id = ?',
      [selectionId]
    );

    res.json({ success: true, gpsId: result.insertId, message: 'GPS 런닝 기록이 DB에 저장되었습니다.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'GPS 저장 중 오류 발생' });
  }
});

// 4. 신체 정보(BMI/BMR) 저장 API
app.post('/api/user/body', async (req, res) => {
  const { userId, height, weight, bmi, bmr } = req.body;

  try {
    const [result] = await pool.query(
      'INSERT INTO BODY_RECORD (user_id, height, weight, bmi, bmr) VALUES (?, ?, ?, ?, ?)',
      [userId || 'testuser', height, weight, bmi, bmr]
    );

    res.json({ success: true, bodyRecId: result.insertId, message: '신체 데이터가 저장되었습니다.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: '신체 정보 저장 중 오류 발생' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 RoutineNote 백엔드 서버가 ${PORT}번 포트에서 실행 중입니다.`);
});