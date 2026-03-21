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

    db.query(sql, [email, nickname, sanitizedPhone], async (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ message: '서버 오류 (중복 체크 중)' });
        }

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

        try {
            const hashedPassword = await bcrypt.hash(password, 10);

            const insertSql = `
                INSERT INTO users (nickname, email, password, phone)
                VALUES (?, ?, ?, ?)
            `;

            db.query(insertSql, [nickname, email, hashedPassword, sanitizedPhone], (err, result) => {
                if (err) {
                    console.error(err);
                    return res.status(500).json({ message: '회원가입 실패 (DB 저장 오류)' });
                }

                res.status(201).json({
                    message: '회원가입이 완료되었습니다!',
                    userId: result.insertId
                });
            });
        } catch (err) {
            console.error(err);
            return res.status(500).json({ message: '비밀번호 암호화 오류' });
        }
    })
};

exports.login = (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: '이메일과 비밀번호를 모두 입력해주세요.'});
    }

    const sql = 'SELECT * FROM users WHERE email = ?';

    db.query(sql, [email], async (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ message: '로그인 실패'});
        }

        if (results.length === 0) {
            return res.status(401).json({ message: '이메일 또는 비밀번호가 올바르지 않습니다.'});
        }

        const user = results[0];
        
        // 보안: 소셜 로그인으로 가입하여 비밀번호가 없는 계정의 일반 로그인 시도 차단
        if (!user.password) {
            return res.status(401).json({ message: '이메일 또는 비밀번호가 올바르지 않습니다. (소셜 가입 계정일 수 있습니다.)'});
        }

        try {
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
            db.query(updateSql, [refreshToken, user.id], (err, result) => {
                if (err) {
                    console.error('리프레시 토큰 저장 실패:', err);
                    return res.status(500).json({ message: '로그인 처리 중 DB 오류' });
                }
            
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
            });
        } catch (err) {
            console.error(err);
            return res.status(500).json({ message: '로그인 처리 중 오류가 발생했습니다.' });
        }
    });
};

exports.logout = (req, res) => {
    const userId = req.user.id;

    // 해당 유저의 refresh_token을 NULL로 지워버림
    const sql = 'UPDATE users SET refresh_token = NULL WHERE id = ?';

    db.query(sql, [userId], (err, result) => {
        if (err) {
            console.error('로그아웃 DB 처리 중 오류:', err);
            return res.status(500).json({ message: '로그아웃 처리 중 서버 오류가 발생했습니다.' });
        }

        res.status(200).json({ message: '성공적으로 로그아웃 되었습니다.' });
    });
};

exports.refreshToken = (req, res) => {
    const { refreshToken } = req.body;

    if (!refreshToken) {
        return res.status(403).json({ message: '리프레시 토큰이 제공되지 않았습니다.' });
    }

    jwt.verify(refreshToken, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            // 리프레시 토큰까지 만료되었으면 ㄹㅇ 다시 로그인해야됨.
            return res.status(401).json({ message: '리프레시 토큰이 만료되었습니다. 다시 로그인해주세요.' });
        }

        const userId = decoded.id;

        const sql = 'SELECT refresh_token, role FROM users WHERE id = ?';
        db.query(sql, [userId], (err, results) => {
            if (err) return res.status(500).json({ message: 'DB 오류가 발생했습니다.' });
            if (results.length === 0) return res.status(404).json({ message: '사용자를 찾을 수 없습니다.' });

            const user = results[0];

            if (user.refresh_token !== refreshToken) {
                // [중요 보안] 토큰 탈취 및 재사용이 의심되는 상황!
                // 누군가 이미 과거의 토큰으로 갱신을 진행했음. (해커의 소행일 확률 높음)
                // 보안을 위해 해당 유저의 리프레시 토큰을 DB에서 강제로 지워 해커의 세션도 함께 차단합니다.
                const compromiseSql = 'UPDATE users SET refresh_token = NULL WHERE id = ?';
                db.query(compromiseSql, [userId], () => {
                    console.warn(`🚨 [보안 경고] 유저 ${userId}의 리프레시 토큰 재사용 시도 감지. 모든 세션을 차단합니다.`);
                });
                return res.status(403).json({ message: '비정상적인 접근이 감지되어 보안을 위해 강제 로그아웃 되었습니다. 다시 로그인해주세요.' });
            }

            const newAccessToken = jwt.sign(
                { id: userId, role: user.role },
                process.env.JWT_SECRET,
                { expiresIn: '1h' } // 개발 편의를 위해 1시간으로 설정함. 차후 수정할듯?
            )
            
            // 토큰 순환(Token Rotation) 적용: 리프레시 토큰도 함께 재발급
            const newRefreshToken = jwt.sign(
                { id: user.id, role: user.role },
                process.env.JWT_SECRET,
                { expiresIn: '14d' }
            );

            // 새로 발급된 리프레시 토큰으로 DB 업데이트 (기존 토큰 무효화)
            const updateSql = 'UPDATE users SET refresh_token = ? WHERE id = ?';
            db.query(updateSql, [newRefreshToken, userId], (err, result) => {
                if (err) {
                    console.error(err);
                    return res.status(500).json({ message: '토큰 갱신 중 DB 오류' });
                }

                res.status(200).json({
                    message: '새로운 액세스와 리프레시 토큰이 성공적으로 발급되었습니다.',
                    accessToken: newAccessToken,
                    refreshToken: newRefreshToken,
                });
            });
        });
    });
};

