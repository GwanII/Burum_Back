const db = require('../database'); 

// [기본 기능] 사용자가 캘린더에서 직접 수행하는 일정 제어 로직
exports.createCalendarEvent = async (req, res) => {
try {
        // 1. 작성자 ID 확인 (토큰에서 가져옴)
        const writerId = req.user ? req.user.id : null; 
        const { applicantId, title, deadline, location } = req.body;

        console.log("=========================================");
        console.log("🚀 [광역 연동 시작]");
        console.log("작성자(나) ID:", writerId);
        console.log("지원자 ID:", applicantId);
        console.log("게시물 제목:", title);
        console.log("=========================================");

        if (!writerId || !applicantId || !title || !deadline) {
            console.log("🚨 데이터 누락 발생! 작성자 ID가 없거나 필수값이 부족하오!");
            return res.status(400).json({ success: false, message: '데이터가 부족하여 연동할 수 없소!' });
        }

        // 2. 날짜 번역 (이전의 번역 마법 계승)
        let deadlineDate;
        const dateMatch = deadline.match(/(\d+)\/(\d+)\s+(\d+):(\d+)/);
        if (dateMatch) {
            const currentYear = new Date().getFullYear();
            deadlineDate = new Date(currentYear, parseInt(dateMatch[1]) - 1, parseInt(dateMatch[2]), parseInt(dateMatch[3]), parseInt(dateMatch[4]));
        } else {
            deadlineDate = new Date(deadline);
        }

        if (isNaN(deadlineDate.getTime())) {
            return res.status(400).json({ success: false, message: '날짜 형식이 잘못되었소!' });
        }

        const endTime = new Date(deadlineDate.getTime() + (60 * 60 * 1000));
        const formatDateTime = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:00`;
        const schedulesJson = JSON.stringify([{ start: formatDateTime(deadlineDate), end: formatDateTime(endTime) }]);

        // 🛡️ [안전 장치] 두 번의 INSERT를 병렬로 실행하여 한 명이 실패해도 로그를 남김!
        const query = `INSERT INTO calendars (user_id, title, content, location, color, alarm, schedules) VALUES (?, ?, ?, ?, ?, ?, ?)`;

        // ⚔️ 1번: 지원자 등록
        const insertApplicant = db.promise().execute(query, [
            applicantId, `[수행할 심부름] ${title}`, '확정된 심부름입니다.', location || '', '#FFCCBC', '30', schedulesJson
        ]);

        // ⚔️ 2번: 작성자 등록
        const insertWriter = db.promise().execute(query, [
            writerId, `[내가 요청한 심부름] ${title}`, '지원자가 매칭되었습니다.', location || '', '#FFF59D', '30', schedulesJson
        ]);

        // 두 주문이 모두 끝날 때까지 기다림!
        await Promise.all([insertApplicant, insertWriter]);

        console.log("✅ [성공] 작성자와 지원자 모두 등록 완료!");
        res.status(201).json({ success: true, message: '양쪽 달력에 모두 등록되었소!' });

    } catch (error) {
        console.error("🚨 광역 연동 중 치명적 에러:", error);
        res.status(500).json({ success: false, message: '서버 에러 발생!' });
    }
};

exports.getCalendarEvents = async (req, res) => {
    try {
        const userId = req.user.id;
        const [events] = await db.promise().execute(`SELECT * FROM calendars WHERE user_id = ? ORDER BY created_at DESC`, [userId]);
        res.status(200).json({ success: true, events });
    } catch (error) {
        res.status(500).json({ success: false, message: '조회 실패' });
    }
};

exports.deleteCalendarEvents = async (req, res) => {
    try {
        const userId = req.user.id;
        const { ids } = req.body;
        const placeholders = ids.map(() => '?').join(',');
        const query = `DELETE FROM calendars WHERE id IN (${placeholders}) AND user_id = ?`;
        await db.promise().execute(query, [...ids, userId]);
        res.status(200).json({ success: true, message: '삭제 완료' });
    } catch (error) {
        res.status(500).json({ success: false, message: '삭제 실패' });
    }
};

exports.createDualErrandEvent = async (req, res) => {
    try {
        console.log("=========================================");
        console.log("🔥 [캘린더 광역 등록 요청 도착!]");
        console.log("넘어온 데이터:", req.body);
        console.log("=========================================");
        const writerId = req.user.id; // 👈 버튼을 누른 용사님(작성자)
        const { applicantId, title, deadline, location } = req.body; // 👈 지원자 ID와 정보

        if (!applicantId || !title || !deadline) {
            return res.status(400).json({ success: false, message: '필수 데이터가 부족하오 용사님!' });
        }
// ====================================================================
        // 🌟 [날짜 번역 마법] "4/19 14:59 마감" -> 진짜 날짜(Date)로 변환!
        // ====================================================================
        let deadlineDate;
        
        // 정규식(Regex)을 써서 "숫자/숫자 숫자:숫자" 패턴을 족집게처럼 뽑아냄!
        const dateMatch = deadline.match(/(\d+)\/(\d+)\s+(\d+):(\d+)/);

        if (dateMatch) {
            const currentYear = new Date().getFullYear(); // 연도가 없으니 올해 연도로 자동 설정!
            const month = parseInt(dateMatch[1]) - 1;     // JS는 달(Month)을 0부터 세니까 -1 해줌!
            const day = parseInt(dateMatch[2]);
            const hour = parseInt(dateMatch[3]);
            const minute = parseInt(dateMatch[4]);
            
            deadlineDate = new Date(currentYear, month, day, hour, minute);
        } else {
            // 혹시라도 평범한 영어 날짜 포맷이 올 경우를 대비한 플랜 B
            deadlineDate = new Date(deadline);
        }

        // 그래도 실패했다면?
        if (isNaN(deadlineDate.getTime())) {
            console.log("🚨 날짜 번역 대실패! 들어온 값:", deadline);
            return res.status(400).json({ success: false, message: '서버가 날짜를 이해하지 못했소!' });
        }
        // ====================================================================


        const endTime = new Date(deadlineDate.getTime() + (60 * 60 * 1000)); 
        const formatDateTime = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:00`;
        const schedulesJson = JSON.stringify([{ start: formatDateTime(deadlineDate), end: formatDateTime(endTime) }]);

        // ⚔️ 1번 타격: 지원자(심부름꾼) 달력에 저장!
        const query1 = `INSERT INTO calendars (user_id, title, content, location, color, alarm, schedules) VALUES (?, ?, ?, ?, ?, ?, ?)`;
        await db.promise().execute(query1, [applicantId, `[수행할 심부름] ${title}`, '확정된 심부름입니다.', location || '', '#FFCCBC', '30', schedulesJson]);

        // ⚔️ 2번 타격: 작성자(나) 달력에 저장!
        const query2 = `INSERT INTO calendars (user_id, title, content, location, color, alarm, schedules) VALUES (?, ?, ?, ?, ?, ?, ?)`;
        await db.promise().execute(query2, [writerId, `[내가 요청한 심부름] ${title}`, '지원자가 매칭되었습니다.', location || '', '#FFF59D', '30', schedulesJson]);

        res.status(201).json({ success: true, message: '두 용사님의 달력에 일정을 모두 새겼소!!!!!' });
    } catch (error) {
        console.error("광역 등록 에러:", error);
        res.status(500).json({ success: false, message: '서버 에러 발생!' });
    }
};

exports.deleteDualErrandEvent = async (req, res) => {
    try {
        const writerId = req.user.id;
        const { applicantId, title } = req.body;

        const query = `DELETE FROM calendars WHERE user_id IN (?, ?) AND (title = ? OR title = ?)`;
        await db.promise().execute(query, [writerId, applicantId, `[수행할 심부름] ${title}`, `[내가 요청한 심부름] ${title}`]);

        res.status(200).json({ success: true, message: '양쪽 달력에서 깨끗이 지웠소!!!!!' });
    } catch (error) {
        console.error("광역 삭제 에러:", error);
        res.status(500).json({ success: false, message: '서버 에러 발생!' });
    }
};