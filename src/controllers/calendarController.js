// 💡 용사님의 DB 연결 마법서를 가져오오! (경로는 용사님 프로젝트에 맞게 수정하시오!)
const db = require('../config/database'); 

// 🚀 [1. 캘린더 일정 생성 마법!!!!!]
exports.createCalendarEvent = async (req, res) => {
    try {
        // 수문장이 달아준 명찰에서 유저 번호를 뽑아내오!
        const userId = req.user.id; 
        
        // 플러터 대포가 쏴준 데이터들을 받아오오!
        const { title, content, location, color, alarm, schedules } = req.body;

        // 🛡️ 필수 방어막: 제목과 시간이 없으면 튕겨내시오!
        if (!title || !schedules || schedules.length === 0) {
            return res.status(400).json({ success: false, message: '제목과 날짜/시간은 필수요!!!!!' });
        }

        // 🌟 여러 개의 시간을 담은 배열을 통째로 문자열(JSON)로 압축하오!
        const schedulesJson = JSON.stringify(schedules);

        const query = `
            INSERT INTO calendars 
            (user_id, title, content, location, color, alarm, schedules) 
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        
        const [result] = await db.execute(query, [
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
            message: '🎉 일정이 성공적으로 등록되었소!!!!!',
            calendarId: result.insertId 
        });

    } catch (error) {
        console.error("캘린더 생성 중 에러 발생:", error);
        res.status(500).json({ success: false, message: '서버 에러가 발생했소!!!!!' });
    }
};

// 🚀 [2. 내 캘린더 일정 불러오기 마법!!!!!] (미리 만들어 두었소!)
exports.getCalendarEvents = async (req, res) => {
    try {
        const userId = req.user.id;
        
        // 내 일정만 싹 다 가져오기!
        const query = `SELECT * FROM calendars WHERE user_id = ? ORDER BY created_at DESC`;
        const [events] = await db.execute(query, [userId]);

        res.status(200).json({ success: true, events });
    } catch (error) {
        console.error("캘린더 조회 중 에러 발생:", error);
        res.status(500).json({ success: false, message: '서버 에러가 발생했소!!!!!' });
    }
};