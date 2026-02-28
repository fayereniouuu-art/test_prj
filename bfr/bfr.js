const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const cors = require('cors');
const con = require('../config/config');
const multer = require('multer');
const upload = multer();

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

var router = express.Router();

// นำเข้า Middleware ตรวจสอบสิทธิ์
const { verifyToken, isAdmin } = require('../middleware/auth');

/*------------------------------------------------------------------------------------------------------------------------------ */
// อาคาร (Buildings)
/*------------------------------------------------------------------------------------------------------------------------------ */

// เพิ่มอาคาร (Add a building)
router.post('/building', verifyToken, isAdmin, async (req, res) => {
    const { buildingName } = req.body;

    // ตรวจสอบว่ามี buildingName ถูกส่งมาหรือไม่
    if (!buildingName || buildingName.trim() === '') {
        return res.status(200).send({
            error: true,
            status: "1",
            message: "ไม่สามารถบันทึกได้: กรุณากรอกชื่ออาคาร"
        });
    }

    try {
        const trimmedBuildingName = buildingName.trim(); // Trim ช่องว่างที่เกินมา

        // ตรวจสอบว่าชื่ออาคารซ้ำหรือไม่
        const existingBuilding = await new Promise((resolve, reject) => {
            // ใช้ LOWER() เพื่อให้การตรวจสอบเป็นแบบ case-insensitive
            con.query('SELECT building_id FROM `building` WHERE LOWER(building_name) = LOWER(?)', [trimmedBuildingName], (error, results) => {
                if (error) return reject(error);
                resolve(results.length > 0 ? results[0] : null);
            });
        });

        if (existingBuilding) {
            return res.status(200).send({
                error: true,
                status: "1",
                message: "ไม่สามารถบันทึกได้: ชื่ออาคารนี้มีอยู่แล้ว"
            });
        }

        // บันทึกข้อมูลอาคารใหม่
        const insertBuilding = await new Promise((resolve, reject) => {
            con.query('INSERT INTO `building` (`building_name`) VALUES (?)', [trimmedBuildingName], (error, results) => {
                if (error) return reject(error);
                resolve(results);
            });
        });

        if (insertBuilding.affectedRows === 0) {
            return res.status(200).send({
                error: true,
                status: "1",
                message: "ไม่สามารถบันทึกได้"
            });
        }

        return res.send({
            error: false,
            status: "0",
            message: "บันทึกข้อมูลสำเร็จ"
        });

    } catch (error) {
        console.error('Error in /building (POST):', error);
        return res.status(500).send({
            error: true,
            status: "1",
            message: "เกิดข้อผิดพลาดในการบันทึกข้อมูลอาคาร"
        });
    }
});

/*------------------------------------------------------------------------------------------------------------------------------ */

