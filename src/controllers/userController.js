const db = require('../database');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

dotenv.config();

exports.signup = async (req, res) => {
    const { nickname, email, password, phone } = req.body;

    if (!nickname || !email || !password) {
        return res.status(400).json({ message: '닉네임, 이메일, 비밀번호는 필수입니다.' });
    }

    const sql = 'SELECT * FROM users WHERE email = ? OR nickname = ?';

    db.query(sql, [email, nickname], async (err, results) => {
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
        }

        try {
            const hashedPassword = await bcrypt.hash(password, 10);

            const insertSql = `
                INSERT INTO users (nickname, email, password, phone)
                VALUES (?, ?, ?, ?)
            `;

            db.query(insertSql, [nickname, email, hashedPassword, phone], (err, result) => {
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
            res.status(200).json({
                message: '로그인 성공!',
                accessToken: accessToken,
                refreshToken: refreshToken,
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