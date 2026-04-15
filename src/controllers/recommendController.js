const db = require('../database');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const dotenv = require('dotenv');
dotenv.config();

// Gemini API 클라이언트 초기화
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

exports.getAIRecommendations = async (req, res) => {
    try {
        const userId = req.user.id; 

        // 1. 유저 정보 가져오기 (위치 정보 확인)
        const [userResults] = await db.promise().query('SELECT * FROM users WHERE id = ?', [userId]);
        const user = userResults[0];

        if (!user) {
            return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });
        }

        // 2. DB 사전 필터링: 현재 매칭 대기 중인 최신 심부름 20개 가져오기 (LLM 토큰 절약)
        const sql = `
            SELECT id, title, content, location, cost, deadline, tags
            FROM posts 
            WHERE status = 'WAITING'
            ORDER BY created_at DESC
            LIMIT 20
        `;
        const [candidatePosts] = await db.promise().query(sql);

        if (candidatePosts.length === 0) {
            return res.status(200).json({ success: true, data: [], message: '현재 추천할 심부름이 없습니다.' });
        }

        // 3. 외부 환경 컨텍스트 세팅 (날씨, 시간 등)
        // 실무에서는 기상청이나 OpenWeather API를 호출해 user.location 기준 날씨를 가져옵니다.
        const currentWeather = "맑음, 기온 25도"; // 예시
        const currentTime = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });

        // 4. LLM을 위한 시스템 프롬프트(Prompt) 작성
        const prompt = `
너는 심부름 앱의 똑똑한 AI 추천 비서야.

[사용자 상황]
- 사용자의 주 활동 위치: ${user.location || '위치 미지정'}
- 현재 시간: ${currentTime}
- 현재 날씨: ${currentWeather}

[대기 중인 심부름 후보 목록]
${JSON.stringify(candidatePosts)}

위 후보 목록 중에서 사용자의 위치, 현재 시간, 날씨, 심부름의 난이도와 보상(cost)을 종합적으로 분석하여 가장 추천할 만한 심부름 딱 3개만 골라줘.

반드시 아래와 같은 JSON 배열 형식으로만 응답해야 해. 마크다운(\`\`\`json 등)이나 다른 부연 설명은 절대 출력하지 마.
[
  {
    "postId": 1,
    "reason": "사용자 위치와 가깝고, 맑은 날씨에 이동하기 좋은 조건이며 보상이 높습니다."
  }
]
`;

        // 5. Gemini 모델 호출 (빠른 응답을 위해 2.5-flash 모델 추천)
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const result = await model.generateContent(prompt);
        let responseText = result.response.text();

        // 6. JSON 데이터 파싱 및 정제
        // 가끔 LLM이 마크다운 백틱(```json ... ```)을 포함해 응답할 수 있으므로 제거해줍니다.
        responseText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        
        const recommendations = JSON.parse(responseText);

        // 7. 추천 결과 반환
        res.status(200).json({
            success: true,
            data: recommendations
        });

    } catch (error) {
        console.error("AI 추천 생성 중 오류 발생:", error);
        // JSON 파싱 에러 등이 발생했을 때의 예외 처리
        if (error instanceof SyntaxError) {
            return res.status(500).json({ success: false, message: 'AI 응답을 처리하는 데 실패했습니다.' });
        }
        res.status(500).json({ success: false, message: '서버 에러가 발생했습니다.' });
    }
};

exports.recommendPrice = async (req, res) => {
    try {
        // 프론트엔드에서 사용자가 입력 중인 데이터를 받아옵니다.
        const { title, content, location, deadline, tags } = req.body;

        // LLM을 위한 시스템 프롬프트(Prompt) 작성
        const prompt = `
너는 심부름 매칭 앱의 적정 가격(보상) 추천 AI야.
사용자가 작성한 심부름 정보를 바탕으로 합리적인 심부름 비용을 원화(KRW) 기준으로 제안해줘.

[심부름 정보]
- 제목: ${title || '입력되지 않음'}
- 내용: ${content || '입력되지 않음'}
- 위치: ${location || '입력되지 않음'}
- 마감시간: ${deadline || '입력되지 않음'}
- 태그: ${tags ? tags.join(', ') : '입력되지 않음'}

위 심부름의 예상 소요 시간, 작업의 난이도, 이동 거리 등을 종합적으로 고려해서 적정 가격을 산정해줘.
반드시 아래와 같은 JSON 형식으로만 응답해야 해. 마크다운(\`\`\`json 등)이나 부연 설명은 절대 출력하지 마.
{
  "suggestedPrice": 10000,
  "reason": "요청하신 심부름은 무거운 물건을 옮기는 작업이 포함되어 있어 기본금에 난이도 할증이 추가되었습니다."
}
`;
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const result = await model.generateContent(prompt);
        let responseText = result.response.text();

        responseText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        const recommendation = JSON.parse(responseText);

        res.status(200).json({ success: true, data: recommendation });

    } catch (error) {
        console.error("가격 추천 AI 에러:", error);
        res.status(500).json({ success: false, message: '적정 가격을 분석하는 중 오류가 발생했습니다.' });
    }
};