// ลบอาคาร (Delete a building)
router.delete('/building/:buildingId', verifyToken, isAdmin, async (req, res) => {
    const buildingId = req.params.buildingId;
    let connection;

    try {
        connection = await new Promise((resolve, reject) => {
            con.getConnection((err, conn) => {
                if (err) return reject(err);
                resolve(conn);
            });
        });

        let hasFloorOrRoom = false; // แฟล็กสำหรับเงื่อนไขการลบห้อง/ชั้น
        const externalReferencedTables = []; // อาร์เรย์สำหรับตารางอื่น ๆ

        // 1. ตรวจสอบว่ามีห้องอยู่ในอาคารนี้หรือไม่ (สำคัญกว่าการนับแค่ชั้น)
        const roomsCount = await new Promise((resolve, reject) => {
            connection.query(`
                SELECT COUNT(r.room_id) AS count 
                FROM room r
                JOIN floor f ON r.floor_id = f.floor_id
                WHERE f.building_id = ?
            `, [buildingId], (error, results) => {
                if (error) return reject(error);
                resolve(results[0].count);
            });
        });
        
        if (roomsCount > 0) {
            hasFloorOrRoom = true;
        } else {
             // ถ้าไม่มีห้อง ให้เช็คว่ามีชั้นเปล่า ๆ เหลืออยู่หรือไม่
             const floorsCount = await new Promise((resolve, reject) => {
                 connection.query('SELECT COUNT(*) AS count FROM `floor` WHERE building_id = ?', [buildingId], (error, results) => {
                     if (error) return reject(error);
                     resolve(results[0].count);
                 });
             });
             if (floorsCount > 0) {
                 hasFloorOrRoom = true; // มีชั้นเปล่าที่ต้องลบก่อน
             }
        }
        
        // 2. ตรวจสอบการอ้างอิงจากตาราง 'routes'
        const routeReferencesCount = await new Promise((resolve, reject) => {
            connection.query('SELECT COUNT(*) AS count FROM `routes` WHERE start_building_id = ? OR end_building_id = ?', [buildingId, buildingId], (error, results) => {
                if (error) return reject(error);
                resolve(results[0].count);
            });
        });
        if (routeReferencesCount > 0) {
            externalReferencedTables.push('routes');
        }
        
        // 4. สร้างข้อความแจ้งเตือนที่ซับซ้อน
        if (hasFloorOrRoom || externalReferencedTables.length > 0) {
            const parts = [];

            // ส่วนที่ 1: การแจ้งเตือนเรื่องชั้น/ห้อง
            if (hasFloorOrRoom) {
                if (roomsCount > 0) {
                    parts.push("มีชั้นอยู่ในอาคารนี้ กรุณาลบห้องภายในชั้นให้หมดก่อน");
                } else {
                    parts.push("มีชั้นที่ว่างเปล่าอยู่ในอาคารนี้ กรุณาลบชั้นให้หมดก่อน");
                }
            }

            // ส่วนที่ 2: การแจ้งเตือนเรื่องตารางอ้างอิงภายนอก
            if (externalReferencedTables.length > 0) {
                const tablesString = externalReferencedTables.join(', ');
                // ข้อความนี้จะระบุชื่อตารางภายนอกเท่านั้น
                parts.push(`อาคารนี้ถูกอ้างอิงจากตาราง ${tablesString} กรุณาลบข้อมูลที่เกี่ยวข้องในตารางเหล่านี้ก่อน`);
            }
            
            // นำข้อความมารวมกันด้วย " และ "
            const finalMessage = "ไม่สามารถลบได้: " + parts.join(" และ ");

            connection.release();
            return res.status(409).send({
                error: true,
                message: finalMessage 
            });
        }

        // 5. ถ้าไม่มีข้อมูลอ้างอิง ก็ดำเนินการลบ
        const deleteResult = await new Promise((resolve, reject) => {
            connection.query('DELETE FROM `building` WHERE building_id = ?', [buildingId], (error, results) => {
                if (error) return reject(error);
                resolve(results);
            });
        });

        if (deleteResult.affectedRows === 0) {
            connection.release();
            return res.status(404).send({
                error: true,
                message: "ไม่พบอาคารที่ต้องการลบ"
            });
        }

        res.status(200).send({
            error: false,
            message: "ลบอาคารสำเร็จ"
        });

    } catch (error) {
        // จัดการ Error ทั่วไป (เช่น Connection Error, SQL Syntax Error)
        if (connection) connection.release(); 
        console.error('Error in /building/:buildingId (DELETE):', error);
        
        let errorMessage = "เกิดข้อผิดพลาดในการลบอาคาร";
        let statusCode = 500;
        
        // จัดการ Foreign Key Constraint ที่อาจหลุดมา
        if (error.code === 'ER_ROW_IS_REFERENCED_2') {
             statusCode = 409;
             // ถ้าเกิด Foreign Key Error ในขั้นตอนนี้ แสดงว่ามีตารางอื่นที่ไม่ได้ถูกตรวจสอบ
             errorMessage = "ไม่สามารถลบอาคารได้: มีข้อมูลที่อ้างอิงถึงอาคารนี้ในตารางอื่น (ที่ไม่ใช่ floor หรือ routes) กรุณาตรวจสอบ Foreign Key";
        }
        
        res.status(statusCode).send({
            error: true,
            message: errorMessage
        });
    }
});

