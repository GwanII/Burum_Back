const jwt = require('jsonwebtoken');

exports.verifyToken = (req, res, next) => {
  // 1. 헤더에서 토큰 가져오기 (Authorization: Bearer <token>)
  const authHeader = req.headers['authorization'];
  
  if (!authHeader) {
    return res.status(403).json({ message: '토큰이 제공되지 않았습니다.' });
  }

  if (!authHeader.startsWith('Bearer ')) {
    return res.status(403).json({ message: '지원되지 않는 토큰 형식입니다. (Bearer 필요)' });
  }

  // "Bearer " 부분을 떼어내고 토큰만 추출
  const token = authHeader.split(' ')[1];

  if (!token) {
    return res.status(403).json({ message: '토큰 형식이 올바르지 않습니다.' });
  }

  // 2. 토큰 검증
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 3. 검증 성공 시, 요청(req) 객체에 사용자 정보 저장
    req.user = decoded; // 이제 컨트롤러에서 req.user.id 로 접근 가능!
    next(); // 다음 미들웨어(컨트롤러)로 통과!
  } catch (err) {
    // 토큰 만료(TokenExpiredError) or 위조(JsonWebTokenError)된 경우
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: '토큰이 만료되었습니다. 다시 로그인해주세요.', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ message: '유효하지 않은 토큰입니다.', code: 'INVALID_TOKEN' });
  }
};