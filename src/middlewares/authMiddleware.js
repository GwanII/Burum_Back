const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
dotenv.config();

exports.verifyToken = (req, res, next) => {
  // 1. 헤더에서 토큰 가져오기 (Authorization: Bearer <token>)
  const authHeader = req.headers['authorization'];
  
  if (!authHeader) {
    return res.status(403).json({ message: '토큰이 제공되지 않았습니다.' });
  }

  // "Bearer " 부분을 떼어내고 토큰만 추출
  const token = authHeader.split(' ')[1];

  if (!token) {
    return res.status(403).json({ message: '토큰 형식이 올바르지 않습니다.' });
  }

  // 2. 토큰 검증
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      // 토큰 만료 or 위조된 경우
      return res.status(401).json({ message: '유효하지 않거나 만료된 토큰입니다.' });
    }

    // 3. 검증 성공 시, 요청(req) 객체에 사용자 정보 저장
    req.user = decoded; // 이제 컨트롤러에서 req.user.id 로 접근 가능!
    next(); // 다음 미들웨어(컨트롤러)로 통과!
  });
};