/*------------------------------------------------------------------------------------------------------------------------------ */
// แก้ไขอาคาร (Edit a building)
router.put('/building/:buildingId', verifyToken, isAdmin, async (req, res) => {
    const { buildingId } = req.params;
    const { buildingName } = req.body;

    if (!buildingName || buildingName.trim() === '') {
        return res.status(200).send({
            error: true,
            status: "1",
            message: "ไม่สามารถแก้ไขได้: กรุณากรอกชื่ออาคาร"
        });
    }

    try {
        const trimmedBuildingName = buildingName.trim();

        // Check if new building name already exists (excluding current building)
        const existingBuilding = await new Promise((resolve, reject) => {
            con.query('SELECT building_id FROM `building` WHERE LOWER(building_name) = LOWER(?) AND building_id != ?', [trimmedBuildingName, buildingId], (error, results) => {
                if (error) return reject(error);
                resolve(results.length > 0 ? results[0] : null);
            });
        });

        if (existingBuilding) {
            return res.status(200).send({
                error: true,
                status: "1",
                message: "ไม่สามารถแก้ไขได้: ชื่ออาคารนี้มีอยู่แล้ว"
            });
        }

        const updateBuilding = await new Promise((resolve, reject) => {
            con.query('UPDATE `building` SET `building_name` = ? WHERE `building_id` = ?', [trimmedBuildingName, buildingId], (error, results) => {
                if (error) return reject(error);
                resolve(results);
            });
        });

        if (updateBuilding.affectedRows === 0) {
            return res.status(200).send({
                error: true,
                status: "1",
                message: "ไม่พบอาคารที่ต้องการแก้ไข หรือไม่มีการเปลี่ยนแปลงข้อมูล"
            });
        }

        return res.send({
            error: false,
            status: "0",
            message: "แก้ไขข้อมูลอาคารสำเร็จ"
        });

    } catch (error) {
        console.error('Error in /building/:buildingId (PUT):', error);
        return res.status(500).send({
            error: true,
            status: "1",
            message: "เกิดข้อผิดพลาดในการแก้ไขข้อมูลอาคาร"
        });
    }
});


/*-----------------------------------------------------------------------------------------------------------------------------*/
// ชั้น (Floors)
/*------------------------------------------------------------------------------------------------------------------------------ */
// เพิ่มชั้น (Add a floor)
router.post('/floor', verifyToken, isAdmin, async (req, res) => {
    const { buildingId, floorNumber } = req.body;

    if (!buildingId || !floorNumber || floorNumber.trim() === '') {
        return res.status(200).send({
            error: true,
            status: "1",
            message: "ไม่สามารถบันทึกได้: กรุณากรอก buildingId และ floorNumber"
        });
    }

    try {
        const trimmedFloorNumber = floorNumber.trim();

        const insertFloorResult = await new Promise((resolve, reject) => {
            con.query('INSERT INTO `floor` (`building_id`, `floor_number`) VALUES (?, ?)', [buildingId, trimmedFloorNumber], (error, results) => {
                if (error) return reject(error);
                resolve(results);
            });
        });

        if (insertFloorResult.affectedRows > 0) {
            return res.send({
                error: false,
                status: "0",
                message: "บันทึกข้อมูลชั้นสำเร็จ",
                floorId: insertFloorResult.insertId
            });
        } else {
            return res.status(200).send({
                error: true,
                status: "1",
                message: "ไม่สามารถบันทึกข้อมูลชั้นได้"
            });
        }
    } catch (error) {
        console.error('Error in /floor (POST):', error);
        return res.status(500).send({
            error: true,
            status: "1",
            message: "เกิดข้อผิดพลาดในการบันทึกข้อมูลชั้น"
        });
    }
});

