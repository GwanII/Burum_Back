const db = require('../database');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
dotenv.config();
const crypto = require('crypto');

const nodemailer = require('nodemailer');
const { OAuth2Client } = require('google-auth-library');
const client = new OAuth2Client(process.env.GOOGLE_LOGIN_ID);

exports.signup = async (req, res) => {
    const { nickname, email, password, phone } = req.body;

    if (!nickname || !email || !password || !phone) {
        return res.status(400).json({ message: '모두 입력해주세요.' });
    }

    // --- 정규식 유효성 검사 (서버 측 방어) ---
    // 1. 이메일 형식 검사
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ message: '유효한 이메일 형식이 아닙니다.' });
    }

    // 2. 비밀번호 형식 검사: 최소 8자 이상, 영문과 숫자 최소 1개씩 포함 (특수문자 허용)
    const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*#?&~^]{8,}$/;
    if (!passwordRegex.test(password)) {
        return res.status(400).json({ message: '비밀번호는 8자 이상이며, 영문과 숫자를 포함해야 합니다.' });
    }

    // 3. 닉네임 길이 및 형식 검사 (2~10자)
    if (nickname.length < 2 || nickname.length > 10) {
        return res.status(400).json({ message: '닉네임은 2자 이상 10자 이하로 입력해주세요.' });
    }

    // 4. 전화번호 형식 검사 (예: 010-0000-0000)
    if (phone) {
        const phoneRegex = /^010-\d{4}-\d{4}$/;
        if (!phoneRegex.test(phone)) {
            return res.status(400).json({ message: '전화번호는 010-0000-0000 형식으로 입력해주세요.' });
        }
    }

    const sanitizedPhone = phone ? phone.replace(/[^0-9]/g, "") : null;

    const sql = 'SELECT * FROM users WHERE email = ? OR nickname = ? OR phone = ?';

    try {
        const [results] = await db.promise().query(sql, [email, nickname, sanitizedPhone]);

        if (results.length > 0) {
            const emailExists = results.some(user => user.email === email);
            if (emailExists) {
                return res.status(409).json({ message: '이미 존재하는 이메일입니다.' });
             }

            const nicknameExists = results.some(user => user.nickname === nickname);
            if (nicknameExists) {
                return res.status(409).json({ message: '이미 존재하는 닉네임입니다.' });
            }

            const phoneExists = results.some(user => user.phone === sanitizedPhone);
            if (phoneExists) {
                return res.status(409).json({ message: '이미 존재하는 전화번호입니다.' });
            }
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const insertSql = `
            INSERT INTO users (nickname, email, password, phone)
            VALUES (?, ?, ?, ?)
        `;

        const [result] = await db.promise().query(insertSql, [nickname, email, hashedPassword, sanitizedPhone]);

        res.status(201).json({
            message: '회원가입이 완료되었습니다!',
            userId: result.insertId
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: '회원가입 처리 중 오류가 발생했습니다.' });
    }
};

exports.login = async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: '이메일과 비밀번호를 모두 입력해주세요.'});
    }

    const sql = 'SELECT * FROM users WHERE email = ?';

    try {
        const [results] = await db.promise().query(sql, [email]);

        if (results.length === 0) {
            return res.status(401).json({ message: '이메일 또는 비밀번호가 올바르지 않습니다.'});
        }

        const user = results[0];
        
        // 보안: 소셜 로그인으로 가입하여 비밀번호가 없는 계정의 일반 로그인 시도 차단
        if (!user.password) {
            return res.status(401).json({ message: '이메일 또는 비밀번호가 올바르지 않습니다. (소셜 가입 계정일 수 있습니다.)'});
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(401).json({ message: '이메일 또는 비밀번호가 올바르지 않습니다.'});
        }

        const accessToken = jwt.sign(
            { id: user.id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '1h' } // 개발 편의를 위해 1시간으로 설정함. 차후 수정할듯?
        );

        const refreshToken = jwt.sign(
            { id: user.id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '14d' }
        );

        const updateSql = 'UPDATE users SET refresh_token = ? WHERE id = ?';
        await db.promise().query(updateSql, [refreshToken, user.id]);
            
        const hasLocation = user.location !== null;

        res.status(200).json({
            message: '로그인 성공!',
            accessToken: accessToken,
            refreshToken: refreshToken,
            requiresLocation: !hasLocation, // 위치 정보
            user: {
                id: user.id,
                nickname: user.nickname,
                email: user.email,
                role: user.role
            }
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: '로그인 처리 중 오류가 발생했습니다.' });
    }
};

