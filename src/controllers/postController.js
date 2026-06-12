// backend/controllers/postController.js
const db = require('../database');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const dotenv = require('dotenv');
dotenv.config();

// 심부름 전체 목록 or 추천 목록 가져오기
exports.getAllPosts = async (req, res) => {
    try {
        // 1. 전체 게시물 (기존 로직: 최신순)
        const allSql = `
            SELECT p.*, u.nickname 
            FROM posts p 
            LEFT JOIN users u ON p.user_id = u.id 
            ORDER BY p.created_at DESC
        `;
        const [allPosts] = await db.promise().query(allSql);

        // 2. 추천 게시물
        const recommendedSql = `
            SELECT p.*, u.nickname 
            FROM posts p 
            LEFT JOIN users u ON p.user_id = u.id
            ORDER BY p.view_count DESC, p.created_at DESC
        `;
        const [recommendedPosts] = await db.promise().query(recommendedSql);

        // 전체 게시물과 추천 게시물을 한 번에 응답
        res.status(200).json({
            allPosts: allPosts,
            recommendedPosts: recommendedPosts
        });
    } catch (err) {
        console.error('게시물 및 추천 목록 조회 중 DB 에러:', err);
        res.status(500).json({ message: 'DB 에러' });
    }
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

        LEFT JOIN applications a 
         ON p.id = a.post_id AND a.status = 'ACCEPTED'

      LEFT JOIN users au 
            ON a.user_id = au.id

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

exports.cancelErrand = async (req, res) => {
  try {
    const user_id = req.user.id;
    const post_id = req.body.postId;

    // 🌟 그냥 지원 내역만 삭제하고 끝내기!
    await db.promise().execute(
      `DELETE FROM applications WHERE post_id = ? AND user_id = ?`, 
      [post_id, user_id]
    );

    res.status(200).json({ success: true, message: "취소 완료" });
  } catch (e) {
    res.status(500).json({ success: false });
  }
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
            a.is_read_by_writer,
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


// 이 밑으로 남기현이 한거 추천 알고리즘

// 게시물 수정 (PUT)
exports.updatePost = async (req, res) => {
    try {
        const postId = req.params.id;
        const userId = req.user.id;

        // 1. 해당 게시물이 존재하는지, 본인 글인지 권한 확인
        const [post] = await db.promise().query('SELECT * FROM posts WHERE id = ?', [postId]);
        
        if (post.length === 0) {
            return res.status(404).json({ success: false, message: '게시물을 찾을 수 없습니다.' });
        }
        if (post[0].user_id !== userId) {
            return res.status(403).json({ success: false, message: '게시물 수정 권한이 없습니다.' });
        }

        // 2. 전달받은 데이터 추출 (값이 안 들어왔으면 기존 값 유지)
        const title = req.body.title || post[0].title;
        const content = req.body.content || post[0].content;
        const location = req.body.location || post[0].location;
        const latitude = req.body.latitude || post[0].latitude;
        const longitude = req.body.longitude || post[0].longitude;
        const cost = req.body.cost || post[0].cost;
        const deadline = req.body.deadline || post[0].deadline;
        const tags = req.body.tags || post[0].tags;

        // 3. 이미지 처리 로직
        let image_url = post[0].image_url; // 기본적으로 기존 이미지 유지
        if (req.files && req.files.length > 0) {
            // 새로운 이미지가 업로드된 경우 덮어쓰기
            const imageUrls = req.files.map(file => `/uploads/${file.filename}`);
            image_url = JSON.stringify(imageUrls);
        }

        // 4. DB 업데이트 실행
        const updateSql = `
            UPDATE posts 
            SET title = ?, content = ?, location = ?, latitude = ?, longitude = ?, cost = ?, deadline = ?, tags = ?, image_url = ?
            WHERE id = ?
        `;
        
        await db.promise().execute(updateSql, [
            title, content, location, latitude, longitude, cost, deadline, tags, image_url, postId
        ]);

        res.status(200).json({ success: true, message: '게시물이 성공적으로 수정되었습니다.' });
    } catch (error) {
        console.error('게시물 수정 실패:', error);
        res.status(500).json({ success: false, message: '게시물 수정 중 서버 에러가 발생했습니다.' });
    }
};

// 태그 점수 및 거리 기반 추천 게시물 가져오기
exports.getRecommendedPosts = async (req, res) => {
    try {
        // 🌟 GET 요청이므로 req.query에서 파라미터를 가져옵니다.
        const userId = (req.user && req.user.id) || Number(req.query.userId) || null;
        let latitude = Number(req.query.latitude);
        let longitude = Number(req.query.longitude);

        // 🌟 프론트엔드에서 위치를 안 보냈다면, DB에서 해당 유저의 저장된 위치를 찾아옵니다.
        if (userId && (isNaN(latitude) || isNaN(longitude))) {
            const [userRows] = await db.promise().query('SELECT latitude, longitude FROM users WHERE id = ?', [userId]);
            if (userRows.length > 0 && userRows[0].latitude !== null && userRows[0].longitude !== null) {
                latitude = Number(userRows[0].latitude);
                longitude = Number(userRows[0].longitude);
            }
        }

        let sql = '';
        let params = [];

        // 1. 유저 ID와 내 위치 정보(위도, 경도)가 모두 있는 경우: 태그 점수 합산 + 거리 기반 추천
        if (userId && !isNaN(latitude) && !isNaN(longitude)) {
            sql = `
                SELECT 
                    p.*, 
                    u.nickname,
                    -- 📍 1. MySQL 공간 함수를 이용해 나와 게시물 간의 거리(미터) 계산
                    ST_Distance_Sphere(POINT(p.longitude, p.latitude), POINT(?, ?)) AS distance,
                    -- ⭐ 2. 태그 점수
                    COALESCE(SUM(utp.score), 0) AS tag_score,
                    -- 🏃 3. 거리 점수 가산점 (1km 이내 5점,. 1~2km 4점.. 5km 이상 0점)
                    GREATEST(0, 5 - FLOOR(ST_Distance_Sphere(POINT(p.longitude, p.latitude), POINT(?, ?)) / 1000)) AS distance_score,
                    -- 🏆 4. 최종 점수 = 태그 점수 + 거리 점수
                    (COALESCE(SUM(utp.score), 0) + GREATEST(0, 5 - FLOOR(ST_Distance_Sphere(POINT(p.longitude, p.latitude), POINT(?, ?)) / 1000))) AS match_score
                FROM posts p
                LEFT JOIN users u ON p.user_id = u.id
                LEFT JOIN user_tag_preferences utp 
                    ON utp.user_id = ? AND JSON_CONTAINS(p.tags, CONCAT('"', utp.tag, '"'))
                WHERE p.status = 'WAITING'
                GROUP BY p.id
                ORDER BY match_score DESC, distance ASC -- 점수가 높고, 거리가 가까운 순 정렬
                LIMIT 10
            `;
            // ST_Distance_Sphere를 3번 호출하므로 [경도, 위도]를 3번 반복해서 넣어줍니다.
            params = [longitude, latitude, longitude, latitude, longitude, latitude, userId];
        } 
        // 2. 정보가 부족한 경우: 기존 로직(조회수 + 최신순)으로 폴백
        else {
            sql = `
                SELECT p.*, u.nickname 
                FROM posts p 
                LEFT JOIN users u ON p.user_id = u.id 
                WHERE p.status = 'WAITING'
                ORDER BY p.view_count DESC, p.created_at DESC
                LIMIT 10
            `;
        }

        const [results] = await db.promise().query(sql, params);

        // 🌟 백엔드 터미널에 거리 및 점수 계산 결과 로그 출력
        if (userId && !isNaN(latitude) && !isNaN(longitude)) {
            console.log(`\n📍 [추천 시스템] 유저(${userId}) 추천 결과 (내 위치: ${latitude}, ${longitude})`);
            results.forEach((post, i) => {
                console.log(`  ${i + 1}. [게시물 ${post.id}] 총점: ${post.match_score}점 (태그: ${post.tag_score} + 거리: ${post.distance_score}) | 거리: ${Math.round(post.distance)}m | 제목: ${post.title}`);
            });
            console.log('--------------------------------------------------\n');
        }

        res.status(200).json(results);
    } catch (err) {
        console.error('추천 게시물 조회 중 DB 오류:', err);
        res.status(500).json({ message: 'DB 에러' });
    }
};

// 게시물 상세 페이지 진입 시 조회수 증가
exports.increaseViewCount = async (req, res) => {
    const postId = Number(req.params.id);

    if (isNaN(postId)) {
        return res.status(400).json({ success: false, message: '잘못된 게시물 ID입니다.' });
    }

    // 🌟 유저 정보 확인 (로그인 상태일 경우 req.user, 아니면 body의 userId 활용)
    const userId = (req.user && req.user.id) || (req.body && req.body.userId) || null;

    try {
        // 1. 기존 로직: 조회수 1 증가
        const updateViewCountSql = `UPDATE posts SET view_count = IFNULL(view_count, 0) + 1 WHERE id = ?`;
        await db.promise().execute(updateViewCountSql, [postId]);
        
        // 2. 추천 시스템 로직: 사용자가 본 게시물의 태그 점수 +1
        if (userId) {
            const [postRows] = await db.promise().execute(`SELECT tags FROM posts WHERE id = ?`, [postId]);
            
            if (postRows.length > 0 && postRows[0].tags) {
                let tags = [];
                try {
                    // DB에 저장된 태그 배열 꺼내오기
                    tags = typeof postRows[0].tags === 'string' ? JSON.parse(postRows[0].tags) : postRows[0].tags;
                } catch (e) {
                    tags = [];
                }
                
                if (Array.isArray(tags) && tags.length > 0) {
                    const upsertSql = `
                        INSERT INTO user_tag_preferences (user_id, tag, score) 
                        VALUES (?, ?, 1) 
                        ON DUPLICATE KEY UPDATE score = score + 1
                    `;
                    // 각 태그별로 점수 업데이트 (병렬 실행)
                    const promises = tags.map(tag => db.promise().execute(upsertSql, [userId, tag]));
                    await Promise.all(promises);
                }
            }
        }

        res.status(200).json({ success: true, message: '조회수 및 태그 선호도가 업데이트되었습니다.' });
    } catch (err) {
        console.error('🚨 조회수 업데이트 중 서버 오류:', err);
        return res.status(500).json({ success: false, message: '서버 에러가 발생했습니다.' });
    }
};