/*------------------------------------------------------------------------------------------------------------------------------ */
// ลบชั้น (Delete a floor)
router.delete('/floor/:floorId', verifyToken, isAdmin, async (req, res) => {
    const { floorId } = req.params;
    let connection;

    try {
        // Get a dedicated connection from the pool for the transaction
        connection = await new Promise((resolve, reject) => {
            con.getConnection((err, conn) => {
                if (err) return reject(err);
                conn.beginTransaction(transactionErr => {
                    if (transactionErr) {
                        conn.release();
                        return reject(transactionErr);
                    }
                    resolve(conn);
                });
            });
        });

        // 1. Check if the floor has any associated rooms first
        const roomCheckResult = await new Promise((resolve, reject) => {
            connection.query('SELECT COUNT(*) AS roomCount FROM `room` WHERE floor_id = ?', [floorId], (error, results) => {
                if (error) return reject(error);
                resolve(results[0].roomCount);
            });
        });

        if (roomCheckResult > 0) {
            await new Promise((resolve) => connection.rollback(() => resolve()));
            connection.release();
            return res.status(200).send({
                error: true,
                status: "1",
                message: "ไม่สามารถลบได้: ชั้นนี้มีห้องอยู่ กรุณาลบห้องทั้งหมดก่อน"
            });
        }

        // 2. Delete the floor itself
        const deleteFloorResult = await new Promise((resolve, reject) => {
            connection.query('DELETE FROM `floor` WHERE floor_id = ?', [floorId], (error, results) => {
                if (error) return reject(error);
                resolve(results);
            });
        });

        if (deleteFloorResult.affectedRows === 0) {
            await new Promise((resolve) => connection.rollback(() => resolve()));
            connection.release();
            return res.status(200).send({
                error: true,
                status: "1",
                message: "ไม่พบชั้นที่ต้องการลบ"
            });
        }

        // 3. Commit the transaction
        await new Promise((resolve, reject) => {
            connection.commit(err => {
                if (err) return reject(err);
                resolve();
            });
        });

        connection.release();

        return res.send({
            error: false,
            status: "0",
            message: "ลบข้อมูลชั้นสำเร็จ"
        });

    } catch (error) {
        if (connection) {
            await new Promise((resolve) => connection.rollback(() => resolve()));
            connection.release();
        }
        console.error('Error in /floor/:floorId (DELETE):', error);
        return res.status(500).send({
            error: true,
            status: "1",
            message: "เกิดข้อผิดพลาดในการลบข้อมูลชั้น"
        });
    }
});


/*-----------------------------------------------------------------------------------------------------------------------------*/
// ห้อง (Rooms)
/*------------------------------------------------------------------------------------------------------------------------------ */