exports.logout = async (req, res) => {
    const userId = req.user.id;

    // 해당 유저의 refresh_token을 NULL로 지워버림
    const sql = 'UPDATE users SET refresh_token = NULL WHERE id = ?';

    try {
        await db.promise().query(sql, [userId]);
        res.status(200).json({ message: '성공적으로 로그아웃 되었습니다.' });
    } catch (err) {
        console.error('로그아웃 DB 처리 중 오류:', err);
        return res.status(500).json({ message: '로그아웃 처리 중 서버 오류가 발생했습니다.' });
    }
};

exports.refreshToken = async (req, res) => {
    const { refreshToken } = req.body;

    if (!refreshToken) {
        return res.status(403).json({ message: '리프레시 토큰이 제공되지 않았습니다.' });
    }

    try {
        const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
        const userId = decoded.id;

        const sql = 'SELECT refresh_token, role FROM users WHERE id = ?';
        const [results] = await db.promise().query(sql, [userId]);
        
        if (results.length === 0) {
            return res.status(404).json({ message: '사용자를 찾을 수 없습니다.' });
        }

        const user = results[0];

        if (user.refresh_token !== refreshToken) {
            // [중요 보안] 토큰 탈취 및 재사용이 의심되는 상황!
            // 누군가 이미 과거의 토큰으로 갱신을 진행했음. (해커의 소행일 확률 높음)
            // 보안을 위해 해당 유저의 리프레시 토큰을 DB에서 강제로 지워 해커의 세션도 함께 차단합니다.
            const compromiseSql = 'UPDATE users SET refresh_token = NULL WHERE id = ?';
            await db.promise().query(compromiseSql, [userId]);
            console.warn(`🚨 [보안 경고] 유저 ${userId}의 리프레시 토큰 재사용 시도 감지. 모든 세션을 차단합니다.`);
            return res.status(403).json({ message: '비정상적인 접근이 감지되어 강제 로그아웃 되었습니다. 다시 로그인해주세요.' });
        }

        const newAccessToken = jwt.sign(
            { id: userId, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '1h' } // 개발 편의를 위해 1시간으로 설정함. 차후 수정할듯?
        );
        
        // 토큰 순환(Token Rotation) 적용: 리프레시 토큰도 함께 재발급
        const newRefreshToken = jwt.sign(
            { id: userId, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '14d' }
        );

        // 새로 발급된 리프레시 토큰으로 DB 업데이트 (기존 토큰 무효화)
        const updateSql = 'UPDATE users SET refresh_token = ? WHERE id = ?';
        await db.promise().query(updateSql, [newRefreshToken, userId]);

        res.status(200).json({
            message: '새로운 액세스와 리프레시 토큰이 성공적으로 발급되었습니다.',
            accessToken: newAccessToken,
            refreshToken: newRefreshToken,
        });
    } catch (err) {
        if (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError') {
            // 리프레시 토큰까지 만료되었거나 비정상적인 토큰인 경우
            return res.status(401).json({ message: '리프레시 토큰이 만료되었거나 유효하지 않습니다. 다시 로그인해주세요.' });
        }
        
        console.error('토큰 갱신 중 서버 오류:', err);
        return res.status(500).json({ message: '서버 오류가 발생했습니다.' });
    }
};

