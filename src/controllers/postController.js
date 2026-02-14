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