const db = require('../database'); 

exports.createCalendarEvent = async (req, res) => {
    try {
        const userId = req.user.id; 
        const { title, content, location, color, alarm, schedules } = req.body;

        if (!title || !schedules || schedules.length === 0) {
            return res.status(400).json({ success: false, message: '제목과 날짜/시간은 필수입니다.' });
        }

        const schedulesJson = JSON.stringify(schedules);
        const query = `
            INSERT INTO calendars 
            (user_id, title, content, location, color, alarm, schedules) 
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        
        const [result] = await db.promise().execute(query, [
            userId, 
            title, 
            content || '', 
            location || '', 
            color || '#90B2AB', // 기본색
            alarm || '정각', 
            schedulesJson
        ]);

        res.status(201).json({ 
            success: true, 
            message: '일정이 성공적으로 등록됐습니다.',
            calendarId: result.insertId 
        });

    } catch (error) {
        console.error("캘린더 생성 중 에러 발생:", error);
        res.status(500).json({ success: false, message: '서버 에러 발생' });
    }
};

exports.getCalendarEvents = async (req, res) => {
    try {
        const userId = req.user.id;
        
        const query = `SELECT * FROM calendars WHERE user_id = ? ORDER BY created_at DESC`;
        
        const [events] = await db.promise().execute(query, [userId]);

        res.status(200).json({ success: true, events });
    } catch (error) {
        console.error("캘린더 조회 중 에러 발생:", error);
        res.status(500).json({ success: false, message: '서버 에러 발생' });
    }
};

exports.deleteCalendarEvents = async (req, res) => {
    try {
        const userId = req.user.id;
        const { ids } = req.body;

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ success: false, message: '삭제할 일정 번호가 없소!!!!!' });
        }

        const placeholders = ids.map(() => '?').join(',');

        const query = `DELETE FROM calendars WHERE id IN (${placeholders}) AND user_id = ?`;

        const params = [...ids, userId];

        const [result] = await db.promise().execute(query, params);

        res.status(200).json({ 
            success: true, 
            message: `🎉 ${result.affectedRows}개의 일정 삭제` 
        });

    } catch (error) {
        console.error("캘린더 삭제 중 에러 발생:", error);
        res.status(500).json({ success: false, message: '서버 에러 발생' });
    }
};