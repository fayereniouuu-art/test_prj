const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        return res.status(403).json({ status: 'error', message: 'กรุณาส่ง Token มาด้วย' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
        return res.status(403).json({ status: 'error', message: 'รูปแบบ Token ไม่ถูกต้อง' });
    }

    // หมายเหตุ: เมื่อเอาขึ้นเซิร์ฟเวอร์จริง ควรเปลี่ยน 'YOUR_SECRET_KEY' เป็นค่าที่ซับซ้อนและเก็บในไฟล์ .env
    jwt.verify(token, 'YOUR_SECRET_KEY', (err, decoded) => {
        if (err) {
            return res.status(401).json({ status: 'error', message: 'Token หมดอายุหรือไม่ถูกต้อง' });
        }
        req.user = decoded;
        next();
    });
};

// ฟังก์ชันเดิม: ให้เฉพาะ Admin เท่านั้น (เก็บไว้ใช้กับ Route อื่นที่จำเป็น)
const isAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ status: 'error', message: 'คุณไม่มีสิทธิ์ใช้งานส่วนนี้ (เฉพาะ Admin)' });
    }
};

// 🌟 ฟังก์ชันใหม่: ให้ Admin หรือ "เจ้าของข้อมูล" เข้าถึงได้
const isOwnerOrAdmin = (req, res, next) => {
    // ดึง ID จาก URL parameter (เช่น /ac/accounts/9 -> requestParamId = 9)
    const requestParamId = parseInt(req.params.id, 10);

    if (req.user) {
        // เงื่อนไข: ถ้าเป็น Admin "หรือ" ID ใน Token ตรงกับ ID ใน URL
        if (req.user.role === 'admin' || req.user.id === requestParamId) {
            return next();
        }
    }
    
    // ถ้าไม่เข้าเงื่อนไขด้านบนเลย ให้เด้ง 403
    return res.status(403).json({ status: 'error', message: 'คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้ (เฉพาะเจ้าของบัญชีหรือ Admin เท่านั้น)' });
};

// อย่าลืม export ตัวใหม่ที่เพิ่งสร้างออกไปด้วย
module.exports = { verifyToken, isAdmin, isOwnerOrAdmin };