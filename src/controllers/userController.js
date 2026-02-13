const db = require('../../database');
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
            return res.status(500).json({ message: '서버 오류 (이메일 중복 체크 중)' });
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
                    return res.status(500).json({ message: '회원가입 실패 (DB 저장 중 오류)' });
                }

                res.status(201).json({
                    message: '회원가입이 완료되었습니다!',
                    userId: result.insertId
                });
            });
        } catch (err) {
            console.error(err);
            return res.status(500).json({ message: '비밀번호 암호화 중 오류 발생' });
        }
    })
}

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

            const token = jwt.sign(
                { id: user.id, role: user.role },
                process.env.JWT_SECRET,
                { expiresIn: '2h' }
            );

            res.status(200).json({
                message: '로그인 성공!',
                token: token,
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