exports.updateLocation = async (req, res) => {
    const userId = req.user.id;     // 미들웨어가 확인한 id
    const { location } = req.body;  // 프론트엔드에서 보낸 위치 정보

    if (!location) {
        return res.status(400).json({ message: '위치 정보가 필요합니다.' });
    }

    const sql = 'UPDATE users SET location = ? WHERE id = ?';

    try {
        await db.promise().query(sql, [location, userId]);
        res.status(200).json({ message: '위치 정보가 성공적으로 등록되었습니다.', location });
    } catch (err) {
        console.error('위치 업데이트 오류:', err);
        return res.status(500).json({ message: 'DB 저장 중 오류가 발생했습니다.' });
    }
};

exports.googleLogin = async (req, res) => {
    const { idToken } = req.body;

    if (!idToken) {
        return res.status(400).json({ message: '구글 토큰이 없습니다.' });
    }

    try {
        // 구글 서버에 영수증(idToken)이 진짜인지 검증 요청
        const ticket = await client.verifyIdToken({
            idToken: idToken,
            audience: process.env.GOOGLE_LOGIN_ID,
        });

        // 검증이 완료된 영수증에서 유저 정보 뽑아내기
        const payload = ticket.getPayload();
        const email = payload.email;
        const nickname = payload.name;

        // 우리 DB에 이미 가입된 이메일인지 확인
        const [results] = await db.promise().query('SELECT * FROM users WHERE email = ?', [email]);
        const user = results[0];

        // 가입된 유저가 없다면? (신규 가입)
        if (!user) {
            // 소셜 로그인은 비밀번호가 필요 없으므로 빈 문자열 처리
            const insertSql = 'INSERT INTO users (email, password, nickname) VALUES (?,?,?)';
            const [result] = await db.promise().query(insertSql, [email, '', nickname]);

            // 방금 가입한 유저의 ID 가져오기
            const newUserId = result.insertId;

            // 토큰 발급
            const accessToken = jwt.sign({ id: newUserId }, process.env.JWT_SECRET, {expiresIn: '1h'}); // 추후 수정
            const refreshToken = jwt.sign({ id: newUserId}, process.env.JWT_SECRET, {expiresIn: '7d' });

            const updateTokenSql = 'UPDATE users SET refresh_token = ? WHERE id = ?';
            await db.promise().query(updateTokenSql, [refreshToken, newUserId]);
            
            return res.status(200).json({
                message: '구글 회원가입 및 로그인 성공!',
                accessToken,
                refreshToken,
                requiresLocation: true, // 위치 정보(location)가 NULL이므로 requiresLocation: true 로 응답
                user: { id: newUserId, nickname, location: null }
            });
        }
        // 4-B. 이미 가입된 유저라면? -> 바로 로그인 통과!
        else {
            const accessToken = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {expiresIn: '1h'}); // 추후 수정
            const refreshToken = jwt.sign({ id: user.id}, process.env.JWT_SECRET, {expiresIn: '7d' });

            const updateTokenSql = 'UPDATE users SET refresh_token = ? WHERE id = ?';
            await db.promise().query(updateTokenSql, [refreshToken, user.id]);
            
            // 위치 정보 유무에 따라 프론트 화면 분기
            const requiresLocation = user.location === null;

            return res.status(200).json({
                message: '구글 로그인 성공!',
                accessToken,
                refreshToken,
                requiresLocation,
                user: { id: user.id, nickname: user.nickname, location: user.location }
            });
        }
    } catch (error) {
        console.error('구글 로그인/회원가입 처리 에러:', error);
        return res.status(500).json({ message: '구글 인증 및 로그인 처리 중 서버 오류가 발생했습니다.' });
    }
}

