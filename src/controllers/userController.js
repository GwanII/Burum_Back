const db = require('../database');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
dotenv.config();

const { OAuth2Client } = require('google-auth-library');
const client = new OAuth2Client(process.env.GOOGLE_LOGIN_ID);

exports.signup = async (req, res) => {
    const { nickname, email, password, phone } = req.body;

    if (!nickname || !email || !password) {
        return res.status(400).json({ message: '닉네임, 이메일, 비밀번호는 필수입니다.' });
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
            return res.status(401).json({ message: '존재하지 않는 이메일입니다. '});
        }

        const user = results[0];

        try {
            const isMatch = await bcrypt.compare(password, user.password);

            if (!isMatch) {
                return res.status(401).json({ message: '비밀번호가 일치하지 않습니다. '});
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
            })
            
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
                return res.status(403).json({ message: '유효하지 않은 리프레시 토큰입니다.' });
            }

            const newAccessToken = jwt.sign(
                { id: userId, role: user.role },
                process.env.JWT_SECRET,
                { expiresIn: '1h' } // 개발 편의를 위해 1시간으로 설정함. 차후 수정할듯?
            )
            
            // 리프레시 토큰도 재발급한다면 주석 제거. 이게 필요할지 고민해봐야함!!

            // const newRefreshToken = jwt.sign(
            //     { id: user.id, role: user.role },
            //     process.env.JWT_SECRET,
            //     { expiresIn: '14d' }
            
            // )

            // const updateSql = 'UPDATE users SET refresh_token = ? WHERE id = ?';
            // db.query(updateSql, [newRefreshToken, userId], (err, result) => {
            //     if (err) {
            //         console.error(err);
            //         return res.status(500).json({ message: '토큰 갱신 중 DB 오류' });
            //     }

            res.status(200).json({
                message: '새로운 액세스 토큰이 성공적으로 발급되었습니다.',
                accessToken: newAccessToken,
                // refreshToken: newRefreshToken,
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
                    const refreshtoken = jwt.sign({ id: newUserId}, process.env.JWT_SECRET, {expiresIn: '7d' });

                    const updateTokenSql = 'UPDATE users SET refresh_token = ? WHERE id = ?';
                    db.query(updateTokenSql, [refreshtoken, newUserId], (updateErr) => {
                        if (updateErr) console.error('신규 구글 유저 토큰 저장 실패:', updateErr);
                    });
                    return res.status(200).json({
                        message: '구글 회원가입 및 로그인 성공!',
                        accessToken,
                        refreshtoken,
                        requiresLocation: true, // 위치 정보(location)가 NULL이므로 requiresLocation: true 로 응답
                        user: { id: newUserId, nickname, location: null }
                    });
                });
            }
            // 4-B. 이미 가입된 유저라면? -> 바로 로그인 통과!
            else {
                const accessToken = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {expiresIn: '1h'}); // 추후 수정
                const refreshtoken = jwt.sign({ id: user.id}, process.env.JWT_SECRET, {expiresIn: '7d' });

                const updateTokenSql = 'UPDATE users SET refresh_token = ? WHERE id = ?';
                db.query(updateTokenSql, [refreshtoken, user.id], (updateErr) => {
                    if (updateErr) console.error('기존 구글 유저 토큰 갱신 실패:', updateErr);
                })
                // 위치 정보 유무에 따라 프론트 화면 분기
                const requiresLocation = user.location === null;

                return res.status(200).json({
                    message: '구글 로그인 성공!',
                    accessToken,
                    refreshtoken,
                    requiresLocation,
                    user: { id: user.id, nickname: user.nickname, location: user.location }
                });
            }
        });
    } catch (error) {
        console.error('구글 토큰 검증 에러:', error);
        return res.status(401).json({ message: '유효하지 않은 구글 인증입니다.' });
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