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


// 이 밑으로 남기현이 한거 ai 가격 추천

// Gemini API 클라이언트 초기화
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

// 게시물 맞춤 가격 추천
exports.recommendPrice = async (req, res) => {
    try {
        const { title, content, location, deadline, tags } = req.body;

        // 1. 최저시급 등 기준 데이터 (상수로 관리하거나 JSON 모듈을 import 해도 됩니다)
        const MINIMUM_WAGE_PER_HOUR = 10320; // 2026년 최저시급

        // 2. LLM에게는 계산이 아닌 '데이터 추출 및 분석'만 맡깁니다.
        const prompt = `
너는 심부름 매칭 앱의 적정 가격(보상) 추천 AI야.
사용자가 작성한 심부름 정보를 바탕으로 예상 소요 시간과 난이도 가중치를 분석해줘.

[심부름 정보]
- 제목: ${title || '입력되지 않음'}
- 내용: ${content || '입력되지 않음'}
- 위치: ${location || '입력되지 않음'}
- 마감시간: ${deadline || '입력되지 않음'}
- 태그: ${tags ? tags.join(', ') : '입력되지 않음'}

[분석 기준]
1. estimatedHours (예상 소요 시간, 숫자형): 심부름을 완료하는 데 걸릴 예상 시간(시간 단위). 
   - 반드시 '이동 시간'을 포함하여 상식적인 수준으로 계산해.
   - 아무리 빨리 끝나는 단순 작업(예: 벌레 잡기, 쓰레기 버리기)이라도 최소 기본 소요 시간인 0.2(12분) 이상으로 산정해야 해. (예: 12분 = 0.2, 30분 = 0.5, 1시간 = 1.0)
   - 사용자가 비현실적인 장기간(예: 1달, 1년)을 요구하더라도, 단일 심부름의 최대 소요 시간은 24.0(24시간)을 초과할 수 없어.
2. difficultyWeight (난이도 가중치, 숫자형): 반드시 1.0에서 2.0 사이의 소수.
   - 단순 배달/수령 등 쉬운 일: 1.0 ~ 1.2
   - 무거운 짐 운반, 전문 기술 필요, 악천후, 급한 마감시간: 1.3 ~ 2.0
   - 어떠한 경우에도 1.0 미만이거나 2.0을 초과할 수 없어.
3. reason (이유, 문자열): 왜 이런 예상 시간과 가중치를 설정했는지 1~2문장으로 사용자에게 설명해주는 친절한 이유.
   - 만약 입력된 정보가 너무 부족해 판단하기 어렵다면, "입력된 정보가 부족하여 기본 소요 시간을 기준으로 산정했습니다."라고 작성해.

반드시 아래와 같은 JSON 형식으로만 응답해.
{
  "estimatedHours": 1.5,
  "difficultyWeight": 1.3,
  "reason": "무거운 물건을 옮기는 작업이 포함되어 있어 난이도 가중치 1.3을 적용했으며, 이동 시간을 고려해 약 1시간 30분이 소요될 것으로 예상됩니다."
}
`;
        const model = genAI.getGenerativeModel({ 
            model: "gemini-2.5-flash",
            generationConfig: { responseMimeType: "application/json" }
        });
        const result = await model.generateContent(prompt);
        let responseText = result.response.text();

        const analysis = JSON.parse(responseText);

        // 안전한 숫자 변환 및 이중 방어 (AI의 환각이나 오류로 범위를 벗어난 값을 줄 경우 강제 조정)
        let estHours = Number(analysis.estimatedHours);
        estHours = (isNaN(estHours) || estHours <= 0) ? 1.0 : Math.min(Math.max(estHours, 0.2), 24.0); // 0.2 ~ 24 시간 제한

        let diffWeight = Number(analysis.difficultyWeight);
        diffWeight = (isNaN(diffWeight) || diffWeight < 1.0) ? 1.0 : Math.min(diffWeight, 2.0); // 1.0 ~ 2.0 가중치 제한

        // 3. 실제 가격 계산은 Node.js(서버)에서 정확하게 수행
        let calculatedPrice = MINIMUM_WAGE_PER_HOUR * estHours * diffWeight;
        
        // 100원 단위 반올림으로 깔끔하게 정리 (예: 12,345원 -> 12,300원)
        calculatedPrice = Math.round(calculatedPrice / 100) * 100;

        // 프론트엔드로 전달할 최종 추천 데이터 구성
        const recommendation = {
            suggestedPrice: calculatedPrice,
            estimatedHours: estHours,
            difficultyWeight: diffWeight,
            reason: analysis.reason || "분석을 통해 적정 가격이 산출되었습니다."
        };

        res.status(200).json({ success: true, data: recommendation });

    } catch (error) {
        console.error("가격 추천 AI 에러:", error);
        res.status(500).json({ success: false, message: '적정 가격을 분석하는 중 오류가 발생했습니다.' });
    }
};

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

// 카운트(조회수) 기반 인기 추천 게시물 가져오기
exports.getRecommendedPosts = (req, res) => {
    // 조회수가 높은 순서, 그리고 최신순으로 정렬하여 상위 10개만 추천합니다.
    // WAITING 상태(진행 대기 중)인 심부름만 보이도록 처리했습니다.
    const sql = `
        SELECT p.*, u.nickname 
        FROM posts p 
        LEFT JOIN users u ON p.user_id = u.id 
        WHERE p.status = 'WAITING'
        ORDER BY p.view_count DESC, p.created_at DESC
        LIMIT 10
    `;

    db.query(sql, (err, results) => {
        if (err) {
            console.error('추천 게시물 조회 중 DB 오류:', err);
            return res.status(500).json({ message: 'DB 에러' });
        }
        res.status(200).json(results);
    });
};

// 게시물 상세 페이지 진입 시 조회수 증가
exports.increaseViewCount = async (req, res) => {
    const postId = Number(req.params.id);

    if (isNaN(postId)) {
        return res.status(400).json({ success: false, message: '잘못된 게시물 ID입니다.' });
    }

    try {
        const updateViewCountSql = `UPDATE posts SET view_count = IFNULL(view_count, 0) + 1 WHERE id = ?`;
        await db.promise().execute(updateViewCountSql, [postId]);
        
        res.status(200).json({ success: true, message: '조회수가 성공적으로 증가했습니다.' });
    } catch (err) {
        console.error('🚨 조회수 업데이트 중 서버 오류:', err);
        return res.status(500).json({ success: false, message: '서버 에러가 발생했습니다.' });
    }
};
