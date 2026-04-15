const jwt = require('jsonwebtoken');

exports.verifyToken = (req, res, next) => {
  // 1. 헤더에서 토큰 가져오기 (Authorization: Bearer <token>)
  const authHeader = req.headers['authorization'];
  
  if (!authHeader) {
    return res.status(403).json({ message: '토큰이 제공되지 않았습니다.' });
  }

  // 대소문자 구분 없이 'bearer ' 검사 (에지 케이스 방어 및 호환성 확보)
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return res.status(403).json({ message: '지원되지 않는 토큰 형식입니다. (Bearer 필요)' });
  }

  // "Bearer " 부분을 떼어내고 토큰만 추출
  const token = authHeader.split(' ')[1];

  if (!token) {
    return res.status(403).json({ message: '토큰 형식이 올바르지 않습니다.' });
  }

  // 환경변수 누락 체크 (서버 오작동 및 보안사고 방지)
  if (!process.env.JWT_SECRET) {
    console.error('🚨 서버 에러: JWT_SECRET 환경변수가 설정되지 않았습니다.');
    return res.status(500).json({ message: '서버 인증 설정에 문제가 발생했습니다.' });
  }

  // 2. 토큰 검증
  try {
    // 보안 강화: 허용할 알고리즘을 명시하여 '알고리즘 혼동 공격(Algorithm Confusion Attack)' 방지
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ['HS256'] 
    });

    // 3. 페이로드(Payload) 필수 데이터 방어 검증
    // 서명이 맞더라도 필요한 정보(id 등)가 없는 비정상 토큰인 경우를 방어합니다.
    if (!decoded || !decoded.id) {
      console.warn('🚨 보안 경고: 토큰 페이로드에 사용자 ID가 없습니다.');
      return res.status(401).json({ message: '유효하지 않은 토큰 데이터입니다.', code: 'INVALID_PAYLOAD' });
    }

    // 4. 검증 성공 시, 요청(req) 객체에 사용자 정보 저장
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