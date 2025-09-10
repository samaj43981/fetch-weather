
require('dotenv').config();
const express = require('express');
const { MongoClient } = require('mongodb');
const { formatInTimeZone } = require('date-fns-tz');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000; // ใช้ Port จาก Render หรือ 3000 ถ้าเป็น local

const MONGO_URI = process.env.MONGO_URI;
const client = new MongoClient(MONGO_URI);
let db; // สร้างตัวแปร db ไว้ข้างนอก

// ฟังก์ชันสำหรับเชื่อมต่อฐานข้อมูล
async function connectDB() {
  if (db) return; // ถ้าเชื่อมต่อแล้วให้ออกจากฟังก์ชัน
  try {
    await client.connect();
    db = client.db("weatherdb");
    console.log("✅ Connected to MongoDB");
  } catch (err) {
    console.error("❌ Failed to connect to MongoDB", err);
    process.exit(1); // ออกจากโปรแกรมถ้าต่อ DB ไม่ได้
  }
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', async (req, res) => {
  try {
    const searchQuery = req.query.q || '';
    const collection = db.collection("records");

    // สร้างเงื่อนไขการค้นหา
    const matchStage = {};
    if (searchQuery) {
      // ใช้ regex เพื่อค้นหาแบบ case-insensitive และ partial match
      matchStage.city = { $regex: searchQuery, $options: 'i' };
    }

    // 1. ดึงข้อมูลล่าสุดของแต่ละจังหวัด
    // 2. จัดกลุ่มตามภาค (region)
    const pipeline = [
      { $match: matchStage }, // เพิ่ม stage สำหรับการกรองข้อมูล
      { $sort: { timestamp: -1 } },
      {
        $group: {
          _id: "$city",
          doc: { $first: "$$ROOT" }
        }
      },
      { $replaceRoot: { newRoot: "$doc" } },
      { $sort: { city: 1 } },
      {
        $group: {
          _id: "$region",
          provinces: { $push: "$$ROOT" }
        }
      },
      { $sort: { _id: 1 } } // เรียงตามชื่อภาค
    ];

    const regions = await collection.aggregate(pipeline).toArray();

    // แปลงเวลา timestamp ของแต่ละจังหวัดให้เป็นเวลาไทย
    const timeZone = 'Asia/Bangkok';
    const formatString = 'd/M/yyyy HH:mm:ss';

    regions.forEach(region => {
      region.provinces.forEach(province => {
        province.formattedTimestamp = formatInTimeZone(province.timestamp, timeZone, formatString);
      });
    });

    // --- เพิ่มส่วนนี้: ดึงข้อมูลจาก Sensor ---
    const sensorDb = client.db('test');
    const sensorCollection = sensorDb.collection('sensors');
    const sensorData = await sensorCollection
      .find({})
      .sort({ timestamp: -1 }) // ดึงข้อมูลล่าสุดก่อน
      .limit(10) // แสดงผล 10 รายการล่าสุด
      .toArray();

    // แปลงเวลา timestamp ของ sensor
    sensorData.forEach(sensor => {
      sensor.formattedTimestamp = formatInTimeZone(sensor.timestamp, timeZone, formatString);
    });
    // --- จบส่วนที่เพิ่ม ---

    res.render('index', { regions, sensorData, query: searchQuery, locale: 'th-TH' });
  } catch (err) {
    console.error(err);
    res.status(500).send("เกิดข้อผิดพลาด");
  }
});

// เชื่อมต่อ DB ก่อนแล้วค่อยเปิดเซิร์ฟเวอร์
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`✅ Server running at http://localhost:${PORT}`);
  });
});