// เพิ่มห้อง (Add a room)
router.post('/room', verifyToken, isAdmin, async (req, res) => {
    const { floorId, roomNames } = req.body;

    // ตรวจสอบว่ามีการส่ง floorId มาหรือไม่
    // และตรวจสอบว่า roomNames เป็น array ที่ไม่ว่างเปล่า
    if (!floorId || !roomNames || !Array.isArray(roomNames) || roomNames.length === 0) {
        return res.status(200).send({
            error: true,
            status: "1",
            message: "ไม่สามารถบันทึกได้: กรุณากรอกชื่อห้องอย่างน้อยหนึ่งห้อง"
        });
    }
    
    // ตรวจสอบว่ามีชื่อห้องใดเป็นค่าว่างหรือมีแต่ช่องว่างหรือไม่
    if (roomNames.some(name => !name || name.trim() === '')) {
      return res.status(200).send({
        error: true,
        status: "1",
        message: "ไม่สามารถบันทึกได้: ชื่อห้องไม่สามารถเป็นค่าว่างได้"
      });
    }

    let connection;
    try {
        connection = await new Promise((resolve, reject) => {
            con.getConnection((err, conn) => {
                if (err) return reject(err);
                resolve(conn);
            });
        });
        
        const trimmedRoomNames = roomNames.map(name => name.trim());
        
        // Check for duplicate room names within the provided array
        const uniqueLocalNames = [...new Set(trimmedRoomNames.map(name => name.toLowerCase()))];
        if (uniqueLocalNames.length !== trimmedRoomNames.length) {
            const duplicates = trimmedRoomNames.filter((item, index) => trimmedRoomNames.map(n => n.toLowerCase()).indexOf(item.toLowerCase()) !== index);
            const uniqueDuplicates = [...new Set(duplicates)];
            connection.release();
            return res.status(200).send({
                error: true,
                status: "1",
                message: `ไม่สามารถบันทึกได้: มีชื่อห้อง "${uniqueDuplicates.join(', ')}" ซ้ำกันในรายการที่คุณเพิ่มเข้ามา กรุณาแก้ไข`
            });
        }

        // Check for duplicate room names in the database for the given floor
        const placeholders = trimmedRoomNames.map(() => '?').join(', ');
        const dbDuplicateCheck = await new Promise((resolve, reject) => {
            connection.query(`SELECT room_name FROM \`room\` WHERE floor_id = ? AND LOWER(room_name) IN (${placeholders})`, [floorId, ...trimmedRoomNames.map(name => name.toLowerCase())], (error, results) => {
                if (error) return reject(error);
                resolve(results.length > 0 ? results.map(row => row.room_name) : null);
            });
        });

        if (dbDuplicateCheck) {
            connection.release();
            return res.status(200).send({
                error: true,
                status: "1",
                message: `ไม่สามารถบันทึกได้: ชื่อห้อง "${dbDuplicateCheck.join(', ')}" มีอยู่แล้วในชั้นนี้`
            });
        }
        
        // Insert all rooms in a single query
        const values = trimmedRoomNames.map(name => [floorId, name]);
        const insertRoomsQuery = 'INSERT INTO `room` (`floor_id`, `room_name`) VALUES ?';

        const insertRoomsResult = await new Promise((resolve, reject) => {
            connection.query(insertRoomsQuery, [values], (error, results) => {
                if (error) return reject(error);
                resolve(results);
            });
        });

        connection.release();

        if (insertRoomsResult.affectedRows === trimmedRoomNames.length) {
            return res.send({
                error: false,
                status: "0",
                message: `บันทึกข้อมูลห้องทั้งหมด ${insertRoomsResult.affectedRows} ห้องสำเร็จ`
            });
        } else {
            return res.status(200).send({
                error: true,
                status: "1",
                message: `บันทึกข้อมูลสำเร็จ ${insertRoomsResult.affectedRows} จาก ${trimmedRoomNames.length} ห้อง มีบางส่วนไม่สามารถบันทึกได้`
            });
        }
    } catch (error) {
        if (connection) connection.release();
        console.error('Error in /room (POST):', error);
        return res.status(500).send({
            error: true,
            status: "1",
            message: "เกิดข้อผิดพลาดในการบันทึกข้อมูลห้อง"
        });
    }
});

/*------------------------------------------------------------------------------------------------------------------------------ */
// แก้ไขห้อง (Edit a room)
router.put('/room/:roomId', verifyToken, isAdmin, async (req, res) => {
    const { roomId } = req.params;
    const { roomName, floorId } = req.body;

    if (!roomName || roomName.trim() === '' || !floorId) {
        return res.status(200).send({
            error: true,
            status: "1",
            message: "ไม่สามารถแก้ไขได้: กรุณากรอก roomName และ floorId"
        });
    }

    try {
        const trimmedRoomName = roomName.trim();

        // ตรวจสอบชื่อห้องซ้ำกันในระบบทั้งหมด (ยกเว้นห้องที่กำลังแก้ไข)
        const existingRoom = await new Promise((resolve, reject) => {
            con.query('SELECT room_id FROM `room` WHERE LOWER(room_name) = LOWER(?) AND room_id != ?', [trimmedRoomName, roomId], (error, results) => {
                if (error) return reject(error);
                resolve(results.length > 0 ? results[0] : null);
            });
        });

        if (existingRoom) {
            return res.status(200).send({
                error: true,
                status: "1",
                message: "ไม่สามารถแก้ไขได้: ชื่อห้องนี้มีอยู่แล้วในระบบ"
            });
        }

        const updateRoom = await new Promise((resolve, reject) => {
            con.query('UPDATE `room` SET `room_name` = ? WHERE `room_id` = ?', [trimmedRoomName, roomId], (error, results) => {
                if (error) return reject(error);
                resolve(results);
            });
        });

        if (updateRoom.affectedRows === 0) {
            return res.status(200).send({
                error: true,
                status: "1",
                message: "ไม่พบห้องที่ต้องการแก้ไข หรือไม่มีการเปลี่ยนแปลงข้อมูล"
            });
        }

        return res.send({
            error: false,
            status: "0",
            message: "แก้ไขข้อมูลห้องสำเร็จ"
        });

    } catch (error) {
        console.error('Error in /room/:roomId (PUT):', error);
        return res.status(500).send({
            error: true,
            status: "1",
            message: "เกิดข้อผิดพลาดในการแก้ไขข้อมูลห้อง"
        });
    }
});

