const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const cors = require('cors');
const con = require('../config/config');
const { promisify } = require('util');

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

var router = express.Router();

const query = promisify(con.query).bind(con);

/*-----------------------------------------------------------------------------------------------------------------------------*/
// API สำหรับหน้า User (foruser.php)
/*-----------------------------------------------------------------------------------------------------------------------------*/
// GET: ดึงข้อมูลอาคารทั้งหมดพร้อมพิกัด (Latitude/Longitude)
router.get('/buildings_with_locations', async (req, res) => {
    try {
        const sqlQuery = `
            SELECT 
                b.building_id, 
                b.building_name,
                rp.latitude,
                rp.longitude
            FROM building b
            JOIN reference_points rp ON b.building_id = rp.building_id
            WHERE rp.latitude IS NOT NULL AND rp.longitude IS NOT NULL;
        `;
        const results = await query(sqlQuery);
        
        if (results.length === 0) {
            return res.status(404).send({ status: 'error', message: 'ไม่พบอาคารที่มีการบันทึกพิกัด' });
        }
        
        return res.status(200).send({ status: 'success', data: results });

    } catch (error) {
        console.error('Error in /buildings_with_locations (GET):', error);
        return res.status(500).send({ status: 'error', message: 'เกิดข้อผิดพลาดในการดึงข้อมูลพิกัดอาคาร' });
    }
});


// GET: ดึงข้อมูลอาคารทั้งหมดที่มีการบันทึกเส้นทางแล้ว
router.get('/buildings_list', async (req, res) => {
    try {
        const sqlQuery = `
            SELECT DISTINCT b.building_id, b.building_name
            FROM building b
            WHERE b.building_id IN (
                SELECT start_building_id FROM routes WHERE start_building_id IS NOT NULL
                UNION
                SELECT end_building_id FROM routes WHERE end_building_id IS NOT NULL
            )
            ORDER BY b.building_name ASC;
        `;
        const results = await query(sqlQuery);
        
        if (results.length === 0) {
            return res.status(404).send({ status: 'error', message: 'ไม่พบอาคารที่มีการบันทึกเส้นทาง' });
        }
        
        return res.status(200).send({ status: 'success', data: results });

    } catch (error) {
        console.error('Error in /buildings_list (GET):', error);
        return res.status(500).send({ status: 'error', message: 'เกิดข้อผิดพลาดในการดึงข้อมูลอาคาร: ' + error.message });
    }
});

// GET: ค้นหาเส้นทางระหว่างสองอาคาร
router.get('/find_route/:startId/:endId', async (req, res) => {
    try {
        const { startId, endId } = req.params;

        if (!startId || !endId) {
            return res.status(400).send({ status: 'error', message: 'กรุณาระบุ ID อาคารเริ่มต้นและปลายทาง' });
        }

        const sqlQuery = `
            SELECT route_points, start_building_id 
            FROM routes 
            WHERE 
                (start_building_id = ? AND end_building_id = ?) 
                OR 
                (start_building_id = ? AND end_building_id = ?)
            LIMIT 1;
        `;
        
        const [route] = await query(sqlQuery, [startId, endId, endId, startId]);
        
        if (route) {
            return res.status(200).send({ status: 'success', data: route });
        } else {
            return res.status(404).send({ status: 'error', message: 'ไม่พบเส้นทางที่เชื่อมต่อระหว่างอาคารที่เลือก' });
        }

    } catch (error) {
        console.error('Error in /find_route/:startId/:endId (GET):', error);
        return res.status(500).send({ status: 'error', message: 'เกิดข้อผิดพลาดในเซิร์ฟเวอร์ขณะค้นหาเส้นทาง' });
    }
});

module.exports = router;