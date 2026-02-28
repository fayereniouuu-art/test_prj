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

// GET: ดึงข้อมูลชื่อเส้นทางอื่นๆ ทั้งหมดตามประเภทที่เลือก
router.get('/other_routes_by_type/:typeId', async (req, res) => {
    try {
        const { typeId } = req.params;

        if (!typeId) {
            return res.status(400).send({ status: 'error', message: 'กรุณาระบุ ID ประเภทเส้นทาง' });
        }

        const sqlQuery = `
            SELECT 
                route_other_id, 
                route_other_name,
                route_other AS route_points,
                route_other_color AS route_color 
            FROM route_other
            WHERE route_type_id = ?
            ORDER BY route_other_name ASC;
        `;
        
        const results = await query(sqlQuery, [typeId]);
        
        return res.status(200).send({ status: 'success', data: results });

    } catch (error) {
        console.error('Error in /other_routes_by_type/:typeId (GET):', error);
        return res.status(500).send({ status: 'error', message: 'เกิดข้อผิดพลาดในการดึงข้อมูลเส้นทาง' });
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

// GET: ค้นหาเส้นทางระหว่างสองอาคาร (เวอร์ชันอัปเดต)
router.get('/find_route/:startId/:endId/:typeId', async (req, res) => {
    try {
        const { startId, endId, typeId } = req.params;

        if (!startId || !endId || !typeId) {
            return res.status(400).send({ status: 'error', message: 'กรุณาระบุข้อมูลให้ครบถ้วน (อาคารเริ่มต้น, ปลายทาง, ประเภท)' });
        }

        const sqlQuery = `
            SELECT route_points, start_building_id, route_color 
            FROM routes 
            WHERE 
                ((start_building_id = ? AND end_building_id = ?) 
                OR 
                (start_building_id = ? AND end_building_id = ?))
                AND route_type_id = ?
            LIMIT 1;
        `;
        
        const [route] = await query(sqlQuery, [startId, endId, endId, startId, typeId]);
        
        if (route) {
            return res.status(200).send({ status: 'success', data: route });
        } else {
            return res.status(404).send({ status: 'error', message: 'ไม่พบเส้นทางที่ตรงกับเงื่อนไขที่เลือก' });
        }

    } catch (error) {
        console.error('Error in /find_route/:startId/:endId/:typeId (GET):', error);
        return res.status(500).send({ status: 'error', message: 'เกิดข้อผิดพลาดในเซิร์ฟเวอร์ขณะค้นหาเส้นทาง' });
    }
});

// GET: ดึงข้อมูลอาคารที่เชื่อมต่อกับอาคารและประเภทเส้นทางที่เลือก
router.get('/connected_buildings/:buildingId/:typeId', async (req, res) => {
    try {
        const { buildingId, typeId } = req.params; 

        if (!buildingId || !typeId) {
            return res.status(400).send({ status: 'error', message: 'กรุณาระบุ ID อาคารและประเภทเส้นทาง' });
        }

        const sqlQuery = `
            SELECT b.building_id, b.building_name
            FROM building b
            WHERE b.building_id IN (
                SELECT end_building_id
                FROM routes
                WHERE start_building_id = ? AND route_type_id = ?
                
                UNION
                
                SELECT start_building_id
                FROM routes
                WHERE end_building_id = ? AND route_type_id = ?
            )
            ORDER BY b.building_name ASC;
        `;
        
        const results = await query(sqlQuery, [buildingId, typeId, buildingId, typeId]);
        
        if (results.length === 0) {
            return res.status(404).send({ status: 'error', message: 'ไม่พบอาคารปลายทางที่เชื่อมต่อด้วยประเภทเส้นทางนี้' });
        }
        
        return res.status(200).send({ status: 'success', data: results });

    } catch (error) {
        console.error('Error in /connected_buildings/:buildingId/:typeId (GET):', error);
        return res.status(500).send({ status: 'error', message: 'เกิดข้อผิดพลาดในการดึงข้อมูลอาคารที่เชื่อมต่อ' });
    }
});

//================================================================================
// [+] โค้ดที่เพิ่มเข้ามาใหม่เพื่อแก้ปัญหา 404 Not Found
// GET: ดึงข้อมูลอาคารทั้งหมดที่เกี่ยวข้องกับประเภทเส้นทางที่เลือก
//================================================================================
router.get('/buildings_by_type/:typeId', async (req, res) => {
    try {
        const { typeId } = req.params;

        if (!typeId) {
            return res.status(400).send({ status: 'error', message: 'กรุณาระบุ ID ประเภทเส้นทาง' });
        }

        const sqlQuery = `
            SELECT DISTINCT b.building_id, b.building_name
            FROM building b
            WHERE b.building_id IN (
                SELECT start_building_id FROM routes WHERE route_type_id = ? AND start_building_id IS NOT NULL
                UNION
                SELECT end_building_id FROM routes WHERE route_type_id = ? AND end_building_id IS NOT NULL
            )
            ORDER BY b.building_name ASC;
        `;
        
        const results = await query(sqlQuery, [typeId, typeId]);
        
        return res.status(200).send({ status: 'success', data: results });

    } catch (error) {
        console.error('Error in /buildings_by_type/:typeId (GET):', error);
        return res.status(500).send({ status: 'error', message: 'เกิดข้อผิดพลาดในการดึงข้อมูลอาคารตามประเภท' });
    }
});


module.exports = router;