/*------------------------------------------------------------------------------------------------------------------------------ */
// ลบห้อง (Delete a room)
router.delete('/room/:roomId', verifyToken, isAdmin, async (req, res) => {
    const { roomId } = req.params;

    const connection = con; // ใช้ connection ที่มีอยู่

    try {
        // 1. ดึง floor_id ของห้องที่จะถูกลบ
        const getFloorIdResult = await new Promise((resolve, reject) => {
            connection.query('SELECT floor_id FROM `room` WHERE `room_id` = ?', [roomId], (error, results) => {
                if (error) return reject(error);
                resolve(results);
            });
        });

        if (getFloorIdResult.length === 0) {
            return res.status(200).send({
                error: true,
                status: "1",
                message: "ไม่พบห้องที่ต้องการลบ"
            });
        }

        const floorId = getFloorIdResult[0].floor_id;

        // 2. ลบห้อง
        const deleteRoomResult = await new Promise((resolve, reject) => {
            connection.query('DELETE FROM `room` WHERE `room_id` = ?', [roomId], (error, results) => {
                if (error) return reject(error);
                resolve(results);
            });
        });

        if (deleteRoomResult.affectedRows === 0) {
            return res.status(200).send({
                error: true,
                status: "1",
                message: "ไม่พบห้องที่ต้องการลบ"
            });
        }

        // 3. ตรวจสอบว่ายังมีห้องอื่นในชั้นนั้นอีกหรือไม่
        const checkRoomsResult = await new Promise((resolve, reject) => {
            connection.query('SELECT COUNT(*) AS room_count FROM `room` WHERE `floor_id` = ?', [floorId], (error, results) => {
                if (error) return reject(error);
                resolve(results);
            });
        });

        const roomCount = checkRoomsResult[0].room_count;
        let message = "ลบข้อมูลห้องสำเร็จ";

        // 4. ถ้าไม่มีห้องเหลืออยู่ ให้ลบชั้นนั้นด้วย
        if (roomCount === 0) {
            await new Promise((resolve, reject) => {
                connection.query('DELETE FROM `floor` WHERE `floor_id` = ?', [floorId], (error, results) => {
                    if (error) return reject(error);
                    resolve(results);
                });
            });
            message = "ลบข้อมูลห้องสำเร็จ และได้ลบชั้นที่ไม่มีห้องแล้ว";
        }

        return res.send({
            error: false,
            status: "0",
            message: message
        });

    } catch (error) {
        console.error('Error in /room/:roomId (DELETE):', error);
        return res.status(500).send({
            error: true,
            status: "1",
            message: "เกิดข้อผิดพลาดในการลบข้อมูลห้อง"
        });
    }
});

