// backend/controllers/postController.js
const db = require('../database');

// 심부름 전체 목록 가져오기
exports.getAllPosts = (req, res) => {
    const sql = `
        SELECT p.*, u.nickname 
        FROM posts p 
        LEFT JOIN users u ON p.user_id = u.id 
        ORDER BY p.created_at DESC
    `;

    db.query(sql, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ message: 'DB 에러' });
        }
        res.status(200).json(results);
    });
};

exports.getTrendingTags = (req, res) => {
    // 1. 최근 1시간(INTERVAL 1 HOUR) 내에 작성된 글의 tags만 가져옴
    const sql = `
        SELECT tags 
        FROM posts 
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
    `;

    db.query(sql, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ message: 'DB 에러' });
        }

        // 2. 태그 개수 세기 (JavaScript로 계산)
        const tagCounts = {};

        results.forEach(row => {
            let tags = [];
            try {
                // DB에 JSON 문자열로 저장된 걸 배열로 변환
                tags = typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags;
            } catch (e) {
                tags = [];
            }

            if (Array.isArray(tags)) {
                tags.forEach(tag => {
                    // 태그 카운트 +1
                    tagCounts[tag] = (tagCounts[tag] || 0) + 1;
                });
            }
        });

        // 3. 많이 나온 순서대로 정렬하고 Top 6 자르기
        const sortedTags = Object.entries(tagCounts)
            .sort((a, b) => b[1] - a[1]) // 개수 내림차순 정렬
            .slice(0, 6)                 // 상위 6개만 자르기
            .map(entry => entry[0]);     // 태그 이름만 남기기

        res.status(200).json(sortedTags);
    });
};

//옮길거
exports.getUserProfile = (req, res) => {
    const userId = req.user.id;
    // 🌟 id를 추가로 SELECT 합니다.
    const sql = 'SELECT id, nickname FROM users WHERE id = ?';

    db.query(sql, [userId], (err, results) => {
        if (err) return res.status(500).json({ message: 'DB 에러' });
        if (results.length === 0) return res.status(404).json({ message: '유저 없음' });

        // 🌟 id와 nickname을 모두 플러터로 보냅니다.
        res.status(200).json({ 
            id: results[0].id, 
            nickname: results[0].nickname 
        });
    });
};

//다은 작업, 채팅방 상단 게시물 연동에 필요
exports.getPostDetail = (req, res) => {
    const postId = req.params.id;

    const sql = `
        SELECT
            p.*,
            u.nickname AS writerNickname,
            u.profile_image_url AS writerProfileImage,
            u.user_title AS writerTitle,
            u.grade AS writerGrade,
            au.nickname AS assignedUserNickname
        FROM posts p
        LEFT JOIN users u ON p.user_id = u.id
        LEFT JOIN users au ON p.assigned_user_id = au.id
        WHERE p.id = ?
        LIMIT 1
    `;

    db.query(sql, [postId], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ message: '게시물 상세 조회 중 DB 오류' });
        }

        if (results.length === 0) {
            return res.status(404).json({ message: '게시물을 찾을 수 없습니다.' });
        }

        res.status(200).json(results[0]);
    });
};

exports.applyForErrand = (req, res) => {
    // 🌟 플러터에서 보낸 postId, userId, message를 받습니다.
    const { postId, message } = req.body; 
    const applicantId = Number(req.user ? req.user.id : req.body.userId);

    // 방어 로직: 필수 데이터가 안 넘어왔을 때
    if (!postId || !applicantId) {
        return res.status(400).json({ message: '게시물 ID와 지원자 ID가 모두 필요합니다.' });
    }

    // 🌟 핵심: posts 테이블의 특정 게시물(id)을 찾아서, 빈칸(applicant_id, apply_message)을 채워줍니다!
    const sql = `
        UPDATE posts 
        SET applicant_id = ?, apply_message = ? 
        WHERE id = ?
    `;

    // 쿼리 실행 (? 자리에 들어갈 값들을 순서대로 배열로 넣습니다)
    db.query(sql, [applicantId, message, postId], (err, results) => {
        if (err) {
            console.error('심부름 지원 DB 에러:', err);
            return res.status(500).json({ message: '지원 접수 중 서버 오류가 발생했습니다.' });
        }

        // 만약 업데이트된 줄(row)이 없다면 = 해당 ID의 게시물이 존재하지 않는다면
        if (results.affectedRows === 0) {
            return res.status(404).json({ message: '해당 심부름 게시물을 찾을 수 없습니다.' });
        }

        // 플러터로 성공 축포 쏘기! (200 OK)
        res.status(200).json({ message: '심부름 지원이 성공적으로 접수되었습니다!' });
    });
};