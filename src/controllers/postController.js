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
    const postId = Number(req.body.postId);
    const message = req.body.message || "";
    const applicantId = Number(req.user ? req.user.id : req.body.userId);

    if (!postId || !applicantId || isNaN(postId) || isNaN(applicantId)) {
        return res.status(400).json({ message: '유효한 게시물 ID와 지원자 ID가 필요합니다.' });
    }

    // 🌟 새로운 지원 테이블에 INSERT!
    const sql = `
        INSERT INTO applications (post_id, user_id, message) 
        VALUES (?, ?, ?)
    `;

    db.query(sql, [postId, applicantId, message], (err, results) => {
        if (err) {
            console.error('지원 접수 DB 에러:', err);
            // 중복 지원 방지 (만약 post_id + user_id를 UNIQUE로 묶었다면)
            if (err.code === 'ER_DUP_ENTRY') {
                return res.status(409).json({ message: '이미 지원한 심부름입니다.' });
            }
            return res.status(500).json({ message: '서버 오류' });
        }

        res.status(200).json({ message: '심부름 지원이 성공적으로 접수되었습니다!' });
    });
};

exports.getApplicants = (req, res) => {
    const postId = req.params.postId; 

    // 🌟 applications 테이블을 기준으로 users 정보를 조인해서 가져옵니다.
   const sql = `
        SELECT 
            u.id AS user_id, 
            u.nickname, 
            u.profile_image_url, 
            u.user_title, 
            u.grade,
            a.message AS apply_message,  -- 지원 메시지
            a.status,                    -- 지원 상태 (PENDING, ACCEPTED 등)
            a.created_at,                -- 지원한 시간
            -- 👇 여기에 마법의 한 줄 추가! 👇
            (SELECT assigned_user_id FROM posts WHERE id = a.post_id) AS assigned_user_id
        FROM applications a
        JOIN users u ON a.user_id = u.id
        WHERE a.post_id = ?
        ORDER BY a.created_at DESC       -- 최신 지원자가 위로 오도록 정렬
    `;

    db.query(sql, [postId], (err, results) => {
        if (err) {
            console.error('지원자 목록 조회 에러:', err);
            return res.status(500).json({ message: '서버 오류' });
        }
        
        res.status(200).json(results);
    });
};