/*-----------------------------------------------------------------------------------------------------------------------------*/
// ดึงข้อมูล (Fetch Data) - ส่วนนี้ให้สิทธิ์ Public (ไม่ต้องมี verifyToken)
/*------------------------------------------------------------------------------------------------------------------------------ */
router.get('/allData', async (req, res) => {
    const searchTerm = req.query.searchTerm ? req.query.searchTerm.toLowerCase() : null;

    try {
        let query = `
            SELECT
                b.building_id,
                b.building_name,
                f.floor_id,
                f.floor_number,
                r.room_id,
                r.room_name
            FROM building b
            LEFT JOIN floor f ON b.building_id = f.building_id
            LEFT JOIN room r ON f.floor_id = r.floor_id
        `;

        const params = [];
        if (searchTerm) {
            query += ` WHERE LOWER(b.building_name) LIKE LOWER(?) OR (r.room_name IS NOT NULL AND LOWER(r.room_name) LIKE LOWER(?))`;
            params.push(`%${searchTerm}%`, `%${searchTerm}%`);
        }
        
        query += ` ORDER BY b.building_name, f.floor_number, r.room_name`;

        const results = await new Promise((resolve, reject) => {
            con.query(query, params, (error, results) => {
                if (error) return reject(error);
                resolve(results);
            });
        });

        const buildingsMap = new Map();
        results.forEach(row => {
            if (!buildingsMap.has(row.building_id)) {
                buildingsMap.set(row.building_id, {
                    building_id: row.building_id,
                    building_name: row.building_name,
                    floors: new Map()
                });
            }
            const building = buildingsMap.get(row.building_id);

            if (row.floor_id) {
                if (!building.floors.has(row.floor_id)) {
                    building.floors.set(row.floor_id, {
                        floor_id: row.floor_id,
                        floor_number: row.floor_number,
                        rooms: []
                    });
                }
                const floor = building.floors.get(row.floor_id);
                if (row.room_id) {
                    floor.rooms.push({
                        room_id: row.room_id,
                        room_name: row.room_name
                    });
                }
            }
        });

        let allData = Array.from(buildingsMap.values()).map(building => {
            building.floors = Array.from(building.floors.values());
            return building;
        });

        if (searchTerm) {
            allData = allData.filter(building => {
                const buildingNameMatches = building.building_name.toLowerCase().includes(searchTerm);
                const someRoomNameMatches = building.floors.some(floor =>
                    floor.rooms.some(room => room.room_name && room.room_name.toLowerCase().includes(searchTerm))
                );
                return buildingNameMatches || someRoomNameMatches;
            });
            
            allData.forEach(building => {
                building.floors = building.floors.filter(floor => 
                    floor.rooms.some(room => room.room_name && room.room_name.toLowerCase().includes(searchTerm))
                );
                building.floors.forEach(floor => {
                    floor.rooms = floor.rooms.filter(room => room.room_name && room.room_name.toLowerCase().includes(searchTerm));
                });
            });
        }

        return res.send(allData);

    } catch (error) {
        console.error('Error in /allData (GET):', error);
        return res.status(500).send({
            error: true,
            status: "1",
            message: "เกิดข้อผิดพลาดในการดึงข้อมูลอาคาร ชั้น และห้อง"
        });
    }
});

/*------------------------------------------------------------------------------------------------------------------------------ */
router.get('/buildings', (req, res) => {
    const searchTerm = req.query.typebuilding_name;
    const query = searchTerm ?
        `SELECT building_id, building_name FROM building WHERE building_name LIKE ?` :
        `SELECT building_id, building_name FROM building ORDER BY building_name`;
    
    const params = searchTerm ? [`%${searchTerm}%`] : [];
    
    con.query(query, params, (error, results) => {
        if (error) {
            console.error('Error fetching buildings:', error);
            return res.status(500).json({ error: 'Internal Server Error' });
        }
        res.json(results);
    });
});
/*------------------------------------------------------------------------------------------------------------------------------ */