exports.resetPassword = async (req, res) => {
    const { email, phone } = req.body;

    if (!email || !phone) {
        return res.status(400).json({ message: '이메일과 전화번호를 모두 입력해주세요.' });
    }

    const sanitizedPhone = phone ? phone.replace(/[^0-9]/g, "") : null;

    // 이메일과 전화번호가 모두 일치하는 유저 찾기
    const sql = 'SELECT * FROM users WHERE email = ? AND phone = ?';

    try {
        const [results] = await db.promise().query(sql, [email, sanitizedPhone]);

        if (results.length === 0) {
            return res.status(404).json({ message: '입력하신 정보와 일치하는 사용자를 찾을 수 없습니다.' });
        }

        // 임시 비밀번호 생성 (암호학적으로 안전한 난수 사용)
        const tempPassword = crypto.randomBytes(4).toString('hex') + 'A1!';
        
        // 임시 비밀번호 해싱
        const hashedPassword = await bcrypt.hash(tempPassword, 10);

        // Nodemailer를 이용한 이메일 발송 설정
        const transporter = nodemailer.createTransport({
            service: 'gmail', // 사용하는 이메일 서비스 (Naver, Daum 등 지원 가능)
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: '[Burum] 임시 비밀번호 발급 안내',
            text: `안녕하세요.\n요청하신 임시 비밀번호는 다음과 같습니다.\n\n임시 비밀번호: ${tempPassword}\n\n로그인 후 반드시 비밀번호를 변경해주세요.`
        };

        // 트랜잭션 시작 (이메일 발송 실패 시 롤백하기 위함)
        await db.promise().beginTransaction();

        // DB에 임시 비밀번호 업데이트
        const updateSql = 'UPDATE users SET password = ? WHERE email = ?';
        await db.promise().query(updateSql, [hashedPassword, email]);

        try {
            // 이메일 발송 시도
            await transporter.sendMail(mailOptions);
            
            // 모든 작업이 성공했으면 커밋
            await db.promise().commit();
            res.status(200).json({ message: '등록된 이메일로 임시 비밀번호가 발송되었습니다.' });
        } catch (mailErr) {
            // 이메일 발송 실패 시 비밀번호 변경을 취소(롤백)
            await db.promise().rollback();
            console.error('이메일 발송 오류 (롤백됨):', mailErr);
            return res.status(500).json({ message: '이메일 발송에 실패하여 비밀번호 변경이 취소되었습니다.' });
        }
    } catch (err) {
        console.error('비밀번호 찾기 처리 중 오류:', err);
        return res.status(500).json({ message: '비밀번호 찾기 처리 중 서버 오류가 발생했습니다.' });
    }
}

//다은 작업, 유저 프로필 불러오기에 필요 
exports.getUserProfile = (req, res) => {
    const userId = req.params.id;

    const userSql = `
        SELECT
            id,
            nickname,
            location,
            profile_image_url,
            user_title,
            grade,
            created_at
        FROM users
        WHERE id = ?
    `;

    const createdPostsSql = `
        SELECT
            id,
            user_id,
            title,
            content,
            cost,
            status,
            deadline,
            tags,
            created_at,
            image_url,
            assigned_user_id
        FROM posts
        WHERE user_id = ?
        ORDER BY created_at DESC
    `;

    const assignedPostsSql = `
        SELECT
            id,
            user_id,
            title,
            content,
            cost,
            status,
            deadline,
            tags,
            created_at,
            image_url,
            assigned_user_id
        FROM posts
        WHERE assigned_user_id = ?
        ORDER BY created_at DESC
    `;

    db.query(userSql, [userId], (err, userResults) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ message: '유저 조회 중 DB 오류' });
        }

        if (userResults.length === 0) {
            return res.status(404).json({ message: '사용자를 찾을 수 없습니다.' });
        }

        db.query(createdPostsSql, [userId], (err2, createdPosts) => {
            if (err2) {
                console.error(err2);
                return res.status(500).json({ message: '작성 게시물 조회 중 DB 오류' });
            }

            db.query(assignedPostsSql, [userId], (err3, assignedPosts) => {
                if (err3) {
                    console.error(err3);
                    return res.status(500).json({ message: '수락 게시물 조회 중 DB 오류' });
                }

                return res.status(200).json({
                    user: userResults[0],
                    createdPosts,
                    assignedPosts
                });
            });
        });
    });
};