exports.updateLocation = (req, res) => {
    const userId = req.user.id;     // 미들웨어가 확인한 id
    const { location } = req.body;  // 프론트엔드에서 보낸 위치 정보

    if (!location) {
        return res.status(400).json({ message: '위치 정보가 필요합니다.' });
    }

    const sql = 'UPDATE users SET location = ? WHERE id = ?';

    db.query(sql, [location, userId], (err, result) => {
        if (err) {
            console.error('위치 업데이트 오류:', err);
            return res.status(500).json({ message: 'DB 저장 중 오류가 발생했습니다.' });
        }

        res.status(200).json({ message: '위치 정보가 성공적으로 등록되었습니다.', location });
    });
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
        db.query('SELECT * FROM users WHERE email = ?', [email], (err, results) => {
            if (err) return res.status(500).json({ message: 'DB 에러' });

            let user = results[0];

            // 가입된 유저가 없다면? (신규 가입)
            if (!user) {
                // 소셜 로그인은 비밀번호가 필요 없으므로 빈 문자열이나 임의값 처리
                const insertSql = 'INSERT INTO users (email, password, nickname) VALUES (?,?,?)';
                db.query(insertSql, [email, '', nickname], (err, result) => {
                    if (err) return res.status(500).json({ message: '소셜 회원가입 실패'});

                    // 방금 가입한 유저의 ID 가져오기
                    const newUserId = result.insertId;

                    // 토큰 발급
                    const accessToken = jwt.sign({ id: newUserId }, process.env.JWT_SECRET, {expiresIn: '1h'}); // 추후 수정
                    const refreshToken = jwt.sign({ id: newUserId}, process.env.JWT_SECRET, {expiresIn: '7d' });

                    const updateTokenSql = 'UPDATE users SET refresh_token = ? WHERE id = ?';
                    db.query(updateTokenSql, [refreshToken, newUserId], (updateErr) => {
                        if (updateErr) {
                            console.error('신규 구글 유저 토큰 저장 실패:', updateErr);
                            return res.status(500).json({ message: '토큰 저장 중 서버 오류' });
                        }
                        return res.status(200).json({
                            message: '구글 회원가입 및 로그인 성공!',
                            accessToken,
                            refreshToken,
                            requiresLocation: true, // 위치 정보(location)가 NULL이므로 requiresLocation: true 로 응답
                            user: { id: newUserId, nickname, location: null }
                        });
                    });
                });
            }
            // 4-B. 이미 가입된 유저라면? -> 바로 로그인 통과!
            else {
                const accessToken = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {expiresIn: '1h'}); // 추후 수정
                const refreshToken = jwt.sign({ id: user.id}, process.env.JWT_SECRET, {expiresIn: '7d' });

                const updateTokenSql = 'UPDATE users SET refresh_token = ? WHERE id = ?';
                db.query(updateTokenSql, [refreshToken, user.id], (updateErr) => {
                    if (updateErr) {
                        console.error('기존 구글 유저 토큰 갱신 실패:', updateErr);
                        return res.status(500).json({ message: '토큰 저장 중 서버 오류' });
                    }
                    // 위치 정보 유무에 따라 프론트 화면 분기
                    const requiresLocation = user.location === null;
        
                    return res.status(200).json({
                        message: '구글 로그인 성공!',
                        accessToken,
                        refreshToken,
                        requiresLocation,
                        user: { id: user.id, nickname: user.nickname, location: user.location }
                    });
                });
            }
        });
    } catch (error) {
        console.error('구글 토큰 검증 에러:', error);
        return res.status(401).json({ message: '유효하지 않은 구글 인증입니다.' });
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

    db.query(sql, [email, sanitizedPhone], async (err, results) => {
        if (err) {
            console.error('비밀번호 찾기 조회 오류:', err);
            return res.status(500).json({ message: '서버 오류가 발생했습니다.' });
        }

        if (results.length === 0) {
            return res.status(404).json({ message: '입력하신 정보와 일치하는 사용자를 찾을 수 없습니다.' });
        }

        // 1. 임시 비밀번호 생성 (암호학적으로 안전한 난수 사용)
        const tempPassword = crypto.randomBytes(4).toString('hex') + 'A1!';

        try {
            // 2. 임시 비밀번호 해싱
            const hashedPassword = await bcrypt.hash(tempPassword, 10);

            // 3. DB에 임시 비밀번호 업데이트
            const updateSql = 'UPDATE users SET password = ? WHERE email = ?';
            db.query(updateSql, [hashedPassword, email], (updateErr) => {
                if (updateErr) {
                    console.error('비밀번호 업데이트 오류:', updateErr);
                    return res.status(500).json({ message: '비밀번호 변경 중 DB 오류가 발생했습니다.' });
                }

                // 4. Nodemailer를 이용한 이메일 발송 설정
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

                transporter.sendMail(mailOptions, (mailErr, info) => {
                    if (mailErr) {
                        console.error('이메일 발송 오류:', mailErr);
                        return res.status(500).json({ message: '비밀번호는 변경되었으나, 이메일 발송에 실패했습니다.' });
                    }
                    res.status(200).json({ message: '등록된 이메일로 임시 비밀번호가 발송되었습니다.' });
                });
            });
        } catch (hashErr) {
            console.error('비밀번호 해싱 오류:', hashErr);
            return res.status(500).json({ message: '비밀번호 처리 중 오류가 발생했습니다.' });
        }
    });
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