// ตรวจสอบข้อมูลซ้ำซ้อน (Check for duplicate data before adding)
router.post('/checkData', verifyToken, isAdmin, async (req, res) => {
    const { buildingId, floorNumber, roomNames } = req.body;

    if (!buildingId || !floorNumber) {
        return res.status(200).send({
            exists: true,
            message: "ไม่สามารถบันทึกได้: กรุณากรอกข้อมูลให้ครบถ้วนและถูกต้อง"
        });
    }

    if (!roomNames || !Array.isArray(roomNames) || roomNames.length === 0) {
        return res.send({
            exists: false,
            message: "ข้อมูลไม่ซ้ำ"
        });
    }
    
    if (roomNames.some(name => !name || name.trim() === '')) {
      return res.status(200).send({
        exists: true,
        type: "LocalRoom",
        message: "ไม่สามารถบันทึกได้: ชื่อห้องไม่สามารถเป็นค่าว่างได้"
      });
    }

    let connection;
    try {
        connection = await new Promise((resolve, reject) => {
            con.getConnection((err, conn) => {
                if (err) return reject(err);
                resolve(conn);
            });
        });

        const trimmedFloorNumber = floorNumber.trim();
        const trimmedRoomNames = roomNames.map(name => name.trim());
        let duplicateRooms = [];
        let messages = [];

        const uniqueLocalNames = [...new Set(trimmedRoomNames.map(name => name.toLowerCase()))];
        if (uniqueLocalNames.length !== trimmedRoomNames.length) {
            const duplicates = trimmedRoomNames.filter((item, index) => trimmedRoomNames.map(n => n.toLowerCase()).indexOf(item.toLowerCase()) !== index);
            const uniqueDuplicates = [...new Set(duplicates)];
            connection.release();
            return res.status(200).send({
                exists: true,
                type: "LocalRoom",
                duplicateRooms: uniqueDuplicates,
                message: `ไม่สามารถบันทึกได้: มีชื่อห้อง "${uniqueDuplicates.join(', ')}" ซ้ำกันในรายการที่คุณเพิ่มเข้ามา กรุณาแก้ไข`
            });
        }
        
        const dbDuplicateCheck = await new Promise((resolve, reject) => {
            const placeholders = trimmedRoomNames.map(() => '?').join(', ');
            const query = `
                SELECT r.room_name
                FROM room r
                JOIN floor f ON r.floor_id = f.floor_id
                WHERE f.building_id = ? AND LOWER(f.floor_number) = LOWER(?) AND LOWER(r.room_name) IN (${placeholders})
            `;
            connection.query(query, [buildingId, trimmedFloorNumber, ...trimmedRoomNames.map(name => name.toLowerCase())], (error, results) => {
                if (error) return reject(error);
                resolve(results.map(row => row.room_name));
            });
        });

        const uniqueDbDuplicates = [...new Set(dbDuplicateCheck)];
        if (uniqueDbDuplicates.length > 0) {
            messages.push(`ข้อมูลอาคาร, ชั้น, และชื่อห้อง "${uniqueDbDuplicates.join(', ')}" ซ้ำ`);
            duplicateRooms.push(...uniqueDbDuplicates);
        }
        
        const roomsToCheckGlobally = trimmedRoomNames.filter(name => !uniqueDbDuplicates.includes(name));
        if (roomsToCheckGlobally.length > 0) {
            const globalDuplicates = await new Promise((resolve, reject) => {
                const placeholders = roomsToCheckGlobally.map(() => '?').join(', ');
                connection.query(`SELECT room_name FROM \`room\` WHERE LOWER(room_name) IN (${placeholders})`, roomsToCheckGlobally.map(name => name.toLowerCase()), (error, results) => {
                    if (error) return reject(error);
                    resolve(results.map(row => row.room_name));
                });
            });
            const uniqueGlobalDuplicates = [...new Set(globalDuplicates)];
            if (uniqueGlobalDuplicates.length > 0) {
                messages.push(`ข้อมูลชื่อห้อง "${uniqueGlobalDuplicates.join(', ')}" ซ้ำกับข้อมูลที่มีอยู่แล้วในระบบ`);
                duplicateRooms.push(...uniqueGlobalDuplicates);
            }
        }

        connection.release();

        if (messages.length > 0) {
            return res.status(200).send({
                exists: true,
                duplicateRooms: [...new Set(duplicateRooms)],
                message: `ไม่สามารถบันทึกได้: ${messages.join(' และ ')}`
            });
        }
        
        return res.send({
            exists: false,
            message: "ข้อมูลไม่ซ้ำ"
        });

    } catch (error) {
        if (connection) connection.release();
        console.error('Error in /checkData (POST):', error);
        return res.status(500).send({
            error: true,
            message: "เกิดข้อผิดพลาดในการตรวจสอบข้อมูล"
        });
    }
});

module.exports = router;